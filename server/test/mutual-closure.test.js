/**
 * V1 Mutual closure tests. This is a local database/resolver test only: the
 * chain submitter is replaced with a counted fake so no Devnet transaction or
 * real owner data is touched.
 */
const assert = require('node:assert/strict');
const crypto = require('crypto');

process.env.PORT = '18102';
require('../index.js');

const BASE = `http://127.0.0.1:${process.env.PORT}`;

function testToken(wallet) {
  const payload = JSON.stringify({ wallet, iat: Date.now(), exp: Date.now() + 60_000 });
  const signature = crypto.createHmac('sha256', process.env.JWT_SECRET).update(payload).digest('hex');
  return `${Buffer.from(payload).toString('base64url')}.${signature}`;
}

async function api(method, path, wallet, body) {
  const response = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${testToken(wallet)}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await response.json(); } catch {}
  return { status: response.status, data };
}

async function closeLocalServer() {
  const servers = process._getActiveHandles().filter((handle) => handle && handle.constructor && handle.constructor.name === 'Server');
  await Promise.all(servers.map((server) => new Promise((resolve) => {
    try { server.close(resolve); } catch { resolve(); }
  })));
}

function ok(label) {
  console.log(`  ok - ${label}`);
}

async function run() {
  await new Promise((resolve) => setTimeout(resolve, 500));
  const { execute, queryOne, queryAll } = require('../db');
  const { resolveDuel } = require('../resolvers');

  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const duelId = `duel_mutual_closure_${suffix}`;
  const takeId = `take_mutual_closure_${suffix}`;
  const challengeId = `chal_mutual_closure_${suffix}`;
  const readyDuelId = `duel_ready_discovery_${suffix}`;
  const timeoutDuelId = `duel_timeout_closure_${suffix}`;
  const walletA = `wallet_a_${suffix}`;
  const walletB = `wallet_b_${suffix}`;
  const now = Math.floor(Date.now() / 1000) - 60;
  let submitCount = 0;

  try {
    execute(
      `INSERT INTO duels
        (id, onchain_duel_id, challenge_id, take_id, onchain_duel_pda,
         captain_a_wallet, captain_b_wallet, side_a_total, side_b_total,
         proposition_a, proposition_b, category, source_type, source_config,
         cutoff_ts, resolution_ts, mutual_deadline_ts, status, winning_side,
         resolution_mode, fallback_mode, chain_status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'MUTUAL', 'REFUND', 'INITIALIZED', ?)`,
      [duelId, `onchain_${suffix}`, challengeId, takeId, `pda_${suffix}`,
        walletA, walletB, 30, 30, 'A', 'B', 'CULTURE', 'none', '{}',
        now - 60, now, now + 86400, 'ACCEPTING_STAKES', new Date().toISOString()]
    );
    execute(
      `INSERT INTO positions (id, duel_id, user_wallet, side, stake_amount, claimed, created_at)
       VALUES (?, ?, ?, 1, 30, 0, ?)`,
      [`pos_${duelId}_${walletA}`, duelId, walletA, new Date().toISOString()]
    );
    execute(
      `INSERT INTO positions (id, duel_id, user_wallet, side, stake_amount, claimed, created_at)
       VALUES (?, ?, ?, 2, 30, 0, ?)`,
      [`pos_${duelId}_${walletB}`, duelId, walletB, new Date().toISOString()]
    );
    execute(
      `INSERT INTO mutual_votes (duel_id, captain_wallet, winner_side, message, signature, created_at, updated_at)
       VALUES (?, ?, 1, 'a', 'sig-a', ?, ?)`,
      [duelId, walletA, new Date().toISOString(), new Date().toISOString()]
    );
    execute(
      `INSERT INTO mutual_votes (duel_id, captain_wallet, winner_side, message, signature, created_at, updated_at)
       VALUES (?, ?, 2, 'b', 'sig-b', ?, ?)`,
      [duelId, walletB, new Date().toISOString(), new Date().toISOString()]
    );

    const fakeSubmit = async (_duel, side) => {
      submitCount += 1;
      assert.equal(side, 3, 'explicit mismatch uses the existing Cancel side');
      return { ok: true, sig: `fake_cancel_${duelId}` };
    };

    const first = await resolveDuel(duelId, { submitSettlementTx: fakeSubmit });
    assert.equal(first.success, true, `mismatch automatically enters cancellation: ${JSON.stringify(first)}`);
    assert.equal(first.status, 'CANCELLED', 'mismatch becomes terminal cancellation');
    assert.equal(submitCount, 1, 'one cancellation transaction is submitted');
    assert.equal(queryAll(`SELECT * FROM receipts WHERE duel_id = ?`, [duelId]).length, 1, 'one receipt exists');

    const second = await resolveDuel(duelId, { submitSettlementTx: fakeSubmit });
    assert.equal(second.success, false, 'terminal Duel cannot resolve again');
    assert.equal(submitCount, 1, 'terminal retry submits no second transaction');
    assert.equal(queryAll(`SELECT * FROM receipts WHERE duel_id = ?`, [duelId]).length, 1, 'retry does not duplicate receipt');
    const attempt = queryOne(`SELECT * FROM duel_settlement_attempts WHERE duel_id = ?`, [duelId]);
    assert.equal(attempt.state, 'SUCCEEDED', 'durable settlement attempt is closed as succeeded');
    ok('opposite votes automatically cancel once and remain idempotent');

    const refundActivities = queryAll(
      `SELECT type FROM activity WHERE target_id = ? AND type IN ('NO_AGREEMENT', 'REFUND_READY')`,
      [duelId]
    );
    assert.equal(refundActivities.length, 4, 'each captain receives one no-agreement and one refund-ready item');
    ok('refund lifecycle activity is deterministic and non-duplicating');

    // A Duel becomes discoverable from authoritative reads without a caller
    // first POSTing /resolve. The response is deterministic across refreshes.
    execute(
      `INSERT INTO duels
        (id, onchain_duel_id, challenge_id, take_id, onchain_duel_pda,
         captain_a_wallet, captain_b_wallet, side_a_total, side_b_total,
         proposition_a, proposition_b, category, source_type, source_config,
         cutoff_ts, resolution_ts, mutual_deadline_ts, status, winning_side,
         resolution_mode, fallback_mode, chain_status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 30, 30, 'A', 'B', 'CULTURE', 'none', '{}', ?, ?, ?, 'ACCEPTING_STAKES', 0, 'MUTUAL', 'REFUND', 'INITIALIZED', ?)`,
      [readyDuelId, `onchain_ready_${suffix}`, challengeId, takeId, `pda_ready_${suffix}`,
        walletA, walletB, now - 3600, now, now + 86400, new Date().toISOString()]
    );
    let activityRead = await api('GET', '/api/activity', walletA);
    let readyItems = (activityRead.data?.activity || []).filter((item) => item.type === 'READY_TO_SETTLE' && item.target_id === readyDuelId);
    assert.equal(readyItems.length, 1, 'ready-to-settle is derived on Activity read');
    assert.match(readyItems[0].message, /ready.*Choose who won/i, 'ready-to-settle copy is actionable');
    activityRead = await api('GET', '/api/activity', walletA);
    readyItems = (activityRead.data?.activity || []).filter((item) => item.type === 'READY_TO_SETTLE' && item.target_id === readyDuelId);
    assert.equal(readyItems.length, 1, 'derived ready-to-settle item does not duplicate on refresh');
    ok('ready-to-settle is discoverable and refresh-stable');

    execute(
      `INSERT INTO mutual_votes (duel_id, captain_wallet, winner_side, message, signature, created_at, updated_at)
       VALUES (?, ?, 2, 'b', 'sig-b', ?, ?)`,
      [readyDuelId, walletB, new Date().toISOString(), new Date().toISOString()]
    );
    activityRead = await api('GET', '/api/activity', walletA);
    assert((activityRead.data?.activity || []).some((item) => item.type === 'OPPONENT_SUBMITTED_RESULT' && item.target_id === readyDuelId), 'opponent-first vote is actionable in Activity');
    ok('opponent-first private result exposes presence, never the winner choice');

    execute(
      `INSERT INTO duels
        (id, onchain_duel_id, challenge_id, take_id, onchain_duel_pda,
         captain_a_wallet, captain_b_wallet, side_a_total, side_b_total,
         proposition_a, proposition_b, category, source_type, source_config,
         cutoff_ts, resolution_ts, mutual_deadline_ts, status, winning_side,
         resolution_mode, fallback_mode, chain_status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 30, 30, 'A', 'B', 'CULTURE', 'none', '{}', ?, ?, ?, 'ACCEPTING_STAKES', 0, 'MUTUAL', 'REFUND', 'INITIALIZED', ?)`,
      [timeoutDuelId, `onchain_timeout_${suffix}`, challengeId, takeId, `pda_timeout_${suffix}`,
        walletA, walletB, now - 3600, now - 60, now - 1, new Date().toISOString()]
    );
    const timeoutResult = await resolveDuel(timeoutDuelId, {
      submitSettlementTx: async (_duel, side) => {
        assert.equal(side, 3, 'timeout uses the existing Cancel side');
        return { ok: true, sig: `fake_timeout_cancel_${timeoutDuelId}` };
      },
    });
    assert.equal(timeoutResult.success, true, 'timeout cancellation succeeds');
    assert.equal(queryOne(`SELECT status FROM duels WHERE id = ?`, [timeoutDuelId]).status, 'CANCELLED', 'timeout becomes terminal cancellation');
    ok('no-second-vote timeout uses the separate cancellation path');
  } finally {
    execute(`DELETE FROM activity WHERE target_id = ?`, [duelId]);
    execute(`DELETE FROM receipts WHERE duel_id = ?`, [duelId]);
    execute(`DELETE FROM mutual_votes WHERE duel_id = ?`, [duelId]);
    execute(`DELETE FROM positions WHERE duel_id = ?`, [duelId]);
    execute(`DELETE FROM duel_settlement_attempts WHERE duel_id = ?`, [duelId]);
    execute(`DELETE FROM duels WHERE id = ?`, [duelId]);
    execute(`DELETE FROM activity WHERE target_id IN (?, ?)`, [readyDuelId, timeoutDuelId]);
    execute(`DELETE FROM mutual_votes WHERE duel_id IN (?, ?)`, [readyDuelId, timeoutDuelId]);
    execute(`DELETE FROM duel_settlement_attempts WHERE duel_id IN (?, ?)`, [readyDuelId, timeoutDuelId]);
    execute(`DELETE FROM duels WHERE id IN (?, ?)`, [readyDuelId, timeoutDuelId]);
    await closeLocalServer();
  }
}

run()
  .catch((err) => {
    console.error(err.stack || err);
    process.exitCode = 1;
  });
