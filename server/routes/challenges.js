const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { queryAll, queryOne, execute } = require('../db');
const { requireAuth } = require('../auth');
const {
  validateVerifiedTemplate,
  validateResolutionMode,
  validateFallbackMode,
} = require('../resolution-templates');

// POST /api/challenges (Propose Challenge on a Take)
router.post('/', requireAuth, (req, res) => {
  const {
    takeId,
    creatorWallet: creatorWalletRaw,
    targetWallet: targetWalletRaw, // client alias for creatorWallet (Captain A)
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

  // Accept both field names so the counterparty is never silently dropped.
  // NOTE: creatorWallet is still client-asserted; challenge integrity against
  // take authorship is SOFT (see claim-mechanism-proof ledger).
  const creatorWallet = creatorWalletRaw || targetWalletRaw;

  const challengerWallet = req.userWallet; // Captain B

  if (!takeId || !creatorWallet || !propositionA || !propositionB || !stakeAmountUsd) {
    return res.status(400).json({ error: 'Missing required challenge parameters' });
  }

  // Settlement mode is part of the binding terms: validated now, stored
  // explicitly, copied to the duel at accept time, never inferred.
  const modeCheck = validateResolutionMode(resolutionModeRaw);
  if (!modeCheck.ok) return res.status(400).json({ error: modeCheck.error });
  const fallbackCheck = validateFallbackMode(fallbackModeRaw);
  if (!fallbackCheck.ok) return res.status(400).json({ error: fallbackCheck.error });

  // Verified resolution criteria are validated BEFORE money can enter. No
  // silent oracle defaults: malformed templates are rejected here.
  const templateCheck = validateVerifiedTemplate(category, sourceType, sourceConfig);
  if (!templateCheck.ok) return res.status(400).json({ error: templateCheck.error });

  const nowSec = Math.floor(Date.now() / 1000);
  const finalCutoff = Number(cutoffTs) || nowSec + 3600;
  const finalResolution = Number(resolutionTs) || nowSec + 7200;
  let mutualDeadline = Number(mutualDeadlineRaw);
  if (modeCheck.value === 'MUTUAL') {
    if (!Number.isFinite(mutualDeadline) || mutualDeadline <= nowSec) {
      mutualDeadline = finalResolution;
    }
  } else {
    mutualDeadline = null;
  }

  const id = `chal_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const now = new Date().toISOString();
  const configStr = typeof sourceConfig === 'string' ? sourceConfig : JSON.stringify(sourceConfig || {});

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
      category || 'crypto',
      sourceType || 'coingecko',
      configStr,
      Number(stakeAmountUsd),
      finalCutoff,
      finalResolution,
      modeCheck.value,
      fallbackCheck.value,
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

  const challenge = queryOne(`SELECT * FROM challenges WHERE id = ?`, [id]);
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

  // A renegotiated resolution template must re-validate; a malformed config
  // can never slip in through the counter path.
  if (sourceConfig !== undefined) {
    const { validateVerifiedTemplate: validateTemplate } = require('../resolution-templates');
    const templateCheck = validateTemplate(challenge.category, challenge.source_type, sourceConfig);
    if (!templateCheck.ok) return res.status(400).json({ error: templateCheck.error });
  }

  const counterId = `cnt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const now = new Date().toISOString();
  const configStr = typeof sourceConfig === 'string' ? sourceConfig : JSON.stringify(sourceConfig || {});

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
      configStr || challenge.source_config,
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
      configStr || challenge.source_config,
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

  // Mark challenge accepted
  execute(`UPDATE challenges SET status = 'ACCEPTED' WHERE id = ?`, [challengeId]);

  // Create Duel record in database (settlement terms copied verbatim from
  // the mutually accepted challenge — mode, fallback, and deadline included).
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
      challenge.creator_wallet,    // Captain A
      challenge.challenger_wallet, // Captain B
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

  const duel = queryOne(`SELECT * FROM duels WHERE id = ?`, [duelId]);
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
