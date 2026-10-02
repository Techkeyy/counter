const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { queryAll, queryOne, execute, transaction } = require('../db');
const { requireAuth } = require('../auth');
const { validateChallengeContract } = require('../resolution-templates');

// GET /api/challenges (current user's actionable challenge inbox)
// Cancelled/declined/accepted rows remain in storage for history but are not
// returned to the review sheet as actionable pending challenges.
router.get('/', requireAuth, (req, res) => {
  const challenges = queryAll(
    `SELECT c.*,
            creator.handle AS creator_handle,
            creator.display_name AS creator_name,
            creator.avatar_url AS creator_avatar,
            challenger.handle AS challenger_handle,
            challenger.display_name AS challenger_name,
            challenger.avatar_url AS challenger_avatar
     FROM challenges c
     LEFT JOIN users creator ON creator.wallet_address = c.creator_wallet
     LEFT JOIN users challenger ON challenger.wallet_address = c.challenger_wallet
     WHERE (c.creator_wallet = ? OR c.challenger_wallet = ?)
       AND c.status IN ('PROPOSED', 'COUNTERED')
     ORDER BY c.created_at DESC LIMIT 50`,
    [req.userWallet, req.userWallet]
  );
  res.json({ challenges });
});

// POST /api/challenges (Propose Challenge on a Take)
router.post('/', requireAuth, (req, res) => {
  const {
    takeId,
    propositionA,
    propositionB,
    category,
    sourceType,
    sourceConfig,
    stakeAmountUsd,
    cutoffTs,
    resolutionTs,
    resolutionMode: resolutionModeRaw,
    fallbackMode: fallbackModeRaw,
    mutualDeadlineTs: mutualDeadlineRaw,
  } = req.body;

  // The client may still send target fields for compatibility, but the server
  // derives both parties from authenticated identity and Take authorship.
  const challengerWallet = req.userWallet; // Captain B

  if (!takeId || !propositionA || !propositionB || !Number.isFinite(Number(stakeAmountUsd)) || Number(stakeAmountUsd) <= 0) {
    return res.status(400).json({ error: 'Missing required challenge parameters' });
  }

  const sourceTake = queryOne(`SELECT id, author_wallet, category, status FROM takes WHERE id = ?`, [takeId]);
  if (!sourceTake || sourceTake.status !== 'ACTIVE') {
    return res.status(400).json({ error: 'Challenges can only target an active Take' });
  }
  const creatorWallet = sourceTake.author_wallet;
  if (!creatorWallet || creatorWallet === challengerWallet) {
    return res.status(400).json({ error: 'You cannot challenge your own Take' });
  }

  const contract = validateChallengeContract({
    category: sourceTake.category,
    sourceType: sourceType || undefined,
    sourceConfig,
    resolutionMode: resolutionModeRaw,
    fallbackMode: fallbackModeRaw,
  });
  if (!contract.ok) return res.status(400).json({ error: contract.error });

  const nowSec = Math.floor(Date.now() / 1000);
  const finalCutoff = Number(cutoffTs) || nowSec + 3600;
  const finalResolution = Number(resolutionTs) || nowSec + 7200;
  let mutualDeadline = Number(mutualDeadlineRaw);
  if (contract.mode === 'MUTUAL') {
    if (!Number.isFinite(mutualDeadline) || mutualDeadline <= nowSec) {
      mutualDeadline = finalResolution;
    }
  } else {
    mutualDeadline = null;
  }

  const id = `chal_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const now = new Date().toISOString();
  const configStr = contract.config ? JSON.stringify(contract.config) : null;
  const storedSourceType = contract.config ? 'open-meteo' : null;

  execute(
    `INSERT INTO challenges (id, take_id, challenger_wallet, creator_wallet, proposition_a, proposition_b, category, source_type, source_config, stake_amount_usd, cutoff_ts, resolution_ts, resolution_mode, fallback_mode, mutual_deadline_ts, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PROPOSED', ?)`,
    [
      id,
      takeId,
      challengerWallet,
      creatorWallet,
      propositionA,
      propositionB,
      sourceTake.category,
      storedSourceType,
      configStr,
      Number(stakeAmountUsd),
      finalCutoff,
      finalResolution,
      contract.mode,
      contract.fallback,
      mutualDeadline,
      now,
    ]
  );

  // Notify Take Creator (Captain A)
  execute(
    `INSERT INTO activity (id, user_wallet, type, source_wallet, target_id, target_type, title, message, is_read, created_at)
     VALUES (?, ?, 'CHALLENGE_RECEIVED', ?, ?, 'CHALLENGE', 'You were Challenged to a Duel!', ?, 0, ?)`,
    [`act_${Date.now()}`, creatorWallet, challengerWallet, id, `Stake: $${stakeAmountUsd} cUSD`, now]
  );

  const challenge = queryOne(
    `SELECT c.*,
            creator.handle AS creator_handle,
            creator.display_name AS creator_name,
            creator.avatar_url AS creator_avatar,
            challenger.handle AS challenger_handle,
            challenger.display_name AS challenger_name,
            challenger.avatar_url AS challenger_avatar
     FROM challenges c
     LEFT JOIN users creator ON creator.wallet_address = c.creator_wallet
     LEFT JOIN users challenger ON challenger.wallet_address = c.challenger_wallet
     WHERE c.id = ?`,
    [id]
  );
  res.status(201).json({ challenge });
});

// POST /api/challenges/:id/counter (Counteroffer terms/stake)
router.post('/:id/counter', requireAuth, (req, res) => {
  const challengeId = req.params.id;
  const proposerWallet = req.userWallet;
  const { stakeAmountUsd, cutoffTs, resolutionTs, propositionA, propositionB, sourceConfig } = req.body;

  const challenge = queryOne(`SELECT * FROM challenges WHERE id = ?`, [challengeId]);
  if (!challenge) {
    return res.status(404).json({ error: 'Challenge not found' });
  }

  // Only the two counterparties may negotiate terms.
  if (proposerWallet !== challenge.creator_wallet && proposerWallet !== challenge.challenger_wallet) {
    return res.status(403).json({ error: 'Only challenge counterparties can counteroffer' });
  }

  if (challenge.status !== 'PROPOSED' && challenge.status !== 'COUNTERED') {
    return res.status(400).json({ error: `Cannot counteroffer challenge in state: ${challenge.status}` });
  }

  // A renegotiated resolution template must re-validate. Generic MUTUAL +
  // REFUND keeps its deliberately empty oracle config.
  let storedConfig = challenge.source_config;
  if (typeof storedConfig === 'string' && storedConfig) {
    try { storedConfig = JSON.parse(storedConfig); } catch { storedConfig = null; }
  }
  const contract = validateChallengeContract({
    category: challenge.category,
    sourceType: challenge.source_type || undefined,
    sourceConfig: sourceConfig !== undefined ? sourceConfig : storedConfig,
    resolutionMode: challenge.resolution_mode,
    fallbackMode: challenge.fallback_mode,
  });
  if (!contract.ok) return res.status(400).json({ error: contract.error });

  const counterId = `cnt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const now = new Date().toISOString();
  const configStr = contract.config ? JSON.stringify(contract.config) : null;

  execute(
    `INSERT INTO counteroffers (id, challenge_id, proposer_wallet, stake_amount_usd, cutoff_ts, resolution_ts, proposition_a, proposition_b, source_config, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
    [
      counterId,
      challengeId,
      proposerWallet,
      Number(stakeAmountUsd) || challenge.stake_amount_usd,
      Number(cutoffTs) || challenge.cutoff_ts,
      Number(resolutionTs) || challenge.resolution_ts,
      propositionA || challenge.proposition_a,
      propositionB || challenge.proposition_b,
      configStr || (contract.config ? challenge.source_config : null),
      now,
    ]
  );

  // Update challenge state
  execute(
    `UPDATE challenges SET
      status = 'COUNTERED',
      stake_amount_usd = ?,
      cutoff_ts = ?,
      resolution_ts = ?,
      proposition_a = ?,
      proposition_b = ?,
      source_config = ?
     WHERE id = ?`,
    [
      Number(stakeAmountUsd) || challenge.stake_amount_usd,
      Number(cutoffTs) || challenge.cutoff_ts,
      Number(resolutionTs) || challenge.resolution_ts,
      propositionA || challenge.proposition_a,
      propositionB || challenge.proposition_b,
      configStr || (contract.config ? challenge.source_config : null),
      challengeId,
    ]
  );

  const recipientWallet = proposerWallet === challenge.creator_wallet ? challenge.challenger_wallet : challenge.creator_wallet;
  execute(
    `INSERT INTO activity (id, user_wallet, type, source_wallet, target_id, target_type, title, message, is_read, created_at)
     VALUES (?, ?, 'COUNTEROFFER_RECEIVED', ?, ?, 'CHALLENGE', 'Counteroffer on Duel', ?, 0, ?)`,
    [`act_${Date.now()}`, recipientWallet, proposerWallet, challengeId, `New Stake: $${stakeAmountUsd} cUSD`, now]
  );

  const updatedChallenge = queryOne(`SELECT * FROM challenges WHERE id = ?`, [challengeId]);
  res.json({ challenge: updatedChallenge, counterId });
});

// POST /api/challenges/:id/accept (Mutual terms approval -> Create Duel Record)
router.post('/:id/accept', requireAuth, (req, res) => {
  const challengeId = req.params.id;
  const userWallet = req.userWallet;

  const challenge = queryOne(`SELECT * FROM challenges WHERE id = ?`, [challengeId]);
  if (!challenge) {
    return res.status(404).json({ error: 'Challenge not found' });
  }

  // Only the two counterparties may accept and spawn the duel.
  if (userWallet !== challenge.creator_wallet && userWallet !== challenge.challenger_wallet) {
    return res.status(403).json({ error: 'Only challenge counterparties can accept' });
  }

  const existingDuel = queryOne(`SELECT * FROM duels WHERE challenge_id = ? ORDER BY created_at ASC LIMIT 1`, [challengeId]);
  if (existingDuel) {
    return res.json({ success: true, duel: existingDuel });
  }

  if (challenge.status !== 'PROPOSED' && challenge.status !== 'COUNTERED') {
    return res.status(400).json({ error: `Cannot accept challenge in state: ${challenge.status}` });
  }

  // Generate 16-byte random on-chain duel ID and terms hash (the hash binds
  // the full settlement terms: propositions, config, timing, AND mode).
  const onchainDuelId = crypto.randomBytes(16).toString('hex');
  const termsString = `${challenge.proposition_a}|${challenge.proposition_b}|${challenge.source_config}|${challenge.cutoff_ts}|${challenge.resolution_mode || 'COUNTER_VERIFIED'}|${challenge.fallback_mode || 'REFUND'}|${challenge.mutual_deadline_ts || ''}`;
  const termsHash = crypto.createHash('sha256').update(termsString).digest('hex');
  const duelId = `duel_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const shareSlug = `d_${crypto.randomBytes(4).toString('hex')}`;
  const now = new Date().toISOString();

  // Acceptance is idempotent: retries return the one Duel already linked to
  // this Challenge instead of incrementing the Take or creating a duplicate.
  let duel;
  try {
    transaction(() => {
      const currentDuel = queryOne(`SELECT * FROM duels WHERE challenge_id = ? ORDER BY created_at ASC LIMIT 1`, [challengeId]);
      if (currentDuel) {
        duel = currentDuel;
        return;
      }

      const currentChallenge = queryOne(`SELECT status FROM challenges WHERE id = ?`, [challengeId]);
      if (!currentChallenge || (currentChallenge.status !== 'PROPOSED' && currentChallenge.status !== 'COUNTERED')) {
        const error = new Error(`Cannot accept challenge in state: ${currentChallenge?.status || 'UNKNOWN'}`);
        error.statusCode = 400;
        throw error;
      }

      execute(`UPDATE challenges SET status = 'ACCEPTED' WHERE id = ?`, [challengeId]);
      execute(
        `INSERT INTO duels (
          id, onchain_duel_id, challenge_id, take_id, captain_a_wallet, captain_b_wallet,
          side_a_total, side_b_total, terms_hash, proposition_a, proposition_b, category,
          source_type, source_config, cutoff_ts, resolution_ts, resolution_mode, fallback_mode, mutual_deadline_ts, status, winning_side, is_arena, share_slug, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACCEPTING_STAKES', 0, 0, ?, ?)`,
        [
          duelId,
          onchainDuelId,
          challengeId,
          challenge.take_id,
          challenge.creator_wallet,
          challenge.challenger_wallet,
          termsHash,
          challenge.proposition_a,
          challenge.proposition_b,
          challenge.category,
          challenge.source_type,
          challenge.source_config,
          challenge.cutoff_ts,
          challenge.resolution_ts,
          challenge.resolution_mode || 'COUNTER_VERIFIED',
          challenge.fallback_mode || 'REFUND',
          challenge.mutual_deadline_ts || null,
          shareSlug,
          now,
        ]
      );
      execute(`UPDATE takes SET duels_count = duels_count + 1 WHERE id = ?`, [challenge.take_id]);
      duel = queryOne(`SELECT * FROM duels WHERE id = ?`, [duelId]);
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
  res.json({ success: true, duel });
});

// POST /api/challenges/:id/decline
router.post('/:id/decline', requireAuth, (req, res) => {
  const challengeId = req.params.id;
  const userWallet = req.userWallet;

  const challenge = queryOne(`SELECT * FROM challenges WHERE id = ?`, [challengeId]);
  if (!challenge) {
    return res.status(404).json({ error: 'Challenge not found' });
  }

  // Only the two counterparties may decline.
  if (userWallet !== challenge.creator_wallet && userWallet !== challenge.challenger_wallet) {
    return res.status(403).json({ error: 'Only challenge counterparties can decline' });
  }

  execute(`UPDATE challenges SET status = 'DECLINED' WHERE id = ?`, [challengeId]);
  res.json({ success: true, status: 'DECLINED' });
});

module.exports = router;
