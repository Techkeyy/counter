const express = require('express');
const router = express.Router();
const { requireAuth } = require('../auth');
const { queryOne, execute } = require('../db');
const {
  Connection,
  Keypair,
  PublicKey,
} = require('@solana/web3.js');
const {
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
} = require('@solana/spl-token');
const fs = require('fs');

const DEVNET_RPC = process.env.DEVNET_RPC || 'https://api.devnet.solana.com';
const DEVNET_CUSD_MINT = new PublicKey(process.env.DEVNET_CUSD_MINT || 'AXMB7tf5yHqPuFRTzaMgNSGPZ8iKJtFkeYdpeN7jcHWC');
const FAUCET_AMOUNT_CUSD = 250;
const FAUCET_AMOUNT_RAW = BigInt(FAUCET_AMOUNT_CUSD * 1e6); // 6 decimals

function getFaucetAuthorityKeypair() {
  const keypairPath = process.env.KEYPAIR_PATH || 'C:\\Users\\HomePC\\.config\\solana\\compart-devnet-upgrade.json';
  if (fs.existsSync(keypairPath)) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, 'utf-8'))));
  }
  throw new Error('Server faucet authority keypair not configured on host');
}

// In-memory rate limiting map: walletAddress -> timestamp
const faucetClaims = new Map();

// POST /api/faucet/cusd
// Authenticated user receives fixed 250 Devnet cUSD minted directly to their wallet on-chain
router.post('/cusd', requireAuth, async (req, res) => {
  const wallet = req.userWallet;
  const now = Date.now();
  const lastClaim = faucetClaims.get(wallet) || 0;

  // 24 hour rate limit (86400 * 1000 ms)
  const COOLDOWN_MS = 24 * 60 * 60 * 1000;
  if (now - lastClaim < COOLDOWN_MS) {
    const remainingHours = Math.ceil((COOLDOWN_MS - (now - lastClaim)) / (60 * 60 * 1000));
    return res.status(429).json({
      error: 'Rate limit reached. Please wait 24 hours before claiming more Devnet test cUSD.',
      retryAfterHours: remainingHours,
    });
  }

  try {
    const connection = new Connection(DEVNET_RPC, 'confirmed');
    const authorityKeypair = getFaucetAuthorityKeypair();
    const recipientPubkey = new PublicKey(wallet);

    // Get user token balance before
    let balanceBefore = 0;
    try {
      const existingAta = await getOrCreateAssociatedTokenAccount(
        connection,
        authorityKeypair,
        DEVNET_CUSD_MINT,
        recipientPubkey
      );
      const accBefore = await getAccount(connection, existingAta.address);
      balanceBefore = Number(accBefore.amount) / 1e6;
    } catch (e) {
      balanceBefore = 0;
    }

    // Get or create ATA for user
    const recipientAta = await getOrCreateAssociatedTokenAccount(
      connection,
      authorityKeypair,
      DEVNET_CUSD_MINT,
      recipientPubkey
    );

    // Mint exactly 250 cUSD to the recipient ATA
    const txSignature = await mintTo(
      connection,
      authorityKeypair,
      DEVNET_CUSD_MINT,
      recipientAta.address,
      authorityKeypair,
      FAUCET_AMOUNT_RAW
    );

    // Get user token balance after
    const accAfter = await getAccount(connection, recipientAta.address);
    const balanceAfter = Number(accAfter.amount) / 1e6;

    // Record rate limit timestamp
    faucetClaims.set(wallet, now);

    // Record activity notification
    execute(
      `INSERT INTO activity (id, user_wallet, type, source_wallet, target_id, target_type, title, message, is_read, is_archived, created_at)
       VALUES (?, ?, 'FAUCET_AIRDROP', 'system', ?, 'TOKEN', 'Test funds added', '250 cUSD was added to your test balance.', 0, 0, ?)`,
      [`act_faucet_${Date.now()}`, wallet, DEVNET_CUSD_MINT.toBase58(), new Date().toISOString()]
    );

    return res.json({
      success: true,
      amount: FAUCET_AMOUNT_CUSD,
      currency: 'cUSD (Devnet Test Token)',
      tokenMint: DEVNET_CUSD_MINT.toBase58(),
      recipientWallet: wallet,
      recipientAta: recipientAta.address.toBase58(),
      txSignature,
      explorerUrl: `https://explorer.solana.com/tx/${txSignature}?cluster=devnet`,
      balanceBefore,
      balanceAfter,
      message: `Successfully minted ${FAUCET_AMOUNT_CUSD} Devnet cUSD on-chain!`,
    });
  } catch (err) {
    console.error('[FAUCET ERROR]:', err);
    return res.status(500).json({ error: `On-chain faucet execution failed: ${err.message}` });
  }
});

module.exports = router;
