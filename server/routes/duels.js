const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { queryAll, queryOne, execute } = require('../db');
const { requireAuth } = require('../auth');
const { resolveDuel } = require('../resolvers');
const { querySkrStakedAmount } = require('../skr');

// GET /api/duels (Feed / Arena list)
router.get('/', (req, res) => {
  const { isArena, category, status } = req.query;
  let sql = `
    SELECT d.*, 
           ua.handle as captain_a_handle, ua.display_name as captain_a_name, ua.avatar_url as captain_a_avatar,
           ub.handle as captain_b_handle, ub.display_name as captain_b_name, ub.avatar_url as captain_b_avatar,
           t.topic, t.content as take_content
    FROM duels d
    LEFT JOIN users ua ON d.captain_a_wallet = ua.wallet_address
    LEFT JOIN users ub ON d.captain_b_wallet = ub.wallet_address
    LEFT JOIN takes t ON d.take_id = t.id
    WHERE 1=1
  `;
  const params = [];

  if (isArena === '1' || isArena === 'true') {
    sql += ` AND d.is_arena = 1`;
  }
  if (category) {
    sql += ` AND d.category = ?`;
    params.push(category);
  }
  if (status) {
    sql += ` AND d.status = ?`;
    params.push(status);
  }

  sql += ` ORDER BY d.created_at DESC LIMIT 50`;
  const duels = queryAll(sql, params);

  // Compute parimutuel odds for each duel
  const enrichedDuels = duels.map((d) => {
    const sideA = Number(d.side_a_total) || 0;
    const sideB = Number(d.side_b_total) || 0;
    const total = sideA + sideB;
    const oddsA = sideA > 0 ? (total / sideA).toFixed(2) : '1.00';
    const oddsB = sideB > 0 ? (total / sideB).toFixed(2) : '1.00';
    return {
      ...d,
      total_pool: total,
      odds_a: oddsA,
      odds_b: oddsB,
    };
  });

  res.json({ duels: enrichedDuels });
});

// GET /api/duels/:id
router.get('/:id', (req, res) => {
  const duel = queryOne(
    `SELECT d.*, 
            ua.handle as captain_a_handle, ua.display_name as captain_a_name, ua.avatar_url as captain_a_avatar,
            ub.handle as captain_b_handle, ub.display_name as captain_b_name, ub.avatar_url as captain_b_avatar,
            t.topic, t.content as take_content
     FROM duels d
     LEFT JOIN users ua ON d.captain_a_wallet = ua.wallet_address
     LEFT JOIN users ub ON d.captain_b_wallet = ub.wallet_address
     LEFT JOIN takes t ON d.take_id = t.id
     WHERE d.id = ? OR d.share_slug = ?`,
    [req.params.id, req.params.id]
  );

  if (!duel) {
    return res.status(404).json({ error: 'Duel not found' });
  }

  const positions = queryAll(
    `SELECT p.*, u.handle, u.display_name, u.avatar_url FROM positions p LEFT JOIN users u ON p.user_wallet = u.wallet_address WHERE p.duel_id = ? ORDER BY p.stake_amount DESC`,
    [duel.id]
  );

  const receipt = queryOne(`SELECT * FROM receipts WHERE duel_id = ?`, [duel.id]);

  const sideA = Number(duel.side_a_total) || 0;
  const sideB = Number(duel.side_b_total) || 0;
  const total = sideA + sideB;
  const oddsA = sideA > 0 ? (total / sideA).toFixed(2) : '1.00';
  const oddsB = sideB > 0 ? (total / sideB).toFixed(2) : '1.00';

  res.json({
    duel: {
      ...duel,
      total_pool: total,
      odds_a: oddsA,
      odds_b: oddsB,
    },
    positions,
    receipt,
  });
});

// POST /api/duels/:id/init-onchain (Record on-chain PDA addresses)
router.post('/:id/init-onchain', requireAuth, (req, res) => {
  const duelId = req.params.id;
  const { onchainDuelPda, onchainVaultPda, vaultTokenAccount } = req.body;

  const duel = queryOne(`SELECT * FROM duels WHERE id = ?`, [duelId]);
  if (!duel) {
    return res.status(404).json({ error: 'Duel not found' });
  }

  execute(
    `UPDATE duels SET onchain_duel_pda = ?, onchain_vault_pda = ?, vault_token_account = ? WHERE id = ?`,
    [onchainDuelPda, onchainVaultPda, vaultTokenAccount, duelId]
  );

  res.json({ success: true, duelId, onchainDuelPda });
});

// POST /api/duels/:id/stake (Record confirmed on-chain stake deposit)
router.post('/:id/stake', requireAuth, (req, res) => {
  const duelId = req.params.id;
  const userWallet = req.userWallet;
  const { side, amount, positionPda, txSignature } = req.body;

  if (!side || !amount) {
    return res.status(400).json({ error: 'side and amount are required' });
  }

  const duel = queryOne(`SELECT * FROM duels WHERE id = ?`, [duelId]);
  if (!duel) {
    return res.status(404).json({ error: 'Duel not found' });
  }

  const sideNum = Number(side);
  const amountNum = Number(amount);

  // Check existing position
  const posId = `pos_${duelId}_${userWallet}`;
  const existingPos = queryOne(`SELECT * FROM positions WHERE id = ?`, [posId]);

  if (existingPos) {
    execute(
      `UPDATE positions SET stake_amount = stake_amount + ? WHERE id = ?`,
      [amountNum, posId]
    );
  } else {
    execute(
      `INSERT INTO positions (id, duel_id, user_wallet, side, stake_amount, position_pda, claimed, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
      [posId, duelId, userWallet, sideNum, amountNum, positionPda || '', new Date().toISOString()]
    );
  }

  // Update total pool amounts in duel
  if (sideNum === 1) {
    execute(`UPDATE duels SET side_a_total = side_a_total + ? WHERE id = ?`, [amountNum, duelId]);
  } else if (sideNum === 2) {
    execute(`UPDATE duels SET side_b_total = side_b_total + ? WHERE id = ?`, [amountNum, duelId]);
  }

  // Activity feed
  execute(
    `INSERT INTO activity (id, user_wallet, type, source_wallet, target_id, target_type, title, message, is_read, created_at)
     VALUES (?, ?, 'STAKE_DEPOSITED', ?, ?, 'DUEL', 'Stake Deposited', ?, 0, ?)`,
    [`act_${Date.now()}`, userWallet, userWallet, duelId, `Staked $${amountNum} cUSD on Side ${sideNum === 1 ? 'A' : 'B'}`, new Date().toISOString()]
  );

  const updatedDuel = queryOne(`SELECT * FROM duels WHERE id = ?`, [duelId]);
  res.json({ success: true, duel: updatedDuel });
});

// POST /api/duels/:id/resolve (Trigger resolution engine)
router.post('/:id/resolve', async (req, res) => {
  const duelId = req.params.id;
  const result = await resolveDuel(duelId);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  res.json({ success: true, resolution: result });
});

// POST /api/duels/:id/publish-arena (Verify Mainnet SKR stake and promote to Arena)
router.post('/:id/publish-arena', requireAuth, async (req, res) => {
  const duelId = req.params.id;
  const userWallet = req.userWallet;

  const duel = queryOne(`SELECT * FROM duels WHERE id = ?`, [duelId]);
  if (!duel) {
    return res.status(404).json({ error: 'Duel not found' });
  }

  // Verify caller is one of the Captains
  if (duel.captain_a_wallet !== userWallet && duel.captain_b_wallet !== userWallet) {
    return res.status(403).json({ error: 'Only Captains can publish a Duel to the Arena' });
  }

  // Verify Mainnet SKR stake
  const skrRes = await querySkrStakedAmount(userWallet);
  if (!skrRes.isEligible) {
    return res.status(403).json({
      error: 'Arena requires active SKR staking (> 0 SKR) on Solana Mainnet',
      skrStake: skrRes.stakedAmountSkr,
      userStakePda: skrRes.userStakePda,
    });
  }

  execute(`UPDATE duels SET is_arena = 1 WHERE id = ?`, [duelId]);
  execute(`UPDATE users SET is_arena_eligible = 1, skr_staked_amount = ? WHERE wallet_address = ?`, [skrRes.stakedAmountSkr, userWallet]);

  res.json({
    success: true,
    isArena: 1,
    skrStake: skrRes.stakedAmountSkr,
    userStakePda: skrRes.userStakePda,
  });
});

module.exports = router;
