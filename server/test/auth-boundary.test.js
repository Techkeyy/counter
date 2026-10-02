const assert = require('assert');
const crypto = require('crypto');
const path = require('path');
const { spawnSync } = require('child_process');

const SERVER_DIR = path.join(__dirname, '..');

function runChild(source, env) {
  const result = spawnSync(process.execPath, ['-e', source], {
    cwd: SERVER_DIR,
    env,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `child exited ${result.status}`);
  }
  return result.stdout.trim();
}

const configuredSecretFromEnv = process.env.JWT_SECRET;
const configuredSecret = configuredSecretFromEnv
  ? configuredSecretFromEnv
  : crypto.randomBytes(32).toString('hex');

const configuredFlow = String.raw`
  const crypto = require('crypto');
  const nacl = require('tweetnacl');
  const bs58Module = require('bs58');
  const bs58 = bs58Module.default || bs58Module;
  const { getDb } = require('./db');
  const auth = require('./auth');

  (async () => {
    await getDb();
    const keypair = nacl.sign.keyPair();
    const wallet = bs58.encode(Buffer.from(keypair.publicKey));
    const { nonce } = auth.generateNonce(wallet);
    const message = Buffer.from('Sign-in to Counter with nonce: ' + nonce, 'utf8');
    const signature = bs58.encode(Buffer.from(nacl.sign.detached(message, keypair.secretKey)));
    const session = auth.verifySignature(wallet, signature, nonce);
    if (!session.valid || !session.token) throw new Error('configured SIWS session was not issued');
    const payload = auth.verifyToken(session.token);
    if (!payload || payload.wallet !== wallet) throw new Error('configured session token did not verify');

    const oldPayload = JSON.stringify({ wallet, iat: Date.now(), exp: Date.now() + 60000 });
    const oldSecret = ['counter', '-secret', '-key', '-solana', '-hackathon', '-2026'].join('');
    const oldSignature = crypto.createHmac('sha256', oldSecret).update(oldPayload).digest('hex');
    const oldToken = Buffer.from(oldPayload).toString('base64url') + '.' + oldSignature;
    if (auth.verifyToken(oldToken) !== null) throw new Error('former fallback token was accepted');

    console.log('configured-flow-pass');
  })().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
`;

const missingSecretFlow = String.raw`
  const nacl = require('tweetnacl');
  const bs58Module = require('bs58');
  const bs58 = bs58Module.default || bs58Module;
  const { getDb } = require('./db');
  const auth = require('./auth');

  (async () => {
    await getDb();
    const keypair = nacl.sign.keyPair();
    const wallet = bs58.encode(Buffer.from(keypair.publicKey));
    const { nonce } = auth.generateNonce(wallet);
    const message = Buffer.from('Sign-in to Counter with nonce: ' + nonce, 'utf8');
    const signature = bs58.encode(Buffer.from(nacl.sign.detached(message, keypair.secretKey)));
    const session = auth.verifySignature(wallet, signature, nonce);
    if (session.valid || session.token) throw new Error('missing JWT configuration issued a session');
    if (auth.verifyToken('not-a-real-token') !== null) throw new Error('missing JWT configuration verified a token');
    console.log('missing-secret-pass');
  })().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
`;

assert.strictEqual(
  runChild(configuredFlow, { ...process.env, JWT_SECRET: configuredSecret }),
  'configured-flow-pass'
);

const missingEnv = { ...process.env };
delete missingEnv.JWT_SECRET;
assert.strictEqual(runChild(missingSecretFlow, missingEnv), 'missing-secret-pass');

console.log('Auth boundary tests passed: configured SIWS, missing-secret refusal, former fallback rejection.');
