/**
 * Counter Take-Deletion Boundary Tests (Gate D/F).
 * HTTP-level against a local test server (PORT 18096, local dev DB file).
 * Author-only soft delete; pending challenges atomically cancelled; formed
 * (or funded) Duels block deletion; proof rows survive. Tracked IDs are
 * hard-deleted afterwards; production is never touched.
 */
const naclMod = require('tweetnacl');
const nacl = naclMod.default || naclMod;
const bs58Module = require('bs58');
const bs58 = bs58Module.default || bs58Module;

const PORT = 18096;
process.env.PORT = String(PORT);
const BASE = `http://127.0.0.1:${PORT}`;

function assert(condition, message) {
  if (!condition) throw new Error(`[ASSERTION FAILED] ${message}`);
}
function ok(label) {
  console.log(`  ok - ${label}`);
}

async function api(method, path, token, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {}
  return { status: res.status, data };
}

async function siwsAuth() {
  const kp = nacl.sign.keyPair();
  const wallet = bs58.encode(Buffer.from(kp.publicKey));
  const nres = await api('GET', `/api/auth/nonce?wallet=${wallet}`);
  assert(nres.status === 200 && nres.data.nonce, 'nonce issues');
  const sig = bs58.encode(Buffer.from(nacl.sign.detached(Buffer.from(`Sign-in to Counter with nonce: ${nres.data.nonce}`, 'utf8'), kp.secretKey)));
  const vres = await api('POST', '/api/auth/verify', null, { wallet, signature: sig, nonce: nres.data.nonce });
  assert(vres.status === 200 && vres.data.token, 'verify issues token');
  return { wallet, token: vres.data.token };
}

async function run() {
  console.log('Counter take-deletion boundary tests');
  require('../index.js');
  await new Promise((r) => setTimeout(r, 2500));

  const tracked = { takes: [], challenges: [], duels: [], users: [] };
  try {
    const A = await siwsAuth();
    const B = await siwsAuth();
    tracked.users.push(A.wallet, B.wallet);
    // Author setup (identity joins resolve through users rows)
    const { queryOne, execute } = require('../db');
    execute(`UPDATE users SET display_name = ?, handle = ? WHERE wallet_address = ?`, ['Del Author', 'delauthor', A.wallet]);

    // 1. author deletes unchallenged Take
    let r = await api('POST', '/api/takes', A.token, { topic: 'Deletable', content: 'Delete me', category: 'CRYPTO' });
    assert(r.status === 201, 'take creates');
    const takeId = r.data.take.id;
    tracked.takes.push(takeId);
    r = await api('DELETE', `/api/takes/${takeId}`, A.token);
    assert(r.status === 200 && r.data.success === true, 'author deletes own Take');
    r = await api('GET', '/api/takes', A.token);
    assert(!(r.data.takes || []).some((t) => t.id === takeId), 'deleted Take absent from feed');
    r = await api('GET', `/api/takes/${takeId}`, A.token);
    assert(r.status === 404, 'deleted Take detail 404s');
    ok('author deletes unchallenged Take (soft delete, feed-clean)');

    // 2. non-author cannot delete
    r = await api('POST', '/api/takes', A.token, {
      topic: 'Not yours', content: 'Hands off', category: 'CRYPTO',
      author_name: 'Forged name', author_handle: 'forged_handle', author_avatar: '/forged.png',
    });
    const takeId2 = r.data.take.id;
    tracked.takes.push(takeId2);

    // Route-level profile contract + historical propagation proof. The client
    // may send @/mixed-case handles, but reads must expose the canonical
    // current profile through the author_* response fields.
    r = await api('PUT', '/api/users/profile', A.token, {
      displayName: 'Profile Name A', handle: '@ProfileA', bio: 'Profile bio A',
    });
    assert(
      r.status === 200 && r.data.user.display_name === 'Profile Name A' &&
      r.data.user.handle === 'profilea' && r.data.user.bio === 'Profile bio A',
      'authenticated PUT returns canonical profile fields'
    );
    r = await api('GET', '/api/takes', A.token);
    let feedTake = (r.data.takes || []).find((t) => t.id === takeId2);
    assert(
      feedTake && feedTake.author_wallet === A.wallet && feedTake.author_name === 'Profile Name A' &&
      feedTake.author_handle === 'profilea' && feedTake.author_avatar === '',
      'feed returns live canonical identity and ignores forged author fields'
    );

    r = await api('PUT', '/api/users/profile', A.token, {
      displayName: 'Profile Name B', handle: '@ProfileB', bio: 'Profile bio B',
    });
    assert(r.status === 200 && r.data.user.handle === 'profileb', 'profile edit normalizes handle');
    r = await api('GET', `/api/users/${A.wallet}`, A.token);
    assert(
      r.status === 200 && r.data.user.display_name === 'Profile Name B' &&
      r.data.user.handle === 'profileb' && r.data.user.bio === 'Profile bio B',
      'fresh profile GET matches the edited identity'
    );
    r = await api('GET', '/api/takes', A.token);
    feedTake = (r.data.takes || []).find((t) => t.id === takeId2);
    assert(
      feedTake && feedTake.id === takeId2 && feedTake.author_name === 'Profile Name B' &&
      feedTake.author_handle === 'profileb' && feedTake.author_name !== 'Counter user',
      'existing Take keeps its ID and feed resolves current identity'
    );
    r = await api('POST', `/api/takes/${takeId2}/comments`, A.token, { content: 'Live identity reply' });
    assert(
      r.status === 201 && r.data.comment.author_wallet === A.wallet &&
      r.data.comment.author_name === 'Profile Name B' && r.data.comment.author_handle === 'profileb',
      'new comment resolves current canonical identity'
    );
    r = await api('GET', `/api/takes/${takeId2}`, A.token);
    assert(
      r.status === 200 && r.data.take.author_name === 'Profile Name B' &&
      r.data.take.author_handle === 'profileb' &&
      r.data.comments.some((c) => c.author_name === 'Profile Name B' && c.author_handle === 'profileb'),
      'Take detail and comments resolve current identity'
    );
    ok('profile PUT/GET, feed, detail, comments, and historical propagation agree');

    r = await api('DELETE', `/api/takes/${takeId2}`, B.token);
    assert(r.status === 403, 'non-author delete rejected');
    r = await api('GET', `/api/takes/${takeId2}`, A.token);
    assert(r.status === 200, 'row intact after rejected delete');
    ok('non-author delete rejected with row intact');

    // 3. pending challenges are atomically cancelled
    r = await api('POST', '/api/challenges', B.token, {
      takeId: takeId2, targetWallet: A.wallet,
      propositionA: 'X up', propositionB: 'X down', category: 'CRYPTO',
      stakeAmountUsd: 5, cutoffTs: Math.floor(Date.now() / 1000) + 3600, resolutionTs: Math.floor(Date.now() / 1000) + 7200,
      resolutionMode: 'MUTUAL', fallbackMode: 'REFUND',
    });
    assert(r.status === 201, 'challenge proposes');
    const chalId = r.data.challenge.id;
    tracked.challenges.push(chalId);
    r = await api('GET', '/api/challenges', A.token);
    assert(r.status === 200 && (r.data.challenges || []).some((c) => c.id === chalId), 'pending challenge is actionable before delete');
    r = await api('DELETE', `/api/takes/${takeId2}`, A.token);
    assert(r.status === 200 && r.data.cancelledChallenges === 1, 'delete cancels pending challenge');
    const chRow = queryOne(`SELECT status FROM challenges WHERE id = ?`, [chalId]);
    assert(chRow && chRow.status === 'CANCELLED', 'pending challenge invalidated, not destroyed');
    r = await api('GET', '/api/challenges', A.token);
    assert(r.status === 200 && !(r.data.challenges || []).some((c) => c.id === chalId), 'cancelled challenge is hidden from actionable inbox');
    ok('pending challenges atomically cancelled on delete');

    // 4. formed Duel blocks deletion (even unfunded)
    r = await api('POST', '/api/takes', A.token, { topic: 'Duel bound', content: 'Locked', category: 'CRYPTO' });
    const takeId3 = r.data.take.id;
    tracked.takes.push(takeId3);
    r = await api('POST', '/api/challenges', B.token, {
      takeId: takeId3, targetWallet: A.wallet,
      propositionA: 'Y up', propositionB: 'Y down', category: 'CRYPTO',
      stakeAmountUsd: 5, cutoffTs: Math.floor(Date.now() / 1000) - 10, resolutionTs: Math.floor(Date.now() / 1000) - 5,
      resolutionMode: 'MUTUAL', fallbackMode: 'REFUND', mutualDeadlineTs: Math.floor(Date.now() / 1000) + 3600,
    });
    const chalId3 = r.data.challenge.id;
    tracked.challenges.push(chalId3);
    r = await api('POST', `/api/challenges/${chalId3}/accept`, A.token, {});
    assert(r.status === 200, 'duel forms');
    tracked.duels.push(r.data.duel.id);
    r = await api('DELETE', `/api/takes/${takeId3}`, A.token);
    assert(r.status === 400 && /Duel/.test(r.data.error), 'formed Duel blocks deletion with plain message');
    const stillThere = queryOne(`SELECT status FROM takes WHERE id = ?`, [takeId3]);
    assert(stillThere && stillThere.status === 'ACTIVE', 'take row intact');
    const duelRow = queryOne(`SELECT id FROM duels WHERE id = ?`, [r.data?.duel?.id || tracked.duels[tracked.duels.length - 1]]);
    assert(duelRow, 'formed Duel reference survives rejected delete');
    const positionId = `pos_delete_${Date.now()}`;
    execute(
      `INSERT INTO positions (id, duel_id, user_wallet, side, stake_amount, claimed, created_at) VALUES (?, ?, ?, 1, 5, 0, ?)`,
      [positionId, tracked.duels[tracked.duels.length - 1], A.wallet, new Date().toISOString()]
    );
    r = await api('DELETE', `/api/takes/${takeId3}`, A.token);
    assert(r.status === 400 && /Duel/.test(r.data.error), 'staked Duel also blocks deletion');
    assert(queryOne(`SELECT id FROM positions WHERE id = ?`, [positionId]), 'stake reference survives rejected delete');
    ok('formed Duel blocks deletion; proof rows intact');

    // 5. author identity join still resolves on remaining rows
    r = await api('GET', `/api/takes/${takeId3}`, A.token);
    assert(
      r.status === 200 && r.data.take.author_name === 'Profile Name B' &&
      r.data.take.author_handle === 'profileb',
      'live take resolves current identity'
    );
    ok('feed/detail identity contract holds (author_* populated)');

    console.log('\nAll take-deletion boundary tests passed.');
  } finally {
    const { execute } = require('../db');
    for (const id of tracked.duels) {
      for (const sql of [
        `DELETE FROM mutual_votes WHERE duel_id = '${id}'`,
        `DELETE FROM receipts WHERE duel_id = '${id}'`,
        `DELETE FROM positions WHERE duel_id = '${id}'`,
        `DELETE FROM duels WHERE id = '${id}'`,
        `DELETE FROM activity WHERE target_id = '${id}'`,
      ]) { try { execute(sql, []); } catch {} }
    }
    for (const id of tracked.challenges) {
      for (const sql of [
        `DELETE FROM counteroffers WHERE challenge_id = '${id}'`,
        `DELETE FROM challenges WHERE id = '${id}'`,
        `DELETE FROM activity WHERE target_id = '${id}'`,
      ]) { try { execute(sql, []); } catch {} }
    }
    for (const id of tracked.takes) {
      try { execute(`DELETE FROM comments WHERE take_id = '${id}'`, []); } catch {}
      try { execute(`DELETE FROM takes WHERE id = '${id}'`, []); } catch {}
      try { execute(`DELETE FROM activity WHERE target_id = '${id}'`, []); } catch {}
    }
    for (const w of tracked.users) {
      try { execute(`DELETE FROM users WHERE wallet_address = '${w}'`, []); } catch {}
    }
    try {
      const { saveDb } = require('../db');
      saveDb();
    } catch {}
    console.log('test fixtures cleaned');
  }
  process.exit(0);
}

run().catch((e) => {
  console.log(e.message);
  process.exit(1);
});
