/**
 * Live Devnet lifecycle proof for the canonical product path (server/chain.js).
 *
 * Executes a REAL full lifecycle on Devnet with small amounts, then verifies
 * every step through the SAME backend verifiers the product path uses:
 *   InitializeDuel -> DepositStake x2 -> ResolveDuel -> ClaimPayout
 *   + negative tests (wrong amount, tampered signature must be rejected)
 *
 * Run: node probes/chain-lifecycle-verify.js
 * Uses the local devnet keypair as payer/captain-A/resolver (as the proven
 * harness does). Creates throwaway captain-B. No program changes, no VPS touch.
 */
const {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} = require('@solana/web3.js');
const {
  getOrCreateAssociatedTokenAccount,
  mintTo,
} = require('@solana/spl-token');
const fs = require('fs');
const crypto = require('crypto');
const chain = require('../server/chain');

function assert(cond, msg) {
  if (!cond) throw new Error(`[ASSERTION FAILED] ${msg}`);
  console.log(`  ok - ${msg}`);
}

async function main() {
  console.log('Counter live Devnet lifecycle proof (server/chain.js)\n');
  const connection = new Connection(chain.DEVNET_RPC, 'confirmed');
  const payer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync('C:/Users/HomePC/.config/solana/compart-devnet-upgrade.json', 'utf-8')))
  );
  const captainB = Keypair.generate();
  console.log(`payer/captain-A/resolver: ${payer.publicKey.toBase58()}`);
  console.log(`captain-B (throwaway):   ${captainB.publicKey.toBase58()}`);

  // Fund B with SOL + cUSD (payer is mint authority for AXMB7).
  await sendAndConfirmTransaction(
    connection,
    new Transaction().add(
      SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: captainB.publicKey, lamports: 30000000 })
    ),
    [payer]
  );
  const ataA = await getOrCreateAssociatedTokenAccount(connection, payer, chain.CUSD_MINT, payer.publicKey);
  const ataB = await getOrCreateAssociatedTokenAccount(connection, payer, chain.CUSD_MINT, captainB.publicKey);
  await mintTo(connection, payer, chain.CUSD_MINT, ataA.address, payer, 5 * 10 ** 6);
  await mintTo(connection, payer, chain.CUSD_MINT, ataB.address, payer, 5 * 10 ** 6);
  console.log('  ok - funded throwaway captain-B + minted test cUSD');

  // Canonical duel id + terms.
  const duelIdHex = crypto.randomBytes(16).toString('hex');
  const termsHashHex = crypto.createHash('sha256').update('chain-lifecycle-verify').digest('hex');
  const cutoffTs = Math.floor(Date.now() / 1000) + 3600;
  const resolutionTs = cutoffTs + 3600;
  const canon = chain.deriveChainAccounts(duelIdHex);
  console.log(`  duel PDA: ${canon.duelPda}`);

  // Vault ATA (payer funds creation, as the mobile client does).
  const vaultAtaInfo = await connection.getAccountInfo(new PublicKey(canon.vaultAta));
  const initIxs = [];
  if (!vaultAtaInfo) {
    const { createAssociatedTokenAccountInstruction } = require('@solana/spl-token');
    initIxs.push(
      createAssociatedTokenAccountInstruction(
        payer.publicKey, new PublicKey(canon.vaultAta), new PublicKey(canon.vaultPda), chain.CUSD_MINT
      )
    );
  }
  initIxs.push(
    chain.buildInitializeDuelIx({
      payer: payer.publicKey,
      duelPda: new PublicKey(canon.duelPda),
      resolver: payer.publicKey,
      mint: chain.CUSD_MINT,
      duelId: Buffer.from(duelIdHex, 'hex'),
      cutoffTs, resolutionTs,
      termsHash: Buffer.from(termsHashHex, 'hex'),
      captainA: payer.publicKey,
      captainB: captainB.publicKey,
      duelBump: canon.duelBump,
      vaultBump: canon.vaultBump,
    })
  );
  const initSig = await sendAndConfirmTransaction(connection, new Transaction().add(...initIxs), [payer]);
  console.log(`  init tx: ${initSig}`);

  const verifiedInit = await chain.verifyInitTx({
    signature: initSig,
    duelIdHex,
    captainA: payer.publicKey.toBase58(),
    captainB: captainB.publicKey.toBase58(),
    termsHashHex,
    resolver: payer.publicKey.toBase58(),
  });
  assert(verifiedInit.duelPda === canon.duelPda, 'verifyInitTx: duel PDA matches canonical');
  assert(verifiedInit.vaultAta === canon.vaultAta, 'verifyInitTx: vault ATA matches canonical');
  assert(verifiedInit.mint === chain.CUSD_MINT.toBase58(), 'verifyInitTx: mint is authoritative cUSD');

  // Deposit A: 1 cUSD side 1.
  const posA = chain.derivePositionPda(new PublicKey(canon.duelPda), payer.publicKey.toBase58());
  const depAIx = chain.buildDepositStakeIx({
    user: payer.publicKey,
    duelPda: new PublicKey(canon.duelPda),
    positionPda: posA.positionPda,
    userAta: ataA.address,
    vaultAta: new PublicKey(canon.vaultAta),
    side: 1, amountBase: 1000000, positionBump: posA.positionBump,
  });
  const depASig = await sendAndConfirmTransaction(connection, new Transaction().add(depAIx), [payer]);
  console.log(`  deposit-A tx: ${depASig}`);
  const verifiedA = await chain.verifyStakeTx({
    signature: depASig, duelIdHex, userWallet: payer.publicKey.toBase58(),
    expectedSide: 1, expectedAmountBase: '1000000',
  });
  assert(verifiedA.amountBase === '1000000', 'verifyStakeTx: amount chain-observed = 1 cUSD');
  assert(verifiedA.sideABase === '1000000', 'pool A = 1 cUSD on-chain');

  // Negative: wrong expected amount must be rejected.
  let rejected = false;
  try {
    await chain.verifyStakeTx({
      signature: depASig, duelIdHex, userWallet: payer.publicKey.toBase58(),
      expectedSide: 1, expectedAmountBase: '9999999',
    });
  } catch { rejected = true; }
  assert(rejected, 'verifyStakeTx rejects amount mismatch');

  // Deposit B: 2 cUSD side 2.
  const posB = chain.derivePositionPda(new PublicKey(canon.duelPda), captainB.publicKey.toBase58());
  const depBIx = chain.buildDepositStakeIx({
    user: captainB.publicKey,
    duelPda: new PublicKey(canon.duelPda),
    positionPda: posB.positionPda,
    userAta: ataB.address,
    vaultAta: new PublicKey(canon.vaultAta),
    side: 2, amountBase: 2000000, positionBump: posB.positionBump,
  });
  const depBSig = await sendAndConfirmTransaction(connection, new Transaction().add(depBIx), [captainB]);
  console.log(`  deposit-B tx: ${depBSig}`);
  const verifiedB = await chain.verifyStakeTx({
    signature: depBSig, duelIdHex, userWallet: captainB.publicKey.toBase58(),
    expectedSide: 2, expectedAmountBase: '2000000',
  });
  assert(verifiedB.sideBBase === '2000000', 'pool B = 2 cUSD on-chain');

  // Resolve side A (payer is resolver authority for this duel).
  const { TransactionInstruction } = require('@solana/web3.js');
  const resolveIx = new TransactionInstruction({
    programId: chain.PROGRAM_ID,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: false },
      { pubkey: new PublicKey(canon.duelPda), isSigner: false, isWritable: true },
    ],
    data: chain.serializeResolveDuel({ winningSide: 1 }),
  });
  const resolveSig = await sendAndConfirmTransaction(connection, new Transaction().add(resolveIx), [payer]);
  console.log(`  resolve tx: ${resolveSig}`);
  const verifiedR = await chain.verifyResolveTx({ signature: resolveSig, duelIdHex, expectedWinningSide: 1 });
  assert(verifiedR.winningSide === 1, 'verifyResolveTx: side A wins on-chain');
  assert(verifiedR.onchainStatus === 2, 'duel status = ResolvedSideA');

  // Claim A: 1 + 1*2/1 = 3 cUSD expected.
  const claimIx = chain.buildClaimPayoutIx({
    user: payer.publicKey,
    duelPda: new PublicKey(canon.duelPda),
    positionPda: posA.positionPda,
    userAta: ataA.address,
    vaultAta: new PublicKey(canon.vaultAta),
    vaultPda: new PublicKey(canon.vaultPda),
    duelId: Buffer.from(duelIdHex, 'hex'),
  });
  const claimSig = await sendAndConfirmTransaction(connection, new Transaction().add(claimIx), [payer]);
  console.log(`  claim tx: ${claimSig}`);
  const verifiedC = await chain.verifyClaimTx({
    signature: claimSig, duelIdHex, userWallet: payer.publicKey.toBase58(),
  });
  assert(verifiedC.payoutBase === '3000000', `verifyClaimTx: payout = 3 cUSD (got ${verifiedC.payoutBase})`);

  // Negative: fabricated signature must be rejected.
  let rejected2 = false;
  try {
    await chain.verifyClaimTx({
      signature: '1111111111111111111111111111111111111111111111111111111111111111',
      duelIdHex, userWallet: payer.publicKey.toBase58(),
    });
  } catch { rejected2 = true; }
  assert(rejected2, 'verifyClaimTx rejects fabricated signature');

  console.log('\nLIVE LIFECYCLE PROOF COMPLETE');
  console.log(JSON.stringify({
    duelIdHex, duelPda: canon.duelPda, vaultAta: canon.vaultAta,
    initSig, depASig, depBSig, resolveSig, claimSig,
  }, null, 2));
}

main().catch((err) => {
  console.error('LIFECYCLE PROOF FAILED:', err);
  process.exit(1);
});
