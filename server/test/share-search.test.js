const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const PORT = 18106;
process.env.PORT = String(PORT);
process.env.JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const BASE = `http://127.0.0.1:${PORT}`;

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${BASE}/api/health`);
      if (response.status === 200) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('local test server did not become ready');
}

async function closeLocalServer() {
  const servers = process._getActiveHandles().filter(
    (handle) => handle && handle.constructor && handle.constructor.name === 'Server'
  );
  await Promise.all(servers.map((server) => new Promise((resolve) => {
    try { server.close(resolve); } catch { resolve(); }
  })));
}

async function json(url) {
  const response = await fetch(`${BASE}${url}`);
  return { response, body: await response.json() };
}

async function run() {
  require('../index.js');
  await waitForServer();
  const { getDb, execute } = require('../db');
  await getDb();

  const suffix = `${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const walletA = `search_wallet_a_${suffix}`;
  const walletB = `search_wallet_b_${suffix}`;
  const takeId = `take_share_${suffix}`;
  const duelId = `duel_share_${suffix}`;
  const shareSlug = `share-${suffix}`;
  const receiptId = `receipt_share_${suffix}`;
  const now = new Date().toISOString();

  execute(
    `INSERT INTO users (wallet_address, handle, display_name, avatar_url, bio, created_at)
     VALUES (?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?)`,
    [walletA, `ShareAlice${suffix}`, 'Alice Search', '', 'Public Alice bio', now,
      walletB, `searchbob${suffix}`, 'Bob Counter', '', 'Public Bob bio', now]
  );
  execute(
    `INSERT INTO takes (id, author_wallet, topic, content, category, created_at, status)
     VALUES (?, ?, ?, ?, 'CULTURE', ?, 'ACTIVE')`,
    [takeId, walletA, 'A shareable Take', 'A real shared proposition.', now]
  );
  execute(
    `INSERT INTO duels (id, onchain_duel_id, challenge_id, take_id, captain_a_wallet, captain_b_wallet,
       proposition_a, proposition_b, category, status, winning_side, is_archived, share_slug, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'CULTURE', 'CANCELLED', 0, 0, ?, ?)`,
    [duelId, crypto.randomBytes(16).toString('hex'), `challenge_${suffix}`, takeId, walletA, walletB,
      'A real proposition', 'A real counter', shareSlug, now]
  );
  execute(
    `INSERT INTO receipts (id, duel_id, take_id, captain_a_wallet, captain_b_wallet, winner_wallet,
       total_pool, resolution_summary, resolution_evidence, onchain_signature, created_at)
     VALUES (?, ?, ?, ?, ?, 'REFUNDED', 20, 'No agreement. Both stakes were returned.', 'test evidence', 'test-public-proof', ?)`,
    [receiptId, duelId, takeId, walletA, walletB, now]
  );

  try {
    let result = await json(`/api/users/search?q=%40sharealice`);
    assert.equal(result.response.status, 200);
    assert.equal(result.body.users.length, 1, 'handle search returns one public profile');
    assert.equal(result.body.users[0].wallet_address, walletA);
    assert.equal(result.body.users[0].bio, 'Public Alice bio');
    assert.equal('skr_staked_amount' in result.body.users[0], false, 'search does not expose SKR state');
    assert.equal('created_at' in result.body.users[0], false, 'search does not expose internal timestamps');

    result = await json(`/api/users/search?q=${encodeURIComponent('BOB COUNTER')}`);
    assert.equal(result.body.users[0].wallet_address, walletB, 'display-name search is case-insensitive');

    result = await json(`/api/users/search?q=${encodeURIComponent(walletA.slice(0, 14))}`);
    assert.equal(result.body.users[0].wallet_address, walletA, 'wallet prefix is a supported fallback');

    result = await json('/api/users/search?q=%25');
    assert.deepEqual(result.body.users, [], 'wildcard-only query does not broaden the search');

    const giant = await fetch(`${BASE}/api/users/search?q=${'x'.repeat(65)}`);
    assert.equal(giant.status, 400, 'giant search query is rejected');

    const takePage = await fetch(`${BASE}/t/${takeId}`);
    const takeHtml = await takePage.text();
    assert.equal(takePage.status, 200);
    assert.match(takeHtml, /A real shared proposition/);
    assert.match(takeHtml, /Challenge this Take/);
    assert.match(takeHtml, new RegExp(`counter://take/${takeId}`));
    assert.match(takeHtml, /og:description/);

    const duelPage = await fetch(`${BASE}/d/${shareSlug}`);
    const duelHtml = await duelPage.text();
    assert.equal(duelPage.status, 200);
    assert.match(duelHtml, /Alice Search/);
    assert.match(duelHtml, /Bob Counter/);
    assert.match(duelHtml, /A real proposition/);
    assert.match(duelHtml, new RegExp(`counter://duel/${shareSlug}`));

    const receiptPage = await fetch(`${BASE}/r/${receiptId}`);
    const receiptHtml = await receiptPage.text();
    assert.equal(receiptPage.status, 200);
    assert.match(receiptHtml, /Alice Search/);
    assert.match(receiptHtml, /Bob Counter/);
    assert.match(receiptHtml, /No agreement\. Both stakes were returned\./);
    assert.match(receiptHtml, new RegExp(`counter://receipt/${receiptId}`));

    console.log('Share pages and public user search HTTP contract: PASS');
  } finally {
    execute('DELETE FROM receipts WHERE id = ?', [receiptId]);
    execute('DELETE FROM duels WHERE id = ?', [duelId]);
    execute('DELETE FROM takes WHERE id = ?', [takeId]);
    execute('DELETE FROM users WHERE wallet_address IN (?, ?)', [walletA, walletB]);
    await closeLocalServer();
  }
}

run().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
