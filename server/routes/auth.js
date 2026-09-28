const express = require('express');
const router = express.Router();
const { generateNonce, verifySignature } = require('../auth');
const { queryOne, execute } = require('../db');
const { querySkrStakedAmount } = require('../skr');

// GET /api/auth/nonce?wallet=<pubkey>
router.get('/nonce', (req, res) => {
  const { wallet } = req.query;
  if (!wallet) {
    return res.status(400).json({ error: 'wallet query parameter is required' });
  }

  const { nonce, expiresAt } = generateNonce(wallet);
  res.json({ wallet, nonce, expiresAt });
});

// POST /api/auth/verify
router.post('/verify', async (req, res) => {
  const { wallet, signature, nonce } = req.body;
  if (!wallet || !signature || !nonce) {
    return res.status(400).json({ error: 'wallet, signature, and nonce are required' });
  }

  const result = verifySignature(wallet, signature, nonce);
  if (!result.valid) {
    return res.status(401).json({ error: result.error });
  }

  // Check or initialize user profile
  let user = queryOne(`SELECT * FROM users WHERE wallet_address = ?`, [wallet]);
  if (!user) {
    const defaultHandle = `user_${wallet.slice(0, 4)}_${wallet.slice(-4)}`;
    execute(
      `INSERT INTO users (wallet_address, handle, display_name, avatar_url, bio, skr_staked_amount, is_arena_eligible, is_age_verified, created_at)
       VALUES (?, ?, ?, ?, ?, 0, 0, 1, ?)`,
      [wallet, defaultHandle, defaultHandle, '', 'Solana Mobile Contender', new Date().toISOString()]
    );
    user = queryOne(`SELECT * FROM users WHERE wallet_address = ?`, [wallet]);
  }

  // Async query live mainnet SKR stake
  querySkrStakedAmount(wallet).then((skrRes) => {
    execute(
      `UPDATE users SET skr_staked_amount = ?, is_arena_eligible = ? WHERE wallet_address = ?`,
      [skrRes.stakedAmountSkr, skrRes.isEligible ? 1 : 0, wallet]
    );
  }).catch(() => {});

  res.json({
    token: result.token,
    user,
  });
});

module.exports = router;
