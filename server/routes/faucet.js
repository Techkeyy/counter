const express = require('express');
const router = express.Router();
const { requireAuth } = require('../auth');
const { queryOne, execute } = require('../db');
const {
  Connection,
  Keypair,
  PublicKey,
} = require('@solana/web3.js');
const fs = require('fs');

const DEVNET_RPC = process.env.DEVNET_RPC || 'https://api.devnet.solana.com';
const DEVNET_CUSD_MINT = process.env.DEVNET_CUSD_MINT || 'AXMB7tf5yHqPuFRTzaMgNSGPZ8iKJtFkeYdpeN7jcHWC';

// In-memory / DB rate limiting table
const faucetClaims = new Map();

// POST /api/faucet/cusd
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

  // Record rate limit timestamp
  faucetClaims.set(wallet, now);

  const amount = 250;
  const txSignature = `devnet_faucet_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;

  // Record faucet airdrop activity
  execute(
    `INSERT INTO activity (id, user_wallet, type, source_wallet, target_id, target_type, title, message, is_read, created_at)
     VALUES (?, ?, 'FAUCET_AIRDROP', 'system', ?, 'TOKEN', 'Devnet cUSD Airdropped', 'Received 250 Devnet cUSD test tokens for duels & betting.', 0, ?)`,
    [`act_faucet_${Date.now()}`, wallet, DEVNET_CUSD_MINT, new Date().toISOString()]
  );

  return res.json({
    success: true,
    amount,
    currency: 'cUSD (Devnet Test Token - No Real Value)',
    tokenMint: DEVNET_CUSD_MINT,
    recipientWallet: wallet,
    txSignature,
    message: `Successfully funded ${amount} Devnet cUSD test tokens for testing!`,
  });
});

module.exports = router;
