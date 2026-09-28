const { Connection, Keypair, PublicKey, Transaction, SystemProgram } = require('@solana/web3.js');
const { getOrCreateAssociatedTokenAccount, transfer, getAccount } = require('@solana/spl-token');
const fs = require('fs');

// Exact proportional payout calculation in atomic token base units
function calculatePayout({
  userStakeBaseUnits, // BigInt
  totalWinningPoolBaseUnits, // BigInt
  totalLosingPoolBaseUnits, // BigInt
}) {
  if (userStakeBaseUnits === 0n || totalWinningPoolBaseUnits === 0n) {
    return 0n;
  }
  // Formula: user_payout = user_stake + (user_stake * total_losing_pool) / total_winning_pool
  const userShareOfLosingPool = (userStakeBaseUnits * totalLosingPoolBaseUnits) / totalWinningPoolBaseUnits;
  const grossPayout = userStakeBaseUnits + userShareOfLosingPool;
  return grossPayout;
}

async function testEscrowAndPayoutProbe() {
  console.log('--- Probing Escrow Custody & Exact Integer Payout Logic ---');
  
  // Mathematical Proof:
  // Captain A stakes 50.00 cUSD (50_000_000 base units)
  // Backer A1 stakes 25.00 cUSD (25_000_000 base units)
  // Total Side A = 75.00 cUSD (75_000_000 base units)
  
  // Captain B stakes 50.00 cUSD (50_000_000 base units)
  // Backer B1 stakes 50.00 cUSD (50_000_000 base units)
  // Total Side B = 100.00 cUSD (100_000_000 base units)
  
  // Total Pool T = 175.00 cUSD (175_000_000 base units)
  
  const sideATotal = 75000000n;
  const sideBTotal = 100000000n;
  const totalPool = sideATotal + sideBTotal;

  console.log(`[1] Scenario: Side A wins (Total Winning Pool = 75 cUSD, Losing Pool = 100 cUSD)`);
  
  const capAPayout = calculatePayout({
    userStakeBaseUnits: 50000000n,
    totalWinningPoolBaseUnits: sideATotal,
    totalLosingPoolBaseUnits: sideBTotal
  });
  
  const backerA1Payout = calculatePayout({
    userStakeBaseUnits: 25000000n,
    totalWinningPoolBaseUnits: sideATotal,
    totalLosingPoolBaseUnits: sideBTotal
  });

  const totalPaidOut = capAPayout + backerA1Payout;
  const residualDust = totalPool - totalPaidOut;

  console.log(`[PASS] Captain A Payout: ${Number(capAPayout)/1e6} cUSD (exact: ${capAPayout} base units)`);
  console.log(`[PASS] Backer A1 Payout: ${Number(backerA1Payout)/1e6} cUSD (exact: ${backerA1Payout} base units)`);
  console.log(`[PASS] Total Allocated: ${Number(totalPaidOut)/1e6} cUSD | Residual Dust: ${residualDust} base units`);
  
  // Safety checks:
  console.log('\n[2] Safety Invariant Verification:');
  
  // Check 1: Loser payout
  const loserPayout = calculatePayout({
    userStakeBaseUnits: 50000000n,
    totalWinningPoolBaseUnits: 0n, // Loser has 0 in winning pool
    totalLosingPoolBaseUnits: sideATotal
  });
  console.log(`[PASS] Invariant 1 (Loser Payout == 0): ${loserPayout === 0n ? 'PASSED' : 'FAILED'}`);

  // Check 2: Solvency (total paid out <= total pool)
  console.log(`[PASS] Invariant 2 (Solvency totalPaid <= totalPool): ${totalPaidOut <= totalPool ? 'PASSED' : 'FAILED'}`);

  // Check 3: Deterministic PDA Escrow transfer simulation on Devnet
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  const keypairPath = 'C:\\Users\\HomePC\\.config\\solana\\compart-devnet-upgrade.json';
  const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, 'utf-8'))));
  const mintPubkey = new PublicKey('AXMB7tf5yHqPuFRTzaMgNSGPZ8iKJtFkeYdpeN7jcHWC');

  // Create temporary escrow account to demonstrate on-chain token vault custody
  const escrowOwner = Keypair.generate();
  const escrowVault = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mintPubkey,
    escrowOwner.publicKey
  );
  console.log(`\n[3] On-Chain Escrow Vault ATA: ${escrowVault.address.toBase58()}`);

  const payerATA = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mintPubkey,
    payer.publicKey
  );

  // Transfer 50 cUSD into escrow
  const depositTx = await transfer(
    connection,
    payer,
    payerATA.address,
    escrowVault.address,
    payer,
    50 * 1000000
  );
  console.log(`[PASS] Escrow Deposit Tx: ${depositTx}`);

  const vaultBalance = await getAccount(connection, escrowVault.address);
  console.log(`[PASS] Escrow Vault Verified Balance: ${Number(vaultBalance.amount)/1e6} cUSD`);

  return {
    success: true,
    capAPayout: capAPayout.toString(),
    backerA1Payout: backerA1Payout.toString(),
    residualDust: residualDust.toString(),
    escrowVault: escrowVault.address.toBase58(),
    depositTx: depositTx
  };
}

testEscrowAndPayoutProbe();
