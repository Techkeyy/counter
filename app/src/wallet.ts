import { Connection, PublicKey } from '@solana/web3.js';
import { transact } from '@solana-mobile/mobile-wallet-adapter-protocol-web3js';
import { Buffer } from 'buffer';
import { api } from './api';
import type { StoredWalletAuthorization } from './session';
import { connectStage, isWalletCancellation, isWalletTimeout } from './diagnostics';
import { startWalletKeepalive, stopWalletKeepalive } from './walletKeepalive';

export const DEVNET_RPC = 'https://api.devnet.solana.com';
export const PROGRAM_ID = new PublicKey('52QgqEmxZzh2EH1gAwheMmp2ZXd9eT3WuXefSLYu6NmT');
// Authoritative Devnet cUSD mint (SPL Token-owned). See app/src/chain.ts.
export const CUSD_MINT = new PublicKey('AXMB7tf5yHqPuFRTzaMgNSGPZ8iKJtFkeYdpeN7jcHWC'); // Devnet cUSD mint
export const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

export interface WalletState {
  connected: boolean;
  publicKey: string | null;
  authToken: string | null;
  isArenaEligible: boolean;
  skrStakedAmount: number;
  needsProfileSetup?: boolean;
}

// Explicit connection lifecycle (Gate 8). Failures never silently return to
// idle: every terminal failure carries a status the UI must render with a
// recovery action.
export type WalletConnectionStatus =
  | 'IDLE'
  | 'CONNECTING'
  | 'WAITING_FOR_WALLET'
  | 'VERIFYING'
  | 'RESTORING'
  | 'CONNECTED'
  | 'USER_REJECTED'
  | 'NO_WALLET'
  | 'MWA_TIMEOUT'
  | 'NETWORK_ERROR'
  | 'AUTH_FAILED'
  | 'INTERRUPTED'
  | 'WALLET_CHANGED';

let connection: Connection | null = null;
export function getConnection(): Connection {
  if (!connection) {
    connection = new Connection(DEVNET_RPC, 'confirmed');
  }
  return connection;
}

// NOTE (single-derivation rule): PDA derivation lives ONLY on the backend
// (server/chain.js). The client consumes GET /api/duels/:id/chain-accounts
// verbatim via app/src/chain.ts and never derives program addresses itself.
// The previous local derive* helpers were removed: they used an incompatible
// seed scheme ([b"duel", u32-hash]) and were dead code (no on-chain calls).

// Connect Wallet & perform SIWS.
//
// Staged, timeout-guarded, and explicitly classified: failures NEVER silently
// collapse to idle. The caller receives a WalletConnectionStatus it must
// render with a recovery action (retry / help), plus the raw detail message
// for the help view (never user-facing jargon as the headline).
export interface ConnectOutcome {
  state: WalletState;
  status: WalletConnectionStatus;
  detail?: string;
  tokenRejected?: boolean;
  walletChanged?: boolean;
}

export interface ConnectOptions {
  attemptId?: string;
  authorization?: StoredWalletAuthorization | null;
  expectedWallet?: string | null;
  onMarker?: (stage: import('./diagnostics').ConnectStage) => void | Promise<void>;
  onAuthorization?: (authorization: Omit<StoredWalletAuthorization, 'v' | 'authorizedAt'>) => void | Promise<void>;
}

const DISCONNECTED_STATE: WalletState = {
  connected: false,
  publicKey: null,
  authToken: null,
  isArenaEligible: false,
  skrStakedAmount: 0,
  needsProfileSetup: true,
};

// Local MWA handshake budget. The wallet app opens over a local socket; if it
// has not answered in this window (e.g. OS power saving stalls the dispatch),
// fail closed with MWA_TIMEOUT instead of hanging forever.
export const MWA_HANDSHAKE_TIMEOUT_MS = 45000;

function classifyConnectError(err: any, stage: 'authorize' | 'verify'): WalletConnectionStatus {
  const msg = String(err?.message || err || '').toLowerCase();
  if (/reject|cancel|declin|dismiss|denied|user cancel/.test(msg)) return 'USER_REJECTED';
  if (/no wallet|wallet not|no compatible|not installed|unavailable|no mwa|protocol/.test(msg)) return 'NO_WALLET';
  if (/network|fetch|failed to fetch|econn|socket|dns|offline|unreachable|load failed/.test(msg)) return 'NETWORK_ERROR';
  if (/timeout|timed out|expired/.test(msg)) return stage === 'authorize' ? 'MWA_TIMEOUT' : 'NETWORK_ERROR';
  if (/nonce|verif|signature|token|401|unauthor|forbidden|invalid/.test(msg)) return 'AUTH_FAILED';
  return stage === 'authorize' ? 'NO_WALLET' : 'AUTH_FAILED';
}

function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const gate = new Promise<T>((_, reject) => {
    timer = setTimeout(() => {
      onTimeout();
      reject(new Error('MWA handshake timed out'));
    }, ms);
  });
  return Promise.race([promise, gate]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export async function connectAndAuthenticate(
  onStage?: (stage: WalletConnectionStatus) => void,
  timeoutMs: number = MWA_HANDSHAKE_TIMEOUT_MS,
  options: ConnectOptions = {},
): Promise<ConnectOutcome> {
  const emit = (s: WalletConnectionStatus) => {
    try {
      if (onStage) onStage(s);
    } catch {}
  };
  let timedOut = false;
  let settled = false;
  let tokenRejected = false;
  let walletChanged = false;
  let verificationStarted = false;
  const attemptId = options.attemptId || `connect_${Date.now().toString(36)}`;
  await startWalletKeepalive('CONNECT', attemptId);
  const emitMarker = async (stage: import('./diagnostics').ConnectStage) => {
    connectStage(attemptId, stage);
    try { await options.onMarker?.(stage); } catch {}
  };
  const identity = {
    name: 'Counter Mobile',
    uri: 'https://counter.103-195-188-198.sslip.io',
    icon: 'favicon.ico',
  };

  // If authorization has not returned quickly, the user is most likely
  // looking at their wallet app (or the dispatch stalled): say so instead
  // of showing a generic spinner forever.
  const waitingTimer = setTimeout(() => {
    if (!settled) emit('WAITING_FOR_WALLET');
  }, 2500);

  const attempt = (async () => {
    await emitMarker('CONNECT_MWA_TRANSACT_START');
    return transact(async (wallet) => {
      await emitMarker('CONNECT_CALLBACK_ENTER');
      let authResult: any;
      const walletWithReauthorize = wallet as typeof wallet & {
        reauthorize?: (params: { auth_token: string; identity: typeof identity }) => Promise<any>;
      };
      try {
        if (options.authorization) {
          await emitMarker('CONNECT_REASSOCIATE_START');
          await emitMarker('CONNECT_REAUTHORIZE_START');
          if (typeof walletWithReauthorize.reauthorize === 'function') {
            authResult = await walletWithReauthorize.reauthorize({ auth_token: options.authorization.auth_token, identity });
          } else {
            authResult = await wallet.authorize({
              chain: 'solana:devnet',
              identity,
              auth_token: options.authorization.auth_token,
            });
          }
          await emitMarker('CONNECT_REAUTHORIZE_OK');
        } else {
          await emitMarker('CONNECT_AUTHORIZE_START');
          authResult = await wallet.authorize({ cluster: 'devnet', identity });
          await emitMarker('CONNECT_AUTHORIZE_OK');
        }
      } catch (error) {
        const message = String((error as any)?.message || error || '').toLowerCase();
        if (options.authorization && /auth.?token|unauthor|deauthor|expired|invalid.?auth|not authorized/.test(message)) {
          tokenRejected = true;
        }
        throw error;
      }

      const userPubkeyStr = authResult?.accounts?.[0]?.address;
      if (typeof userPubkeyStr !== 'string' || userPubkeyStr.length === 0) throw new Error('Wallet returned no account');
      const userPubkey = new PublicKey(Buffer.from(userPubkeyStr, 'base64'));
      const walletBase58 = userPubkey.toBase58();
      if (options.expectedWallet && options.expectedWallet !== walletBase58) {
        walletChanged = true;
        throw new Error('Wallet changed during recovery');
      }

      await options.onAuthorization?.({
        wallet: walletBase58,
        auth_token: authResult.auth_token,
        wallet_uri_base: authResult.wallet_uri_base,
        chain: 'solana:devnet',
      });
      await emitMarker('CONNECT_AUTH_PERSISTED');

      emit('VERIFYING');
      await emitMarker('CONNECT_SIGN_IN_START');
      const { nonce } = await api.getNonce(walletBase58);
      const message = `Sign-in to Counter with nonce: ${nonce}`;
      const messageBytes = Uint8Array.from(Buffer.from(message, 'utf-8'));

      const signResults = await wallet.signMessages({
        addresses: [userPubkeyStr],
        payloads: [messageBytes],
      });
      await emitMarker('CONNECT_SIGN_IN_RETURN');

      const signatureBytes = signResults[0] as Uint8Array;
      // Convert to base58
      const bs58 = require('bs58').default || require('bs58');
      const signatureBase58 = bs58.encode(Buffer.from(signatureBytes));

      verificationStarted = true;
      await emitMarker('CONNECT_VERIFY_START');
      const verifyRes = await api.verifySignature(walletBase58, signatureBase58, nonce);
      await emitMarker('CONNECT_VERIFY_OK');

      return {
        connected: true,
        publicKey: walletBase58,
        authToken: verifyRes.token,
        isArenaEligible: verifyRes.user?.is_arena_eligible === 1,
        skrStakedAmount: verifyRes.user?.skr_staked_amount || 0,
      } as WalletState;
    });
  })();

  emit('CONNECTING');
  try {
    const state = await withTimeout(attempt, timeoutMs, () => {
      timedOut = true;
    });
    settled = true;
    clearTimeout(waitingTimer);
    return { state, status: 'CONNECTED' };
  } catch (err: any) {
    settled = true;
    clearTimeout(waitingTimer);
    // No mock fallback in any build: a failed/cancelled wallet authorization
    // must surface as an explicit failure state so the product never
    // fabricates identity, session tokens, or arena eligibility. Wallet
    // rejection is a normal outcome the UI handles explicitly.
    const status: WalletConnectionStatus = walletChanged
      ? 'WALLET_CHANGED'
      : timedOut
        ? 'MWA_TIMEOUT'
        : tokenRejected
          ? 'AUTH_FAILED'
          : classifyConnectError(err, verificationStarted ? 'verify' : 'authorize');
    if (timedOut) void emitMarker('CONNECT_TIMEOUT');
    else if (walletChanged) void emitMarker('CONNECT_ERROR');
    else if (tokenRejected || status === 'AUTH_FAILED') void emitMarker('CONNECT_AUTH_FAILED');
    else if (isWalletCancellation(err)) void emitMarker('CONNECT_CANCELLED');
    else void emitMarker('CONNECT_ERROR');
    // Do not print or surface raw wallet errors: some wallet implementations
    // include authorization material in exception text.
    return {
      state: DISCONNECTED_STATE,
      status,
      tokenRejected,
      walletChanged,
      detail: walletChanged
        ? 'Wallet changed during recovery.'
        : tokenRejected
          ? 'The saved wallet authorization expired. Reconnect to continue.'
          : isWalletCancellation(err)
            ? 'The wallet request was cancelled.'
            : timedOut || isWalletTimeout(err)
              ? 'The wallet connection was interrupted. Reconnect to continue.'
              : 'Wallet connection could not be completed safely.',
    };
  } finally {
    await stopWalletKeepalive(attemptId);
  }
}
