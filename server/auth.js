const crypto = require('crypto');
const nacl = require('tweetnacl');
const bs58Module = require('bs58');
const bs58 = bs58Module.default || bs58Module;
const { queryOne, execute } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'counter-secret-key-solana-hackathon-2026';

function generateNonce(walletAddress) {
  const nonce = crypto.randomBytes(16).toString('hex');
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes validity

  // Upsert nonce
  execute(`INSERT OR REPLACE INTO auth_nonces (wallet_address, nonce, expires_at) VALUES (?, ?, ?)`, [
    walletAddress,
    nonce,
    expiresAt,
  ]);

  return { nonce, expiresAt };
}

function verifySignature(walletAddress, signatureBase58, nonce) {
  const nonceRow = queryOne(`SELECT nonce, expires_at FROM auth_nonces WHERE wallet_address = ?`, [walletAddress]);
  if (!nonceRow) {
    return { valid: false, error: 'No active authentication challenge for this wallet' };
  }

  if (Date.now() > nonceRow.expires_at) {
    return { valid: false, error: 'Authentication nonce expired' };
  }

  if (nonceRow.nonce !== nonce) {
    return { valid: false, error: 'Invalid nonce provided' };
  }

  const expectedMessage = `Sign-in to Counter with nonce: ${nonce}`;
  const messageBytes = Buffer.from(expectedMessage, 'utf-8');

  try {
    const signatureBytes = bs58.decode(signatureBase58);
    const publicKeyBytes = bs58.decode(walletAddress);

    const isVerified = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
    if (!isVerified) {
      return { valid: false, error: 'Cryptographic signature verification failed' };
    }

    // Delete used nonce
    execute(`DELETE FROM auth_nonces WHERE wallet_address = ?`, [walletAddress]);

    // Create session token
    const payload = JSON.stringify({
      wallet: walletAddress,
      iat: Date.now(),
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
    });
    const tokenSignature = crypto.createHmac('sha256', JWT_SECRET).update(payload).digest('hex');
    const token = `${Buffer.from(payload).toString('base64url')}.${tokenSignature}`;

    return { valid: true, token, wallet: walletAddress };
  } catch (err) {
    return { valid: false, error: `Signature verification exception: ${err.message}` };
  }
}

function verifyToken(tokenString) {
  if (!tokenString) return null;
  const parts = tokenString.split('.');
  if (parts.length !== 2) return null;

  const [payloadBase64, providedSig] = parts;
  const payloadStr = Buffer.from(payloadBase64, 'base64url').toString('utf-8');
  const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(payloadStr).digest('hex');

  if (providedSig !== expectedSig) return null;

  try {
    const payload = JSON.parse(payloadStr);
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch (err) {
    return null;
  }
}

function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  const token = authHeader.substring(7);
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Invalid or expired authentication session' });
  }

  req.userWallet = payload.wallet;
  next();
}

module.exports = {
  generateNonce,
  verifySignature,
  verifyToken,
  requireAuth,
};
