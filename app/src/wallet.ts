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

// Connect Wallet & perform SIWS
export async function connectAndAuthenticate(): Promise<WalletState> {
  try {
    return await transact(async (wallet) => {
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
      };
    });
  } catch (err: any) {
    // No mock fallback in any build: a failed/cancelled wallet authorization
    // must surface as disconnected so the product never fabricates identity,
    // session tokens, or arena eligibility. Wallet rejection is a normal
    // outcome the UI handles explicitly.
    console.warn('[MWA] authorization failed or cancelled:', err?.message);
    return {
      connected: false,
      publicKey: null,
      authToken: null,
      isArenaEligible: false,
      skrStakedAmount: 0,
    };
  }
}
