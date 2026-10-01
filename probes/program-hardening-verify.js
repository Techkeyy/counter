/**
 * Program-hardening re-proof (post-upgrade, Devnet, real txs).
 * H1: early resolve -> 110; resolve at time ok; re-resolve/cancel -> 109.
 * H2: cutoff enforced (101); cancel after time; cancel -> A/B resolve -> 109;
 *     exact principal claims; duplicate refund -> 106.
 * H3: backend-mediated mutual match through the NEW bytecode (integration).
 * Previous program proof is superseded by this run.
 */
const {
  Connection, Keypair, PublicKey, SystemProgram, Transaction,
  TransactionInstruction, sendAndConfirmTransaction,
} = require('@solana/web3.js');
const {
  getOrCreateAssociatedTokenAccount, mintTo,
  createAssociatedTokenAccountInstruction,
} = require('@solana/spl-token');
const naclMod = require('../server/node_modules/tweetnacl');
const nacl = naclMod.default || naclMod;
const bs58Mod = require('../server/node_modules/bs58');
const bs58 = bs58Mod.default || bs58Mod;
const fs = require('fs');
const crypto = require('crypto');
const chain = require('../server/chain');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function assert(c, m) {
  if (!c) throw new Error(`[ASSERTION FAILED] ${m}`);
  console.log(`  ok - ${m}`);
}
async function expectProgramError(promise, codeHex, label) {
  try {
    await promise;
  } catch (err) {
    const msg = String((err && err.message) || err);
    assert(
      msg.includes(codeHex),
      `${label} rejected with ${codeHex} (got: ${msg.slice(0, 100)})`
    );
    return;
  }
  throw new Error(`[ASSERTION FAILED] ${label} unexpectedly succeeded`);
}

async function main() {
  console.log('Program hardening re-proof (post-upgrade)\n');
  const connection = new Connection(chain.DEVNET_RPC, 'confirmed');
  const payer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync('C:/Users/HomePC/.config/solana/compart-devnet-upgrade.json', 'utf8')))
  );
  const B = Keypair.generate();
  const P = (s) => new PublicKey(typeof s === 'string' ? s : s.toBase58());

  async function send(ixs, signers, feePayer) {
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    const tx = new Transaction({ feePayer: feePayer || payer.publicKey, recentBlockhash: blockhash });
    tx.add(...ixs);
    return sendAndConfirmTransaction(connection, tx, signers);
  }
  async function resolveIx(duelPda, side) {
    const buf = Buffer.alloc(2);
    buf.writeUInt8(2, 0);
    buf.writeUInt8(side, 1);
    return new TransactionInstruction({
      programId: new PublicKey('52QgqEmxZzh2EH1gAwheMmp2ZXd9eT3WuXefSLYu6NmT'),
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: false },
        { pubkey: duelPda, isSigner: false, isWritable: true },
      ],
      data: buf,
    });
  }
  async function onchainStatus(duelPda) {
    return (await chain.fetchDuelOnChain(duelPda.toBase58())).status;
  }
  async function fundAndInit(tag, cutoffOffSec, resolutionOffSec) {
    await send([SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: B.publicKey, lamports: 30000000 })], [payer]);
    const ataA = await getOrCreateAssociatedTokenAccount(connection, payer, chain.CUSD_MINT, payer.publicKey);
    const ataB = await getOrCreateAssociatedTokenAccount(connection, payer, chain.CUSD_MINT, B.publicKey);
    await mintTo(connection, payer, chain.CUSD_MINT, ataA.address, payer, 10 * 10 ** 6);
    await mintTo(connection, payer, chain.CUSD_MINT, ataB.address, payer, 10 * 10 ** 6);
    const nowSec = Math.floor(Date.now() / 1000);
    const duelIdHex = crypto.randomBytes(16).toString('hex');
    const canon = chain.deriveChainAccounts(duelIdHex);
    const duelPda = P(canon.duelPda);
    const ixs = [];
    if (!(await connection.getAccountInfo(P(canon.vaultAta)))) {
      ixs.push(createAssociatedTokenAccountInstruction(payer.publicKey, P(canon.vaultAta), P(canon.vaultPda), chain.CUSD_MINT));
    }
    ixs.push(chain.buildInitializeDuelIx({
      payer: payer.publicKey, duelPda, resolver: payer.publicKey, mint: chain.CUSD_MINT,
      duelId: Buffer.from(duelIdHex, 'hex'), cutoffTs: nowSec + cutoffOffSec, resolutionTs: nowSec + resolutionOffSec,
      termsHash: crypto.randomBytes(32), captainA: payer.publicKey, captainB: B.publicKey,
      duelBump: canon.duelBump, vaultBump: canon.vaultBump,
    }));
    await send(ixs, [payer]);
    console.log(`  ok - ${tag} initialized (${duelPda.toBase58().slice(0, 8)})`);
    return { duelIdHex, duelPda, vaultAta: P(canon.vaultAta), ataA, ataB };
  }
  async function stake(userKp, userAta, duelPda, vaultAta, side, usd) {
    const { positionPda, positionBump } = chain.derivePositionPda(duelPda, userKp.publicKey.toBase58());
    return send([chain.buildDepositStakeIx({
      user: userKp.publicKey, duelPda, positionPda,
      userAta: P(userAta), vaultAta,
      side, amountBase: chain.usdToBaseUnits(usd), positionBump,
    })], [userKp], userKp.publicKey);
  }
  async function claim(userKp, userAta, duelPda, vaultAta, duelIdHex) {
    const { positionPda } = chain.derivePositionPda(duelPda, userKp.publicKey.toBase58());
    const { vaultPda } = chain.deriveVaultPda(duelPda);
    const P2 = (s) => new PublicKey(s);
    return send([chain.buildClaimPayoutIx({
      user: userKp.publicKey, duelPda, positionPda,
      userAta: P2(userAta), vaultAta, vaultPda,
      duelId: Buffer.from(duelIdHex, 'hex'),
    })], [userKp], userKp.publicKey);
  }

  // ---- H1: timing gate, normal settle, terminal lock ----
  console.log('\n[H1] timing gate, normal settle, terminal lock');
  const h1 = await fundAndInit('H1', 900, 25);
  await stake(payer, h1.ataA.address.toBase58(), h1.duelPda, h1.vaultAta, 1, 2);
  await stake(B, h1.ataB.address.toBase58(), h1.duelPda, h1.vaultAta, 2, 1);
  await expectProgramError(send([await resolveIx(h1.duelPda, 1)], [payer]), '0x6e', 'pre-resolution resolve rejected (110 TooEarly)');
  assert((await onchainStatus(h1.duelPda)) === 0, 'state unchanged while early (AcceptingStakes)');
  console.log('  .. waiting past resolution time');
  await sleep(30000);
  await send([await resolveIx(h1.duelPda, 1)], [payer]);
  assert((await onchainStatus(h1.duelPda)) === 2, 'resolved Side A at/after time');
  await expectProgramError(send([await resolveIx(h1.duelPda, 2)], [payer]), '0x6d', 'resolved A -> resolve B rejected (109)');
  await expectProgramError(send([await resolveIx(h1.duelPda, 1)], [payer]), '0x6d', 'resolved A -> resolve A rejected (109)');
  await expectProgramError(send([await resolveIx(h1.duelPda, 3)], [payer]), '0x6d', 'resolved A -> cancel rejected (109)');

  // ---- H2: cutoff + cancel + principal claims ----
  console.log('\n[H2] backing cutoff, cancel lifecycle, principal claims');
  const h2 = await fundAndInit('H2', 14, 70);
  await stake(payer, h2.ataA.address.toBase58(), h2.duelPda, h2.vaultAta, 1, 1);
  console.log('  .. waiting past backing cutoff');
  await sleep(18000);
  await expectProgramError(
    stake(B, h2.ataB.address.toBase58(), h2.duelPda, h2.vaultAta, 2, 1),
    '0x65', 'post-cutoff deposit rejected (101 StakingClosed)'
  );
  console.log('  .. waiting past resolution time');
  await sleep(55000);
  await send([await resolveIx(h2.duelPda, 3)], [payer]);
  assert((await onchainStatus(h2.duelPda)) === 4, 'cancelled after valid time');
  await expectProgramError(send([await resolveIx(h2.duelPda, 1)], [payer]), '0x6d', 'cancelled -> resolve A rejected (109)');
  await expectProgramError(send([await resolveIx(h2.duelPda, 2)], [payer]), '0x6d', 'cancelled -> resolve B rejected (109)');
  // exact principal claims + duplicate rejection
  const balBefore = Number((await connection.getTokenAccountBalance(h2.ataA.address)).value.amount);
  await claim(payer, h2.ataA.address.toBase58(), h2.duelPda, h2.vaultAta, h2.duelIdHex);
  const balAfter = Number((await connection.getTokenAccountBalance(h2.ataA.address)).value.amount);
  assert(balAfter - balBefore === 1000000, `exact $1 principal refund (got ${balAfter - balBefore})`);
  await expectProgramError(
    claim(payer, h2.ataA.address.toBase58(), h2.duelPda, h2.vaultAta, h2.duelIdHex),
    '0x6a', 'duplicate refund rejected (106 AlreadyClaimed)'
  );

  // ---- H3: backend-mediated mutual match through NEW bytecode ----
  console.log('\n[H3] backend mutual match integration');
  const PORT = 18097;
  process.env.PORT = String(PORT);
  const BASE = `http://127.0.0.1:${PORT}`;
  require('../server/index.js');
  await sleep(2500);
  const api = async (method, path, token, body) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    let data = null;
    try { data = await res.json(); } catch {}
    return { status: res.status, data };
  };
  async function siws(kp) {
    const wallet = kp.publicKey.toBase58();
    const n = await (await fetch(`${BASE}/api/auth/nonce?wallet=${wallet}`)).json();
    const sig = bs58.encode(Buffer.from(nacl.sign.detached(Buffer.from(`Sign-in to Counter with nonce: ${n.nonce}`, 'utf8'), kp.secretKey)));
    const v = await (await fetch(`${BASE}/api/auth/verify`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet, signature: sig, nonce: n.nonce }),
    })).json();
    return { wallet, token: v.token };
  }
  const A = await siws(payer);
  const BU = await siws(B);
  const nowSec = Math.floor(Date.now() / 1000);
  const pr = await api('POST', '/api/challenges', A.token, {
    takeId: 'take_probe', targetWallet: BU.wallet,
    propositionA: 'X up', propositionB: 'X down', category: 'CRYPTO',
    sourceType: 'coingecko', sourceConfig: { assetId: 'solana', targetPriceUsd: 1, operator: '>=' },
    stakeAmountUsd: 2, cutoffTs: nowSec + 900, resolutionTs: nowSec - 30,
    resolutionMode: 'MUTUAL', fallbackMode: 'REFUND', mutualDeadlineTs: nowSec + 3600,
  });
  assert(pr.status === 201, 'mutual challenge proposes');
  const acc = await api('POST', `/api/challenges/${pr.data.challenge.id}/accept`, BU.token, {});
  assert(acc.status === 200, 'accept forms duel');
  const duel = acc.data.duel;
  const duelsTracked = [{ duelId: duel.id, challengeId: pr.data.challenge.id }];
  const vote = async (tok, kp, side) => {
    const msg = `COUNTER_SETTLEMENT_V1|duel_id=${duel.id}|winner_side=${side}|mode=MUTUAL|at=${duel.resolution_ts}`;
    const signature = bs58.encode(Buffer.from(nacl.sign.detached(Buffer.from(msg, 'utf8'), kp.secretKey)));
    return api('POST', `/api/duels/${duel.id}/mutual-vote`, tok, { winnerSide: side, signature });
  };
  // fund + init + stakes through backend routes with real txs
  const ca = await api('GET', `/api/duels/${duel.id}/chain-accounts?wallet=${A.wallet}`, A.token);
  const acct = ca.data;
  const P2 = (s) => new PublicKey(s);
  {
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    const tx = new Transaction({ feePayer: payer.publicKey, recentBlockhash: blockhash });
    if (!(await connection.getAccountInfo(P2(acct.vaultAta)))) {
      tx.add(createAssociatedTokenAccountInstruction(payer.publicKey, P2(acct.vaultAta), P2(acct.vaultPda), chain.CUSD_MINT));
    }
    tx.add(chain.buildInitializeDuelIx({
      payer: payer.publicKey, duelPda: P2(acct.duelPda), resolver: P2(acct.resolver), mint: P2(acct.mint),
      duelId: Buffer.from(acct.duelIdHex, 'hex'), cutoffTs: acct.cutoffTs, resolutionTs: acct.resolutionTs,
      termsHash: Buffer.from(acct.termsHash, 'hex'), captainA: P2(acct.captainA), captainB: P2(acct.captainB),
      duelBump: acct.duelBump, vaultBump: acct.vaultBump,
    }));
    tx.sign(payer);
    const sig = await connection.sendRawTransaction(tx.serialize());
    await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
    const init = await api('POST', `/api/duels/${duel.id}/init-onchain`, A.token, { txSignature: sig });
    assert(init.status === 200, 'backend init verified on new bytecode');
  }
  async function backendStake(kp, tok, side, usd) {
    const c2 = await api('GET', `/api/duels/${duel.id}/chain-accounts?wallet=${kp.publicKey.toBase58()}`, tok);
    const a2 = c2.data;
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    const tx = new Transaction({ feePayer: kp.publicKey, recentBlockhash: blockhash });
    tx.add(chain.buildDepositStakeIx({
      user: kp.publicKey, duelPda: P2(a2.duelPda), positionPda: P2(a2.positionPda),
      userAta: P2(a2.userAta), vaultAta: P2(a2.vaultAta),
      side, amountBase: chain.usdToBaseUnits(usd), positionBump: a2.positionBump,
    }));
    tx.sign(kp);
    const sig = await connection.sendRawTransaction(tx.serialize());
    await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
    const st = await api('POST', `/api/duels/${duel.id}/stake`, tok, { side, amount: usd, txSignature: sig });
    assert(st.status === 200, `backend stake $${usd} verified`);
  }
  await backendStake(payer, A.token, 1, 2);
  await backendStake(B, BU.token, 2, 1);
  let v = await vote(A.token, payer, 1);
  assert(v.status === 200 && v.data.match.matched === false, 'single vote unmatched');
  v = await vote(BU.token, B, 1);
  assert(v.status === 200 && v.data.match.matched === true, 'matched pair');
  const res = await api('POST', `/api/duels/${duel.id}/resolve`, A.token, {});
  assert(res.status === 200 && res.data.resolution.status === 'RESOLVED_SIDE_A', 'backend settles matched pair on new bytecode');
  const dAfter = await api('GET', `/api/duels/${duel.id}`);
  assert(dAfter.data.receipt && dAfter.data.receipt.id === `receipt_${duel.id}`, 'receipt cites real settlement');
  const rr = await api('POST', `/api/duels/${duel.id}/resolve`, A.token, {});
  assert(rr.status === 400, 'backend refuses re-resolution (defense in depth)');

  console.log('\nProgram hardening re-proof passed.');
  const { execute } = require('../server/db');
  for (const t of duelsTracked) {
    for (const sql of [
      `DELETE FROM mutual_votes WHERE duel_id = '${t.duelId}'`,
      `DELETE FROM receipts WHERE duel_id = '${t.duelId}'`,
      `DELETE FROM positions WHERE duel_id = '${t.duelId}'`,
      `DELETE FROM duels WHERE id = '${t.duelId}'`,
      `DELETE FROM counteroffers WHERE challenge_id = '${t.challengeId}'`,
      `DELETE FROM challenges WHERE id = '${t.challengeId}'`,
      `DELETE FROM activity WHERE target_id IN ('${t.duelId}','${t.challengeId}')`,
    ]) { try { execute(sql, []); } catch {} }
  }
  for (const w of [B.publicKey.toBase58()]) {
    try { execute(`DELETE FROM users WHERE wallet_address = '${w}'`, []); } catch {}
  }
  try { const { saveDb } = require('../server/db'); saveDb(); } catch {}
  console.log('probe fixtures cleaned (authority wallet row preserved)');
  process.exit(0);
}

main().catch((e) => {
  console.log('PROBE_FAILED: ' + (e.message || e));
  process.exit(1);
});
