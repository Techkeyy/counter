const express = require('express');
const router = express.Router();
const { queryAll, queryOne } = require('../db');

// GET /api/receipts/:id
router.get('/:id', (req, res) => {
  const receipt = queryOne(
    `SELECT r.*, 
            d.proposition_a, d.proposition_b, d.category, d.terms_hash, d.side_a_total, d.side_b_total, d.winning_side, d.share_slug,
            ua.handle as captain_a_handle, ua.display_name as captain_a_name, ua.avatar_url as captain_a_avatar,
            ub.handle as captain_b_handle, ub.display_name as captain_b_name, ub.avatar_url as captain_b_avatar,
            t.topic, t.content as take_content
     FROM receipts r
     LEFT JOIN duels d ON r.duel_id = d.id
     LEFT JOIN users ua ON r.captain_a_wallet = ua.wallet_address
     LEFT JOIN users ub ON r.captain_b_wallet = ub.wallet_address
     LEFT JOIN takes t ON r.take_id = t.id
     WHERE r.id = ? OR r.duel_id = ?`,
    [req.params.id, req.params.id]
  );

  if (!receipt) {
    return res.status(404).json({ error: 'Receipt not found' });
  }

  const positions = queryAll(
    `SELECT p.*, u.handle, u.display_name FROM positions p LEFT JOIN users u ON p.user_wallet = u.wallet_address WHERE p.duel_id = ?`,
    [receipt.duel_id]
  );

  res.json({ receipt, positions });
});

// GET /api/receipts/user/:wallet
router.get('/user/:wallet', (req, res) => {
  const receipts = queryAll(
    `SELECT r.*, d.category, d.proposition_a, d.proposition_b, d.share_slug
     FROM receipts r
     LEFT JOIN duels d ON r.duel_id = d.id
     WHERE r.captain_a_wallet = ? OR r.captain_b_wallet = ? OR r.winner_wallet = ?
     ORDER BY r.created_at DESC`,
    [req.params.wallet, req.params.wallet, req.params.wallet]
  );

  res.json({ receipts });
});

module.exports = router;
