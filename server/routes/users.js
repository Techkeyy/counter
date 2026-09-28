const express = require('express');
const router = express.Router();
const { queryAll, queryOne, execute } = require('../db');
const { requireAuth } = require('../auth');
const { querySkrStakedAmount } = require('../skr');

// GET /api/users/:wallet
router.get('/:wallet', async (req, res) => {
  const wallet = req.params.wallet;
  let user = queryOne(`SELECT * FROM users WHERE wallet_address = ?`, [wallet]);

  if (!user) {
    const defaultHandle = `user_${wallet.slice(0, 4)}_${wallet.slice(-4)}`;
    execute(
      `INSERT INTO users (wallet_address, handle, display_name, avatar_url, bio, skr_staked_amount, is_arena_eligible, is_age_verified, created_at)
       VALUES (?, ?, ?, '', 'Solana Mobile Contender', 0, 0, 1, ?)`,
      [wallet, defaultHandle, defaultHandle, new Date().toISOString()]
    );
    user = queryOne(`SELECT * FROM users WHERE wallet_address = ?`, [wallet]);
  }

  // Aggregate stats
  const totalDuelsAsCaptain = queryOne(
    `SELECT COUNT(*) as count FROM duels WHERE captain_a_wallet = ? OR captain_b_wallet = ?`,
    [wallet, wallet]
  )?.count || 0;

  const wins = queryOne(
    `SELECT COUNT(*) as count FROM receipts WHERE winner_wallet = ?`,
    [wallet]
  )?.count || 0;

  const totalResolved = queryOne(
    `SELECT COUNT(*) as count FROM receipts WHERE captain_a_wallet = ? OR captain_b_wallet = ?`,
    [wallet, wallet]
  )?.count || 0;

  const losses = Math.max(0, totalResolved - wins);
  const pending = Math.max(0, totalDuelsAsCaptain - totalResolved);

  // SKR stake check
  try {
    const skrRes = await querySkrStakedAmount(wallet);
    if (skrRes.stakedAmountSkr !== user.skr_staked_amount) {
      execute(
        `UPDATE users SET skr_staked_amount = ?, is_arena_eligible = ? WHERE wallet_address = ?`,
        [skrRes.stakedAmountSkr, skrRes.isEligible ? 1 : 0, wallet]
      );
      user.skr_staked_amount = skrRes.stakedAmountSkr;
      user.is_arena_eligible = skrRes.isEligible ? 1 : 0;
    }
  } catch (e) {}

  res.json({
    user,
    stats: {
      totalDuels: totalDuelsAsCaptain,
      wins,
      losses,
      pending,
      winRate: totalResolved > 0 ? ((wins / totalResolved) * 100).toFixed(1) + '%' : '0%',
    },
  });
});

// PUT /api/users/profile (Authenticated)
router.put('/profile', requireAuth, (req, res) => {
  const wallet = req.userWallet;
  const { handle, displayName, avatarUrl, bio } = req.body;

  execute(
    `UPDATE users SET
      handle = COALESCE(?, handle),
      display_name = COALESCE(?, display_name),
      avatar_url = COALESCE(?, avatar_url),
      bio = COALESCE(?, bio)
     WHERE wallet_address = ?`,
    [handle, displayName, avatarUrl, bio, wallet]
  );

  const updated = queryOne(`SELECT * FROM users WHERE wallet_address = ?`, [wallet]);
  res.json({ user: updated });
});

// GET /api/users/:wallet/rivalry/:opponentWallet (Head-to-head rivalry derivation)
router.get('/:wallet/rivalry/:opponentWallet', (req, res) => {
  const walletA = req.params.wallet;
  const walletB = req.params.opponentWallet;

  const headToHeadDuels = queryAll(
    `SELECT d.*, r.winner_wallet, r.resolution_summary, r.created_at as resolved_at
     FROM duels d
     LEFT JOIN receipts r ON d.id = r.duel_id
     WHERE (d.captain_a_wallet = ? AND d.captain_b_wallet = ?)
        OR (d.captain_a_wallet = ? AND d.captain_b_wallet = ?)
     ORDER BY d.created_at DESC`,
    [walletA, walletB, walletB, walletA]
  );

  let winsA = 0;
  let winsB = 0;
  let totalDisputedVolume = 0;

  headToHeadDuels.forEach((d) => {
    totalDisputedVolume += (Number(d.side_a_total) || 0) + (Number(d.side_b_total) || 0);
    if (d.winner_wallet === walletA) winsA++;
    if (d.winner_wallet === walletB) winsB++;
  });

  const userA = queryOne(`SELECT wallet_address, handle, display_name, avatar_url FROM users WHERE wallet_address = ?`, [walletA]);
  const userB = queryOne(`SELECT wallet_address, handle, display_name, avatar_url FROM users WHERE wallet_address = ?`, [walletB]);

  res.json({
    userA,
    userB,
    score: `${winsA} - ${winsB}`,
    winsA,
    winsB,
    totalDuels: headToHeadDuels.length,
    totalDisputedVolume,
    history: headToHeadDuels,
  });
});

module.exports = router;
