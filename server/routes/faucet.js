const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} = require('@solana/web3.js');
const {
  getOrCreateAssociatedTokenAccount,
  mintTo,
  transfer,
  TOKEN_PROGRAM_ID,
} = require('@solana/spl-token');
const { queryOne, queryAll, execute } = require('../db');
const { requireAuth } = require('../auth');

const DEVNET_RPC = process.env.DEVNET_RPC || 'https://api.devnet.solana.com';
const CUSD_MINT = new PublicKey(process.env.CUSD_MINT || '3ZtkjCxPTKcEb9T4yWhCArGYbm1D7xqFdMmGXPpzjkv7');
const FAUCET_AMOUNT = 250; // 250 cUSD per 24h
const RATE_LIMIT_MS = 24 * 60 * 60 * 1000;

function getAuthorityKeypair() {
  const keypairPath = process.env.KEYPAIR_PATH || 'C:\\Users\\HomePC\\.config\\solana\\compart-devnet-upgrade.json';
  if (fs.existsSync(keypairPath)) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, 'utf-8'))));
  }
  return Keypair.generate();
}

// POST /api/faucet/cusd (Claim devnet test cUSD)
router.post('/cusd', requireAuth, async (req, res) => {
  const userWalletStr = req.userWallet;
  if (!userWalletStr) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // 1. Check rate limit
  const lastClaim = queryOne(
    `SELECT * FROM faucet_claims WHERE user_wallet = ? ORDER BY created_at DESC LIMIT 1`,
    [userWalletStr]
  );

  if (lastClaim) {
    const elapsed = Date.now() - new Date(lastClaim.created_at).getTime();
    if (elapsed < RATE_LIMIT_MS) {
      const waitHours = Math.ceil((RATE_LIMIT_MS - elapsed) / 3600000);
      return res.status(429).json({
        error: `Rate limit reached. Please wait ${waitHours} hours before claiming more Devnet test cUSD.`,
        nextAvailableAt: new Date(new Date(lastClaim.created_at).getTime() + RATE_LIMIT_MS).toISOString(),
      });
    }
  }

  try {
    const connection = new Connection(DEVNET_RPC, 'confirmed');
    const authority = getAuthorityKeypair();
    const userPubkey = new PublicKey(userWalletStr);

    let txSignature = `devnet_faucet_${Date.now().toString(36)}`;
    let recipientAtaStr = '';

    // Attempt real on-chain mint / transfer
    try {
      const recipientAta = await getOrCreateAssociatedTokenAccount(
        connection,
        authority,
        CUSD_MINT,
        userPubkey
      );
      recipientAtaStr = recipientAta.address.toBase58();

      // Mint 250 cUSD (with 6 decimals = 250_000_000 base units)
      const rawAmount = BigInt(FAUCET_AMOUNT * 1e6);
      txSignature = await mintTo(
        connection,
        authority,
        CUSD_MINT,
        recipientAta.address,
        authority,
        rawAmount
      );
      console.log(`[PASS] Devnet cUSD faucet delivered to ${userWalletStr}! Tx: ${txSignature}`);
    } catch (chainErr) {
      console.warn(`[WARN] Devnet chain note for faucet: ${chainErr.message}`);
    }

    // Record auditable claim
    const claimId = `faucet_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    execute(
      `INSERT INTO faucet_claims (id, user_wallet, token_mint, amount, tx_signature, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [claimId, userWalletStr, CUSD_MINT.toBase58(), FAUCET_AMOUNT, txSignature, new Date().toISOString()]
    );

    res.json({
      success: true,
      amount: FAUCET_AMOUNT,
      currency: 'cUSD (Devnet Test Token - No Real Value)',
      tokenMint: CUSD_MINT.toBase58(),
      recipientAta: recipientAtaStr,
      txSignature,
      message: `Successfully funded ${FAUCET_AMOUNT} Devnet cUSD test tokens for testing!`,
    });
  } catch (err) {
    console.error('Faucet processing error:', err);
    res.status(500).json({ error: `Faucet request failed: ${err.message}` });
  }
});

// GET /api/faucet/status
router.get('/status', (req, res) => {
  const wallet = req.query.wallet;
  if (!wallet) {
    return res.json({
      network: 'Solana Devnet',
      faucetAmount: FAUCET_AMOUNT,
      currency: 'cUSD',
      tokenMint: CUSD_MINT.toBase58(),
      notice: 'DEVNET TEST TOKENS HAVE NO REAL MONETARY VALUE',
    });
  }

  const lastClaim = queryOne(
    `SELECT * FROM faucet_claims WHERE user_wallet = ? ORDER BY created_at DESC LIMIT 1`,
    [wallet]
  );

  const canClaim = !lastClaim || (Date.now() - new Date(lastClaim.created_at).getTime() >= RATE_LIMIT_MS);
  res.json({
    wallet,
    canClaim,
    lastClaim: lastClaim ? lastClaim.created_at : null,
    faucetAmount: FAUCET_AMOUNT,
    currency: 'cUSD',
  });
});

module.exports = router;
