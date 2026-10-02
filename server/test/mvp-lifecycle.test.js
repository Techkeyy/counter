/**
 * Counter MVP lifecycle and challenge-integrity boundary tests.
 *
 * This suite proves the server-side TAKE -> CHALLENGE -> AGREE TERMS -> DUEL
 * binding and the deliberately narrow resolution contracts. It uses only the
 * local test DB and deletes every fixture it creates.
 */
const naclMod = require('tweetnacl');
const nacl = naclMod.default || naclMod;
const bs58Module = require('bs58');
const bs58 = bs58Module.default || bs58Module;

const PORT = 18100;
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
  const response = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await response.json(); } catch {}
  return { status: response.status, data };
}

async function siwsAuth() {
  const keypair = nacl.sign.keyPair();
  const wallet = bs58.encode(Buffer.from(keypair.publicKey));
  const nonce = await api('GET', `/api/auth/nonce?wallet=${wallet}`);
  assert(nonce.status === 200 && nonce.data.nonce, 'nonce issues');
  const message = `Sign-in to Counter with nonce: ${nonce.data.nonce}`;
  const signature = bs58.encode(Buffer.from(nacl.sign.detached(Buffer.from(message, 'utf8'), keypair.secretKey)));
  const verified = await api('POST', '/api/auth/verify', null, {
    wallet,
    signature,
    nonce: nonce.data.nonce,
  });
  assert(verified.status === 200 && verified.data.token, 'verify issues token');
  return { wallet, token: verified.data.token };
}

async function run() {
  console.log('Counter MVP lifecycle and challenge-integrity tests');
  require('../index.js');
  await new Promise((resolve) => setTimeout(resolve, 2500));

  const tracked = { takes: [], challenges: [], duels: [], users: [] };
  try {
    const A = await siwsAuth();
    const B = await siwsAuth();
    const C = await siwsAuth();
    tracked.users.push(A.wallet, B.wallet, C.wallet);

    const { queryAll, queryOne, execute } = require('../db');
    const { deriveChallengeTiming } = require('../routes/challenges');
    const timingNow = Math.floor(Date.now() / 1000);
    const clampedTiming = deriveChallengeTiming(timingNow - 60, timingNow);
    assert(clampedTiming.ok && clampedTiming.resolutionTs === timingNow + 2 * 3600, 'past decision time clamps to the two-hour minimum');
    assert(clampedTiming.cutoffTs > timingNow && clampedTiming.cutoffTs < clampedTiming.resolutionTs, 'derived cutoff stays inside the valid timing boundary');
    execute(`UPDATE users SET display_name = ?, handle = ? WHERE wallet_address = ?`, ['Take Author', 'takeauthor', A.wallet]);
    execute(`UPDATE users SET display_name = ?, handle = ? WHERE wallet_address = ?`, ['Challenger B', 'challengerb', B.wallet]);
    execute(`UPDATE users SET display_name = ?, handle = ? WHERE wallet_address = ?`, ['Unrelated C', 'unrelatedc', C.wallet]);

    // Client-supplied creator/target fields are deliberately forged. The
    // server must still bind Captain A to the Take author and Captain B to the
    // authenticated challenger.
    let response = await api('POST', '/api/takes', A.token, {
      topic: 'Culture lifecycle Take', content: 'Any active Take can use Mutual + Refund.', category: 'CULTURE',
    });
    assert(response.status === 201 && response.data.take, 'culture Take creates');
    const cultureTakeId = response.data.take.id;
    tracked.takes.push(cultureTakeId);

    const genericChallengeBody = {
      takeId: cultureTakeId,
      creatorWallet: C.wallet,
      targetWallet: C.wallet,
      propositionA: 'Side A is right',
      propositionB: 'Side B is right',
      category: 'CRYPTO',
      sourceType: 'coingecko',
      sourceConfig: { assetId: 'solana', targetPriceUsd: 250, operator: '>=' },
      stakeAmountUsd: 25,
      decisionTs: Math.floor(Date.now() / 1000) + 24 * 3600,
      resolutionMode: 'MUTUAL',
      fallbackMode: 'REFUND',
    };
    response = await api('POST', '/api/challenges', B.token, {
      ...genericChallengeBody,
      cutoffTs: Math.floor(Date.now() / 1000) + 3600,
      resolutionTs: Math.floor(Date.now() / 1000) + 7200,
      mutualDeadlineTs: Math.floor(Date.now() / 1000) + 90000,
    });
    assert(response.status === 400 && /derived from decision time/.test(response.data.error), 'hidden timing overrides rejected');
    const createdBefore = Math.floor(Date.now() / 1000);
    response = await api('POST', '/api/challenges', B.token, genericChallengeBody);
    assert(response.status === 201 && response.data.challenge, 'generic Mutual challenge creates');
    const challenge = response.data.challenge;
    tracked.challenges.push(challenge.id);
    assert(challenge.creator_wallet === A.wallet, 'creator is derived from Take.author_wallet');
    assert(challenge.challenger_wallet === B.wallet, 'challenger is derived from authenticated session');
    assert(challenge.category === 'CULTURE', 'Take category is authoritative');
    assert(challenge.resolution_mode === 'MUTUAL' && challenge.fallback_mode === 'REFUND', 'generic Mutual contract persists');
    assert(challenge.source_type === null && challenge.source_config === null, 'generic Mutual has no oracle config');
    assert(Number(challenge.cutoff_ts) > createdBefore, 'cutoff is server-derived and in the future');
    assert(Number(challenge.resolution_ts) - Number(challenge.cutoff_ts) === 3600, 'cutoff is one hour before resolution');
    assert(Number(challenge.mutual_deadline_ts) - Number(challenge.resolution_ts) === 24 * 3600, 'mutual deadline is server-derived');

    response = await api('GET', '/api/challenges', B.token);
    assert(response.status === 200 && response.data.challenges.some((row) => row.id === challenge.id), 'challenger sees Sent challenge');
    response = await api('GET', '/api/challenges', A.token);
    assert(response.status === 200 && response.data.challenges.some((row) => row.id === challenge.id), 'Take author sees Incoming challenge');
    response = await api('GET', '/api/challenges', C.token);
    assert(response.status === 200 && !response.data.challenges.some((row) => row.id === challenge.id), 'forged third party cannot see challenge');
    response = await api('POST', `/api/challenges/${challenge.id}/counter`, B.token, {
      stakeAmountUsd: 30,
      cutoffTs: Math.floor(Date.now() / 1000) + 3600,
      resolutionTs: Math.floor(Date.now() / 1000) + 7200,
    });
    assert(response.status === 400 && /derived from decision time/.test(response.data.error), 'counteroffer timing overrides rejected');
    ok('challenge parties, category, profile joins, and generic contract are authoritative');

    response = await api('POST', `/api/challenges/${challenge.id}/accept`, B.token, {});
    assert(response.status === 403, 'challenger cannot accept their outgoing challenge');
    response = await api('POST', `/api/challenges/${challenge.id}/accept`, C.token, {});
    assert(response.status === 403, 'unrelated wallet cannot accept the challenge');
    response = await api('POST', `/api/challenges/${challenge.id}/accept`, A.token, {});
    assert(response.status === 200 && response.data.duel, 'Take author accepts and forms Duel');
    const duelId = response.data.duel.id;
    tracked.duels.push(duelId);
    response = await api('POST', `/api/challenges/${challenge.id}/accept`, A.token, {});
    assert(response.status === 200 && response.data.duel.id === duelId, 'accept retry returns original Duel');
    const duelCount = queryOne(`SELECT COUNT(*) AS count FROM duels WHERE challenge_id = ?`, [challenge.id]);
    const takeAfterAccept = queryOne(`SELECT duels_count FROM takes WHERE id = ?`, [cultureTakeId]);
    assert(Number(duelCount.count) === 1, 'accept retry cannot duplicate Duel');
    assert(Number(takeAfterAccept.duels_count) === 1, 'accept retry increments Take duel count once');
    ok('AGREE TERMS creates one linked Duel idempotently');

    response = await api('POST', '/api/challenges', A.token, {
      takeId: cultureTakeId,
      targetWallet: B.wallet,
      propositionA: 'self', propositionB: 'self', stakeAmountUsd: 5,
      resolutionMode: 'MUTUAL', fallbackMode: 'REFUND',
    });
    assert(response.status === 400 && /own Take/.test(response.data.error), 'self-challenge rejected');
    ok('self-challenge rejected');

    // Counter Verified is Weather-temperature-only. A category may not be
    // client-swapped into another oracle or into the former crypto fallback.
    response = await api('POST', '/api/takes', A.token, {
      topic: 'Weather lifecycle Take', content: 'Temperature at resolution.', category: 'WEATHER',
    });
    assert(response.status === 201, 'weather Take creates');
    const weatherTakeId = response.data.take.id;
    tracked.takes.push(weatherTakeId);
    const validWeather = {
      takeId: weatherTakeId,
      targetWallet: A.wallet,
      propositionA: 'Temperature reaches threshold',
      propositionB: 'Temperature stays below threshold',
      category: 'WEATHER',
      sourceType: 'open-meteo',
      sourceConfig: {
        provider: 'open-meteo', metric: 'temperature_2m', operator: '>=',
        city: 'Lagos', latitude: 6.5244, longitude: 3.3792, threshold: 30,
      },
      stakeAmountUsd: 10,
      decisionTs: Math.floor(Date.now() / 1000) + 24 * 3600,
      resolutionMode: 'COUNTER_VERIFIED', fallbackMode: 'REFUND',
    };
    response = await api('POST', '/api/challenges', B.token, validWeather);
    assert(response.status === 201, 'canonical Weather Counter Verified challenge creates');
    tracked.challenges.push(response.data.challenge.id);
    const persistedWeather = JSON.parse(response.data.challenge.source_config);
    assert(persistedWeather.provider === 'open-meteo' && persistedWeather.metric === 'temperature_2m' && persistedWeather.operator === '>=', 'Weather contract is canonical');

    response = await api('POST', '/api/challenges', B.token, {
      ...validWeather,
      sourceConfig: { ...validWeather.sourceConfig, provider: 'coingecko' },
    });
    assert(response.status === 400, 'non-Open-Meteo verified source rejected');
    response = await api('POST', '/api/challenges', B.token, {
      ...validWeather,
      sourceConfig: { ...validWeather.sourceConfig, latitude: 91 },
    });
    assert(response.status === 400, 'invalid Weather latitude rejected');
    response = await api('POST', '/api/challenges', B.token, {
      ...validWeather,
      sourceConfig: { ...validWeather.sourceConfig, operator: '<=' },
    });
    assert(response.status === 400, 'invalid Weather operator rejected');
    response = await api('POST', '/api/challenges', B.token, {
      ...validWeather,
      sourceConfig: { ...validWeather.sourceConfig, threshold: 'not-a-temperature' },
    });
    assert(response.status === 400, 'invalid Weather threshold rejected');
    response = await api('POST', '/api/challenges', B.token, {
      ...validWeather,
      resolutionMode: 'MUTUAL', fallbackMode: 'COUNTER_VERIFIED',
      sourceConfig: { ...validWeather.sourceConfig, operator: '<=' },
    });
    assert(response.status === 400, 'invalid Weather fallback contract rejected');
    response = await api('POST', '/api/challenges', B.token, {
      ...validWeather,
      takeId: cultureTakeId,
      category: 'CRYPTO',
      sourceType: 'coingecko',
      sourceConfig: { assetId: 'solana', targetPriceUsd: 250, operator: '>=' },
    });
    assert(response.status === 400, 'non-Weather Counter Verified fallback rejected');
    const { resolveWeather } = require('../resolvers/weather');
    const unsupportedWeather = await resolveWeather({
      provider: 'open-meteo', metric: 'temperature_2m', operator: '<=',
      city: 'Lagos', latitude: 6.5244, longitude: 3.3792, threshold: 30,
    });
    assert(unsupportedWeather.success === false, 'unsupported Weather resolver contract fails closed');
    ok('Counter Verified is limited to the locked Open-Meteo temperature contract');

    // Inactive/deleted Takes cannot become new challenges.
    response = await api('POST', '/api/takes', A.token, {
      topic: 'Delete before challenge', content: 'This Take is removed first.', category: 'CULTURE',
    });
    assert(response.status === 201, 'deletion probe Take creates');
    const deletedTakeId = response.data.take.id;
    tracked.takes.push(deletedTakeId);
    response = await api('DELETE', `/api/takes/${deletedTakeId}`, A.token);
    assert(response.status === 200, 'author deletes unused Take');
    response = await api('POST', '/api/challenges', B.token, {
      takeId: deletedTakeId, targetWallet: A.wallet,
      propositionA: 'after delete A', propositionB: 'after delete B', stakeAmountUsd: 5,
      decisionTs: Math.floor(Date.now() / 1000) + 24 * 3600,
      resolutionMode: 'MUTUAL', fallbackMode: 'REFUND',
    });
    assert(response.status === 400 && /active Take/.test(response.data.error), 'deleted Take cannot be challenged');
    ok('inactive/deleted Take cannot enter the MVP lifecycle');

    console.log('\nAll MVP lifecycle and challenge-integrity tests passed.');
  } finally {
    const { execute, saveDb } = require('../db');
    for (const id of tracked.duels) {
      for (const sql of [
        `DELETE FROM mutual_votes WHERE duel_id = ?`,
        `DELETE FROM receipts WHERE duel_id = ?`,
        `DELETE FROM positions WHERE duel_id = ?`,
        `DELETE FROM duels WHERE id = ?`,
        `DELETE FROM activity WHERE target_id = ?`,
      ]) { try { execute(sql, [id]); } catch {} }
    }
    for (const id of tracked.challenges) {
      for (const sql of [
        `DELETE FROM counteroffers WHERE challenge_id = ?`,
        `DELETE FROM challenges WHERE id = ?`,
        `DELETE FROM activity WHERE target_id = ?`,
      ]) { try { execute(sql, [id]); } catch {} }
    }
    for (const id of tracked.takes) {
      try { execute(`DELETE FROM comments WHERE take_id = ?`, [id]); } catch {}
      try { execute(`DELETE FROM takes WHERE id = ?`, [id]); } catch {}
      try { execute(`DELETE FROM activity WHERE target_id = ?`, [id]); } catch {}
    }
    for (const wallet of tracked.users) {
      try { execute(`DELETE FROM users WHERE wallet_address = ?`, [wallet]); } catch {}
    }
    try { saveDb(); } catch {}
    console.log('test fixtures cleaned');
  }
  process.exit(0);
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
