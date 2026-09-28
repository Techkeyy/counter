const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { queryAll, queryOne, execute } = require('../db');
const { requireAuth } = require('../auth');

// GET /api/takes
router.get('/', (req, res) => {
  const { category, author } = req.query;
  let sql = `
    SELECT t.*, u.handle, u.display_name, u.avatar_url, u.is_arena_eligible, u.skr_staked_amount
    FROM takes t
    LEFT JOIN users u ON t.author_wallet = u.wallet_address
    WHERE t.status = 'ACTIVE'
  `;
  const params = [];

  if (category) {
    sql += ` AND t.category = ?`;
    params.push(category);
  }
  if (author) {
    sql += ` AND t.author_wallet = ?`;
    params.push(author);
  }

  sql += ` ORDER BY t.created_at DESC LIMIT 50`;
  const takes = queryAll(sql, params);
  res.json({ takes });
});

// POST /api/takes (Authenticated)
router.post('/', requireAuth, (req, res) => {
  const { topic, content, category } = req.body;
  const authorWallet = req.userWallet;

  if (!content || !topic) {
    return res.status(400).json({ error: 'topic and content are required' });
  }

  const id = `take_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const now = new Date().toISOString();

  execute(
    `INSERT INTO takes (id, author_wallet, topic, content, category, created_at, status, likes_count, comments_count, duels_count)
     VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', 0, 0, 0)`,
    [id, authorWallet, topic, content, category || 'crypto', now]
  );

  const take = queryOne(
    `SELECT t.*, u.handle, u.display_name, u.avatar_url FROM takes t LEFT JOIN users u ON t.author_wallet = u.wallet_address WHERE t.id = ?`,
    [id]
  );

  res.status(201).json({ take });
});

// GET /api/takes/:id
router.get('/:id', (req, res) => {
  const take = queryOne(
    `SELECT t.*, u.handle, u.display_name, u.avatar_url, u.is_arena_eligible FROM takes t LEFT JOIN users u ON t.author_wallet = u.wallet_address WHERE t.id = ?`,
    [req.params.id]
  );

  if (!take) {
    return res.status(404).json({ error: 'Take not found' });
  }

  const comments = queryAll(
    `SELECT c.*, u.handle, u.display_name, u.avatar_url FROM comments c LEFT JOIN users u ON c.author_wallet = u.wallet_address WHERE c.take_id = ? ORDER BY c.created_at ASC`,
    [req.params.id]
  );

  const duels = queryAll(
    `SELECT d.*, ua.handle as captain_a_handle, ub.handle as captain_b_handle
     FROM duels d
     LEFT JOIN users ua ON d.captain_a_wallet = ua.wallet_address
     LEFT JOIN users ub ON d.captain_b_wallet = ub.wallet_address
     WHERE d.take_id = ? ORDER BY d.created_at DESC`,
    [req.params.id]
  );

  res.json({ take, comments, duels });
});

// POST /api/takes/:id/comments (Authenticated)
router.post('/:id/comments', requireAuth, (req, res) => {
  const { content } = req.body;
  const authorWallet = req.userWallet;
  const takeId = req.params.id;

  if (!content) {
    return res.status(400).json({ error: 'content is required' });
  }

  const take = queryOne(`SELECT * FROM takes WHERE id = ?`, [takeId]);
  if (!take) {
    return res.status(404).json({ error: 'Take not found' });
  }

  const commentId = `comm_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const now = new Date().toISOString();

  execute(
    `INSERT INTO comments (id, take_id, author_wallet, content, created_at) VALUES (?, ?, ?, ?, ?)`,
    [commentId, takeId, authorWallet, content, now]
  );

  execute(`UPDATE takes SET comments_count = comments_count + 1 WHERE id = ?`, [takeId]);

  // Activity notification for Take author
  if (take.author_wallet !== authorWallet) {
    execute(
      `INSERT INTO activity (id, user_wallet, type, source_wallet, target_id, target_type, title, message, is_read, created_at)
       VALUES (?, ?, 'COMMENT_ADDED', ?, ?, 'TAKE', 'New Comment on Your Take', ?, 0, ?)`,
      [`act_${Date.now()}`, take.author_wallet, authorWallet, takeId, content.slice(0, 80), now]
    );
  }

  const comment = queryOne(
    `SELECT c.*, u.handle, u.display_name, u.avatar_url FROM comments c LEFT JOIN users u ON c.author_wallet = u.wallet_address WHERE c.id = ?`,
    [commentId]
  );

  res.status(201).json({ comment });
});

module.exports = router;
