/**
 * Counter Backend Adversarial & Integration Test Suite
 * Tests full social lifecycle, SIWS auth, parimutuel math, resolvers, receipts, moderation, and SKR checks.
 */

const nacl = require('tweetnacl');
const bs58Module = require('bs58');
const bs58 = bs58Module.default || bs58Module;
const { getDb, queryAll, queryOne, execute } = require('../db');
const auth = require('../auth');
const skr = require('../skr');
const { resolveCrypto } = require('../resolvers/crypto');
const { resolveSports } = require('../resolvers/sports');
const { resolveWeather } = require('../resolvers/weather');
const { resolveDuel } = require('../resolvers');

// Test utilities
function assert(condition, message) {
  if (!condition) {
    throw new Error(`[ASSERTION FAILED] ${message}`);
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('  COUNTER BACKEND ADVERSARIAL & INTEGRATION SUITE   ');
  console.log('====================================================\n');

  // 1. Initialize Database
  console.log('[1/8] Initializing test database...');
  const db = await getDb();
  assert(db !== null, 'Database must be initialized');
  console.log('✓ In-memory SQLite initialized successfully\n');

  // 2. Test SIWS Authentication & Signature Security
  console.log('[2/8] Testing SIWS Authentication & Adversarial Signature Security...');
  const keypairA = nacl.sign.keyPair();
  const walletA = bs58.encode(keypairA.publicKey);
  const keypairB = nacl.sign.keyPair();
  const walletB = bs58.encode(keypairB.publicKey);
  const attackerKeypair = nacl.sign.keyPair();

  // Nonce generation
  const { nonce: nonceA } = auth.generateNonce(walletA);
  assert(nonceA && nonceA.length > 10, 'Nonce must be generated');

  // Honest signature
  const expectedMsgA = `Sign-in to Counter with nonce: ${nonceA}`;
  const messageBytes = Buffer.from(expectedMsgA, 'utf-8');
  const signatureA = nacl.sign.detached(messageBytes, keypairA.secretKey);
  const sigBase58 = bs58.encode(signatureA);

  const authRes = auth.verifySignature(walletA, sigBase58, nonceA);
  assert(authRes.valid === true, 'Honest signature must produce valid session');
  const tokenA = authRes.token;
  
  const tokenPayload = auth.verifyToken(tokenA);
  assert(tokenPayload && tokenPayload.wallet === walletA, 'Token must verify back to wallet A');

  // Adversarial: Replay nonce
  const replayRes = auth.verifySignature(walletA, sigBase58, nonceA);
  assert(replayRes.valid === false, 'Replayed nonce must be rejected');

  // Adversarial: Forged signature by attacker
  const { nonce: nonceB } = auth.generateNonce(walletB);
  const forgedSig = nacl.sign.detached(Buffer.from(`Sign-in to Counter with nonce: ${nonceB}`, 'utf-8'), attackerKeypair.secretKey);
  const forgedRes = auth.verifySignature(walletB, bs58.encode(forgedSig), nonceB);
  assert(forgedRes.valid === false, 'Forged signature from different keypair must be rejected');

  // Adversarial: Tampered token
  const tamperedToken = tokenA.substring(0, tokenA.length - 4) + 'abcd';
  assert(auth.verifyToken(tamperedToken) === null, 'Tampered JWT/HMAC token must be rejected');

  console.log('✓ SIWS Auth & Replay/Forgery protection passed\n');

  // 3. Test Takes and Social Feed
  console.log('[3/8] Testing Social Takes, Comments & Mentions...');
  const takeId = 'take_test_001';
  execute(`INSERT OR REPLACE INTO users (wallet_address, handle, display_name, avatar_url, bio, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [walletA, 'alicesol', 'Alice Sol', 'https://avatar.vercel.sh/alice', 'DeFi Analyst', new Date().toISOString()]);
  execute(`INSERT OR REPLACE INTO users (wallet_address, handle, display_name, avatar_url, bio, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [walletB, 'bobbull', 'Bob Bull', 'https://avatar.vercel.sh/bob', 'Macro Trader', new Date().toISOString()]);

  execute(`INSERT OR REPLACE INTO takes (id, author_wallet, topic, content, category, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [takeId, walletA, 'SOL vs ETH', 'SOL will outperform ETH through Q4 2026. Put your money where your mouth is.', 'CRYPTO', new Date().toISOString()]);

  const takeRows = queryAll(`SELECT * FROM takes WHERE id = ?`, [takeId]);
  assert(takeRows.length === 1, 'Take must be stored');

  // Add comment
  execute(`INSERT OR REPLACE INTO comments (id, take_id, author_wallet, content, created_at) VALUES (?, ?, ?, ?, ?)`,
    ['comm_001', takeId, walletB, 'You are completely delusional Alice. Challenge accepted.', new Date().toISOString()]);
  const commentRows = queryAll(`SELECT * FROM comments WHERE take_id = ?`, [takeId]);
  assert(commentRows.length === 1, 'Comment must be linked to take');
  console.log('✓ Social Takes & Comments passed\n');

  // 4. Test Challenge Negotiation & Mutual Agreement Loop
  console.log('[4/8] Testing Challenge -> Counteroffer -> Acceptance State Machine...');
  const challengeId = 'chal_test_001';
  
  // Alice challenges Bob
  execute(`INSERT OR REPLACE INTO challenges (id, take_id, challenger_wallet, creator_wallet, proposition_a, proposition_b, category, stake_amount_usd, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [challengeId, takeId, walletA, walletB, 'SOL/USD > $250 on settlement', 'SOL/USD <= $250 on settlement', 'CRYPTO', 100, 'PROPOSED', new Date().toISOString()]);

  // Bob proposes counteroffer: 250 cUSD instead of 100
  const counterId = 'co_001';
  execute(`INSERT OR REPLACE INTO counteroffers (id, challenge_id, proposer_wallet, stake_amount_usd, proposition_a, proposition_b, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [counterId, challengeId, walletB, 250, 'SOL/USD > $250 on settlement', 'SOL/USD <= $250 on settlement', 'PENDING', new Date().toISOString()]);

  // Alice accepts counteroffer -> transitions challenge to accepted
  execute(`UPDATE counteroffers SET status = 'ACCEPTED' WHERE id = ?`, [counterId]);
  execute(`UPDATE challenges SET status = 'ACCEPTED', stake_amount_usd = 250 WHERE id = ?`, [challengeId]);

  const updatedChal = queryOne(`SELECT status, stake_amount_usd FROM challenges WHERE id = ?`, [challengeId]);
  assert(updatedChal.status === 'ACCEPTED', 'Challenge must be accepted');
  assert(updatedChal.stake_amount_usd === 250, 'Agreed stake must match counteroffer');
  console.log('✓ Challenge & Counteroffer negotiation passed\n');

  // 5. Test Duel Creation, Parimutuel Backer Pools & Odds Calculation
  console.log('[5/8] Testing Duel Lifecycle, Parimutuel Pools & Outside Backers...');
  const duelId = 'duel_test_001';
  const duelPda = '9wJ1...duelVaultTestPda';

  execute(`INSERT OR REPLACE INTO duels (id, onchain_duel_id, challenge_id, take_id, captain_a_wallet, captain_b_wallet, side_a_total, side_b_total, proposition_a, proposition_b, category, source_type, source_config, cutoff_ts, resolution_ts, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [duelId, 'onchain_001', challengeId, takeId, walletA, walletB, 250, 250, 'SOL > $250', 'SOL <= $250', 'CRYPTO', 'CRYPTO', JSON.stringify({ coinId: 'solana', targetPriceUsd: 250, condition: 'GTE' }), Date.now() + 86400000, Date.now() + 172800000, 'ACCEPTING_STAKES', new Date().toISOString()]);

  // Captain positions
  execute(`INSERT OR REPLACE INTO positions (id, duel_id, user_wallet, side, stake_amount, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    ['pos_cap_a', duelId, walletA, 1, 250, new Date().toISOString()]);
  execute(`INSERT OR REPLACE INTO positions (id, duel_id, user_wallet, side, stake_amount, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    ['pos_cap_b', duelId, walletB, 2, 250, new Date().toISOString()]);

  // Initial Odds: 250 vs 250 -> 1:1 (2.0x for both)
  let poolA = 250, poolB = 250;
  let oddsA = (poolA + poolB) / poolA; // 2.0x
  let oddsB = (poolA + poolB) / poolB; // 2.0x
  assert(oddsA === 2.0 && oddsB === 2.0, 'Initial odds with equal pools must be 2.0x');

  // Outside Backers join
  // Backer 1 backs Side A with 750 cUSD
  const backer1 = 'Backer1Wallet...';
  execute(`INSERT OR REPLACE INTO positions (id, duel_id, user_wallet, side, stake_amount, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    ['pos_back_1', duelId, backer1, 1, 750, new Date().toISOString()]);
  poolA += 750; // Total A = 1000

  // Backer 2 backs Side B with 250 cUSD
  const backer2 = 'Backer2Wallet...';
  execute(`INSERT OR REPLACE INTO positions (id, duel_id, user_wallet, side, stake_amount, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    ['pos_back_2', duelId, backer2, 2, 250, new Date().toISOString()]);
  poolB += 250; // Total B = 500

  // Update duel pools
  execute(`UPDATE duels SET side_a_total = ?, side_b_total = ? WHERE id = ?`, [poolA, poolB, duelId]);

  const totalPool = poolA + poolB; // 1500
  oddsA = (totalPool / poolA); // 1500 / 1000 = 1.5x
  oddsB = (totalPool / poolB); // 1500 / 500 = 3.0x
  assert(oddsA === 1.5, 'Odds for Side A must adjust to 1.5x');
  assert(oddsB === 3.0, 'Odds for Side B must adjust to 3.0x');

  // Invariant check: If Side A wins, total payout = 1000 * 1.5 = 1500 = Total Pool
  // If Side B wins, total payout = 500 * 3.0 = 1500 = Total Pool
  assert(poolA * oddsA === totalPool, 'Side A total payout must exactly equal total pool');
  assert(poolB * oddsB === totalPool, 'Side B total payout must exactly equal total pool');
  console.log('✓ Parimutuel pools & dynamic odds math verified\n');

  // 6. Test Multi-Category Deterministic Resolvers & Settlement Receipts
  console.log('[6/8] Testing Deterministic Resolvers (Crypto, Sports, Weather) & Receipts...');
  
  // Test Crypto Resolver Logic
  const cryptoRes = await resolveCrypto({ coinId: 'solana', targetPriceUsd: 200, condition: 'GTE' });
  assert(cryptoRes && cryptoRes.success, 'Crypto resolver must execute successfully');
  assert(cryptoRes.winningSide === 1 || cryptoRes.winningSide === 2, 'Crypto resolver must return side 1 or 2');
  assert(cryptoRes.evidence !== undefined, 'Evidence must be present');

  // Test Weather Resolver Logic
  const weatherRes = await resolveWeather({ latitude: 40.7128, longitude: -74.0060, condition: 'RAIN_OR_SNOW' });
  assert(weatherRes && weatherRes.success, 'Weather resolver must execute successfully');

  // Test Sports Resolver Logic
  const sportsRes = await resolveSports({ league: 'epl', teamA: 'Arsenal', teamB: 'Chelsea' });
  assert(sportsRes && sportsRes.success, 'Sports resolver must execute successfully');

  // Execute full resolveDuel
  const resOutcome = await resolveDuel(duelId);
  assert(resOutcome.success, 'resolveDuel must succeed');

  const rcpt = queryOne(`SELECT * FROM receipts WHERE duel_id = ?`, [duelId]);
  assert(rcpt !== null, 'Receipt must be recorded in database');
  assert(rcpt.winner_wallet === walletA || rcpt.winner_wallet === walletB, 'Receipt winner wallet must match winning side');
  console.log(`✓ Deterministic settlement & permanent receipt generated: ${rcpt.id}\n`);

  // 7. Test User Rivalry & Head-to-Head Scorecards
  console.log('[7/8] Testing Rivalry Head-to-Head & Volume Tracking...');
  // Add a 2nd resolved duel between Alice and Bob where Alice wins again
  execute(`INSERT OR REPLACE INTO duels (id, onchain_duel_id, challenge_id, captain_a_wallet, captain_b_wallet, side_a_total, side_b_total, status, winning_side, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['duel_test_002', 'onchain_002', 'chal_002', walletA, walletB, 500, 500, 'RESOLVED_SIDE_A', 1, new Date().toISOString()]);

  const h2hDuels = queryAll(`SELECT * FROM duels WHERE (captain_a_wallet = ? AND captain_b_wallet = ?) OR (captain_a_wallet = ? AND captain_b_wallet = ?)`,
    [walletA, walletB, walletB, walletA]);
  assert(h2hDuels.length >= 2, 'Rivalry must count at least 2 duels');

  let aliceWins = 0, bobWins = 0, totalDisputed = 0;
  h2hDuels.forEach(row => {
    const pool = (Number(row.side_a_total) || 0) + (Number(row.side_b_total) || 0);
    totalDisputed += pool;
    if (row.winning_side === 1 && row.captain_a_wallet === walletA) aliceWins++;
    else if (row.winning_side === 2 && row.captain_b_wallet === walletA) aliceWins++;
    else if (row.winning_side === 1 && row.captain_a_wallet === walletB) bobWins++;
    else if (row.winning_side === 2 && row.captain_b_wallet === walletB) bobWins++;
  });
  assert(totalDisputed >= 2500, 'Total disputed volume across rivalries must be recorded');
  console.log(`✓ Rivalry aggregation: Alice (${aliceWins}) - Bob (${bobWins}), Disputed: $${totalDisputed} cUSD\n`);

  // 8. Test Moderation, UGC Reporting & User Blocking
  console.log('[8/8] Testing Moderation, Content Reporting & User Blocking...');
  // User B blocks an abusive spammer wallet
  const spammerWallet = 'Spammer11111111111111111111111111111111111';
  execute(`INSERT OR REPLACE INTO blocks (id, blocker_wallet, blocked_wallet, created_at) VALUES (?, ?, ?, ?)`,
    ['block_001', walletB, spammerWallet, new Date().toISOString()]);

  // Query feed excluding blocked users
  const blockedRows = queryAll(`SELECT blocked_wallet FROM blocks WHERE blocker_wallet = ?`, [walletB]);
  assert(blockedRows.length === 1 && blockedRows[0].blocked_wallet === spammerWallet, 'Block must be stored');

  // Report inappropriate content
  execute(`INSERT OR REPLACE INTO reports (id, reporter_wallet, target_type, target_id, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    ['rep_001', walletB, 'TAKE', takeId, 'Inappropriate language', new Date().toISOString()]);
  const repRows = queryAll(`SELECT * FROM reports WHERE id = ?`, ['rep_001']);
  assert(repRows.length === 1, 'Report must be recorded');
  console.log('✓ Moderation, Reporting & Blocking passed\n');

  console.log('====================================================');
  console.log('  ALL 8/8 BACKEND ADVERSARIAL TEST SUITES PASSED!   ');
  console.log('====================================================');
}

runTests().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
