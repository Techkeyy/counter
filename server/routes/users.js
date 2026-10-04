const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const { queryAll, queryOne, execute } = require('../db');
const { requireAuth } = require('../auth');
const { querySkrStakedAmount } = require('../skr');
const profile = require('../profile');
const { getCusdBalance } = require('../chain');
const { buildPortfolio } = require('../portfolio');

// GET /api/users/portfolio (Authenticated; always the token wallet)
// Portfolio is a read-only view over chain balance plus verified Counter
// position/receipt facts. The wallet is never accepted from the URL or body.
router.get('/portfolio', requireAuth, async (req, res) => {
  const wallet = req.userWallet;
  try {
    const positions = queryAll(
      `SELECT p.duel_id, p.user_wallet, p.side, p.stake_amount, p.claimed,
              p.claim_tx, p.payout_amount, p.created_at,
              d.proposition_a, d.proposition_b, d.side_a_total, d.side_b_total,
              d.status, d.winning_side
       FROM positions p
       INNER JOIN duels d ON d.id = p.duel_id
       WHERE p.user_wallet = ?
       ORDER BY p.created_at DESC`,
      [wallet]
    );
    const balance = await getCusdBalance(wallet);
    res.json(buildPortfolio({ balance, positions }));
  } catch (error) {
    console.error('[PORTFOLIO] read failed:', error);
    res.status(503).json({ error: 'Portfolio balance is temporarily unavailable.' });
  }
});

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
    `SELECT COUNT(*) as count FROM duels WHERE COALESCE(is_archived, 0) = 0 AND (captain_a_wallet = ? OR captain_b_wallet = ?)`,
    [wallet, wallet]
  )?.count || 0;

  const wins = queryOne(
    `SELECT COUNT(*) as count FROM receipts WHERE winner_wallet = ?`,
    [wallet]
  )?.count || 0;

  const totalResolved = queryOne(
    `SELECT COUNT(*) as count FROM receipts r INNER JOIN duels d ON d.id = r.duel_id AND COALESCE(d.is_archived, 0) = 0 WHERE r.captain_a_wallet = ? OR r.captain_b_wallet = ?`,
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

// PUT /api/users/profile (Authenticated; own profile only — wallet comes
// from the verified token, never the client body)
router.put('/profile', requireAuth, (req, res) => {
  const wallet = req.userWallet;
  const { handle, displayName, bio } = req.body || {};
  const result = profile.updateProfile(wallet, { handle, displayName, bio });
  if (!result.ok) {
    const status = result.code === 'HANDLE_TAKEN' ? 409 : 400;
    return res.status(status).json({ error: result.error });
  }
  res.json({ user: result.user });
});

// POST /api/users/profile/avatar { dataUrl } (Authenticated; own profile only)
router.post('/profile/avatar', requireAuth, (req, res) => {
  const result = profile.setAvatar(req.userWallet, req.body && req.body.dataUrl);
  if (!result.ok) {
    const status = /smaller than/i.test(result.error || '') ? 413 : 400;
    return res.status(status).json({ error: result.error });
  }
  res.json({ user: result.user });
});

// DELETE /api/users/profile/avatar (Authenticated; own profile only)
router.delete('/profile/avatar', requireAuth, (req, res) => {
  const result = profile.removeAvatar(req.userWallet);
  res.json({ user: result.user });
});

// GET /api/users/profile/avatar/:file (public read; strict filename gate)
router.get('/profile/avatar/:file', (req, res) => {
  const file = req.params.file;
  if (!profile.isSafeAvatarFile(file)) {
    return res.status(404).json({ error: 'Avatar not found' });
  }
  const full = path.join(profile.defaultUploadDir(), file);
  if (!fs.existsSync(full)) {
    return res.status(404).json({ error: 'Avatar not found' });
  }
  const ext = file.split('.').pop();
  const type = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  res.setHeader('Content-Type', type);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  fs.createReadStream(full).pipe(res);
});

// GET /api/users/:wallet/rivalry/:opponentWallet (Head-to-head rivalry derivation)
router.get('/:wallet/rivalry/:opponentWallet', (req, res) => {
  const walletA = req.params.wallet;
  const walletB = req.params.opponentWallet;

  const headToHeadDuels = queryAll(
    `SELECT d.*, r.winner_wallet, r.resolution_summary, r.created_at as resolved_at
     FROM duels d
     LEFT JOIN receipts r ON d.id = r.duel_id
     WHERE COALESCE(d.is_archived, 0) = 0
       AND ((d.captain_a_wallet = ? AND d.captain_b_wallet = ?)
        OR (d.captain_a_wallet = ? AND d.captain_b_wallet = ?)
       )
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
