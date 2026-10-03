import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import { transact } from '@solana-mobile/mobile-wallet-adapter-protocol-web3js';
import { Buffer } from 'buffer';
import { getConnection, DEVNET_RPC } from './wallet';
import {
  isWalletCancellation,
  isWalletNotSubmitted,
  isWalletTimeout,
  WalletFlowError,
  walletStage,
} from './diagnostics';
import type { WalletOperation } from './diagnostics';

// Canonical chain constants — MUST match server/chain.js and program/src/lib.rs.
// The mobile client never derives PDAs independently: every address below is
// consumed verbatim from GET /api/duels/:id/chain-accounts (single-derivation
// rule). This module only serializes instructions and drives MWA signing.
export const PROGRAM_ID = new PublicKey('52QgqEmxZzh2EH1gAwheMmp2ZXd9eT3WuXefSLYu6NmT');
// Authoritative Devnet cUSD mint (SPL Token-owned). 3Ztkj... is the upgrade
// authority WALLET (system-owned), not a mint — never use it as one.
export const CUSD_MINT = new PublicKey('AXMB7tf5yHqPuFRTzaMgNSGPZ8iKJtFkeYdpeN7jcHWC');
export const CUSD_DECIMALS = 6;

export interface ChainAccounts {
  duelId: string;
  chainStatus: 'UNINITIALIZED' | 'INITIALIZED';
  initTxSignature: string | null;
  captainA: string;
  captainB: string;
  termsHash: string;
  cutoffTs: number;
  resolutionTs: number;
  status: string;
  winningSide: number;
  resolver: string;
  programId: string;
  mint: string;
  decimals: number;
  duelIdHex: string;
  duelPda: string;
  duelBump: number;
  vaultPda: string;
  vaultBump: number;
  vaultAta: string;
  userWallet?: string;
  positionPda?: string;
  positionBump?: number;
  userAta?: string;
}

export function usdToBaseUnits(usd: number | string): number {
  const base = Math.round(Number(usd) * 10 ** CUSD_DECIMALS);
  if (!Number.isFinite(base) || base <= 0 || !Number.isSafeInteger(base)) {
    throw new Error('Stake amount must be a positive number');
  }
  return base;
}

function hexToBytes(hex: string): Buffer {
  if (!/^[0-9a-fA-F]+$/.test(hex) || (hex.length !== 32 && hex.length !== 64)) {
    throw new Error('Invalid hash/id hex (expected 16 or 32 bytes)');
  }
  return Buffer.from(hex, 'hex');
}

// Serializers — byte-identical to server/chain.js and the proven harness.
// NOTE: `buffer@6.0.3` ships incorrect .d.ts types declaring
// writeBigInt64LE/writeBigUInt64LE(value: number). Node runtime requires
// bigint (verified). This helper preserves runtime bytes while satisfying tsc.
function writeI64LE(buf: Buffer, value: bigint, offset: number): void {
  (buf as unknown as { writeBigInt64LE(v: bigint, o: number): unknown }).writeBigInt64LE(value, offset);
}

function writeU64LE(buf: Buffer, value: bigint, offset: number): void {
  (buf as unknown as { writeBigUInt64LE(v: bigint, o: number): unknown }).writeBigUInt64LE(value, offset);
}
export function serializeInitializeDuel(args: {
  duelIdHex: string;
  cutoffTs: number;
  resolutionTs: number;
  termsHashHex: string;
  captainA: string;
  captainB: string;
  duelBump: number;
  vaultBump: number;
}): Buffer {
  const duelId = hexToBytes(args.duelIdHex);
  const termsHash = hexToBytes(args.termsHashHex);
  if (duelId.length !== 16) throw new Error('duel id must be 16 bytes');
  if (termsHash.length !== 32) throw new Error('terms hash must be 32 bytes');
  const buffer = Buffer.alloc(1 + 16 + 8 + 8 + 32 + 32 + 32 + 1 + 1);
  let o = 0;
  buffer.writeUInt8(0, o); o += 1;
  duelId.copy(buffer, o); o += 16;
  writeI64LE(buffer, BigInt(args.cutoffTs), o); o += 8;
  writeI64LE(buffer, BigInt(args.resolutionTs), o); o += 8;
  termsHash.copy(buffer, o); o += 32;
  new PublicKey(args.captainA).toBuffer().copy(buffer, o); o += 32;
  new PublicKey(args.captainB).toBuffer().copy(buffer, o); o += 32;
  buffer.writeUInt8(args.duelBump, o); o += 1;
  buffer.writeUInt8(args.vaultBump, o); o += 1;
  return buffer;
}

export function serializeDepositStake(side: 1 | 2, amountBase: number, positionBump: number): Buffer {
  const buffer = Buffer.alloc(1 + 1 + 8 + 1);
  let o = 0;
  buffer.writeUInt8(1, o); o += 1;
  buffer.writeUInt8(side, o); o += 1;
  writeU64LE(buffer, BigInt(amountBase), o); o += 8;
  buffer.writeUInt8(positionBump, o); o += 1;
  return buffer;
}

export function serializeClaimPayout(duelIdHex: string): Buffer {
  const duelId = hexToBytes(duelIdHex);
  if (duelId.length !== 16) throw new Error('duel id must be 16 bytes');
  const buffer = Buffer.alloc(1 + 16);
  buffer.writeUInt8(3, 0);
  duelId.copy(buffer, 1);
  return buffer;
}

export function buildInitializeDuelIx(acct: ChainAccounts, payer: PublicKey): TransactionInstruction {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: new PublicKey(acct.duelPda), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(acct.resolver), isSigner: false, isWritable: false },
      { pubkey: new PublicKey(acct.mint), isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: serializeInitializeDuel({
      duelIdHex: acct.duelIdHex,
      cutoffTs: acct.cutoffTs,
      resolutionTs: acct.resolutionTs,
      termsHashHex: acct.termsHash,
      captainA: acct.captainA,
      captainB: acct.captainB,
      duelBump: acct.duelBump,
      vaultBump: acct.vaultBump,
    }),
  });
}

export function buildDepositStakeIx(
  acct: ChainAccounts,
  user: PublicKey,
  side: 1 | 2,
  amountBase: number
): TransactionInstruction {
  if (!acct.positionPda || acct.positionBump === undefined || !acct.userAta || !acct.vaultAta) {
    throw new Error('Chain accounts missing position/user/vault addresses');
  }
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: user, isSigner: true, isWritable: true },
      { pubkey: new PublicKey(acct.duelPda), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(acct.positionPda), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(acct.userAta), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(acct.vaultAta), isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: serializeDepositStake(side, amountBase, acct.positionBump),
  });
}

export function buildClaimPayoutIx(acct: ChainAccounts, user: PublicKey): TransactionInstruction {
  if (!acct.positionPda || !acct.userAta || !acct.vaultAta) {
    throw new Error('Chain accounts missing position/user/vault addresses');
  }
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: user, isSigner: true, isWritable: true },
      { pubkey: new PublicKey(acct.duelPda), isSigner: false, isWritable: false },
      { pubkey: new PublicKey(acct.positionPda), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(acct.userAta), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(acct.vaultAta), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(acct.vaultPda), isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: serializeClaimPayout(acct.duelIdHex),
  });
}

/** Create the user's cUSD ATA if missing (pays own rent — standard flow). */
export function buildUserAtaCreateIxIfNeeded(
  user: PublicKey,
  existingAtaInfo: boolean
): TransactionInstruction | null {
  if (existingAtaInfo) return null;
  const ata = getAssociatedTokenAddressSync(CUSD_MINT, user, false);
  return createAssociatedTokenAccountInstruction(user, ata, user, CUSD_MINT);
}

/** Create the vault ATA (owned by vault PDA, off-curve) if missing. */
export function buildVaultAtaCreateIxIfNeeded(
  payer: PublicKey,
  vaultPda: PublicKey,
  existingAtaInfo: boolean
): TransactionInstruction | null {
  if (existingAtaInfo) return null;
  const ata = getAssociatedTokenAddressSync(CUSD_MINT, vaultPda, true);
  return createAssociatedTokenAccountInstruction(payer, ata, vaultPda, CUSD_MINT);
}

export { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, DEVNET_RPC };

/**
 * Sign + send instructions through Mobile Wallet Adapter and wait for
 * confirmation. The wallet user approves in their wallet app; rejection
 * surfaces as an error (never a fabricated session).
 */
export async function mwaSignSendConfirm(
  instructions: TransactionInstruction[],
  feePayer: PublicKey,
  connection?: Connection,
  operation: WalletOperation = 'STAKE'
): Promise<string> {
  const conn = connection || getConnection();
  const {
    context: { slot: minContextSlot },
    value: { blockhash, lastValidBlockHeight },
  } = await conn.getLatestBlockhashAndContext('confirmed');
  const tx = new Transaction({ feePayer, recentBlockhash: blockhash });
  tx.add(...instructions);

  walletStage(operation, 'MWA_OPEN');
  let authorizationSucceeded = false;
  let signSendStarted = false;
  let handoffSignatures: string[] | null = null;

  const parseSignature = (value: unknown): string | null => {
    if (!Array.isArray(value)) return null;
    const candidate = value[0];
    return typeof candidate === 'string' && candidate.length > 0 ? candidate : null;
  };

  try {
    walletStage(operation, 'MWA_TRANSACT_START');
    let signatures: string[] | null = null;
    try {
      signatures = await transact(async (wallet) => {
        walletStage(operation, 'MWA_CALLBACK_ENTER');
        walletStage(operation, 'MWA_AUTHORIZE_START');
        await wallet.authorize({
          chain: 'solana:devnet',
          identity: {
            name: 'Counter Mobile',
            uri: 'https://counter.103-195-188-198.sslip.io',
            icon: 'favicon.ico',
          },
        });
        authorizationSucceeded = true;
        walletStage(operation, 'MWA_AUTHORIZE_OK');
        signSendStarted = true;
        walletStage(operation, 'MWA_SIGN_SEND_START');
        handoffSignatures = await wallet.signAndSendTransactions({
          minContextSlot,
          transactions: [tx],
        });
        walletStage(operation, 'MWA_SIGN_SEND_RETURN');
        return handoffSignatures;
      });
    } catch (error) {
      // The installed transact() closes the native session in a finally block.
      // Preserve a signature that was already returned by signAndSendTransactions
      // if that cleanup rejects, so the app never loses a submitted transaction.
      if (!handoffSignatures) throw error;
      signatures = handoffSignatures;
    }

    walletStage(operation, 'MWA_TRANSACT_RETURN');

    walletStage(operation, 'MWA_APPROVED');
    const signature = parseSignature(signatures);
    if (!signature) {
      walletStage(operation, 'MWA_ERROR');
      throw new WalletFlowError(
        signSendStarted ? 'NOT_SUBMITTED' : 'PRE_SUBMIT',
        signSendStarted
          ? 'Your wallet approved, but the transaction was not submitted.'
          : "Couldn't get the transaction from your wallet."
      );
    }
    walletStage(operation, 'TX_SIGNATURE_PARSED');
    walletStage(operation, 'TX_SUBMITTED');
    walletStage(operation, 'TX_CONFIRM_START');
    try {
      const confirmation = await conn.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        'confirmed'
      );
      if (confirmation.value.err) {
        throw new Error('Devnet transaction failed');
      }
    } catch (error) {
      walletStage(operation, 'TX_CONFIRM_FAILED');
      throw new WalletFlowError(
        'CONFIRMATION_FAILED',
        'Transaction submitted but not confirmed yet.',
        signature,
        error
      );
    }
    walletStage(operation, 'TX_CONFIRMED');
    return signature;
  } catch (error) {
    if (error instanceof WalletFlowError) throw error;
    walletStage(operation, isWalletCancellation(error) ? 'MWA_CANCELLED' : 'FAILED');
    if (isWalletCancellation(error)) throw error;
    if (isWalletTimeout(error)) {
      walletStage(operation, 'MWA_TIMEOUT');
      throw new WalletFlowError(
        'TIMEOUT',
        'Wallet response timed out; check transaction status before retrying.',
        parseSignature(handoffSignatures),
        error
      );
    }
    if (isWalletNotSubmitted(error) || authorizationSucceeded || signSendStarted) {
      walletStage(operation, 'MWA_ERROR');
      throw new WalletFlowError(
        'NOT_SUBMITTED',
        'Your wallet approved, but the transaction was not submitted.',
        undefined,
        error
      );
    }
    walletStage(operation, 'MWA_ERROR');
    throw new WalletFlowError(
      'PRE_SUBMIT',
      "Couldn't get the transaction from your wallet.",
      undefined,
      error
    );
  }
}

/**
 * Canonical bilateral-settlement attestation text. Must stay byte-identical
 * to server/mutual.js settlementMessage: the server reconstructs it and
 * verifies the ed25519 signature against the captain wallet.
 */
export function settlementMessage(duelId: string, winnerSide: 1 | 2, resolutionAt: number): string {
  return `COUNTER_SETTLEMENT_V1|duel_id=${duelId}|winner_side=${winnerSide}|mode=MUTUAL|at=${resolutionAt}`;
}

/**
 * Wallet-sign an arbitrary UTF-8 attestation through MWA (same primitive as
 * SIWS). Used for bilateral settlement votes: the server reconstructs the
 * exact expected message and verifies the ed25519 signature. Rejection
 * surfaces as an error; nothing is fabricated.
 */
export async function mwaSignMessage(
  message: string,
  walletBase58: string,
  operation: WalletOperation = 'SETTLEMENT'
): Promise<string> {
  const walletAddressB64 = Buffer.from(new PublicKey(walletBase58).toBytes()).toString('base64');
  const payload = Uint8Array.from(Buffer.from(message, 'utf-8'));
  walletStage(operation, 'MWA_OPEN');
  try {
    const out = await transact(async (wallet) => {
      await wallet.authorize({
        chain: 'solana:devnet',
        identity: {
          name: 'Counter Mobile',
          uri: 'https://counter.103-195-188-198.sslip.io',
          icon: 'favicon.ico',
        },
      });
      const results = await wallet.signMessages({
        addresses: [walletAddressB64],
        payloads: [payload],
      });
      return results[0] as Uint8Array;
    });
    walletStage(operation, 'MWA_APPROVED');
    const bs58 = require('bs58').default || require('bs58');
    return bs58.encode(Buffer.from(out));
  } catch (error) {
    walletStage(operation, isWalletCancellation(error) ? 'MWA_CANCELLED' : 'FAILED');
    throw error;
  }
}
