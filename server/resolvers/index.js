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
const crypto = require('crypto');
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

// A ResolveDuel submission is an economic side effect. Keep a durable, unique
// attempt row so an HTTP retry (or two captains opening the same notification)
// cannot submit a second cancellation/settlement transaction. A failed
// attempt stays recorded as FAILED; recovery must inspect the chain rather
// than blindly sending another transaction.
function beginSettlementAttempt(duel, mode) {
  const existing = queryOne(`SELECT * FROM duel_settlement_attempts WHERE duel_id = ?`, [duel.id]);
  if (existing) return { acquired: false, existing };
  const attemptToken = `${new Date().toISOString()}_${crypto.randomBytes(8).toString('hex')}`;
  const now = new Date().toISOString();
  execute(
    `INSERT OR IGNORE INTO duel_settlement_attempts
      (duel_id, mode, state, created_at, updated_at)
     VALUES (?, ?, 'SUBMITTING', ?, ?)`,
    [duel.id, mode, attemptToken, now]
  );
  const current = queryOne(`SELECT * FROM duel_settlement_attempts WHERE duel_id = ?`, [duel.id]);
  // sql.js does not expose sqlite3_changes() consistently after a persisted
  // statement. Comparing the unique creation token still gives an atomic
  // insert winner under the single-process Counter service model.
  const inserted = !!current && current.created_at === attemptToken;
  return {
    acquired: inserted,
    existing: inserted ? null : current,
  };
}

function finishSettlementAttempt(duelId, result) {
  execute(
    `UPDATE duel_settlement_attempts
        SET state = ?, tx_signature = ?, result_json = ?, error = ?, updated_at = ?
      WHERE duel_id = ?`,
    [
      result.success ? 'SUCCEEDED' : 'FAILED',
      result.tx || result.resolution?.tx || null,
      JSON.stringify(result),
      result.success ? null : String(result.error || 'Settlement attempt failed'),
      new Date().toISOString(),
      duelId,
    ]
  );
}

async function settleOnce(duel, mode, operation) {
  const attempt = beginSettlementAttempt(duel, mode);
  if (!attempt.acquired) {
    if (attempt.existing?.state === 'SUCCEEDED' && attempt.existing.result_json) {
      return { ...JSON.parse(attempt.existing.result_json), idempotent: true };
    }
    return {
      success: false,
      error: attempt.existing?.state === 'FAILED'
        ? 'A previous settlement attempt failed; inspect its transaction status before recovery.'
        : 'Settlement is already in progress for this Duel',
      idempotent: true,
    };
  }

  let result;
  try {
    result = await operation();
  } catch (err) {
    result = { success: false, error: err?.message || 'Settlement attempt failed' };
  }
  finishSettlementAttempt(duel.id, result);
  return result;
}

async function resolveDuel(duelId, dependencies = {}) {
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

  if (!(Number(duel.side_a_total) > 0 && Number(duel.side_b_total) > 0)) {
    return { success: false, error: 'Both captain stakes must be confirmed before settlement' };
  }

  const mode = duel.resolution_mode || 'COUNTER_VERIFIED';
  if (mode === 'MUTUAL') {
    return resolveMutualDuel(duel, dependencies);
  }
  return resolveVerifiedDuel(duel, undefined, dependencies);
}

async function resolveVerifiedDuel(duel, forcedConfig, dependencies = {}) {
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
    return settleOnce(duel, 'COUNTER_VERIFIED', async () => {
      const txSignature = await (dependencies.submitSettlementTx || submitSettlementTx)(duel, winningSide);
      if (!txSignature.ok) return txSignature;
      return (dependencies.recordSettlement || recordSettlement)(duel, winningSide, {
        summary: resolutionResult.summary,
        evidence: { ...(resolutionResult.evidence || {}), resolutionMode: 'COUNTER_VERIFIED' },
        txSignature: txSignature.sig,
      });
    });
}

// MUTUAL settlement: a verified captain-pair match settles that exact side;
// past the agreement deadline the pre-agreed fallback executes (REFUND via
// on-chain Cancel, or the locked verified template). One captain alone,
// disputed pairs, and premature calls all fail closed with no state change.
async function resolveMutualDuel(duel, dependencies = {}) {
  const mutual = require('../mutual');
  const match = mutual.checkMatch(duel);
  if (match.matched) {
    return settleOnce(duel, 'MUTUAL', async () => {
      const txSignature = await (dependencies.submitSettlementTx || submitSettlementTx)(duel, match.winnerSide);
      if (!txSignature.ok) return txSignature;
      return (dependencies.recordSettlement || recordSettlement)(duel, match.winnerSide, {
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
    });
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const deadline = Number(duel.mutual_deadline_ts) || Number(duel.resolution_ts) || 0;
  // The deployed program accepts ResolveDuel(3) as Cancel once the agreed
  // resolution timestamp is reached. An explicit mismatch therefore becomes
  // refundable immediately at resolution; the 24-hour deadline remains only
  // for the no-second-vote timeout path.
  if (match.state === 'DISPUTED' && nowSec < Number(duel.resolution_ts || 0)) {
    return { success: false, error: 'Captains disagree. Refund opens at the agreed resolution time.' };
  }
  if (match.state !== 'DISPUTED' && (!deadline || nowSec < deadline)) {
    return { success: false, error: 'Awaiting both captains. Settlement unlocks on agreement or the fallback deadline.' };
  }

  const fallback = duel.fallback_mode || 'REFUND';
  if (fallback === 'COUNTER_VERIFIED') {
      return resolveVerifiedDuel(duel, undefined, dependencies);
  }
  // REFUND: on-chain Cancel returns every position principal (program-enforced).
  return settleOnce(duel, 'MUTUAL_REFUND', async () => {
    const txSignature = await (dependencies.submitSettlementTx || submitSettlementTx)(duel, 3);
    if (!txSignature.ok) return txSignature;
    return (dependencies.recordSettlement || recordSettlement)(duel, 0, {
      summary: match.state === 'DISPUTED'
        ? 'No agreement. Both stakes are being returned.'
        : 'No agreement reached. Both stakes are being returned.',
      evidence: { resolutionMode: 'MUTUAL', fallback: 'REFUND', votes: match.votes },
      txSignature: txSignature.sig,
      cancelled: true,
    });
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
    `INSERT OR IGNORE INTO receipts (id, duel_id, take_id, captain_a_wallet, captain_b_wallet, winner_wallet, total_pool, resolution_summary, resolution_evidence, onchain_signature, created_at)
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
  if (!cancelled) {
    const notifA = `notif_${duelId}_resolved_a`;
    const notifB = `notif_${duelId}_resolved_b`;
    execute(
      `INSERT OR IGNORE INTO activity (id, user_wallet, type, source_wallet, target_id, target_type, title, message, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      [notifA, duel.captain_a_wallet, 'DUEL_RESOLVED', 'system', receiptId, 'RECEIPT', 'Duel Resolved', summary, new Date().toISOString()]
    );
    execute(
      `INSERT OR IGNORE INTO activity (id, user_wallet, type, source_wallet, target_id, target_type, title, message, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      [notifB, duel.captain_b_wallet, 'DUEL_RESOLVED', 'system', receiptId, 'RECEIPT', 'Duel Resolved', summary, new Date().toISOString()]
    );
  }

  if (cancelled) {
    for (const wallet of [duel.captain_a_wallet, duel.captain_b_wallet]) {
      execute(
        `INSERT OR IGNORE INTO activity (id, user_wallet, type, source_wallet, target_id, target_type, title, message, is_read, created_at)
         VALUES (?, ?, 'NO_AGREEMENT', 'system', ?, 'DUEL', 'No agreement', ?, 0, ?)`,
        [`notif_${duelId}_no_agreement_${wallet === duel.captain_a_wallet ? 'a' : 'b'}`, wallet, duelId,
          'You and the other captain chose different results, so both stakes are being returned.', new Date().toISOString()]
      );
      execute(
        `INSERT OR IGNORE INTO activity (id, user_wallet, type, source_wallet, target_id, target_type, title, message, is_read, created_at)
         VALUES (?, ?, 'REFUND_READY', 'system', ?, 'DUEL', 'Refund ready', ?, 0, ?)`,
        [`notif_${duelId}_refund_ready_${wallet === duel.captain_a_wallet ? 'a' : 'b'}`, wallet, duelId,
          'Get your principal cUSD back. Both stakes are refundable.', new Date().toISOString()]
      );
    }
  } else {
    execute(
      `INSERT OR IGNORE INTO activity (id, user_wallet, type, source_wallet, target_id, target_type, title, message, is_read, created_at)
       VALUES (?, ?, 'WINNINGS_READY', 'system', ?, 'DUEL', 'Winnings ready', ?, 0, ?)`,
      [`notif_${duelId}_winnings_ready`, winnerWallet, duelId,
        'Your winning payout is ready to claim.', new Date().toISOString()]
    );
  }

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
