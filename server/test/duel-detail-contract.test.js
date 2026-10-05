/**
 * Duel-detail JSON contract regression.
 *
 * The detail endpoint must remain a body-bearing application response even
 * when a client repeats a request with the prior response's ETag validator.
 * This test uses a local fixture only and never touches production data or
 * submits a chain transaction.
 */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const PORT = 18103;
process.env.PORT = String(PORT);
process.env.JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const BASE = `http://127.0.0.1:${PORT}`;

function ok(label) {
  console.log(`  ok - ${label}`);
}

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
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

async function run() {
  require('../index.js');
  await waitForServer();

  const { execute } = require('../db');
  const duelId = `duel_detail_contract_${Date.now()}`;
  const onchainId = `detail_contract_${Date.now()}`;

  execute(
    `INSERT INTO duels
      (id, onchain_duel_id, captain_a_wallet, captain_b_wallet,
       proposition_a, proposition_b, status, chain_status,
       resolution_ts, is_archived, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'ACCEPTING_STAKES', 'UNINITIALIZED', ?, 0, ?)`,
    [duelId, onchainId, 'detail-contract-a', 'detail-contract-b', 'A', 'B',
      Math.floor(Date.now() / 1000) + 900, new Date().toISOString()]
  );

  try {
    const first = await fetch(`${BASE}/api/duels/${duelId}`);
    assert.equal(first.status, 200, 'first Duel detail GET must return 200');
    assert.match(first.headers.get('cache-control') || '', /no-store/i, 'detail response must advertise no-store');
    const firstBody = await first.json();
    assert.equal(firstBody.duel.id, duelId, 'first response must contain the Duel JSON body');
    const etag = first.headers.get('etag');
    ok(`first GET returned 200 JSON${etag ? ' with ETag captured' : ''}`);

    const second = await fetch(`${BASE}/api/duels/${duelId}`, {
      headers: {
        'If-None-Match': etag || 'W/"detail-contract-regression"',
        'If-Modified-Since': 'Wed, 21 Oct 2015 07:28:00 GMT',
      },
    });
    assert.equal(second.status, 200, 'conditional Duel detail GET must not become 304');
    assert.match(second.headers.get('cache-control') || '', /no-store/i, 'conditional detail response must advertise no-store');
    const secondBody = await second.json();
    assert.equal(secondBody.duel.id, duelId, 'conditional response must contain a fresh Duel JSON body');
    ok('conditional GET returned 200 JSON with a body');

    console.log('Duel detail HTTP contract: PASS');
  } finally {
    execute('DELETE FROM duels WHERE id = ?', [duelId]);
    await closeLocalServer();
  }
}

run().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
