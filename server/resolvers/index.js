const { resolveWeather } = require('./weather');
const {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');
const { queryOne, execute } = require('../db');
const { validateVerifiedTemplate } = require('../resolution-templates');

const DEVNET_RPC = process.env.DEVNET_RPC || 'https://api.devnet.solana.com';
const PROGRAM_ID = new PublicKey(process.env.PROGRAM_ID || '52QgqEmxZzh2EH1gAwheMmp2ZXd9eT3WuXefSLYu6NmT');

function getResolverKeypair() {
  const keypairPath = process.env.KEYPAIR_PATH || 'C:\\Users\\HomePC\\.config\\solana\\compart-devnet-upgrade.json';
  if (fs.existsSync(keypairPath)) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, 'utf-8'))));
  }
  // Fail fast: resolving with an invented key would produce a rejected chain
  // tx while the backend recorded settlement. Never resolve without authority.
  throw new Error('Server resolver authority keypair not configured on host (KEYPAIR_PATH)');
}

function serializeResolveDuel(winningSide) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt8(2, 0); // Discriminator: 2
  buffer.writeUInt8(winningSide, 1);
  return buffer;
}

async function resolveDuel(duelId) {
  const duel = queryOne(`SELECT * FROM duels WHERE id = ?`, [duelId]);
  if (!duel) {
    return { success: false, error: 'Duel not found' };
  }

  if (duel.status.startsWith('RESOLVED') || duel.status === 'CANCELLED') {
    return { success: false, error: 'Duel already resolved' };
  }

  // Settlement is only authoritative for duels bound to the deployed program.
  // Backend-only "resolution" of uninitialized duels would fabricate receipts.
  if ((duel.chain_status || 'UNINITIALIZED') !== 'INITIALIZED' || !duel.onchain_duel_pda) {
    return { success: false, error: 'Duel is not initialized on-chain; settlement refused' };
  }

  const mode = duel.resolution_mode || 'COUNTER_VERIFIED';
  if (mode === 'MUTUAL') {
    return resolveMutualDuel(duel);
  }
  return resolveVerifiedDuel(duel);
}

async function resolveVerifiedDuel(duel, forcedConfig) {
  const category = duel.category?.toLowerCase();
  let sourceConfig = {};
  try {
    sourceConfig = forcedConfig || JSON.parse(duel.source_config || '{}');
  } catch (e) {}

  const templateCheck = validateVerifiedTemplate(duel.category, duel.source_type, sourceConfig);
  if (!templateCheck.ok) {
    return { success: false, error: `Verified resolution refused: ${templateCheck.error}` };
  }

  let resolutionResult = null;
  if (category === 'weather') {
    resolutionResult = await resolveWeather(sourceConfig);
  } else {
    return { success: false, error: 'Verified resolution is unavailable for this category.' };
  }

  if (!resolutionResult || !resolutionResult.success) {
    return {
      success: false,
      error: resolutionResult?.error || 'Resolution data pending or unavailable',
    };
  }

  const winningSide = resolutionResult.winningSide;
  const txSignature = await submitSettlementTx(duel, winningSide);
  if (!txSignature.ok) return txSignature;
  return recordSettlement(duel, winningSide, {
    summary: resolutionResult.summary,
    evidence: { ...(resolutionResult.evidence || {}), resolutionMode: 'COUNTER_VERIFIED' },
    txSignature: txSignature.sig,
  });
}

// MUTUAL settlement: a verified captain-pair match settles that exact side;
// past the agreement deadline the pre-agreed fallback executes (REFUND via
// on-chain Cancel, or the locked verified template). One captain alone,
// disputed pairs, and premature calls all fail closed with no state change.
async function resolveMutualDuel(duel) {
  const mutual = require('../mutual');
  const match = mutual.checkMatch(duel);
  if (match.matched) {
    const txSignature = await submitSettlementTx(duel, match.winnerSide);
    if (!txSignature.ok) return txSignature;
    return recordSettlement(duel, match.winnerSide, {
      summary: `Settled together: both captains agreed Side ${match.winnerSide === 1 ? 'A' : 'B'}.`,
      evidence: {
        resolutionMode: 'MUTUAL',
        agreedWinnerSide: match.winnerSide,
        confirmations: match.votes.map((v) => ({
          captainWallet: v.captain_wallet,
          winnerSide: Number(v.winner_side),
          signature: v.signature,
          at: v.updated_at,
        })),
      },
      txSignature: txSignature.sig,
    });
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const deadline = Number(duel.mutual_deadline_ts) || Number(duel.resolution_ts) || 0;
  if (match.state === 'DISPUTED' && (!deadline || nowSec < deadline)) {
    return { success: false, error: 'Captains disagree. Settlement waits for agreement or the fallback deadline.' };
  }
  if (!deadline || nowSec < deadline) {
    return { success: false, error: 'Awaiting both captains. Settlement unlocks on agreement or the fallback deadline.' };
  }

  const fallback = duel.fallback_mode || 'REFUND';
  if (fallback === 'COUNTER_VERIFIED') {
    return resolveVerifiedDuel(duel);
  }
  // REFUND: on-chain Cancel returns every position principal (program-enforced).
  const txSignature = await submitSettlementTx(duel, 3);
  if (!txSignature.ok) return txSignature;
  return recordSettlement(duel, 0, {
    summary: 'No agreement by the deadline. Duel cancelled; every backer may reclaim principal.',
    evidence: { resolutionMode: 'MUTUAL', fallback: 'REFUND', votes: match.votes },
    txSignature: txSignature.sig,
    cancelled: true,
  });
}

// Submits a real ResolveDuel transaction (winningSide 1 | 2, or 3 = Cancel).
async function submitSettlementTx(duel, winningSide) {
  const connection = new Connection(DEVNET_RPC, 'confirmed');
  let resolverKeypair;
  try {
    resolverKeypair = getResolverKeypair();
  } catch (err) {
    return { ok: false, error: err.message };
  }
  const duelPdaPubkey = new PublicKey(duel.onchain_duel_pda);

  const resolveIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: resolverKeypair.publicKey, isSigner: true, isWritable: false },
      { pubkey: duelPdaPubkey, isSigner: false, isWritable: true },
    ],
    data: serializeResolveDuel(winningSide),
  });

  const tx = new Transaction().add(resolveIx);
  try {
    const sig = await sendAndConfirmTransaction(connection, tx, [resolverKeypair]);
    console.log(`[PASS] On-chain duel settlement confirmed! Tx: ${sig}`);
    return { ok: true, sig };
  } catch (err) {
    return { ok: false, error: `On-chain settlement failed; duel left unresolved: ${err.message}` };
  }
}

// Persists settlement AFTER a confirmed chain tx: duel row, durable receipt,
// captain notifications. `cancelled` marks the CANCELLED/REFUND terminal state.
function recordSettlement(duel, winningSide, { summary, evidence, txSignature, cancelled }) {
  const duelId = duel.id;
  const newStatus = cancelled
    ? 'CANCELLED'
    : winningSide === 1
      ? 'RESOLVED_SIDE_A'
      : 'RESOLVED_SIDE_B';
  const winnerWallet = cancelled
    ? 'REFUNDED'
    : winningSide === 1
      ? duel.captain_a_wallet
      : duel.captain_b_wallet;
  const totalPool = (Number(duel.side_a_total) || 0) + (Number(duel.side_b_total) || 0);

  // Update duel in DB
  execute(
    `UPDATE duels SET status = ?, winning_side = ?, resolution_data = ?, resolution_tx = ? WHERE id = ?`,
    [newStatus, winningSide, JSON.stringify(evidence), txSignature, duelId]
  );

  // Generate durable Receipt
  const receiptId = `receipt_${duelId}`;
  execute(
    `INSERT OR REPLACE INTO receipts (id, duel_id, take_id, captain_a_wallet, captain_b_wallet, winner_wallet, total_pool, resolution_summary, resolution_evidence, onchain_signature, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      receiptId,
      duelId,
      duel.take_id,
      duel.captain_a_wallet,
      duel.captain_b_wallet,
      winnerWallet,
      totalPool,
      summary,
      JSON.stringify(evidence),
      txSignature,
      new Date().toISOString(),
    ]
  );

  // Notify Captains
  const notifA = `notif_${Date.now()}_a`;
  const notifB = `notif_${Date.now()}_b`;
  execute(
    `INSERT INTO activity (id, user_wallet, type, source_wallet, target_id, target_type, title, message, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    [notifA, duel.captain_a_wallet, 'DUEL_RESOLVED', 'system', receiptId, 'RECEIPT', 'Duel Resolved', summary, new Date().toISOString()]
  );
  execute(
    `INSERT INTO activity (id, user_wallet, type, source_wallet, target_id, target_type, title, message, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    [notifB, duel.captain_b_wallet, 'DUEL_RESOLVED', 'system', receiptId, 'RECEIPT', 'Duel Resolved', summary, new Date().toISOString()]
  );

  return {
    success: true,
    duelId,
    status: newStatus,
    winningSide,
    winnerWallet,
    summary,
    evidence,
    receiptId,
    tx: txSignature,
  };
}

module.exports = {
  resolveDuel,
};
