/*
 * Local-only reliability regression. It starts the repository server against
 * the test SQLite file, proves Take POST idempotency/readback, no-cache list
 * behavior, feed Duel summaries, and time-derived expired Activity, then
 * removes every fixture it created.
 */
const crypto = require('crypto');
const naclMod = require('tweetnacl');
const nacl = naclMod.default || naclMod;
const bs58Module = require('bs58');
const bs58 = bs58Module.default || bs58Module;

const PORT = 18104;
process.env.PORT = String(PORT);
if (!process.env.JWT_SECRET) process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
const BASE = `http://127.0.0.1:${PORT}`;

function assert(condition, message) {
  if (!condition) throw new Error(`[ASSERTION FAILED] ${message}`);
}

async function api(method, pathname, token, body, extraHeaders = {}) {
  const headers = { ...extraHeaders };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(BASE + pathname, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await response.json(); } catch {}
  return { status: response.status, data, headers: response.headers };
}

async function waitForHealth() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const response = await api('GET', '/api/health');
      if (response.status === 200) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('local reliability server did not become healthy');
}

async function siwsAuth() {
  const keypair = nacl.sign.keyPair();
  const wallet = bs58.encode(Buffer.from(keypair.publicKey));
  const nonce = await api('GET', `/api/auth/nonce?wallet=${wallet}`);
  assert(nonce.status === 200 && nonce.data.nonce, 'test wallet receives a nonce');
  const message = `Sign-in to Counter with nonce: ${nonce.data.nonce}`;
  const signature = bs58.encode(Buffer.from(nacl.sign.detached(Buffer.from(message, 'utf8'), keypair.secretKey)));
  const verified = await api('POST', '/api/auth/verify', null, {
    wallet,
    signature,
    nonce: nonce.data.nonce,
  });
  assert(verified.status === 200 && verified.data.token, 'test wallet receives a session');
  return { wallet, token: verified.data.token };
}

async function run() {
  require('../index.js');
  await waitForHealth();
  const { execute, saveDb } = require('../db');
  const tracked = { takeId: null, duelId: null, wallet: null };
  try {
    const user = await siwsAuth();
    tracked.wallet = user.wallet;
    const attemptId = `reliability_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

    const first = await api('POST', '/api/takes', user.token, {
      topic: 'Reliability test Take',
      content: 'The first response must be authoritative.',
      category: 'CULTURE',
    }, { 'X-Counter-Attempt-Id': attemptId });
    assert(first.status === 201 && first.data.take?.id, 'first Take POST succeeds with a Take');
    tracked.takeId = first.data.take.id;

    const repeat = await api('POST', '/api/takes', user.token, {
      topic: 'Reliability test Take',
      content: 'A retry must not duplicate it.',
      category: 'CULTURE',
    }, { 'X-Counter-Attempt-Id': attemptId });
    assert(repeat.status === 200 && repeat.data.idempotent === true, 'same attempt is idempotent');
    assert(repeat.data.take.id === tracked.takeId, 'idempotent retry returns the original Take');

    const readback = await api('GET', `/api/takes/by-attempt/${encodeURIComponent(attemptId)}`, user.token);
    assert(readback.status === 200 && readback.data.take.id === tracked.takeId, 'attempt readback returns the original Take');

    const initialList = await api('GET', '/api/takes');
    assert(initialList.status === 200 && initialList.data.takes.some((take) => take.id === tracked.takeId), 'new Take appears in the authoritative feed');
    const etag = initialList.headers.get('etag');
    const conditionalList = await api('GET', '/api/takes', null, undefined, etag ? { 'If-None-Match': etag } : {});
    assert(conditionalList.status === 200, 'feed list never becomes a stale 304 after a mutation');
    assert(conditionalList.headers.get('cache-control')?.includes('no-store'), 'feed list is explicitly no-store');

    const now = Math.floor(Date.now() / 1000);
    tracked.duelId = `reliability_duel_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    execute(
      `INSERT INTO duels (id, onchain_duel_id, take_id, captain_a_wallet, captain_b_wallet,
         proposition_a, proposition_b, category, resolution_mode, status, chain_status,
         side_a_total, side_b_total, resolution_ts, is_archived, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'CULTURE', 'MUTUAL', 'ACCEPTING_STAKES', 'UNINITIALIZED', 0, 0, ?, 0, ?)`,
      [
        tracked.duelId,
        crypto.randomBytes(16).toString('hex'),
        tracked.takeId,
        user.wallet,
        'reliability-opponent',
        'A',
        'B',
        now - 60,
        new Date().toISOString(),
      ],
    );

    const expiredList = await api('GET', '/api/takes');
    const summary = expiredList.data.takes.find((take) => take.id === tracked.takeId)?.duel_summaries?.find((duel) => duel.id === tracked.duelId);
    assert(summary?.state === 'EXPIRED' && summary.state_label === 'Duel expired', 'feed summary derives expired Duel state from time');

    const activity = await api('GET', '/api/activity', user.token);
    assert(activity.status === 200 && activity.data.activity.some((item) => item.type === 'DUEL_EXPIRED' && item.target_id === tracked.duelId), 'expired Duel propagates to Activity without a duplicate write');

    console.log('Server reliability pass: PASS (idempotent Take POST, readback, no-store refresh, linked Duel state, and expired Activity)');
  } finally {
    if (tracked.duelId) {
      execute(`DELETE FROM activity WHERE target_id = ?`, [tracked.duelId]);
      execute(`DELETE FROM duels WHERE id = ?`, [tracked.duelId]);
    }
    if (tracked.takeId) {
      execute(`DELETE FROM comments WHERE take_id = ?`, [tracked.takeId]);
      execute(`DELETE FROM takes WHERE id = ?`, [tracked.takeId]);
    }
    if (tracked.wallet) {
      execute(`DELETE FROM auth_nonces WHERE wallet_address = ?`, [tracked.wallet]);
      execute(`DELETE FROM users WHERE wallet_address = ?`, [tracked.wallet]);
    }
    try { saveDb(); } catch {}
  }
  process.exit(0);
}

run().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
