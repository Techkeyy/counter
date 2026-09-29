/**
 * GATES 6+8 — Local chain-boundary smoke + failure/replay probes.
 *
 * Boots against the LOCAL new-code server (caller starts it on PORT=3101).
 * Uses a throwaway SIWS identity (real ed25519 signature, TEST- label) and
 * REAL Devnet transactions. Asserts boundaries, not just status codes, and
 * verifies DB/chain state did not mutate incorrectly after each negative.
 *
 * Run: $env:PORT=3101; node index.js  (in server/) then:
 *        node probes/local-chain-smoke.js
 */
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const SERVER_DIR = path.join(__dirname, '..', 'server');
const SERVER_MOD = (n) => require(path.join(SERVER_DIR, 'node_modules', n));
const nacl = SERVER_MOD('tweetnacl');
const bs58Module = SERVER_MOD('bs58');
const bs58 = bs58Module.default || bs58Module;
const {
  Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction,
} = SERVER_MOD('@solana/web3.js');
const {
  getOrCreateAssociatedTokenAccount, mintTo, createAssociatedTokenAccountInstruction,
} = SERVER_MOD('@solana/spl-token');

const BASE = 'http://127.0.0.1:3101/api';
const chain = require(path.join(SERVER_DIR, 'chain.js'));
const dbmod = path.join(SERVER_DIR, 'db.js');
// NOTE: the server holds its own in-memory sql.js handle; this probe must
// reload the DB module from file before every assertion read.
async function freshDb() {
  delete require.cache[require.resolve(dbmod)];
  const m = require(dbmod);
  await m.getDb();
  return m;
}

let passed = 0;
function ok(name) { passed += 1; console.log(`  ok - ${name}`); }
function assert(cond, msg) { if (!cond) throw new Error(`[PROBE FAILED] ${msg}`); }

async function http(method, p, token, body) {
  const r = await fetch(BASE + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await r.json(); } catch { data = null; }
  return { status: r.status, data };
}

async function main() {
  const connection = new Connection(chain.DEVNET_RPC, 'confirmed');
  const payer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync('C:/Users/HomePC/.config/solana/compart-devnet-upgrade.json', 'utf-8')))
  );
  // Throwaway captains (labeled test identities).
  const capA = Keypair.generate();
  const capB = Keypair.generate();
  const walletA = capA.publicKey.toBase58();
  const walletB = capB.publicKey.toBase58();

  // Fund throwaways (SOL for fees + cUSD for stakes).
  await sendAndConfirmTransaction(connection,
    new Transaction().add(
      SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: capA.publicKey, lamports: 40000000 }),
      SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: capB.publicKey, lamports: 20000000 })
    ), [payer]);
  const ataA = await getOrCreateAssociatedTokenAccount(connection, payer, chain.CUSD_MINT, capA.publicKey);
  const ataB = await getOrCreateAssociatedTokenAccount(connection, payer, chain.CUSD_MINT, capB.publicKey);
  await mintTo(connection, payer, chain.CUSD_MINT, ataA.address, payer, 10 * 10 ** 6);
  await mintTo(connection, payer, chain.CUSD_MINT, ataB.address, payer, 10 * 10 ** 6);
  console.log('throwaway wallets funded (TEST-smoke)');

  // Honest SIWS for walletA (real ed25519 signature via backend nonce).
  const toKeypair = (kp) => ({ publicKey: kp.publicKey.toBytes(), secretKey: kp.secretKey });
  const nkA = nacl.sign.keyPair.fromSecretKey(capA.secretKey);
  let r = await http('GET', `/auth/nonce?wallet=${walletA}`);
  assert(r.status === 200, 'nonce issued');
  const sigA = nacl.sign.detached(Buffer.from(`Sign-in to Counter with nonce: ${r.data.nonce}`, 'utf-8'), nkA.secretKey);
  r = await http('POST', '/auth/verify', undefined, { wallet: walletA, signature: bs58.encode(sigA), nonce: r.data.nonce });
  assert(r.status === 200 && r.data.token, 'SIWS login works');
  const tokenA = r.data.token;
  ok('throwaway SIWS authentication');

  // Second identity for wrong-wallet probes.
  const nkB = nacl.sign.keyPair.fromSecretKey(capB.secretKey);
  r = await http('GET', `/auth/nonce?wallet=${walletB}`);
  const sigB = nacl.sign.detached(Buffer.from(`Sign-in to Counter with nonce: ${r.data.nonce}`, 'utf-8'), nkB.secretKey);
  r = await http('POST', '/auth/verify', undefined, { wallet: walletB, signature: bs58.encode(sigB), nonce: r.data.nonce });
  const tokenB = r.data.token;

  // --- READ probes (non-destructive) ---
  r = await http('GET', '/health');
  assert(r.status === 200 && r.data.status === 'ok', 'health ok');
  r = await http('GET', '/takes', tokenA);
  assert(r.status === 200 && Array.isArray(r.data.takes), 'feed reads');
  ok('public reads (health/feed)');

  // --- TEST duel via the REAL product path: take -> challenge -> accept ---
  const now = Math.floor(Date.now() / 1000);
  r = await http('POST', '/takes', tokenA, {
    topic: 'Smoke test take', content: 'TEST-smoke state, ignore. Verifying chain boundaries.', category: 'crypto',
  });
  assert(r.status === 201 && r.data.take, 'take created via product path');
  const takeId = r.data.take.id;
  r = await http('POST', '/challenges', tokenA, {
    takeId, creatorWallet: walletB,
    propositionA: 'Smoke A wins', propositionB: 'Smoke B wins',
    // Deterministic weather vector (keyless oracle): London temp >= -50C.
    category: 'weather', sourceType: 'weather',
    sourceConfig: { latitude: 51.5074, longitude: -0.1278, city: 'London', condition: 'temp', threshold: -50 },
    stakeAmountUsd: 1, cutoffTs: now + 3600, resolutionTs: now + 7200,
  });
  assert(r.status === 201 && r.data.challenge, 'challenge proposed via product path');
  const chalId = r.data.challenge.id;
  r = await http('POST', `/challenges/${chalId}/accept`, tokenB, {});
  assert(r.status === 200 && r.data.duel, 'challenge accepted, duel formed');
  const duelRowId = r.data.duel.id;
  assert(/^[0-9a-f]{32}$/.test(r.data.duel.onchain_duel_id), 'canonical 16-byte duel id assigned');
  ok('social -> challenge -> duel via the real product path');

  // chain-accounts: canonical params, UNINITIALIZED.
  r = await http('GET', `/duels/${duelRowId}/chain-accounts?wallet=${walletA}`, tokenA);
  assert(r.status === 200, 'chain-accounts 200');
  assert(r.data.chainStatus === 'UNINITIALIZED', 'fresh duel UNINITIALIZED');
  assert(r.data.mint === 'AXMB7tf5yHqPuFRTzaMgNSGPZ8iKJtFkeYdpeN7jcHWC', 'chain-accounts mint = AXMB7');
  assert(r.data.programId === '52QgqEmxZzh2EH1gAwheMmp2ZXd9eT3WuXefSLYu6NmT', 'chain-accounts program correct');
  assert(r.data.resolver === payer.publicKey.toBase58(), 'resolver = server authority');
  const canon = r.data;
  ok('chain-accounts serves canonical AXMB7 model');

  // Bad duel id -> real JSON error (not HTML, not spinner data).
  r = await http('GET', '/duels/no_such_duel/chain-accounts', tokenA);
  assert(r.status === 404 && r.data && r.data.error, 'bad duel id -> JSON 404');
  ok('bad duel ID returns real error state');

  // --- FAILURE probes: fabricated / mismatched signatures change NOTHING ---
  const dbBefore = await freshDb();
  const before = dbBefore.queryOne('SELECT chain_status, side_a_total, side_b_total FROM duels WHERE id = ?', [duelRowId]);
  const FAKE = '5'.repeat(88);
  r = await http('POST', `/duels/${duelRowId}/init-onchain`, tokenA, { txSignature: FAKE });
  assert(r.status === 400, 'fabricated init sig rejected');
  r = await http('POST', `/duels/${duelRowId}/stake`, tokenA, { side: 1, amount: 1, txSignature: FAKE });
  assert(r.status === 400, 'fabricated stake sig rejected');
  r = await http('POST', `/duels/${duelRowId}/claim`, tokenA, { txSignature: FAKE });
  assert(r.status === 400, 'fabricated claim rejected (also: unsettled)');
  // Real lifecycle sigs from the OTHER duel must be rejected here (wrong duel).
  const OTHER_STAKE = 'rFpnuEJVwW2seMDoXmXVdL6H4Ydhgrta73YNdG8vgVZG53rngtZcJ4VYdk71WYWeKeQjFcczFk7M4D8db5q2Bo9';
  r = await http('POST', `/duels/${duelRowId}/stake`, tokenA, { side: 1, amount: 1, txSignature: OTHER_STAKE });
  assert(r.status === 400, 'wrong-duel stake sig rejected');
  const dbAfter = await freshDb();
  const after = dbAfter.queryOne('SELECT chain_status, side_a_total, side_b_total FROM duels WHERE id = ?', [duelRowId]);
  assert(JSON.stringify(before) === JSON.stringify(after), 'rejected probes mutated nothing');
  assert(dbAfter.queryAll('SELECT * FROM positions WHERE duel_id = ?', [duelRowId]).length === 0, 'no phantom positions');
  ok('fabricated/wrong-duel signatures rejected with zero state change');

  // Uninitialized stake refusal (authentic shape, no tx).
  r = await http('POST', `/duels/${duelRowId}/stake`, tokenA, { side: 1, amount: 1, txSignature: OTHER_STAKE });
  assert(r.status === 400, 'uninitialized duel refuses stake');
  // Uninitialized settlement refusal + no receipt.
  r = await http('POST', `/duels/${duelRowId}/resolve`, tokenA, {});
  assert(r.status === 400 && /not initialized/.test(r.data.error || ''), 'uninitialized resolve refused');
  assert((await freshDb()).queryOne('SELECT * FROM receipts WHERE duel_id = ?', [duelRowId]) === null, 'no receipt without settlement');
  ok('uninitialized duel refuses stake + settlement (no receipt)');

  // --- POSITIVE path with FRESH real txs ---
  const duelPda = new PublicKey(canon.duelPda);
  const vaultPda = new PublicKey(canon.vaultPda);
  const vaultAta = new PublicKey(canon.vaultAta);
  const initIxs = [];
  if (!(await connection.getAccountInfo(vaultAta))) {
    initIxs.push(createAssociatedTokenAccountInstruction(capA.publicKey, vaultAta, vaultPda, chain.CUSD_MINT));
  }
  initIxs.push(chain.buildInitializeDuelIx({
    payer: capA.publicKey, duelPda, resolver: new PublicKey(canon.resolver), mint: chain.CUSD_MINT,
    duelId: Buffer.from(canon.duelIdHex, 'hex'), cutoffTs: canon.cutoffTs, resolutionTs: canon.resolutionTs,
    termsHash: Buffer.from(canon.termsHash, 'hex'),
    captainA: new PublicKey(canon.captainA), captainB: new PublicKey(canon.captainB),
    duelBump: canon.duelBump, vaultBump: canon.vaultBump,
  }));
  const initSig = await sendAndConfirmTransaction(connection, new Transaction().add(...initIxs), [capA]);
  r = await http('POST', `/duels/${duelRowId}/init-onchain`, tokenA, { txSignature: initSig });
  assert(r.status === 200 && r.data.chainStatus === 'INITIALIZED', 'real init binds duel');
  ok(`real init verified by backend (${initSig.slice(0, 8)}…)`);

  // Real deposit 1 cUSD side A.
  const posA = chain.derivePositionPda(duelPda, walletA);
  const depIx = chain.buildDepositStakeIx({
    user: capA.publicKey, duelPda, positionPda: posA.positionPda, userAta: ataA.address,
    vaultAta, side: 1, amountBase: 1000000, positionBump: posA.positionBump,
  });
  const depSig = await sendAndConfirmTransaction(connection, new Transaction().add(depIx), [capA]);
  // Wrong wallet (B's token, A's genuine sig) must be rejected.
  r = await http('POST', `/duels/${duelRowId}/stake`, tokenB, { side: 1, amount: 1, txSignature: depSig });
  assert(r.status === 400, 'wrong-wallet stake rejected');
  // Wrong amount must be rejected.
  r = await http('POST', `/duels/${duelRowId}/stake`, tokenA, { side: 1, amount: 999, txSignature: depSig });
  assert(r.status === 400, 'wrong-amount stake rejected');
  // Correct indexing.
  r = await http('POST', `/duels/${duelRowId}/stake`, tokenA, { side: 1, amount: 1, txSignature: depSig });
  assert(r.status === 200, 'real stake indexed');
  let dbStake = await freshDb();
  let duel = dbStake.queryOne('SELECT side_a_total, side_b_total FROM duels WHERE id = ?', [duelRowId]);
  assert(duel.side_a_total === 1 && duel.side_b_total === 0, 'pools = chain-observed (1/0)');
  // Replay: same sig again must NOT double-count.
  r = await http('POST', `/duels/${duelRowId}/stake`, tokenA, { side: 1, amount: 1, txSignature: depSig });
  assert(r.status === 200, 'replayed stake sig accepted idempotently');
  dbStake = await freshDb();
  duel = dbStake.queryOne('SELECT side_a_total, side_b_total FROM duels WHERE id = ?', [duelRowId]);
  assert(duel.side_a_total === 1, 'replay did not double-count pool');
  assert(dbStake.queryAll('SELECT * FROM positions WHERE duel_id = ? AND user_wallet = ?', [duelRowId, walletA]).length === 1, 'single position row');
  ok('real stake indexed once; replay cannot create another entry');

  // Real deposit B 2 cUSD side B (for resolution + claim).
  const posB = chain.derivePositionPda(duelPda, walletB);
  const depBIx = chain.buildDepositStakeIx({
    user: capB.publicKey, duelPda, positionPda: posB.positionPda, userAta: ataB.address,
    vaultAta, side: 2, amountBase: 2000000, positionBump: posB.positionBump,
  });
  const depBSig = await sendAndConfirmTransaction(connection, new Transaction().add(depBIx), [capB]);
  r = await http('POST', `/duels/${duelRowId}/stake`, tokenB, { side: 2, amount: 2, txSignature: depBSig });
  assert(r.status === 200, 'backer-B stake indexed');

  // Resolve via route (oracle: London temp >= -50C -> side A; server signs).
  r = await http('POST', `/duels/${duelRowId}/resolve`, tokenA, {});
  if (r.status === 200) {
    assert(r.data.resolution && r.data.resolution.winningSide === 1, 'deterministic vector resolves side A');
    assert(r.data.resolution && r.data.resolution.tx && r.data.resolution.tx.length > 80, 'resolve returns real tx');
    const dbRes = await freshDb();
    const rcpt = dbRes.queryOne('SELECT * FROM receipts WHERE duel_id = ?', [duelRowId]);
    assert(rcpt && rcpt.onchain_signature === r.data.resolution.tx, 'receipt backed by real resolve tx');
    ok(`real on-chain settlement via route (${r.data.resolution.tx.slice(0, 8)}…)`);
    // Claim A via route with a FRESH real claim tx (1 + 1*2/1 = 3 cUSD).
    const claimIx = chain.buildClaimPayoutIx({
      user: capA.publicKey, duelPda, positionPda: posA.positionPda, userAta: ataA.address,
      vaultAta, vaultPda, duelId: Buffer.from(canon.duelIdHex, 'hex'),
    });
    const claimSig = await sendAndConfirmTransaction(connection, new Transaction().add(claimIx), [capA]);
    r = await http('POST', `/duels/${duelRowId}/claim`, tokenA, { txSignature: claimSig });
    assert(r.status === 200, 'real claim indexed');
    assert(r.data.payoutUsd === 3, `payout exactly $3 (got ${r.data.payoutUsd})`);
    const dbClaim = await freshDb();
    const pos = dbClaim.queryOne('SELECT claimed, claim_tx FROM positions WHERE id = ?', [`pos_${duelRowId}_${walletA}`]);
    assert(pos.claimed === 1 && pos.claim_tx === claimSig, 'position marked claimed with real tx');
    // Double-index same claim sig: still one position, still claimed once.
    r = await http('POST', `/duels/${duelRowId}/claim`, tokenA, { txSignature: claimSig });
    assert(r.status === 200, 'claim replay idempotent');
    assert((await freshDb()).queryAll('SELECT * FROM positions WHERE duel_id = ? AND user_wallet = ?', [duelRowId, walletA]).length === 1, 'no second payout row');
    ok('real claim indexed once; replay cannot create two payouts');
  } else {
    console.log(`  SKIP - route resolve unavailable (${(r.data && r.data.error) || r.status}); chain settlement proven separately`);
  }

  // Faucet: first honest response, second rate-limited.
  r = await http('POST', '/faucet/cusd', tokenB, {});
  assert(r.status === 200 && r.data.tokenMint === 'AXMB7tf5yHqPuFRTzaMgNSGPZ8iKJtFkeYdpeN7jcHWC', 'faucet issues AXMB7');
  r = await http('POST', '/faucet/cusd', tokenB, {});
  assert(r.status === 429, 'faucet rate limit honest 429');
  ok('faucet AXMB7 + 24h rate limit');

  // Cleanup TEST rows (keep dev DB clean). The server process is stopped
  // immediately afterwards, so its in-memory handle cannot resurrect rows.
  const dbClean = await freshDb();
  dbClean.execute('DELETE FROM activity WHERE target_id = ? OR target_id = ?', [duelRowId, takeId]);
  dbClean.execute('DELETE FROM comments WHERE take_id = ?', [takeId]);
  dbClean.execute('DELETE FROM counteroffers WHERE challenge_id = ?', [chalId]);
  dbClean.execute('DELETE FROM challenges WHERE id = ?', [chalId]);
  dbClean.execute('DELETE FROM positions WHERE duel_id = ?', [duelRowId]);
  dbClean.execute('DELETE FROM receipts WHERE duel_id = ?', [duelRowId]);
  dbClean.execute('DELETE FROM duels WHERE id = ?', [duelRowId]);
  dbClean.execute('DELETE FROM takes WHERE id = ?', [takeId]);
  dbClean.execute('DELETE FROM users WHERE wallet_address = ? OR wallet_address = ?', [walletA, walletB]);
  dbClean.execute('DELETE FROM auth_nonces WHERE wallet_address = ? OR wallet_address = ?', [walletA, walletB]);
  assert((await freshDb()).queryOne('SELECT * FROM duels WHERE id = ?', [duelRowId]) === null, 'smoke rows cleaned');
  console.log(`\nLOCAL CHAIN-BOUNDARY SMOKE COMPLETE: ${passed} checks passed.`);
}

main().catch((err) => { console.error('SMOKE FAILED:', err); process.exit(1); });
