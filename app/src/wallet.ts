import { Connection, PublicKey } from '@solana/web3.js';
import { transact } from '@solana-mobile/mobile-wallet-adapter-protocol-web3js';
import { Buffer } from 'buffer';
import { api } from './api';

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
}

// Explicit connection lifecycle (Gate 8). Failures never silently return to
// idle: every terminal failure carries a status the UI must render with a
// recovery action.
export type WalletConnectionStatus =
  | 'IDLE'
  | 'CONNECTING'
  | 'WAITING_FOR_WALLET'
  | 'VERIFYING'
  | 'CONNECTED'
  | 'USER_REJECTED'
  | 'NO_WALLET'
  | 'MWA_TIMEOUT'
  | 'NETWORK_ERROR'
  | 'AUTH_FAILED';

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
}

const DISCONNECTED_STATE: WalletState = {
  connected: false,
  publicKey: null,
  authToken: null,
  isArenaEligible: false,
  skrStakedAmount: 0,
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
  timeoutMs: number = MWA_HANDSHAKE_TIMEOUT_MS
): Promise<ConnectOutcome> {
  const emit = (s: WalletConnectionStatus) => {
    try {
      if (onStage) onStage(s);
    } catch {}
  };
  let timedOut = false;
  let settled = false;

  // If authorization has not returned quickly, the user is most likely
  // looking at their wallet app (or the dispatch stalled): say so instead
  // of showing a generic spinner forever.
  const waitingTimer = setTimeout(() => {
    if (!settled) emit('WAITING_FOR_WALLET');
  }, 2500);

  const attempt = transact(async (wallet) => {
    try {
      const authResult = await wallet.authorize({
        cluster: 'devnet',
        identity: {
          name: 'Counter Mobile',
          uri: 'https://counter.103-195-188-198.sslip.io',
          icon: 'favicon.ico',
        },
      });

      const userPubkeyStr = authResult.accounts[0].address;
      const userPubkey = new PublicKey(Buffer.from(userPubkeyStr, 'base64'));
      const walletBase58 = userPubkey.toBase58();

      emit('VERIFYING');
      // SIWS Nonce
      const { nonce } = await api.getNonce(walletBase58);
      const message = `Sign-in to Counter with nonce: ${nonce}`;
      const messageBytes = Uint8Array.from(Buffer.from(message, 'utf-8'));

      const signResults = await wallet.signMessages({
        addresses: [userPubkeyStr],
        payloads: [messageBytes],
      });

      const signatureBytes = signResults[0] as Uint8Array;
      // Convert to base58
      const bs58 = require('bs58').default || require('bs58');
      const signatureBase58 = bs58.encode(Buffer.from(signatureBytes));

      const verifyRes = await api.verifySignature(walletBase58, signatureBase58, nonce);

      return {
        connected: true,
        publicKey: walletBase58,
        authToken: verifyRes.token,
        isArenaEligible: verifyRes.user?.is_arena_eligible === 1,
        skrStakedAmount: verifyRes.user?.skr_staked_amount || 0,
      } as WalletState;
    } catch (err: any) {
      // Stage the failure by where it happened: anything before the SIWS
      // verify call is an authorize/wallet-stage failure.
      throw err;
    }
  });

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
    console.warn('[MWA] authorization failed or cancelled:', err?.message);
    const status: WalletConnectionStatus = timedOut
      ? 'MWA_TIMEOUT'
      : classifyConnectError(err, 'authorize');
    return { state: DISCONNECTED_STATE, status, detail: String(err?.message || err || 'Wallet connection failed') };
  }
}
