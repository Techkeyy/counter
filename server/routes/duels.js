const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { queryAll, queryOne, execute } = require('../db');
const { requireAuth, optionalAuth } = require('../auth');
const { resolveDuel } = require('../resolvers');
const { querySkrStakedAmount } = require('../skr');
const chain = require('../chain');
const { PublicKey, Keypair } = require('@solana/web3.js');
const fs = require('fs');

/** Server resolver authority pubkey (fail-fast: never invent one). */
function getResolverPublicKey() {
  if (process.env.RESOLVER_PUBKEY) return process.env.RESOLVER_PUBKEY;
  const keypairPath = process.env.KEYPAIR_PATH || 'C:\\Users\\HomePC\\.config\\solana\\compart-devnet-upgrade.json';
  if (fs.existsSync(keypairPath)) {
    return Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, 'utf-8')))
    ).publicKey.toBase58();
  }
  throw new Error('Server resolver authority not configured (KEYPAIR_PATH)');
}

/** Ensure the duel row carries a valid canonical 16-byte on-chain id. */
function ensureCanonicalDuelId(duel) {
  let id = duel.onchain_duel_id;
  try {
    chain.duelIdBytesFromHex(id);
    return id;
  } catch {
    id = crypto.randomBytes(16).toString('hex');
    execute(`UPDATE duels SET onchain_duel_id = ? WHERE id = ?`, [id, duel.id]);
    duel.onchain_duel_id = id;
    return id;
  }
}

// GET /api/duels (Feed / Arena list)
router.get('/', (req, res) => {
  const { isArena, category, status } = req.query;
  let sql = `
    SELECT d.*, c.stake_amount_usd AS stake_amount_usd,
           ua.handle as captain_a_handle, ua.display_name as captain_a_name, ua.avatar_url as captain_a_avatar,
           ub.handle as captain_b_handle, ub.display_name as captain_b_name, ub.avatar_url as captain_b_avatar,
           t.topic, t.content as take_content
    FROM duels d
    LEFT JOIN users ua ON d.captain_a_wallet = ua.wallet_address
    LEFT JOIN users ub ON d.captain_b_wallet = ub.wallet_address
    LEFT JOIN challenges c ON d.challenge_id = c.id
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
router.get('/:id', optionalAuth, (req, res) => {
  const duel = queryOne(
    `SELECT d.*, c.stake_amount_usd AS stake_amount_usd,
            ua.handle as captain_a_handle, ua.display_name as captain_a_name, ua.avatar_url as captain_a_avatar,
            ub.handle as captain_b_handle, ub.display_name as captain_b_name, ub.avatar_url as captain_b_avatar,
            t.topic, t.content as take_content
     FROM duels d
     LEFT JOIN users ua ON d.captain_a_wallet = ua.wallet_address
     LEFT JOIN users ub ON d.captain_b_wallet = ub.wallet_address
     LEFT JOIN challenges c ON d.challenge_id = c.id
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

  let mutualVotes = [];
  try {
    mutualVotes = queryAll(`SELECT * FROM mutual_votes WHERE duel_id = ? ORDER BY updated_at ASC`, [duel.id]);
  } catch {}
  const mutual = require('../mutual');
  const match = mutual.checkMatch(duel);
  const viewerWallet = req.userWallet || null;
  const viewerVotes = viewerWallet
    ? mutualVotes
      .filter((vote) => vote.captain_wallet === viewerWallet)
      .map((vote) => ({ captain_wallet: vote.captain_wallet, winner_side: Number(vote.winner_side), updated_at: vote.updated_at }))
    : [];

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
    // Never return the other captain's winner_side or signature. The client
    // receives only its own private choice plus a coarse lifecycle state.
    mutualVotes: viewerVotes,
    mutualState: match.matched ? 'MATCHED' : match.state,
    otherVoteSubmitted: viewerWallet
      ? mutualVotes.some((vote) => vote.captain_wallet !== viewerWallet)
      : false,
  });
});

// GET /api/duels/:id/chain-accounts?wallet=...
// Canonical on-chain parameters for the product path. The mobile client uses
// these verbatim and never derives independently (single-derivation rule).
router.get('/:id/chain-accounts', requireAuth, (req, res) => {
  const duel = queryOne(`SELECT * FROM duels WHERE id = ? OR share_slug = ?`, [req.params.id, req.params.id]);
  if (!duel) {
    return res.status(404).json({ error: 'Duel not found' });
  }
  try {
    const duelIdHex = ensureCanonicalDuelId(duel);
    const wallet = req.query.wallet || req.userWallet;
    const accounts = chain.deriveChainAccounts(duelIdHex, wallet);
    res.json({
      duelId: duel.id,
      chainStatus: duel.chain_status || 'UNINITIALIZED',
      initTxSignature: duel.init_tx_signature || null,
      captainA: duel.captain_a_wallet,
      captainB: duel.captain_b_wallet,
      termsHash: duel.terms_hash,
      cutoffTs: duel.cutoff_ts,
      resolutionTs: duel.resolution_ts,
      status: duel.status,
      winningSide: duel.winning_side,
      resolver: getResolverPublicKey(),
      ...accounts,
    });
  } catch (err) {
    res.status(500).json({ error: `Chain parameters unavailable: ${err.message}` });
  }
});

// POST /api/duels/:id/init-onchain (Bind duel to the deployed program)
// Body: { txSignature } — the REAL confirmed InitializeDuel transaction.
// The backend independently verifies the tx + on-chain account before storing
// anything. Fabricated signatures are rejected with no state change.
router.post('/:id/init-onchain', requireAuth, async (req, res) => {
  const duelId = req.params.id;
  const { txSignature } = req.body;

  if (!txSignature) {
    return res.status(400).json({ error: 'txSignature of the confirmed InitializeDuel transaction is required' });
  }

  const duel = queryOne(`SELECT * FROM duels WHERE id = ?`, [duelId]);
  if (!duel) {
    return res.status(404).json({ error: 'Duel not found' });
  }

  // Only duel captains may anchor on-chain addresses for their duel.
  if (req.userWallet !== duel.captain_a_wallet && req.userWallet !== duel.captain_b_wallet) {
    return res.status(403).json({ error: 'Only duel captains can anchor on-chain addresses' });
  }

  if ((duel.chain_status || 'UNINITIALIZED') === 'INITIALIZED') {
    return res.status(400).json({ error: 'Duel is already initialized on-chain' });
  }

  const duelIdHex = ensureCanonicalDuelId(duel);
  try {
    const verified = await chain.verifyInitTx({
      signature: txSignature,
      duelIdHex,
      captainA: duel.captain_a_wallet,
      captainB: duel.captain_b_wallet,
      termsHashHex: duel.terms_hash,
      resolver: getResolverPublicKey(),
    });
    execute(
      `UPDATE duels SET onchain_duel_pda = ?, onchain_duel_bump = ?, onchain_vault_pda = ?,
        onchain_vault_bump = ?, vault_token_account = ?, onchain_mint = ?,
        init_tx_signature = ?, chain_status = 'INITIALIZED' WHERE id = ?`,
      [
        verified.duelPda, verified.duelBump, verified.vaultPda, verified.vaultBump,
        verified.vaultAta, verified.mint, txSignature, duelId,
      ]
    );
    res.json({ success: true, duelId, chainStatus: 'INITIALIZED', ...verified });
  } catch (err) {
    res.status(400).json({ error: `On-chain initialization not verified: ${err.message}` });
  }
});

// POST /api/duels/:id/stake (Record a VERIFIED on-chain stake deposit)
// Body: { side, amount (USD), txSignature, positionPda? }
// Pool totals are set from chain-observed state, never from client numbers.
router.post('/:id/stake', requireAuth, async (req, res) => {
  const duelId = req.params.id;
  const userWallet = req.userWallet;
  // Accept both `amount` (canonical) and `stakeAmount` (client alias).
  const { side, amount: amountRaw, stakeAmount: stakeAmountRaw, positionPda, txSignature } = req.body;
  const amount = amountRaw !== undefined ? amountRaw : stakeAmountRaw;

  if (!side || amount === undefined || amount === null) {
    return res.status(400).json({ error: 'side and amount are required' });
  }
  if (!txSignature) {
    return res.status(400).json({ error: 'txSignature of the confirmed DepositStake transaction is required' });
  }

  const duel = queryOne(`SELECT * FROM duels WHERE id = ?`, [duelId]);
  if (!duel) {
    return res.status(404).json({ error: 'Duel not found' });
  }
  if ((duel.chain_status || 'UNINITIALIZED') !== 'INITIALIZED') {
    return res.status(400).json({ error: 'Duel is not initialized on-chain yet' });
  }

  const expectedSide = userWallet === duel.captain_a_wallet
    ? 1
    : userWallet === duel.captain_b_wallet
      ? 2
      : null;
  if (!expectedSide) {
    return res.status(403).json({ error: 'Only Duel captains can lock the agreed stake' });
  }

  const sideNum = Number(side);
  let amountBase;
  try {
    amountBase = chain.usdToBaseUnits(amount);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  if (sideNum !== 1 && sideNum !== 2) {
    return res.status(400).json({ error: 'side must be 1 or 2' });
  }
  if (sideNum !== expectedSide) {
    return res.status(403).json({ error: 'Each captain can only lock their agreed side' });
  }

  const challengeTerms = queryOne(`SELECT stake_amount_usd FROM challenges WHERE id = ?`, [duel.challenge_id]);
  const agreedStake = Number(challengeTerms?.stake_amount_usd) || 0;
  if (agreedStake > 0 && Math.abs(Number(amount) - agreedStake) > 0.000001) {
    return res.status(400).json({ error: `The agreed stake is ${agreedStake} cUSD` });
  }

  try {
    const verified = await chain.verifyStakeTx({
      signature: txSignature,
      duelIdHex: duel.onchain_duel_id,
      userWallet,
      expectedSide: sideNum,
      expectedAmountBase: String(amountBase),
    });

    const sideAUsd = chain.baseUnitsToUsd(verified.sideABase);
    const sideBUsd = chain.baseUnitsToUsd(verified.sideBBase);
    execute(`UPDATE duels SET side_a_total = ?, side_b_total = ? WHERE id = ?`, [sideAUsd, sideBUsd, duelId]);

    const posId = `pos_${duelId}_${userWallet}`;
    const existingPos = queryOne(`SELECT * FROM positions WHERE id = ?`, [posId]);
    if (existingPos) {
      execute(
        `UPDATE positions SET stake_amount = ?, position_pda = ?, stake_tx_signature = ? WHERE id = ?`,
        [chain.baseUnitsToUsd(verified.positionStakeBase), verified.positionPda, txSignature, posId]
      );
    } else {
      execute(
        `INSERT INTO positions (id, duel_id, user_wallet, side, stake_amount, position_pda, claimed, stake_tx_signature, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        [posId, duelId, userWallet, verified.side, chain.baseUnitsToUsd(verified.positionStakeBase),
         verified.positionPda, txSignature, new Date().toISOString()]
      );
    }

    execute(
      `INSERT INTO activity (id, user_wallet, type, source_wallet, target_id, target_type, title, message, is_read, created_at)
       VALUES (?, ?, 'STAKE_DEPOSITED', ?, ?, 'DUEL', 'Stake Deposited', ?, 0, ?)`,
      [`act_${Date.now()}`, userWallet, userWallet, duelId, `Staked $${amount} cUSD on Side ${sideNum === 1 ? 'A' : 'B'} (verified on-chain)`, new Date().toISOString()]
    );

    const updatedDuel = queryOne(`SELECT * FROM duels WHERE id = ?`, [duelId]);
    const opponentWallet = expectedSide === 1 ? duel.captain_b_wallet : duel.captain_a_wallet;
    execute(
      `INSERT INTO activity (id, user_wallet, type, source_wallet, target_id, target_type, title, message, is_read, created_at)
       VALUES (?, ?, 'OPPONENT_FUNDED', ?, ?, 'DUEL', 'Opponent funded', ?, 0, ?)`,
      [
        `act_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        opponentWallet,
        userWallet,
        duelId,
        'The other captain locked the agreed stake.',
        new Date().toISOString(),
      ]
    );
    if (Number(updatedDuel.side_a_total) > 0 && Number(updatedDuel.side_b_total) > 0) {
      const liveActivity = queryOne(
        `SELECT id FROM activity WHERE target_id = ? AND type = 'DUEL_LIVE' LIMIT 1`,
        [duelId]
      );
      if (!liveActivity) {
        for (const wallet of [duel.captain_a_wallet, duel.captain_b_wallet]) {
          execute(
            `INSERT INTO activity (id, user_wallet, type, source_wallet, target_id, target_type, title, message, is_read, created_at)
             VALUES (?, ?, 'DUEL_LIVE', 'system', ?, 'DUEL', 'Duel live', ?, 0, ?)`,
            [`act_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`, wallet, duelId,
              'Both captains locked the agreed stake. The Duel is live.', new Date().toISOString()]
          );
        }
      }
    }
    res.json({ success: true, duel: updatedDuel, verified });
  } catch (err) {
    res.status(400).json({ error: `On-chain stake not verified: ${err.message}` });
  }
});

// POST /api/duels/:id/claim (Record a VERIFIED on-chain payout claim)
// Body: { txSignature } — the REAL confirmed ClaimPayout transaction.
router.post('/:id/claim', requireAuth, async (req, res) => {
  const duelId = req.params.id;
  const userWallet = req.userWallet;
  const { txSignature } = req.body;

  if (!txSignature) {
    return res.status(400).json({ error: 'txSignature of the confirmed ClaimPayout transaction is required' });
  }
  const duel = queryOne(`SELECT * FROM duels WHERE id = ?`, [duelId]);
  if (!duel) {
    return res.status(404).json({ error: 'Duel not found' });
  }
  // CANCELLED duels pay principal to every position (program-enforced refund).
  if (!String(duel.status || '').startsWith('RESOLVED') && duel.status !== 'CANCELLED') {
    return res.status(400).json({ error: 'Duel is not settled yet' });
  }

  try {
    const verified = await chain.verifyClaimTx({
      signature: txSignature,
      duelIdHex: duel.onchain_duel_id,
      userWallet,
    });
    // Consistency: claim side must be the recorded winning side.
    if (Number(duel.winning_side) !== 0 && verified.side !== Number(duel.winning_side)) {
      return res.status(400).json({ error: 'Claim side does not match the settled winning side' });
    }
    const posId = `pos_${duelId}_${userWallet}`;
    execute(
      `UPDATE positions SET claimed = 1, claim_tx = ?, payout_amount = ? WHERE id = ?`,
      [
        txSignature,
        verified.payoutBase !== null ? chain.baseUnitsToUsd(verified.payoutBase) : null,
        posId,
      ]
    );
    execute(
      `INSERT INTO activity (id, user_wallet, type, source_wallet, target_id, target_type, title, message, is_read, created_at)
       VALUES (?, ?, ?, 'system', ?, 'DUEL', ?, ?, 0, ?)`,
      [
        `act_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        userWallet,
        duel.status === 'CANCELLED' ? 'REFUNDED' : 'CLAIMED',
        duelId,
        duel.status === 'CANCELLED' ? 'Refund claimed' : 'Payout claimed',
        duel.status === 'CANCELLED' ? 'Your Duel stake was returned.' : 'Your Duel payout was claimed.',
        new Date().toISOString(),
      ]
    );
    const receipt = queryOne(`SELECT * FROM receipts WHERE duel_id = ?`, [duelId]);
    res.json({
      success: true,
      positionPda: verified.positionPda,
      payoutBase: verified.payoutBase,
      payoutUsd: verified.payoutBase !== null ? chain.baseUnitsToUsd(verified.payoutBase) : null,
      receipt,
    });
  } catch (err) {
    res.status(400).json({ error: `On-chain claim not verified: ${err.message}` });
  }
});

// POST /api/duels/:id/resolve (Trigger resolution engine)
// Requires authentication; the engine itself is deterministic per duel terms.
// Any authenticated caller can trigger it — resolver authority on-chain
// remains with the program's resolver key, and re-resolution is rejected.
router.post('/:id/resolve', requireAuth, async (req, res) => {
  const duelId = req.params.id;
  const duel = queryOne(`SELECT * FROM duels WHERE id = ?`, [duelId]);
  if (duel && !String(duel.status || '').startsWith('RESOLVED') && duel.status !== 'CANCELLED'
    && Number(duel.side_a_total) > 0 && Number(duel.side_b_total) > 0
    && Math.floor(Date.now() / 1000) >= Number(duel.resolution_ts || 0)) {
    const readyActivity = queryOne(
      `SELECT id FROM activity WHERE target_id = ? AND type = 'READY_TO_SETTLE' LIMIT 1`,
      [duelId]
    );
    if (!readyActivity) {
      for (const wallet of [duel.captain_a_wallet, duel.captain_b_wallet]) {
        execute(
          `INSERT INTO activity (id, user_wallet, type, source_wallet, target_id, target_type, title, message, is_read, created_at)
           VALUES (?, ?, 'READY_TO_SETTLE', 'system', ?, 'DUEL', 'Ready to settle', ?, 0, ?)`,
          [`act_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`, wallet, duelId,
            'The decision time has arrived. Confirm the result privately.', new Date().toISOString()]
        );
      }
    }
  }
  const result = await resolveDuel(duelId);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  res.json({ success: true, resolution: result });
});

// POST /api/duels/:id/mutual-vote (Captain settlement attestation)
// Body: { winnerSide: 1|2, signature } — signature must verify as
// COUNTER_SETTLEMENT_V1 over (duel_id, winner_side) by the captain wallet.
// Votes stay mutable until a matched pair settles; then they lock.
router.post('/:id/mutual-vote', requireAuth, (req, res) => {
  const duelId = req.params.id;
  const userWallet = req.userWallet;
  const { winnerSide, signature } = req.body || {};

  const duel = queryOne(`SELECT * FROM duels WHERE id = ?`, [duelId]);
  if (!duel) {
    return res.status(404).json({ error: 'Duel not found' });
  }
  if ((duel.resolution_mode || 'COUNTER_VERIFIED') !== 'MUTUAL') {
    return res.status(400).json({ error: 'This duel does not settle by mutual agreement' });
  }
  if (!signature) {
    return res.status(400).json({ error: 'A wallet-signed settlement attestation is required' });
  }
  const mutual = require('../mutual');
  const result = mutual.recordVote(duel, userWallet, Number(winnerSide), signature);
  if (!result.ok) {
    return res.status(400).json({ error: result.error });
  }
  const match = mutual.checkMatch(duel);
  const otherWallet = userWallet === duel.captain_a_wallet ? duel.captain_b_wallet : duel.captain_a_wallet;
  if (!match.matched && match.state === 'AWAITING_COUNTERPARTY') {
    execute(
      `INSERT INTO activity (id, user_wallet, type, source_wallet, target_id, target_type, title, message, is_read, created_at)
       VALUES (?, ?, 'OPPONENT_SUBMITTED_RESULT', ?, ?, 'DUEL', 'Opponent submitted their result', ?, 0, ?)`,
      [`act_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`, otherWallet, userWallet, duelId,
        'The other captain submitted their result.', new Date().toISOString()]
    );
  }
  if (match.matched) {
    for (const wallet of [duel.captain_a_wallet, duel.captain_b_wallet]) {
      execute(
        `INSERT INTO activity (id, user_wallet, type, source_wallet, target_id, target_type, title, message, is_read, created_at)
         VALUES (?, ?, 'RESULT_CONFIRMED', ?, ?, 'DUEL', 'Result confirmed', ?, 0, ?)`,
        [`act_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`, wallet, 'system', duelId,
          'Both captains chose the same result.', new Date().toISOString()]
      );
    }
  }
  res.json({ success: true, votes: result.votes, match });
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
      error: 'Seeker Arena requires active SKR staking (> 0 SKR) on Solana Mainnet',
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
