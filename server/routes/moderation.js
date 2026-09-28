const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { queryAll, queryOne, execute } = require('../db');
const { requireAuth } = require('../auth');

// POST /api/moderation/report
router.post('/report', requireAuth, (req, res) => {
  const reporterWallet = req.userWallet;
  const { targetType, targetId, reason } = req.body;

  if (!targetType || !targetId) {
    return res.status(400).json({ error: 'targetType and targetId are required' });
  }

  const id = `rep_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  execute(
    `INSERT INTO reports (id, reporter_wallet, target_type, target_id, reason, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'PENDING', ?)`,
    [id, reporterWallet, targetType, targetId, reason || 'Inappropriate content', new Date().toISOString()]
  );

  res.status(201).json({ success: true, reportId: id });
});

// POST /api/moderation/block
router.post('/block', requireAuth, (req, res) => {
  const blockerWallet = req.userWallet;
  const { blockedWallet } = req.body;

  if (!blockedWallet) {
    return res.status(400).json({ error: 'blockedWallet is required' });
  }

  const id = `blk_${blockerWallet}_${blockedWallet}`;
  execute(
    `INSERT OR IGNORE INTO blocks (id, blocker_wallet, blocked_wallet, created_at) VALUES (?, ?, ?, ?)`,
    [id, blockerWallet, blockedWallet, new Date().toISOString()]
  );

  res.json({ success: true, blocked: blockedWallet });
});

// GET /api/moderation/blocks
router.get('/blocks', requireAuth, (req, res) => {
  const blockerWallet = req.userWallet;
  const blocks = queryAll(`SELECT * FROM blocks WHERE blocker_wallet = ?`, [blockerWallet]);
  res.json({ blocks });
});

module.exports = router;
