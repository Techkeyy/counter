const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const { createMint, getOrCreateAssociatedTokenAccount, mintTo, getAccount } = require('@solana/spl-token');
const fs = require('fs');

async function testTokenProbe() {
  console.log('--- Probing Solana Devnet Test Stake Asset (cUSD) ---');
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  
  // Load devnet payer
  const keypairPath = 'C:\\Users\\HomePC\\.config\\solana\\compart-devnet-upgrade.json';
  const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, 'utf-8')));
  const payer = Keypair.fromSecretKey(secretKey);
  console.log(`[PASS] Payer Loaded: ${payer.publicKey.toBase58()}`);

  try {
    console.log('[1] Creating Devnet Test Token Mint (6 decimals)...');
    const mint = await createMint(
      connection,
      payer,
      payer.publicKey, // mint authority
      payer.publicKey, // freeze authority
      6 // decimals
    );
    console.log(`[PASS] Test Token Mint Created: ${mint.toBase58()}`);
    console.log(`[PASS] Name/Symbol: Counter USD (cUSD) - DEVNET TEST TOKEN - NO REAL VALUE`);

    console.log('\n[2] Creating Associated Token Account for Payer...');
    const tokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      mint,
      payer.publicKey
    );
    console.log(`[PASS] ATA: ${tokenAccount.address.toBase58()}`);

    console.log('\n[3] Minting 1,000.000000 cUSD test tokens...');
    const mintTx = await mintTo(
      connection,
      payer,
      mint,
      tokenAccount.address,
      payer,
      1000 * 1000000 // 1000 cUSD with 6 decimals
    );
    console.log(`[PASS] Mint Transaction Confirmed: ${mintTx}`);

    const balanceAccount = await getAccount(connection, tokenAccount.address);
    console.log(`[PASS] Final Confirmed Balance: ${Number(balanceAccount.amount) / 1000000} cUSD`);

    return {
      success: true,
      mint: mint.toBase58(),
      tokenAccount: tokenAccount.address.toBase58(),
      mintTx: mintTx
    };
  } catch (err) {
    console.error('[FAIL] Token probe failed:', err.message);
    return { success: false, error: err.message };
  }
}

testTokenProbe();
