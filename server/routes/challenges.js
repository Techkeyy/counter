const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { queryAll, queryOne, execute, transaction } = require('../db');
const { requireAuth } = require('../auth');
const { validateChallengeContract } = require('../resolution-templates');

function noConditionalListCache(req, res, next) {
  delete req.headers['if-none-match'];
  delete req.headers['if-modified-since'];
  res.set({ 'Cache-Control': 'no-store, no-cache, must-revalidate', Pragma: 'no-cache', Expires: '0' });
  next();
}

// The program only requires cutoff < resolution and checks both timestamps at
// instruction time. The old two-hour product floor made short, demoable Duels
// impossible, so keep a safe 15-minute minimum and derive a hidden staking
// buffer that is always strictly before resolution.
const MIN_DECISION_LEAD_SECONDS = 15 * 60;
const MAX_STAKE_BUFFER_SECONDS = 60 * 60;
const MUTUAL_DEADLINE_SECONDS = 24 * 60 * 60;
const HIDDEN_TIMING_FIELDS = ['cutoffTs', 'resolutionTs', 'mutualDeadlineTs'];

function deriveChallengeTiming(decisionTsRaw, nowSec = Math.floor(Date.now() / 1000)) {
  const selected = Number(decisionTsRaw);
  const requestedResolution = Number.isFinite(selected) ? Math.floor(selected) : nowSec + MIN_DECISION_LEAD_SECONDS;
  const resolutionTs = Math.max(requestedResolution, nowSec + MIN_DECISION_LEAD_SECONDS);
  const duration = resolutionTs - nowSec;
  const stakeBuffer = Math.min(MAX_STAKE_BUFFER_SECONDS, Math.max(60, Math.floor(duration / 3)));
  const cutoffTs = resolutionTs - stakeBuffer;
  const mutualDeadlineTs = resolutionTs + MUTUAL_DEADLINE_SECONDS;

  if (!(cutoffTs > nowSec && cutoffTs < resolutionTs && resolutionTs < mutualDeadlineTs)) {
    return { ok: false, error: 'Decision time must be at least 15 minutes from now' };
  }
  return { ok: true, cutoffTs, resolutionTs, mutualDeadlineTs };
}

// GET /api/challenges (current user's actionable challenge inbox)
// Cancelled/declined/accepted rows remain in storage for history but are not
// returned to the review sheet as actionable pending challenges.
router.get('/', noConditionalListCache, requireAuth, (req, res) => {
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
    decisionTs,
    resolutionMode: resolutionModeRaw,
    fallbackMode: fallbackModeRaw,
  } = req.body;

  const callerTimingOverrides = HIDDEN_TIMING_FIELDS.filter((field) =>
    Object.prototype.hasOwnProperty.call(req.body || {}, field)
  );
  if (callerTimingOverrides.length > 0) {
    return res.status(400).json({
      error: 'Timing is derived from decision time; cutoff and deadline fields cannot be supplied',
    });
  }

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

  const timing = deriveChallengeTiming(decisionTs);
  if (!timing.ok) return res.status(400).json({ error: timing.error });
  const { cutoffTs, resolutionTs: finalResolution, mutualDeadlineTs } = timing;
  const finalMutualDeadline = contract.mode === 'MUTUAL' ? mutualDeadlineTs : null;

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
      cutoffTs,
      finalResolution,
      contract.mode,
      contract.fallback,
       finalMutualDeadline,
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
  const { stakeAmountUsd, propositionA, propositionB, sourceConfig } = req.body;
  const counterTimingOverrides = HIDDEN_TIMING_FIELDS.filter((field) =>
    Object.prototype.hasOwnProperty.call(req.body || {}, field)
  );
  if (counterTimingOverrides.length > 0) {
    return res.status(400).json({
      error: 'Timing is derived from decision time; cutoff and deadline fields cannot be supplied',
    });
  }

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
      challenge.cutoff_ts,
      challenge.resolution_ts,
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
      challenge.cutoff_ts,
      challenge.resolution_ts,
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

  // Only the authoritative Take creator may accept and spawn the Duel. The
  // challenger is never allowed to accept their own outgoing Challenge.
  if (userWallet !== challenge.creator_wallet) {
    return res.status(403).json({ error: 'Only the Take creator can accept this challenge' });
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
  execute(
    `INSERT INTO activity (id, user_wallet, type, source_wallet, target_id, target_type, title, message, is_read, created_at)
     VALUES (?, ?, 'CHALLENGE_ACCEPTED', ?, ?, 'DUEL', 'Challenge accepted', ?, 0, ?)`,
    [`act_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`, challenge.challenger_wallet, userWallet, duel.id,
      'Your challenge was accepted. Duel setup is ready.', new Date().toISOString()]
  );
  for (const wallet of [challenge.creator_wallet, challenge.challenger_wallet]) {
    execute(
      `INSERT INTO activity (id, user_wallet, type, source_wallet, target_id, target_type, title, message, is_read, created_at)
       VALUES (?, ?, 'STAKE_REQUIRED', 'system', ?, 'DUEL', 'Stake required', ?, 0, ?)`,
      [`act_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`, wallet, duel.id,
        `Lock ${Number(challenge.stake_amount_usd).toFixed(2)} Counter Test USD to start the Duel.`, new Date().toISOString()]
    );
  }
  execute(
    `INSERT INTO activity (id, user_wallet, type, source_wallet, target_id, target_type, title, message, is_read, created_at)
     VALUES (?, ?, 'DUEL_SETUP_NEEDED', 'system', ?, 'DUEL', 'Duel setup needed', ?, 0, ?)`,
    [`act_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`, challenge.creator_wallet, duel.id,
      'Set up this Duel when you are ready.', new Date().toISOString()]
  );
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
module.exports.deriveChallengeTiming = deriveChallengeTiming;
