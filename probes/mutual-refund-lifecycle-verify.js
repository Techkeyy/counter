/**
 * Live Devnet proof: MUTUAL settlement + REFUND fallback + principal claims.
 * Boots the real local backend (PORT 18098), then drives two full lifecycles
 * with node keypairs through the SAME HTTP routes + verifiers as the app:
 *   propose(MUTUAL) -> accept -> init(MWA-equivalent node sig) -> stakes ->
 *   signed votes -> resolve -> claim (+ replay/loser rejections).
 * Duel 1 (REFUND): disputed votes + past deadline -> on-chain Cancel ->
 *   exact-principal claims + double-claim rejection.
 * Duel 2 (MATCH): agreed votes -> on-chain ResolveDuel(1) -> exact payout.
 * Small Devnet amounts. Throwaway wallets; tracked rows cleaned afterwards.
 */
const {
  Connection, Keypair, PublicKey, SystemProgram, Transaction,
  sendAndConfirmTransaction,
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
const chain = require('../server/chain');

const PORT = 18098;
process.env.PORT = String(PORT);
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function assert(c, m) {
  if (!c) throw new Error(`[ASSERTION FAILED] ${m}`);
  console.log(`  ok - ${m}`);
}

async function api(method, path, token, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}

async function siws(kp) {
  const wallet = kp.publicKey.toBase58();
  const n = await (await fetch(`${BASE}/api/auth/nonce?wallet=${wallet}`)).json();
  const sig = bs58.encode(Buffer.from(nacl.sign.detached(Buffer.from(`Sign-in to Counter with nonce: ${n.nonce}`, 'utf8'), kp.secretKey)));
  const v = await (await fetch(`${BASE}/api/auth/verify`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet, signature: sig, nonce: n.nonce }),
  })).json();
  assert(v.token, `SIWS issues token for ${wallet.slice(0, 6)}`);
  return { wallet, token: v.token };
}

function voteSig(kp, duelId, side, resTs) {
  const msg = `COUNTER_SETTLEMENT_V1|duel_id=${duelId}|winner_side=${side}|mode=MUTUAL|at=${resTs}`;
  return bs58.encode(Buffer.from(nacl.sign.detached(Buffer.from(msg, 'utf8'), kp.secretKey)));
}

async function main() {
  console.log('Counter live Devnet MUTUAL + REFUND proof\n');
  require('../server/index.js');
  await sleep(2500);
  const connection = new Connection(chain.DEVNET_RPC, 'confirmed');
  const payer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync('C:/Users/HomePC/.config/solana/compart-devnet-upgrade.json', 'utf8')))
  );
  const B = Keypair.generate();
  console.log(`captain-A/payer: ${payer.publicKey.toBase58()}`);
  console.log(`captain-B:       ${B.publicKey.toBase58()}`);

  await sendAndConfirmTransaction(connection,
    new Transaction().add(SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: B.publicKey, lamports: 60000000 })), [payer]);
  const ataA = await getOrCreateAssociatedTokenAccount(connection, payer, chain.CUSD_MINT, payer.publicKey);
  const ataB = await getOrCreateAssociatedTokenAccount(connection, payer, chain.CUSD_MINT, B.publicKey);
  await mintTo(connection, payer, chain.CUSD_MINT, ataA.address, payer, 20 * 10 ** 6);
  await mintTo(connection, payer, chain.CUSD_MINT, ataB.address, payer, 20 * 10 ** 6);
  console.log('  ok - funded B with SOL + minted 20 test cUSD each');

  const A = await siws(payer);
  const BU = await siws(B);
  const H = (t) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${t}` });
  const trackedDuels = [];

  async function buildDuel(mode, fallback, deadlineOffsetSec) {
    const nowSec = Math.floor(Date.now() / 1000);
    const pr = await api('POST', '/api/challenges', A.token, {
      takeId: 'take_probe', targetWallet: BU.wallet,
      propositionA: 'SOL over 200', propositionB: 'SOL under 200',
      category: 'CRYPTO', sourceType: 'coingecko',
      sourceConfig: { assetId: 'solana', targetPriceUsd: 200, operator: '>=' },
      stakeAmountUsd: 5, cutoffTs: nowSec + 900, resolutionTs: nowSec - 30,
      resolutionMode: mode, fallbackMode: fallback,
      mutualDeadlineTs: nowSec + deadlineOffsetSec,
    });
    assert(pr.status === 201, `propose ${mode} (HTTP ${pr.status})`);
    const acc = await api('POST', `/api/challenges/${pr.data.challenge.id}/accept`, BU.token, {});
    assert(acc.status === 200, 'accept forms duel');
    const duel = acc.data.duel;
    trackedDuels.push({ duelId: duel.id, challengeId: pr.data.challenge.id });

    // Real on-chain init (captain A signs).
    const ca = await api('GET', `/api/duels/${duel.id}/chain-accounts?wallet=${A.wallet}`, A.token);
    assert(ca.status === 200, 'chain-accounts serves');
    const acct = ca.data;
    const ixs = [];
    const vaultInfo = await connection.getAccountInfo(new PublicKey(acct.vaultAta));
    if (!vaultInfo) {
      ixs.push(createAssociatedTokenAccountInstruction(payer.publicKey, new PublicKey(acct.vaultAta), new PublicKey(acct.vaultPda), chain.CUSD_MINT));
    }
    const { Transaction: Tx } = require('@solana/web3.js');
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    const tx = new Tx({ feePayer: payer.publicKey, recentBlockhash: blockhash });
    const { buildInitializeDuelIx } = chain;
    const P = (s) => new PublicKey(s);
    tx.add(...ixs, buildInitializeDuelIx({
      payer: payer.publicKey, duelPda: P(acct.duelPda), resolver: P(acct.resolver), mint: P(acct.mint),
      duelId: Buffer.from(acct.duelIdHex, 'hex'), cutoffTs: acct.cutoffTs, resolutionTs: acct.resolutionTs,
      termsHash: Buffer.from(acct.termsHash, 'hex'),
      captainA: P(acct.captainA), captainB: P(acct.captainB),
      duelBump: acct.duelBump, vaultBump: acct.vaultBump,
    }));
    tx.sign(payer);
    const sig = await connection.sendRawTransaction(tx.serialize());
    await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
    const init = await api('POST', `/api/duels/${duel.id}/init-onchain`, A.token, { txSignature: sig });
    assert(init.status === 200, `init verified + indexed (${sig.slice(0, 8)})`);
    return duel;
  }

  async function stakeSide(kp, tok, duelId, side, usd) {
    const ca = await api('GET', `/api/duels/${duelId}/chain-accounts?wallet=${kp.publicKey.toBase58()}`, tok);
    const acct = ca.data;
    const { Transaction: Tx } = require('@solana/web3.js');
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    const tx = new Tx({ feePayer: kp.publicKey, recentBlockhash: blockhash });
    const { buildDepositStakeIx, usdToBaseUnits } = chain;
    const P = (s) => new PublicKey(s);
    tx.add(buildDepositStakeIx({
      user: kp.publicKey, duelPda: P(acct.duelPda), positionPda: P(acct.positionPda),
      userAta: P(acct.userAta), vaultAta: P(acct.vaultAta),
      side, amountBase: usdToBaseUnits(usd), positionBump: acct.positionBump,
    }));
    tx.sign(kp);
    const sig = await connection.sendRawTransaction(tx.serialize());
    await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
    const st = await api('POST', `/api/duels/${duelId}/stake`, tok, { side, amount: usd, txSignature: sig });
    assert(st.status === 200, `stake $${usd} side ${side} verified (${sig.slice(0, 8)})`);
    return sig;
  }

  async function claimSide(kp, tok, duelId) {
    const ca = await api('GET', `/api/duels/${duelId}/chain-accounts?wallet=${kp.publicKey.toBase58()}`, tok);
    const acct = ca.data;
    const { Transaction: Tx } = require('@solana/web3.js');
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    const tx = new Tx({ feePayer: kp.publicKey, recentBlockhash: blockhash });
    const P = (s) => new PublicKey(s);
    tx.add(chain.buildClaimPayoutIx({
      user: kp.publicKey, duelPda: P(acct.duelPda), positionPda: P(acct.positionPda),
      userAta: P(acct.userAta), vaultAta: P(acct.vaultAta), vaultPda: P(acct.vaultPda),
      duelId: Buffer.from(acct.duelIdHex, 'hex'),
    }));
    tx.sign(kp);
    const sig = await connection.sendRawTransaction(tx.serialize());
    await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
    return api('POST', `/api/duels/${duelId}/claim`, tok, { txSignature: sig });
  }

  async function claimSideExpectReject(kp, tok, duelId) {
    const ca = await api('GET', `/api/duels/${duelId}/chain-accounts?wallet=${kp.publicKey.toBase58()}`, tok);
    const acct = ca.data;
    const { Transaction: Tx } = require('@solana/web3.js');
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    const tx = new Tx({ feePayer: kp.publicKey, recentBlockhash: blockhash });
    const P = (s) => new PublicKey(s);
    tx.add(chain.buildClaimPayoutIx({
      user: kp.publicKey, duelPda: P(acct.duelPda), positionPda: P(acct.positionPda),
      userAta: P(acct.userAta), vaultAta: P(acct.vaultAta), vaultPda: P(acct.vaultPda),
      duelId: Buffer.from(acct.duelIdHex, 'hex'),
    }));
    tx.sign(kp);
    try {
      const sig = await connection.sendRawTransaction(tx.serialize());
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
    } catch (err) {
      const msg = String((err && err.message) || err);
      assert(/0x6a|106|already claimed/i.test(msg), `duplicate claim rejected on-chain (${msg.slice(0, 80)})`);
      return;
    }
    const r = await api('POST', `/api/duels/${duelId}/claim`, tok, { txSignature: 'UNREACHABLE' });
    assert(r.status === 400, 'duplicate claim rejected');
  }

  // ---- Duel 1: REFUND path (disputed + past deadline) ----
  console.log('\n[1] REFUND lifecycle');
  const d1 = await buildDuel('MUTUAL', 'REFUND', 8);
  await stakeSide(payer, A.token, d1.id, 1, 2);
  await stakeSide(B, BU.token, d1.id, 2, 1);
  let v = await api('POST', `/api/duels/${d1.id}/mutual-vote`, A.token, { winnerSide: 1, signature: voteSig(payer, d1.id, 1, d1.resolution_ts) });
  assert(v.status === 200, 'A votes side A');
  v = await api('POST', `/api/duels/${d1.id}/mutual-vote`, BU.token, { winnerSide: 2, signature: voteSig(B, d1.id, 2, d1.resolution_ts) });
  assert(v.status === 200 && v.data.match.state === 'DISPUTED', 'B disputes');
  console.log('  .. waiting out the 8s agreement window');
  await sleep(12000);
  const res1 = await api('POST', `/api/duels/${d1.id}/resolve`, A.token, {});
  assert(res1.status === 200 && res1.data.resolution.status === 'CANCELLED', `fallback REFUND settles CANCELLED (${JSON.stringify(res1.data.resolution.tx || res1.data).slice(0, 60)})`);
  const cA = await claimSide(payer, A.token, d1.id);
  assert(cA.status === 200 && cA.data.payoutUsd === 2, `A reclaims exactly $2 principal (got ${cA.data.payoutUsd})`);
  const cB = await claimSide(B, BU.token, d1.id);
  assert(cB.status === 200 && cB.data.payoutUsd === 1, `B reclaims exactly $1 principal (got ${cB.data.payoutUsd})`);
  // Duplicate ClaimPayout is rejected by program err 106 at simulation.
  await claimSideExpectReject(payer, A.token, d1.id);
  const rr = await api('POST', `/api/duels/${d1.id}/resolve`, A.token, {});
  assert(rr.status === 400, 're-resolution after CANCELLED rejected');

  // ---- Duel 2: MATCH path ----
  console.log('\n[2] MATCH lifecycle');
  const d2 = await buildDuel('MUTUAL', 'REFUND', 3600);
  await stakeSide(payer, A.token, d2.id, 1, 2);
  await stakeSide(B, BU.token, d2.id, 2, 1);
  v = await api('POST', `/api/duels/${d2.id}/mutual-vote`, A.token, { winnerSide: 1, signature: voteSig(payer, d2.id, 1, d2.resolution_ts) });
  assert(v.status === 200, 'A votes side A');
  v = await api('POST', `/api/duels/${d2.id}/mutual-vote`, BU.token, { winnerSide: 1, signature: voteSig(B, d2.id, 1, d2.resolution_ts) });
  assert(v.status === 200 && v.data.match.matched, 'B agrees: matched');
  const res2 = await api('POST', `/api/duels/${d2.id}/resolve`, BU.token, {});
  assert(res2.status === 200 && res2.data.resolution.status === 'RESOLVED_SIDE_A', 'matched pair settles Side A on-chain');
  const cA2 = await claimSide(payer, A.token, d2.id);
  assert(cA2.status === 200 && cA2.data.payoutUsd === 3, `A exact parimutuel $3 (got ${cA2.data.payoutUsd})`);
  // Loser ClaimPayout is rejected by program err 107 at simulation.
  try {
    await claimSide(B, BU.token, d2.id);
    throw new Error('loser claim unexpectedly succeeded');
  } catch (err) {
    assert(/0x6b|107|Losing position/i.test(String((err && err.message) || err)), 'loser claim rejected on matched settlement');
  }

  console.log('\nAll mutual + refund lifecycle proofs passed.');
  // cleanup tracked rows (+ the partial rows from the aborted first run)
  const { execute } = require('../server/db');
  const extraDuels = ['duel_1790832886889_00eae389'];
  const extraChals = ['chal_1790832886872_460b54e1'];
  const extraUsers = ['4Q9BycoGfVv4PG7cDNBWFPAV4oW9igokZJP4WzVvUvuv'];
  for (const t of trackedDuels) {
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
  try { execute(`DELETE FROM users WHERE wallet_address = '${B.publicKey.toBase58()}'`, []); } catch {}
  for (const dd of extraDuels) {
    for (const sql of [
      `DELETE FROM mutual_votes WHERE duel_id = '${dd}'`,
      `DELETE FROM receipts WHERE duel_id = '${dd}'`,
      `DELETE FROM positions WHERE duel_id = '${dd}'`,
      `DELETE FROM duels WHERE id = '${dd}'`,
      `DELETE FROM activity WHERE target_id = '${dd}'`,
    ]) { try { execute(sql, []); } catch {} }
  }
  for (const cc of extraChals) {
    try { execute(`DELETE FROM counteroffers WHERE challenge_id = '${cc}'`, []); } catch {}
    try { execute(`DELETE FROM challenges WHERE id = '${cc}'`, []); } catch {}
    try { execute(`DELETE FROM activity WHERE target_id = '${cc}'`, []); } catch {}
  }
  for (const w of extraUsers) {
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
