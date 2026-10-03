// Bilateral (MUTUAL) settlement: both captains attest the same winner with
// wallet-signed messages; only a matched pair may settle on-chain.
//
// Cryptography boundary (honest): each confirmation is an ed25519 signature
// over an exact canonical message, verified here against the captain's
// on-file wallet. The Solana program does NOT verify both confirmations
// on-chain (no program change); the on-chain leg remains a resolver-authority
// ResolveDuel, submitted by the server ONLY after a verified match (or the
// pre-agreed fallback past the deadline). Never claim on-chain enforcement.
const naclMod = require('tweetnacl');
const nacl = naclMod.default || naclMod;
const bs58Module = require('bs58');
const bs58 = bs58Module.default || bs58Module;
const { queryAll, queryOne, execute } = require('./db');

function settlementMessage(duelId, winnerSide, resolutionAt) {
  return `COUNTER_SETTLEMENT_V1|duel_id=${duelId}|winner_side=${winnerSide}|mode=MUTUAL|at=${resolutionAt}`;
}

function verifySettlementSignature(walletBase58, message, signatureBase58) {
  try {
    const sig = bs58.decode(signatureBase58);
    const pub = bs58.decode(walletBase58);
    return nacl.sign.detached.verify(Buffer.from(message, 'utf8'), sig, pub);
  } catch {
    return false;
  }
}

function getVotes(duelId) {
  try {
    return queryAll(`SELECT * FROM mutual_votes WHERE duel_id = ? ORDER BY updated_at ASC`, [duelId]);
  } catch {
    return [];
  }
}

// Record (or pre-match update of) a captain's attestation. Votes lock once the
// duel leaves the open state.
function recordVote(duel, captainWallet, winnerSide, signature) {
  if (!duel) return { ok: false, error: 'Duel not found' };
  if (captainWallet !== duel.captain_a_wallet && captainWallet !== duel.captain_b_wallet) {
    return { ok: false, error: 'Only duel captains may confirm a result' };
  }
  if (winnerSide !== 1 && winnerSide !== 2) {
    return { ok: false, error: 'Winner side must be 1 or 2' };
  }
  const status = String(duel.status || '');
  if (status.startsWith('RESOLVED') || status === 'CANCELLED') {
    return { ok: false, error: 'Duel is already settled; votes are locked' };
  }
  const nowSec = Math.floor(Date.now() / 1000);
  const currentMatch = checkMatch(duel);
  if (currentMatch.state === 'DISPUTED' && nowSec >= Number(duel.resolution_ts || 0)) {
    return { ok: false, error: 'No agreement is final; refund is available' };
  }
  if (duel.resolution_ts && nowSec < Number(duel.resolution_ts)) {
    return { ok: false, error: 'Settlement confirmations open at resolution time' };
  }
  const message = settlementMessage(duel.id, winnerSide, Number(duel.resolution_ts) || nowSec);
  if (!verifySettlementSignature(captainWallet, message, signature)) {
    return { ok: false, error: 'Settlement signature does not verify for this captain and duel' };
  }
  const now = new Date().toISOString();
  const existing = queryOne(`SELECT * FROM mutual_votes WHERE duel_id = ? AND captain_wallet = ?`, [duel.id, captainWallet]);
  if (existing) {
    execute(
      `UPDATE mutual_votes SET winner_side = ?, message = ?, signature = ?, updated_at = ? WHERE duel_id = ? AND captain_wallet = ?`,
      [winnerSide, message, signature, now, duel.id, captainWallet]
    );
  } else {
    execute(
      `INSERT INTO mutual_votes (duel_id, captain_wallet, winner_side, message, signature, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [duel.id, captainWallet, winnerSide, message, signature, now, now]
    );
  }
  return { ok: true, votes: getVotes(duel.id) };
}

// Returns { matched, winnerSide, votes } — settlement allowed only on matched.
function checkMatch(duel) {
  const votes = getVotes(duel.id);
  const byCaptain = {};
  for (const v of votes) byCaptain[v.captain_wallet] = Number(v.winner_side);
  const a = byCaptain[duel.captain_a_wallet];
  const b = byCaptain[duel.captain_b_wallet];
  if ((a === 1 || a === 2) && a === b) {
    return { matched: true, winnerSide: a, votes };
  }
  const voted = [a, b].filter((s) => s === 1 || s === 2).length;
  return {
    matched: false,
    winnerSide: 0,
    votes,
    state: voted === 2 ? 'DISPUTED' : voted === 1 ? 'AWAITING_COUNTERPARTY' : 'AWAITING_VOTES',
  };
}

module.exports = {
  settlementMessage,
  verifySettlementSignature,
  getVotes,
  recordVote,
  checkMatch,
};
