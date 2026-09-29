/**
 * Counter chain vector tests — prove the canonical product path (server/chain.js)
 * matches the deployed Rust program and the proven harness, using HARDCODED
 * expected vectors (no circular self-comparison).
 *
 * Run: node test/chain-vectors.test.js (no network required)
 */
const assert = require('assert');
const { PublicKey } = require('@solana/web3.js');
const { getAssociatedTokenAddressSync } = require('@solana/spl-token');
const chain = require('../chain');

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok - ${name}`);
}

console.log('Counter chain vector tests');

// 1. Canonical duel-id parsing.
check('duelIdBytesFromHex accepts 32 hex chars', () => {
  const b = chain.duelIdBytesFromHex('000102030405060708090a0b0c0d0e0f');
  assert.strictEqual(b.length, 16);
  assert.strictEqual(b[0], 0);
  assert.strictEqual(b[15], 15);
});
check('duelIdBytesFromHex rejects garbage', () => {
  assert.throws(() => chain.duelIdBytesFromHex('xyz'), /32 hex chars/);
  assert.throws(() => chain.duelIdBytesFromHex('00'.repeat(15)), /32 hex chars/);
  assert.throws(() => chain.duelIdBytesFromHex('00'.repeat(17)), /32 hex chars/);
});

// 2. Serializer vectors (hand-computed borsh layout).
check('serializeDepositStake byte vector', () => {
  // side=1, amount=1_000_000 (0xF4240 LE -> 40 42 0f 00 00 00 00 00), bump=255
  const got = chain.serializeDepositStake({ side: 1, amountBase: 1000000, positionBump: 255 });
  assert.strictEqual(got.toString('hex'), '010140420f0000000000ff');
});
check('serializeResolveDuel byte vector', () => {
  assert.strictEqual(chain.serializeResolveDuel({ winningSide: 1 }).toString('hex'), '0201');
  assert.strictEqual(chain.serializeResolveDuel({ winningSide: 2 }).toString('hex'), '0202');
});
check('serializeClaimPayout byte vector', () => {
  const duelId = Buffer.from('000102030405060708090a0b0c0d0e0f', 'hex');
  const got = chain.serializeClaimPayout({ duelId });
  assert.strictEqual(got.toString('hex'), '03' + '000102030405060708090a0b0c0d0e0f');
});
check('serializeInitializeDuel layout vector', () => {
  const duelId = Buffer.alloc(16, 7);
  const termsHash = Buffer.alloc(32, 9);
  const captainA = new PublicKey('11111111111111111111111111111111');
  const captainB = new PublicKey('11111111111111111111111111111111');
  const got = chain.serializeInitializeDuel({
    duelId, cutoffTs: 1000, resolutionTs: 2000, termsHash, captainA, captainB,
    duelBump: 255, vaultBump: 254,
  });
  assert.strictEqual(got.length, 131);
  assert.strictEqual(got.readUInt8(0), 0);
  assert.deepStrictEqual(got.subarray(1, 17), duelId);
  assert.strictEqual(got.readBigInt64LE(17).toString(), '1000');
  assert.strictEqual(got.readBigInt64LE(25).toString(), '2000');
  assert.deepStrictEqual(got.subarray(33, 65), termsHash);
  assert.strictEqual(got.readUInt8(129), 255);
  assert.strictEqual(got.readUInt8(130), 254);
});

// 3. PDA derivation uses the program's exact seeds.
check('deriveDuelPda/deriveVaultPda seeds match program', () => {
  const id = '000102030405060708090a0b0c0d0e0f';
  const { duelPda, duelBump } = chain.deriveDuelPda(id);
  const [recomputed, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from('duel'), Buffer.from(id, 'hex')],
    chain.PROGRAM_ID
  );
  assert.strictEqual(duelPda.toBase58(), recomputed.toBase58());
  assert.strictEqual(duelBump, bump);
  const { vaultPda } = chain.deriveVaultPda(duelPda);
  const [v2] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), duelPda.toBuffer()],
    chain.PROGRAM_ID
  );
  assert.strictEqual(vaultPda.toBase58(), v2.toBase58());
});

// 4. Vault ATA matches spl-token's canonical helper (independent code path).
check('deriveVaultAta equals getAssociatedTokenAddressSync', () => {
  const { duelPda } = chain.deriveDuelPda('000102030405060708090a0b0c0d0e0f');
  const { vaultPda } = chain.deriveVaultPda(duelPda);
  const mine = chain.deriveVaultAta(vaultPda).toBase58();
  const theirs = getAssociatedTokenAddressSync(chain.CUSD_MINT, vaultPda, true).toBase58();
  assert.strictEqual(mine, theirs);
});

// 5. Units.
check('usdToBaseUnits', () => {
  assert.strictEqual(chain.usdToBaseUnits(50), 50000000);
  assert.strictEqual(chain.usdToBaseUnits(0.000001), 1);
  assert.strictEqual(chain.baseUnitsToUsd(125000000), 125);
  assert.throws(() => chain.usdToBaseUnits(0), /positive/);
  assert.throws(() => chain.usdToBaseUnits(-5), /positive/);
});

// 6. Duel account decoder against a hand-built 196-byte layout.
check('decodeDuelAccount layout', () => {
  const buf = Buffer.alloc(196);
  let off = 0;
  buf.writeUInt8(1, off); off += 1;
  const resolver = new PublicKey(Buffer.alloc(32, 5));
  resolver.toBuffer().copy(buf, off); off += 32;
  chain.CUSD_MINT.toBuffer().copy(buf, off); off += 32;
  Buffer.alloc(32, 3).copy(buf, off); off += 32;
  const capA = new PublicKey('11111111111111111111111111111111');
  capA.toBuffer().copy(buf, off); off += 32;
  const capB = new PublicKey('11111111111111111111111111111112');
  capB.toBuffer().copy(buf, off); off += 32;
  buf.writeBigUInt64LE(BigInt(75000000), off); off += 8;
  buf.writeBigUInt64LE(BigInt(50000000), off); off += 8;
  buf.writeBigInt64LE(BigInt(1790633104), off); off += 8;
  buf.writeBigInt64LE(BigInt(1790636704), off); off += 8;
  buf.writeUInt8(2, off); off += 1;
  buf.writeUInt8(255, off); off += 1;
  buf.writeUInt8(252, off); off += 1;
  const d = chain.decodeDuelAccount(buf);
  assert.strictEqual(d.isInitialized, true);
  assert.strictEqual(d.sideATotal, '75000000');
  assert.strictEqual(d.sideBTotal, '50000000');
  assert.strictEqual(d.status, 2);
  assert.strictEqual(d.tokenMint, chain.CUSD_MINT.toBase58());
  assert.strictEqual(d.captainA, capA.toBase58());
  assert.strictEqual(d.bump, 255);
  assert.strictEqual(d.vaultBump, 252);
});

// 7. Authoritative constants.
check('authoritative program + mint', () => {
  assert.strictEqual(chain.PROGRAM_ID.toBase58(), '52QgqEmxZzh2EH1gAwheMmp2ZXd9eT3WuXefSLYu6NmT');
  assert.strictEqual(chain.CUSD_MINT.toBase58(), 'AXMB7tf5yHqPuFRTzaMgNSGPZ8iKJtFkeYdpeN7jcHWC');
  assert.strictEqual(chain.CUSD_DECIMALS, 6);
});

console.log(`\nAll ${passed} chain vector tests passed.`);
