const express = require('express');
const router = express.Router();
const { queryAll, execute } = require('../db');
const { requireAuth } = require('../auth');

// GET /api/activity
router.get('/', requireAuth, (req, res) => {
  const userWallet = req.userWallet;
  const activity = queryAll(
    `SELECT * FROM activity WHERE user_wallet = ? ORDER BY created_at DESC LIMIT 50`,
    [userWallet]
  );
  res.json({ activity });
});

// POST /api/activity/read-all
router.post('/read-all', requireAuth, (req, res) => {
  const userWallet = req.userWallet;
  execute(`UPDATE activity SET is_read = 1 WHERE user_wallet = ?`, [userWallet]);
  res.json({ success: true });
});

module.exports = router;
