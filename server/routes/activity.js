const express = require('express');
const router = express.Router();
const { queryAll, execute } = require('../db');
const { requireAuth } = require('../auth');
const { deriveDuelState } = require('../duel-state');

function noConditionalListCache(req, res, next) {
  delete req.headers['if-none-match'];
  delete req.headers['if-modified-since'];
  res.set({ 'Cache-Control': 'no-store, no-cache, must-revalidate', Pragma: 'no-cache', Expires: '0' });
  next();
}

function captainName(duel, wallet) {
  const handle = wallet === duel.captain_a_wallet ? duel.captain_a_handle : duel.captain_b_handle;
  const displayName = wallet === duel.captain_a_wallet ? duel.captain_a_name : duel.captain_b_name;
  if (handle) return `@${String(handle).replace(/^@/, '')}`;
  if (displayName) return displayName;
  return `${String(wallet).slice(0, 4)}…${String(wallet).slice(-4)}`;
}

// Read-only derived lifecycle items. They are deterministic by duel + viewer,
// so repeated open/resume/focus requests never create duplicate notifications.
// Persisted activity remains authoritative for historical events; these items
// only fill the gap where time made a Duel actionable without a new write.
function derivedDuelActivity(userWallet) {
  const mutual = require('../mutual');
  const duels = queryAll(
    `SELECT d.*, ua.handle AS captain_a_handle, ua.display_name AS captain_a_name,
            ub.handle AS captain_b_handle, ub.display_name AS captain_b_name
       FROM duels d
       LEFT JOIN users ua ON d.captain_a_wallet = ua.wallet_address
       LEFT JOIN users ub ON d.captain_b_wallet = ub.wallet_address
      WHERE (d.captain_a_wallet = ? OR d.captain_b_wallet = ?)
        AND COALESCE(d.is_archived, 0) = 0
        AND (d.resolution_mode = 'MUTUAL' OR d.resolution_mode IS NULL)`,
    [userWallet, userWallet]
  );
  const nowSec = Math.floor(Date.now() / 1000);
  const derived = [];

  for (const duel of duels) {
    const otherWallet = duel.captain_a_wallet === userWallet ? duel.captain_b_wallet : duel.captain_a_wallet;
    const other = captainName(duel, otherWallet);
    const match = mutual.checkMatch(duel);
    const votes = Array.isArray(match.votes) ? match.votes : [];
    const mine = votes.some((vote) => vote.captain_wallet === userWallet);
    const otherVoted = votes.some((vote) => vote.captain_wallet !== userWallet);
    const timestamp = new Date(Number(duel.resolution_ts || nowSec) * 1000).toISOString();
    const add = (type, title, message, suffix, isRead = 0) => derived.push({
      id: `derived_${type.toLowerCase()}_${duel.id}_${userWallet}_${suffix}`,
      user_wallet: userWallet,
      type,
      source_wallet: otherWallet,
      target_id: duel.id,
      target_type: 'DUEL',
      title,
      message,
      is_read: isRead,
      created_at: timestamp,
    });

    const effectiveState = deriveDuelState(duel, nowSec);
    if (effectiveState === 'EXPIRED') {
      add('DUEL_EXPIRED', 'Duel expired', 'This Duel expired before both captains funded it.', 'expired');
      continue;
    }
    if (duel.status === 'CANCELLED') {
      if (effectiveState === 'REFUNDED') {
        add('NO_AGREEMENT', 'No agreement', `You and ${other} did not reach an agreement, so both stakes are being returned.`, 'no-agreement');
        add('REFUND_READY', 'Refund ready', 'Get your principal cUSD back. Both stakes are refundable.', 'refund');
      } else {
        add('DUEL_CANCELLED', 'Duel cancelled', 'This Duel was cancelled before completion.', 'cancelled');
      }
      continue;
    }
    if (String(duel.status || '').startsWith('RESOLVED')) continue;
    if ((duel.chain_status || 'UNINITIALIZED') !== 'INITIALIZED') continue;
    if (!(Number(duel.side_a_total) > 0 && Number(duel.side_b_total) > 0)) continue;
    if (nowSec < Number(duel.resolution_ts || 0)) continue;

    if (!mine && otherVoted) {
      add('OPPONENT_SUBMITTED_RESULT', 'Opponent submitted their result', `${other} submitted their result.`, 'opponent-result');
    } else if (!mine) {
      add('READY_TO_SETTLE', 'Ready to settle', `Your Duel with ${other} is ready. Choose who won.`, 'ready');
    } else if (!otherVoted) {
      add('WAITING_FOR_OTHER_RESULT', 'Waiting for opponent', `Waiting for ${other}.`, 'waiting', 1);
    }
  }
  return derived;
}

// GET /api/activity
router.get('/', noConditionalListCache, requireAuth, (req, res) => {
  const userWallet = req.userWallet;
  const persisted = queryAll(
    `SELECT * FROM activity WHERE user_wallet = ? AND COALESCE(is_archived, 0) = 0 ORDER BY created_at DESC LIMIT 50`,
    [userWallet]
  );
  const existingKeys = new Set(persisted.map((item) => `${item.type}|${item.target_id}`));
  const derived = derivedDuelActivity(userWallet).filter(
    (item) => !existingKeys.has(`${item.type}|${item.target_id}`)
  );
  const activity = [...persisted, ...derived]
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, 50);
  res.json({ activity });
});

// POST /api/activity/read-all
router.post('/read-all', requireAuth, (req, res) => {
  const userWallet = req.userWallet;
  execute(`UPDATE activity SET is_read = 1 WHERE user_wallet = ? AND COALESCE(is_archived, 0) = 0`, [userWallet]);
  res.json({ success: true });
});

module.exports = router;
