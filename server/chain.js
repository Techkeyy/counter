/**
 * Counter canonical Solana chain module — the SINGLE derivation/serialization
 * authority for the product path.
 *
 * Canonical model (must match program/src/lib.rs exactly):
 * - duel_id: 16 random bytes, hex-encoded as `onchain_duel_id` in DB/API.
 * - duel PDA:  seeds [b"duel", duel_id]
 * - vault PDA: seeds [b"vault", duel_pda]
 * - position:  seeds [b"position", duel_pda, user_pubkey]
 * - vault ATA: SPL associated token account (mint, vault_pda, allowOwnerOffCurve)
 *
 * Serialization is ported 1:1 from the proven
 * probes/program-escrow-devnet-harness.js (which executed the full lifecycle
 * on Devnet). Do not reinvent it here.
 */
const {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} = require('@solana/web3.js');
const {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} = require('@solana/spl-token');
const bs58Module = require('bs58');
const bs58 = bs58Module.default || bs58Module;

const PROGRAM_ID = new PublicKey(
  process.env.PROGRAM_ID || '52QgqEmxZzh2EH1gAwheMmp2ZXd9eT3WuXefSLYu6NmT'
);
// Authoritative Devnet cUSD mint (SPL Token-owned). Verified live 2026-09-29:
// AXMB7... owner == Token program. (3Ztkj... is the upgrade-authority WALLET,
// system-owned — it is NOT a mint and must never be used as one.)
const CUSD_MINT = new PublicKey(
  process.env.DEVNET_CUSD_MINT || 'AXMB7tf5yHqPuFRTzaMgNSGPZ8iKJtFkeYdpeN7jcHWC'
);
const CUSD_DECIMALS = 6;
const DEVNET_RPC = process.env.DEVNET_RPC || 'https://api.devnet.solana.com';

// Borsh DuelStatus discriminants (program/src/lib.rs enum order).
const DUEL_STATUS = {
  AcceptingStakes: 0,
  BackingClosed: 1,
  ResolvedSideA: 2,
  ResolvedSideB: 3,
  Cancelled: 4,
};
// Program custom error codes (process_* handlers).
const PROGRAM_ERROR = {
  StakingClosed: 101,
  InvalidStatus: 102,
  SideMismatch: 103,
  UnauthorizedResolver: 104,
  PositionUserMismatch: 105,
  AlreadyClaimed: 106,
  InvalidPositionSide: 107,
  NotClaimable: 108,
  AlreadyResolved: 109,
  TooEarly: 110,
};

let connection = null;
function getConnection() {
  if (!connection) connection = new Connection(DEVNET_RPC, 'confirmed');
  return connection;
}

// ---------------------------------------------------------------------------
// Canonical ID + PDA derivation (server is the single implementation; the
// mobile client consumes backend-derived addresses verbatim via
// GET /api/duels/:id/chain-accounts and never derives independently).
// ---------------------------------------------------------------------------

function duelIdBytesFromHex(duelIdHex) {
  if (typeof duelIdHex !== 'string' || !/^[0-9a-fA-F]{32}$/.test(duelIdHex)) {
    throw new Error('onchain_duel_id must be 32 hex chars (16 bytes)');
  }
  return Buffer.from(duelIdHex, 'hex');
}

function deriveDuelPda(duelIdHex) {
  const duelId = duelIdBytesFromHex(duelIdHex);
  const [pda, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from('duel'), duelId],
    PROGRAM_ID
  );
  return { duelPda: pda, duelBump: bump, duelId };
}

function deriveVaultPda(duelPda) {
  const [pda, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), duelPda.toBuffer()],
    PROGRAM_ID
  );
  return { vaultPda: pda, vaultBump: bump };
}

function derivePositionPda(duelPda, userWallet) {
  const user = new PublicKey(userWallet);
  const [pda, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from('position'), duelPda.toBuffer(), user.toBuffer()],
    PROGRAM_ID
  );
  return { positionPda: pda, positionBump: bump };
}

function deriveVaultAta(vaultPda) {
  const [ata] = PublicKey.findProgramAddressSync(
    [
      vaultPda.toBuffer(),
      TOKEN_PROGRAM_ID.toBuffer(),
      CUSD_MINT.toBuffer(),
    ],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return ata;
}

function deriveUserAta(userWallet) {
  const user = new PublicKey(userWallet);
  const [ata] = PublicKey.findProgramAddressSync(
    [user.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), CUSD_MINT.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return ata;
}

/** Full canonical account set for a duel + optional user. */
function deriveChainAccounts(duelIdHex, userWallet) {
  const { duelPda, duelBump, duelId } = deriveDuelPda(duelIdHex);
  const { vaultPda, vaultBump } = deriveVaultPda(duelPda);
  const vaultAta = deriveVaultAta(vaultPda);
  const out = {
    programId: PROGRAM_ID.toBase58(),
    mint: CUSD_MINT.toBase58(),
    decimals: CUSD_DECIMALS,
    duelIdHex: duelIdHex.toLowerCase(),
    duelPda: duelPda.toBase58(),
    duelBump,
    vaultPda: vaultPda.toBase58(),
    vaultBump,
    vaultAta: vaultAta.toBase58(),
  };
  if (userWallet) {
    const { positionPda, positionBump } = derivePositionPda(duelPda, userWallet);
    out.userWallet = userWallet;
    out.positionPda = positionPda.toBase58();
    out.positionBump = positionBump;
    out.userAta = deriveUserAta(userWallet).toBase58();
  }
  return out;
}

// ---------------------------------------------------------------------------
// Instruction serializers (byte-identical to the proven harness).
// ---------------------------------------------------------------------------

function serializeInitializeDuel({
  duelId, // Buffer(16)
  cutoffTs,
  resolutionTs,
  termsHash, // Buffer(32)
  captainA, // PublicKey
  captainB, // PublicKey
  duelBump,
  vaultBump,
}) {
  const buffer = Buffer.alloc(1 + 16 + 8 + 8 + 32 + 32 + 32 + 1 + 1);
  let offset = 0;
  buffer.writeUInt8(0, offset); offset += 1;
  duelId.copy(buffer, offset); offset += 16;
  buffer.writeBigInt64LE(BigInt(cutoffTs), offset); offset += 8;
  buffer.writeBigInt64LE(BigInt(resolutionTs), offset); offset += 8;
  termsHash.copy(buffer, offset); offset += 32;
  captainA.toBuffer().copy(buffer, offset); offset += 32;
  captainB.toBuffer().copy(buffer, offset); offset += 32;
  buffer.writeUInt8(duelBump, offset); offset += 1;
  buffer.writeUInt8(vaultBump, offset); offset += 1;
  return buffer;
}

function serializeDepositStake({ side, amountBase, positionBump }) {
  const buffer = Buffer.alloc(1 + 1 + 8 + 1);
  let offset = 0;
  buffer.writeUInt8(1, offset); offset += 1;
  buffer.writeUInt8(side, offset); offset += 1;
  buffer.writeBigUInt64LE(BigInt(amountBase), offset); offset += 8;
  buffer.writeUInt8(positionBump, offset); offset += 1;
  return buffer;
}

function serializeResolveDuel({ winningSide }) {
  const buffer = Buffer.alloc(1 + 1);
  buffer.writeUInt8(2, 0);
  buffer.writeUInt8(winningSide, 1);
  return buffer;
}

function serializeClaimPayout({ duelId }) {
  const buffer = Buffer.alloc(1 + 16);
  buffer.writeUInt8(3, 0);
  duelId.copy(buffer, 1);
  return buffer;
}

function buildInitializeDuelIx({
  payer, duelPda, resolver, mint, duelId, cutoffTs, resolutionTs,
  termsHash, captainA, captainB, duelBump, vaultBump,
}) {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: duelPda, isSigner: false, isWritable: true },
      { pubkey: resolver, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: serializeInitializeDuel({
      duelId, cutoffTs, resolutionTs, termsHash,
      captainA, captainB, duelBump, vaultBump,
    }),
  });
}

function buildDepositStakeIx({
  user, duelPda, positionPda, userAta, vaultAta, side, amountBase, positionBump,
}) {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: user, isSigner: true, isWritable: true },
      { pubkey: duelPda, isSigner: false, isWritable: true },
      { pubkey: positionPda, isSigner: false, isWritable: true },
      { pubkey: userAta, isSigner: false, isWritable: true },
      { pubkey: vaultAta, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: serializeDepositStake({ side, amountBase, positionBump }),
  });
}

function buildClaimPayoutIx({
  user, duelPda, positionPda, userAta, vaultAta, vaultPda, duelId,
}) {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: user, isSigner: true, isWritable: true },
      { pubkey: duelPda, isSigner: false, isWritable: false },
      { pubkey: positionPda, isSigner: false, isWritable: true },
      { pubkey: userAta, isSigner: false, isWritable: true },
      { pubkey: vaultAta, isSigner: false, isWritable: true },
      { pubkey: vaultPda, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: serializeClaimPayout({ duelId }),
  });
}

// ---------------------------------------------------------------------------
// Units + account decoding.
// ---------------------------------------------------------------------------

function usdToBaseUnits(usd) {
  const n = Number(usd);
  if (!Number.isFinite(n) || n <= 0) throw new Error('amount must be a positive number');
  const base = Math.round(n * 10 ** CUSD_DECIMALS);
  if (!Number.isSafeInteger(base) || base <= 0) throw new Error('amount out of range');
  return base;
}

function baseUnitsToUsd(base) {
  return Number(base) / 10 ** CUSD_DECIMALS;
}

/** Decode a DuelAccount (196 bytes) into plain fields. */
function decodeDuelAccount(data) {
  const buf = Buffer.from(data);
  if (buf.length < 196) throw new Error(`Duel account too short: ${buf.length}`);
  let off = 0;
  const isInitialized = buf.readUInt8(off) === 1; off += 1;
  const resolverAuthority = new PublicKey(buf.subarray(off, off + 32)).toBase58(); off += 32;
  const tokenMint = new PublicKey(buf.subarray(off, off + 32)).toBase58(); off += 32;
  const termsHash = buf.subarray(off, off + 32).toString('hex'); off += 32;
  const captainA = new PublicKey(buf.subarray(off, off + 32)).toBase58(); off += 32;
  const captainB = new PublicKey(buf.subarray(off, off + 32)).toBase58(); off += 32;
  const sideATotal = buf.readBigUInt64LE(off); off += 8;
  const sideBTotal = buf.readBigUInt64LE(off); off += 8;
  const cutoffTs = buf.readBigInt64LE(off); off += 8;
  const resolutionTs = buf.readBigInt64LE(off); off += 8;
  const status = buf.readUInt8(off); off += 1;
  const bump = buf.readUInt8(off); off += 1;
  const vaultBump = buf.readUInt8(off); off += 1;
  return {
    isInitialized, resolverAuthority, tokenMint, termsHash,
    captainA, captainB,
    sideATotal: sideATotal.toString(), sideBTotal: sideBTotal.toString(),
    cutoffTs: cutoffTs.toString(), resolutionTs: resolutionTs.toString(),
    status, bump, vaultBump,
  };
}

/** Decode a PositionAccount into plain fields. */
function decodePositionAccount(data) {
  const buf = Buffer.from(data);
  let off = 0;
  const isInitialized = buf.readUInt8(off) === 1; off += 1;
  const duel = new PublicKey(buf.subarray(off, off + 32)).toBase58(); off += 32;
  const user = new PublicKey(buf.subarray(off, off + 32)).toBase58(); off += 32;
  const side = buf.readUInt8(off); off += 1;
  const stakeAmount = buf.readBigUInt64LE(off).toString(); off += 8;
  const claimed = buf.readUInt8(off) === 1; off += 1;
  const bump = buf.readUInt8(off); off += 1;
  return { isInitialized, duel, user, side, stakeAmount, claimed, bump };
}

async function fetchDuelOnChain(duelPdaBase58) {
  const info = await getConnection().getAccountInfo(new PublicKey(duelPdaBase58));
  if (!info || !info.data) return null;
  if (info.owner.toBase58() !== PROGRAM_ID.toBase58()) {
    throw new Error('Duel PDA owner is not the Counter program');
  }
  return decodeDuelAccount(info.data);
}

async function fetchPositionOnChain(positionPdaBase58) {
  const info = await getConnection().getAccountInfo(new PublicKey(positionPdaBase58));
  if (!info || !info.data || info.data.length === 0) return null;
  if (info.owner.toBase58() !== PROGRAM_ID.toBase58()) {
    throw new Error('Position PDA owner is not the Counter program');
  }
  return decodePositionAccount(info.data);
}

// ---------------------------------------------------------------------------
// Independent transaction verification (backend never trusts client numbers).
// Each verifier fetches the REAL confirmed transaction + resulting on-chain
// account state and returns only chain-observed facts.
// ---------------------------------------------------------------------------

async function fetchConfirmedTx(signature) {
  // Default 'json' encoding: compiled index-based instructions. We resolve
  // indices manually — the 'jsonParsed' variant crashes web3.js v1 response
  // validation on inner-instruction shapes, so it is deliberately avoided.
  const tx = await getConnection().getTransaction(signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });
  if (!tx || !tx.meta || tx.meta.err) {
    throw new Error('Transaction is not confirmed on Devnet');
  }
  return tx;
}

/** Compiled top-level instructions with resolved base58 addresses. */
function compiledIxs(tx) {
  const msg = tx.transaction.message;
  const keys = msg.accountKeys || [];
  const keyAt = (i) => (typeof keys[i] === 'string' ? keys[i] : keys[i].toBase58());
  return (msg.instructions || []).map((ix) => ({
    programId: keyAt(ix.programIdIndex),
    accounts: (ix.accounts || []).map(keyAt),
    data: Buffer.from(bs58.decode(ix.data)),
  }));
}

function findProgramIx(tx, discriminator) {
  const programIdStr = PROGRAM_ID.toBase58();
  for (const ix of compiledIxs(tx)) {
    if (ix.programId === programIdStr && ix.data.length > 0 && ix.data.readUInt8(0) === discriminator) {
      return { ix, data: ix.data };
    }
  }
  return null;
}

function txSignerSet(tx) {
  const msg = tx.transaction.message;
  const keys = msg.accountKeys || [];
  const n = (msg.header && msg.header.numRequiredSignatures) || 0;
  return new Set(
    keys.slice(0, n).map((k) => (typeof k === 'string' ? k : k.toBase58()))
  );
}

/**
 * Verify an InitializeDuel transaction + resulting duel account.
 * Returns canonical chain facts; throws otherwise.
 */
async function verifyInitTx({ signature, duelIdHex, captainA, captainB, termsHashHex, resolver }) {
  const tx = await fetchConfirmedTx(signature);
  const found = findProgramIx(tx, 0);
  if (!found) throw new Error('No InitializeDuel instruction for the Counter program in tx');
  const { data } = found;
  const onchainDuelId = data.subarray(1, 17).toString('hex');
  if (onchainDuelId !== duelIdHex.toLowerCase()) {
    throw new Error('Init tx duel_id does not match canonical duel');
  }
  const { duelPda, duelBump } = deriveDuelPda(duelIdHex);
  const ixAccounts = found.ix.accounts || [];
  if (!ixAccounts[1] || ixAccounts[1] !== duelPda.toBase58()) {
    throw new Error('Init tx duel PDA account mismatch');
  }
  const state = await fetchDuelOnChain(duelPda.toBase58());
  if (!state || !state.isInitialized) throw new Error('Duel account not initialized on-chain');
  if (state.captainA !== captainA || state.captainB !== captainB) {
    throw new Error('On-chain captains do not match duel record');
  }
  if (state.termsHash !== termsHashHex.toLowerCase()) {
    throw new Error('On-chain terms hash does not match duel record');
  }
  if (state.tokenMint !== CUSD_MINT.toBase58()) {
    throw new Error('On-chain mint is not the authoritative cUSD mint');
  }
  if (resolver && state.resolverAuthority !== resolver) {
    throw new Error('On-chain resolver authority mismatch');
  }
  const { vaultPda, vaultBump } = deriveVaultPda(duelPda);
  const vaultAta = deriveVaultAta(vaultPda);
  return {
    duelPda: duelPda.toBase58(), duelBump,
    vaultPda: vaultPda.toBase58(), vaultBump,
    vaultAta: vaultAta.toBase58(),
    mint: CUSD_MINT.toBase58(),
    cutoffTs: state.cutoffTs, resolutionTs: state.resolutionTs,
    onchainState: state,
  };
}

/**
 * Verify a DepositStake transaction + resulting position/duel state.
 * Returns chain-observed { side, amountBase, positionPda, sideATotal, sideBTotal }.
 */
async function verifyStakeTx({ signature, duelIdHex, userWallet, expectedSide, expectedAmountBase }) {
  const tx = await fetchConfirmedTx(signature);
  const found = findProgramIx(tx, 1);
  if (!found) throw new Error('No DepositStake instruction for the Counter program in tx');
  const { data } = found;
  const side = data.readUInt8(1);
  const amountBase = data.readBigUInt64LE(2).toString();
  if (expectedSide !== undefined && side !== Number(expectedSide)) {
    throw new Error('Stake tx side does not match declared side');
  }
  if (expectedAmountBase !== undefined && amountBase !== String(expectedAmountBase)) {
    throw new Error('Stake tx amount does not match declared amount');
  }
  const signers = txSignerSet(tx);
  if (!signers.has(userWallet)) throw new Error('Stake tx was not signed by the funding wallet');
  const { duelPda } = deriveDuelPda(duelIdHex);
  const ixAccounts = found.ix.accounts || [];
  if (!ixAccounts[1] || ixAccounts[1] !== duelPda.toBase58()) {
    throw new Error('Stake tx duel PDA account mismatch');
  }
  const { positionPda } = derivePositionPda(duelPda, userWallet);
  if (!ixAccounts[2] || ixAccounts[2] !== positionPda.toBase58()) {
    throw new Error('Stake tx position PDA account mismatch');
  }
  const position = await fetchPositionOnChain(positionPda.toBase58());
  if (!position || !position.isInitialized) throw new Error('Position not initialized on-chain');
  if (position.user !== userWallet) throw new Error('On-chain position owner mismatch');
  if (position.side !== side) throw new Error('On-chain position side mismatch');
  const duel = await fetchDuelOnChain(duelPda.toBase58());
  if (!duel || !duel.isInitialized) throw new Error('Duel not initialized on-chain');
  if (duel.status !== DUEL_STATUS.AcceptingStakes) {
    throw new Error('Duel is not accepting stakes on-chain');
  }
  return {
    side, amountBase,
    positionPda: positionPda.toBase58(),
    positionStakeBase: position.stakeAmount,
    sideABase: duel.sideATotal, sideBBase: duel.sideBTotal,
  };
}

/**
 * Verify a ClaimPayout transaction: confirmed + position claimed on-chain.
 * Returns chain-observed { payoutBase } from the user's token balance delta.
 */
async function verifyClaimTx({ signature, duelIdHex, userWallet }) {
  const tx = await fetchConfirmedTx(signature);
  const found = findProgramIx(tx, 3);
  if (!found) throw new Error('No ClaimPayout instruction for the Counter program in tx');
  const signers = txSignerSet(tx);
  if (!signers.has(userWallet)) throw new Error('Claim tx was not signed by the claiming wallet');
  const { duelPda } = deriveDuelPda(duelIdHex);
  const { positionPda } = derivePositionPda(duelPda, userWallet);
  const ixAccounts = found.ix.accounts || [];
  if (!ixAccounts[1] || ixAccounts[1] !== duelPda.toBase58()) {
    throw new Error('Claim tx duel PDA account mismatch');
  }
  if (!ixAccounts[2] || ixAccounts[2] !== positionPda.toBase58()) {
    throw new Error('Claim tx position PDA account mismatch');
  }
  const position = await fetchPositionOnChain(positionPda.toBase58());
  if (!position || !position.claimed) throw new Error('Position is not marked claimed on-chain');
  if (position.user !== userWallet) throw new Error('On-chain position owner mismatch');
  // Payout = user's cUSD balance delta in this tx (chain-observed, not asserted).
  const userAta = deriveUserAta(userWallet).toBase58();
  const pre = (tx.meta.preTokenBalances || []).find(
    (b) => b.owner === userWallet && b.mint === CUSD_MINT.toBase58()
  );
  const post = (tx.meta.postTokenBalances || []).find(
    (b) => b.owner === userWallet && b.mint === CUSD_MINT.toBase58()
  );
  let payoutBase = null;
  if (pre && post && pre.uiTokenAmount && post.uiTokenAmount) {
    payoutBase = String(
      BigInt(post.uiTokenAmount.amount) - BigInt(pre.uiTokenAmount.amount)
    );
  }
  return { positionPda: positionPda.toBase58(), userAta, payoutBase, side: position.side };
}

/**
 * Verify a ResolveDuel transaction + resulting duel status.
 */
async function verifyResolveTx({ signature, duelIdHex, expectedWinningSide }) {
  const tx = await fetchConfirmedTx(signature);
  const found = findProgramIx(tx, 2);
  if (!found) throw new Error('No ResolveDuel instruction for the Counter program in tx');
  const winningSide = found.data.readUInt8(1);
  if (expectedWinningSide !== undefined && winningSide !== Number(expectedWinningSide)) {
    throw new Error('Resolve tx winning side mismatch');
  }
  const { duelPda } = deriveDuelPda(duelIdHex);
  const ixAccounts = found.ix.accounts || [];
  if (!ixAccounts[1] || ixAccounts[1] !== duelPda.toBase58()) {
    throw new Error('Resolve tx duel PDA account mismatch');
  }
  const duel = await fetchDuelOnChain(duelPda.toBase58());
  if (!duel) throw new Error('Duel account missing on-chain after resolve');
  return { winningSide, duelPda: duelPda.toBase58(), onchainStatus: duel.status };
}

module.exports = {
  PROGRAM_ID,
  CUSD_MINT,
  CUSD_DECIMALS,
  DEVNET_RPC,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  DUEL_STATUS,
  PROGRAM_ERROR,
  getConnection,
  duelIdBytesFromHex,
  deriveDuelPda,
  deriveVaultPda,
  derivePositionPda,
  deriveVaultAta,
  deriveUserAta,
  deriveChainAccounts,
  serializeInitializeDuel,
  serializeDepositStake,
  serializeResolveDuel,
  serializeClaimPayout,
  buildInitializeDuelIx,
  buildDepositStakeIx,
  buildClaimPayoutIx,
  usdToBaseUnits,
  baseUnitsToUsd,
  decodeDuelAccount,
  decodePositionAccount,
  fetchDuelOnChain,
  fetchPositionOnChain,
  verifyInitTx,
  verifyStakeTx,
  verifyClaimTx,
  verifyResolveTx,
};
