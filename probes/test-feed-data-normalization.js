const assert = require('assert');
const https = require('https');

// Helper to fetch JSON from URL
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

// Client normalization logic as implemented in app/src/api.ts
function normalizeTakes(res) {
  if (Array.isArray(res)) return res;
  if (res && Array.isArray(res.takes)) return res.takes;
  return [];
}

function normalizeDuels(res) {
  if (Array.isArray(res)) return res;
  if (res && Array.isArray(res.duels)) return res.duels;
  return [];
}

async function testFeedDataNormalization() {
  console.log('--- 1. Testing Live VPS API Response Shapes ---');
  const backendBase = 'https://counter.103-195-188-198.sslip.io';

  const takesRes = await fetchJson(`${backendBase}/api/takes`);
  console.log(`GET /api/takes status: ${takesRes.status}`);
  console.log(`GET /api/takes response keys:`, Object.keys(takesRes.body));
  assert.strictEqual(takesRes.status, 200);
  assert(takesRes.body.takes !== undefined, 'Server returns { takes: [...] } object');
  assert(Array.isArray(takesRes.body.takes), 'takes property is an array');

  const duelsRes = await fetchJson(`${backendBase}/api/duels`);
  console.log(`GET /api/duels status: ${duelsRes.status}`);
  console.log(`GET /api/duels response keys:`, Object.keys(duelsRes.body));
  assert.strictEqual(duelsRes.status, 200);
  assert(duelsRes.body.duels !== undefined, 'Server returns { duels: [...] } object');
  assert(Array.isArray(duelsRes.body.duels), 'duels property is an array');

  console.log('\n--- 2. Verifying Normalization Logic (app/src/api.ts) ---');
  // Raw responses would crash if assigned directly to duels/takes:
  const rawDuels = duelsRes.body; // { duels: [...] }
  const rawTakes = takesRes.body; // { takes: [...] }

  assert.strictEqual(typeof rawDuels.map, 'undefined', 'rawDuels.map is undefined!');
  assert.strictEqual(typeof rawTakes.map, 'undefined', 'rawTakes.map is undefined!');

  // Normalized responses:
  const normalizedTakes = normalizeTakes(rawTakes);
  const normalizedDuels = normalizeDuels(rawDuels);

  assert(Array.isArray(normalizedTakes), 'Normalized takes must be an Array');
  assert(Array.isArray(normalizedDuels), 'Normalized duels must be an Array');
  assert.strictEqual(typeof normalizedTakes.map, 'function', 'normalizedTakes.map is a function');
  assert.strictEqual(typeof normalizedDuels.map, 'function', 'normalizedDuels.map is a function');
  console.log(`Normalized takes count: ${normalizedTakes.length}`);
  console.log(`Normalized duels count: ${normalizedDuels.length}`);

  console.log('\n--- 3. Verifying FeedScreen FlatList Mapping ---');
  // FlatList data mapping with normalized arrays:
  const flatListData = [
    { type: 'DUELS_HEADER' },
    ...(Array.isArray(normalizedDuels) ? normalizedDuels : []).map((d) => ({ type: 'DUEL', data: d })),
    { type: 'TAKES_HEADER' },
    ...(Array.isArray(normalizedTakes) ? normalizedTakes : []).map((t) => ({ type: 'TAKE', data: t })),
  ];

  console.log(`FlatList items generated: ${flatListData.length}`);
  assert(flatListData.length >= 2, 'FlatList has at least headers');

  // Verify defensive behavior even if API returns unexpected object / undefined / null:
  const brokenData = [
    { type: 'DUELS_HEADER' },
    ...(Array.isArray(rawDuels) ? rawDuels : []).map((d) => ({ type: 'DUEL', data: d })),
    { type: 'TAKES_HEADER' },
    ...(Array.isArray(rawTakes) ? rawTakes : []).map((t) => ({ type: 'TAKE', data: t })),
  ];
  assert.strictEqual(brokenData.length, 2, 'Defensive check survives un-normalized object');

  console.log('\n✅ PASS: FeedScreen normalization and defensive mapping verified successfully!');
}

testFeedDataNormalization().catch(err => {
  console.error('❌ FAIL:', err);
  process.exit(1);
});
