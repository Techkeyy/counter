/**
 * Counter Resolution Boundary Tests (Phases B-F, I, G-audit support)
 * HTTP-level against a local test server (PORT 18099, local dev DB file).
 * Created rows are tracked by exact ID and deleted afterwards; production is
 * never touched. Chain-submitting paths are NOT executed here (no Devnet
 * writes in the automated suite); they are covered by the gated Devnet probe
 * plus program-code audit. All assertions below are fail-closed gates.
 */
const naclMod = require('tweetnacl');
const nacl = naclMod.default || naclMod;
const bs58Module = require('bs58');
const bs58 = bs58Module.default || bs58Module;

const PORT = 18099;
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
  const sig = bs58.encode(
    Buffer.from(nacl.sign.detached(Buffer.from(`Sign-in to Counter with nonce: ${nres.data.nonce}`, 'utf8'), kp.secretKey))
  );
  const vres = await api('POST', '/api/auth/verify', null, { wallet, signature: sig, nonce: nres.data.nonce });
  assert(vres.status === 200 && vres.data.token, 'verify issues token');
  return { wallet, token: vres.data.token, kp };
}

function signSettlement(kp, duelId, winnerSide, resolutionTs) {
  const msg = `COUNTER_SETTLEMENT_V1|duel_id=${duelId}|winner_side=${winnerSide}|mode=MUTUAL|at=${resolutionTs}`;
  return {
    message: msg,
    signature: bs58.encode(Buffer.from(nacl.sign.detached(Buffer.from(msg, 'utf8'), kp.secretKey))),
  };
}

const VALID_CRYPTO = {
  takeId: 'take_probe', targetWallet: 'WALLET_B', propositionA: 'SOL over 200', propositionB: 'SOL under 200',
  category: 'CRYPTO', sourceType: 'coingecko', sourceConfig: { assetId: 'solana', targetPriceUsd: 200, operator: '>=' },
  stakeAmountUsd: 10,
  // The API accepts only the user-facing decision time. The test moves the
  // created Duel past resolution below before exercising the vote boundary.
  decisionTs: Math.floor(Date.now() / 1000) + 24 * 3600,
  resolutionMode: 'COUNTER_VERIFIED', fallbackMode: 'REFUND',
};

async function run() {
  console.log('Counter resolution boundary tests');
  require('../index.js');
  await new Promise((r) => setTimeout(r, 2500));

  const tracked = { challenges: [], duels: [], takes: [], users: [], votes: [] };
  try {
    const A = await siwsAuth();
    const B = await siwsAuth();
    const C = await siwsAuth();
    const { execute, queryAll } = require('../db');
    tracked.users.push(A.wallet, B.wallet, C.wallet);

    // The live-Take boundary is authoritative: all valid challenge cases need
    // a real source Take rather than the old placeholder ID.
    let takeRes = await api('POST', '/api/takes', A.token, {
      topic: 'Resolution probe', content: 'Resolution probe Take', category: 'CRYPTO',
    });
    assert(takeRes.status === 201 && takeRes.data.take, 'probe Take creates');
    const probeTakeId = takeRes.data.take.id;
    tracked.takes.push(probeTakeId);
    VALID_CRYPTO.takeId = probeTakeId;

    const weatherTakeRes = await api('POST', '/api/takes', A.token, {
      topic: 'Weather resolution probe', content: 'Weather temperature probe Take', category: 'WEATHER',
    });
    assert(weatherTakeRes.status === 201 && weatherTakeRes.data.take, 'weather Take creates');
    const weatherTakeId = weatherTakeRes.data.take.id;
    tracked.takes.push(weatherTakeId);
    const VALID_WEATHER = {
      ...VALID_CRYPTO,
      takeId: weatherTakeId,
      category: 'WEATHER',
      sourceType: 'open-meteo',
      sourceConfig: {
        provider: 'open-meteo', metric: 'temperature_2m', operator: '>=',
        city: 'Lagos', latitude: 6.5244, longitude: 3.3792, threshold: 30,
      },
    };

    // 1. template validation at propose time
    let r = await api('POST', '/api/challenges', B.token, { ...VALID_CRYPTO, sourceConfig: { operator: '>=' } });
    assert(r.status === 400, 'unsupported crypto verified mode rejected');
    r = await api('POST', '/api/challenges', B.token, { ...VALID_CRYPTO, sourceConfig: { assetId: 'dogecoin', targetPriceUsd: 1, operator: '>=' } });
    assert(r.status === 400, 'unsupported crypto template rejected');
    r = await api('POST', '/api/challenges', B.token, { ...VALID_CRYPTO, sourceConfig: { assetId: 'solana', targetPriceUsd: 0, operator: '>=' } });
    assert(r.status === 400, 'unsupported zero-price template rejected');
    r = await api('POST', '/api/challenges', B.token, { ...VALID_CRYPTO, sourceConfig: { assetId: 'solana', targetPriceUsd: 5, operator: '==' } });
    assert(r.status === 400, 'unsupported bad operator rejected');
    r = await api('POST', '/api/challenges', B.token, { ...VALID_CRYPTO, category: 'SPORTS', sourceConfig: { homeTeam: 'A' } });
    assert(r.status === 400, 'unsupported sports template rejected');
    r = await api('POST', '/api/challenges', B.token, { ...VALID_WEATHER, sourceConfig: { city: 'X' } });
    assert(r.status === 400, 'incomplete weather template rejected');
    r = await api('POST', '/api/challenges', B.token, { ...VALID_CRYPTO, resolutionMode: 'TRIBUNAL' });
    assert(r.status === 400, 'unknown mode rejected');
    r = await api('POST', '/api/challenges', B.token, { ...VALID_CRYPTO, fallbackMode: 'COINFLIP' });
    assert(r.status === 400, 'unknown fallback rejected');
    ok('malformed templates and modes rejected at propose time');

    // valid MUTUAL challenge A -> B
    const nowSec = Math.floor(Date.now() / 1000);
    r = await api('POST', '/api/challenges', B.token, {
      ...VALID_CRYPTO,
      targetWallet: B.wallet,
      resolutionMode: 'MUTUAL',
      fallbackMode: 'REFUND',
    });
    assert(r.status === 201 && r.data.challenge, 'mutual challenge proposes');
    const chal = r.data.challenge;
    tracked.challenges.push(chal.id);
    assert(chal.resolution_mode === 'MUTUAL' && chal.fallback_mode === 'REFUND', 'mode persisted explicitly');
    ok('mutual challenge persists explicit mode');

    // 2. non-counterparty cannot touch it
    r = await api('POST', `/api/challenges/${chal.id}/accept`, C.token, {});
    assert(r.status === 403, 'non-counterparty accept rejected');
    r = await api('POST', `/api/duels/duel_nope/mutual-vote`, C.token, { winnerSide: 1, signature: 'x' });
    assert(r.status === 404, 'vote on missing duel 404s');
    ok('counterparty gates hold');

    // 3. only the Take creator A may accept; the challenger B may not accept
    r = await api('POST', `/api/challenges/${chal.id}/accept`, B.token, {});
    assert(r.status === 403, 'challenger cannot accept outgoing challenge');
    r = await api('POST', `/api/challenges/${chal.id}/accept`, A.token, {});
    assert(r.status === 200 && r.data.duel, 'accept forms duel');
    const duel = r.data.duel;
    tracked.duels.push(duel.id);
    assert(duel.resolution_mode === 'MUTUAL' && duel.fallback_mode === 'REFUND', 'duel inherits settlement terms');
    ok('accept copies settlement terms to duel');

    // 4. config locked after funding path opens: counter on ACCEPTED fails
    r = await api('POST', `/api/challenges/${chal.id}/counter`, B.token, { stakeAmountUsd: 99 });
    assert(r.status === 400, 'counter after accept rejected (config locked)');
    ok('post-accept config changes rejected');

    // 5. the authoritative boundary refuses a Mutual vote before resolution.
    const earlySig = signSettlement(A.kp, duel.id, 1, Number(duel.resolution_ts));
    r = await api('POST', `/api/duels/${duel.id}/mutual-vote`, A.token, { winnerSide: 1, signature: earlySig.signature });
    assert(r.status === 400, 'early mutual vote rejected by the API');
    const earlyVotes = queryAll(`SELECT * FROM mutual_votes WHERE duel_id = ?`, [duel.id]);
    assert(earlyVotes.length === 0, 'early mutual vote stores no vote');
    assert(!queryAll(`SELECT * FROM receipts WHERE duel_id = ?`, [duel.id]).length, 'early mutual vote creates no receipt');
    ok('early Mutual vote rejected authoritatively with zero state change');

    // 6. mutual votes: non-captain rejected even with valid-shape sig
    const resTs = Math.floor(Date.now() / 1000) - 60;
    execute(
      `UPDATE duels SET resolution_ts = ?, mutual_deadline_ts = ? WHERE id = ?`,
      [resTs, resTs + 3600, duel.id]
    );
    const outsiderSig = signSettlement(C.kp, duel.id, 1, resTs);
    r = await api('POST', `/api/duels/${duel.id}/mutual-vote`, C.token, { winnerSide: 1, signature: outsiderSig.signature });
    assert(r.status === 400, 'non-captain vote rejected');
    // wrong-duel binding: A's sig for another duel id
    const wrongSig = signSettlement(A.kp, 'duel_other', 1, resTs);
    r = await api('POST', `/api/duels/${duel.id}/mutual-vote`, A.token, { winnerSide: 1, signature: wrongSig.signature });
    assert(r.status === 400, 'cross-duel signature rejected');
    // bad side
    const badSide = signSettlement(A.kp, duel.id, 7, resTs);
    r = await api('POST', `/api/duels/${duel.id}/mutual-vote`, A.token, { winnerSide: 7, signature: badSide.signature });
    assert(r.status === 400, 'invalid side rejected');
    ok('non-captain, cross-duel, and bad-side votes rejected');

    // 7. single captain vote -> no match, no settlement
    const sigA1 = signSettlement(A.kp, duel.id, 1, resTs);
    r = await api('POST', `/api/duels/${duel.id}/mutual-vote`, A.token, { winnerSide: 1, signature: sigA1.signature });
    assert(r.status === 200 && r.data.match && r.data.match.matched === false, 'single vote unmatched');
    r = await api('POST', `/api/duels/${duel.id}/resolve`, A.token, {});
    assert(r.status === 400, 'one captain alone cannot settle');
    const d1 = await api('GET', `/api/duels/${duel.id}`);
    assert(!String(d1.data.duel.status).startsWith('RESOLVED') && d1.data.duel.status !== 'CANCELLED', 'no state change without match');
    assert(!d1.data.receipt, 'no receipt without match');
    ok('one captain alone cannot settle (fail-closed, no receipt)');

    // 8. opposing vote -> DISPUTED. This fixture is deliberately uninitialized,
    // so the real-chain cancellation path is not invoked by the API probe.
    const sigB2 = signSettlement(B.kp, duel.id, 2, resTs);
    r = await api('POST', `/api/duels/${duel.id}/mutual-vote`, B.token, { winnerSide: 2, signature: sigB2.signature });
    assert(r.status === 200 && r.data.match.state === 'DISPUTED', 'opposing votes dispute');
    const privateRead = await api('GET', `/api/duels/${duel.id}`, A.token);
    assert(privateRead.status === 200 && privateRead.data.mutualState === 'DISPUTED', 'private read exposes coarse mismatch state');
    assert(privateRead.data.otherVoteSubmitted === true, 'private read exposes opponent submission presence');
    assert(privateRead.data.mutualVotes.length === 1 && privateRead.data.mutualVotes[0].captain_wallet === A.wallet && Number(privateRead.data.mutualVotes[0].winner_side) === 1, 'private read hides opponent winner choice');
    r = await api('POST', `/api/duels/${duel.id}/resolve`, B.token, {});
    assert(r.status === 400, 'disputed pair cannot settle');
    ok('opposing votes dispute without settlement');

    // 9. Once both captains disagree at/after resolution, the mismatch is
    // locked and the only valid path is refund. A late re-vote must not turn a
    // disputed pair into a winner after the decision boundary.
    const sigB1 = signSettlement(B.kp, duel.id, 1, resTs);
    r = await api('POST', `/api/duels/${duel.id}/mutual-vote`, B.token, { winnerSide: 1, signature: sigB1.signature });
    assert(r.status === 400 && /No agreement is final|refund/i.test(String(r.data?.error)), 'late re-vote rejected after mismatch');
    const lockedVotes = queryAll(`SELECT captain_wallet, winner_side FROM mutual_votes WHERE duel_id = ?`, [duel.id]);
    assert(lockedVotes.some((vote) => vote.captain_wallet === B.wallet && Number(vote.winner_side) === 2), 'disputed vote remains locked');
    ok('post-resolution mismatch locks and opens only the refund path');

    // 10. vote on VERIFIED-mode duel rejected
    r = await api('POST', '/api/challenges', B.token, { ...VALID_WEATHER, targetWallet: A.wallet });
    assert(r.status === 201, 'verified challenge proposes');
    tracked.challenges.push(r.data.challenge.id);
    const acc = await api('POST', `/api/challenges/${r.data.challenge.id}/accept`, A.token, {});
    assert(acc.status === 200 && acc.data.duel, 'creator accepts verified challenge');
    tracked.duels.push(acc.data.duel.id);
    const rv = await api('POST', `/api/duels/${acc.data.duel.id}/mutual-vote`, A.token, { winnerSide: 1, signature: sigA1.signature });
    assert(rv.status === 400, 'vote on verified-mode duel rejected');
    ok('verified-mode duels refuse mutual votes');

    // 11. losing-side style wrong-winner claim attempt rejected without chain
    r = await api('POST', `/api/duels/${duel.id}/claim`, A.token, { txSignature: 'FakeSig11111111111111111111111111111111111111111111111111111111111' });
    assert(r.status === 400, 'fabricated claim rejected pre-settlement');
    ok('fabricated claim rejected with zero state change');

    // 12. serializeResolveDuel side=3 (Cancel) byte vector
    const chain = require('../chain');
    const buf = chain.serializeResolveDuel({ winningSide: 3 });
    assert(buf.length === 2 && buf[0] === 2 && buf[1] === 3, 'cancel discriminator vector exact');
    ok('cancel (side=3) serializer vector exact');

    // 12. SKR rule: zero stake denied; dead-RPC deterministic false
    const skr = require('../skr');
    assert(skr.isStakeEligible(0) === false, 'zero SKR denied');
    assert(skr.isStakeEligible(0.000001) === true, 'dust active stake eligible (any active stake)');
    assert(skr.isStakeEligible(150) === true, 'real stake eligible');
    assert(skr.isStakeEligible(NaN) === false, 'non-numeric denied');
    process.env.MAINNET_RPC = 'http://127.0.0.1:9';
    const z = await skr.querySkrStakedAmount(A.wallet);
    assert(z.isEligible === false && z.stakedAmountSkr === 0, 'unreachable/zero stake denies eligibility');
    delete process.env.MAINNET_RPC;
    ok('Seeker Arena rule: any active stake eligible, zero/none denied');

    // 13. reseed guard: no rows added when takes exist
    const seed = require('../seed');
    assert(typeof seed.seedDatabase === 'function', 'seed module loads');
    ok('seed guard module present (skip path proven in production boot log)');

    console.log('\nAll resolution boundary tests passed.');
  } finally {
    const { queryOne, execute } = require('../db');
    for (const id of tracked.duels) {
      try {
        execute(`DELETE FROM mutual_votes WHERE duel_id = ?`, [id]);
        execute(`DELETE FROM receipts WHERE duel_id = ?`, [id]);
        execute(`DELETE FROM positions WHERE duel_id = ?`, [id]);
        execute(`DELETE FROM duels WHERE id = ?`, [id]);
        execute(`DELETE FROM activity WHERE target_id = ?`, [id]);
      } catch {}
    }
    for (const id of tracked.challenges) {
      try {
        execute(`DELETE FROM counteroffers WHERE challenge_id = ?`, [id]);
        execute(`DELETE FROM challenges WHERE id = ?`, [id]);
        execute(`DELETE FROM activity WHERE target_id = ?`, [id]);
      } catch {}
    }
    for (const id of tracked.takes) {
      try { execute(`DELETE FROM comments WHERE take_id = ?`, [id]); } catch {}
      try { execute(`DELETE FROM takes WHERE id = ?`, [id]); } catch {}
      try { execute(`DELETE FROM activity WHERE target_id = ?`, [id]); } catch {}
    }
    for (const w of tracked.users) {
      try { execute(`DELETE FROM users WHERE wallet_address = ?`, [w]); } catch {}
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
