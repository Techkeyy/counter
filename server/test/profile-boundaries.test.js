/**
 * Counter Profile Boundary Tests
 * Own-profile update, ownership isolation, handle uniqueness (case-insensitive),
 * field bounds, avatar upload boundaries, removal, and persistence.
 * Fixtures are scoped to pt_ handles / tracked wallets and removed afterwards;
 * production data is never touched (local dev DB file only).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const nacl = require('tweetnacl');
const bs58Module = require('bs58');
const bs58 = bs58Module.default || bs58Module;
const { getDb, queryAll, queryOne, execute, saveDb } = require('../db');
const auth = require('../auth');
const profile = require('../profile');

function assert(condition, message) {
  if (!condition) throw new Error(`[ASSERTION FAILED] ${message}`);
}
function ok(label) {
  console.log(`  ok - ${label}`);
}

// 1x1 PNG (valid magic bytes)
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function run() {
  console.log('Counter profile boundary tests');
  await getDb();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'counter-prof-test-'));
  const wallets = [];
  const mkWallet = () => {
    const kp = nacl.sign.keyPair();
    const w = bs58.encode(kp.publicKey);
    wallets.push(w);
    execute(
      `INSERT OR REPLACE INTO users (wallet_address, handle, display_name, avatar_url, bio, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [w, `pt_${w.slice(0, 4).toLowerCase()}_${w.slice(-4).toLowerCase()}`, 'Test Contender', '', '', new Date().toISOString()]
    );
    return w;
  };

  try {
    const walletA = mkWallet();
    const walletB = mkWallet();

    // 1. own update succeeds
    let r = profile.updateProfile(walletA, { displayName: 'Ada Lovelace', handle: 'adalove', bio: 'First programmer.' });
    assert(r.ok && r.user.display_name === 'Ada Lovelace' && r.user.handle === 'adalove', 'own update persists');
    ok('own-profile update succeeds');

    // 2. ownership isolation: B untouched; forged token rejected at auth layer
    const beforeB = queryOne(`SELECT * FROM users WHERE wallet_address = ?`, [walletB]);
    profile.updateProfile(walletA, { displayName: 'Mallory' });
    const afterB = queryOne(`SELECT * FROM users WHERE wallet_address = ?`, [walletB]);
    assert(afterB.display_name === beforeB.display_name, 'other user row untouched');
    assert(auth.verifyToken(`${Buffer.from(JSON.stringify({ wallet: walletB, iat: 1, exp: Date.now() + 9999 })).toString('base64url')}.forged`) === null, 'forged token rejected');
    ok('other-user update rejected (ownership isolation)');

    // 3/4. duplicate + case-insensitive duplicate
    r = profile.updateProfile(walletB, { handle: 'adalove' });
    assert(!r.ok && r.code === 'HANDLE_TAKEN', 'duplicate handle rejected');
    r = profile.updateProfile(walletB, { handle: 'AdaLove' });
    assert(!r.ok && r.code === 'HANDLE_TAKEN', 'case-insensitive duplicate rejected');
    r = profile.updateProfile(walletA, { handle: 'AdaLove' });
    assert(r.ok && r.user.handle === 'adalove', 'own handle re-save normalizes + succeeds');
    ok('duplicate and case-insensitive duplicate handles rejected');

    // 5/6. bad handles + bounds
    for (const bad of ['ab', 'x'.repeat(21), 'has space', 'bang!', '@@@', 'UPPER-DOT.a']) {
      const rr = profile.updateProfile(walletB, { handle: bad });
      assert(!rr.ok, `bad handle rejected: ${bad}`);
    }
    assert(!profile.updateProfile(walletB, { displayName: '   ' }).ok, 'empty name rejected');
    assert(!profile.updateProfile(walletB, { displayName: 'x'.repeat(41) }).ok, 'overlong name rejected');
    assert(!profile.updateProfile(walletB, { bio: 'x'.repeat(161) }).ok, 'overlong bio rejected');
    assert(profile.updateProfile(walletB, { bio: '' }).ok, 'empty bio allowed');
    ok('handle charset/length and name/bio bounds enforced');

    // 7. avatar: valid upload
    r = profile.setAvatar(walletA, TINY_PNG, tmpDir);
    assert(r.ok && r.user.avatar_url.startsWith('/api/users/profile/avatar/'), 'avatar URL stored');
    const fileA = r.user.avatar_url.split('/').pop();
    assert(profile.isSafeAvatarFile(fileA), 'generated filename is safe');
    assert(fs.existsSync(path.join(tmpDir, fileA)), 'avatar file persisted on disk');
    ok('valid avatar upload persists');

    // 8. avatar: oversized / wrong MIME / corrupt
    const big = 'data:image/png;base64,' + Buffer.alloc(2 * 1024 * 1024, 7).toString('base64');
    assert(!profile.setAvatar(walletA, big, tmpDir).ok, 'oversized image rejected');
    assert(!profile.setAvatar(walletA, 'data:text/plain;base64,aGk=', tmpDir).ok, 'wrong MIME rejected');
    assert(!profile.setAvatar(walletA, 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', tmpDir).ok, 'SVG rejected');
    assert(!profile.setAvatar(walletA, 'data:image/png;base64,!!!notbase64!!!', tmpDir).ok, 'corrupt payload rejected');
    assert(!profile.isSafeAvatarFile('../../etc/passwd'), 'path traversal filename rejected');
    assert(!profile.isSafeAvatarFile('avatar.php'), 'extension gate rejects executables');
    ok('oversized, wrong-MIME, corrupt, traversal uploads rejected');

    // 9. avatar replacement reclaims old file; removal clears field + file
    r = profile.setAvatar(walletA, TINY_PNG, tmpDir);
    assert(!fs.existsSync(path.join(tmpDir, fileA)), 'replaced avatar reclaimed');
    const fileB = r.user.avatar_url.split('/').pop();
    r = profile.removeAvatar(walletA, tmpDir);
    assert(r.ok && r.user.avatar_url === '', 'removal clears field');
    assert(!fs.existsSync(path.join(tmpDir, fileB)), 'removed avatar deleted');
    ok('avatar replacement reclaims; removal clears field and file');

    // 10. persistence across saveDb + fresh read
    profile.updateProfile(walletA, { displayName: 'Ada Persisted' });
    saveDb();
    const reread = queryOne(`SELECT display_name FROM users WHERE wallet_address = ?`, [walletA]);
    assert(reread && reread.display_name === 'Ada Persisted', 'profile persists through saveDb + reread');
    ok('profile persists after backend save + reread');

    // 11. onboarding sequence: draft fields persist through canonical writes,
    // canonical reread matches, avatar included
    profile.updateProfile(walletA, { displayName: 'Onboard Ori', handle: 'onboardori', bio: 'Fresh contender.' });
    r = profile.setAvatar(walletA, TINY_PNG, tmpDir);
    assert(r.ok, 'onboarding avatar upload succeeds');
    const canon = queryOne(`SELECT display_name, handle, bio, avatar_url FROM users WHERE wallet_address = ?`, [walletA]);
    assert(
      canon.display_name === 'Onboard Ori' &&
      canon.handle === 'onboardori' &&
      canon.bio === 'Fresh contender.' &&
      canon.avatar_url.startsWith('/api/users/profile/avatar/'),
      'canonical reread matches name, handle, bio, avatar'
    );
    ok('onboarding sequence persists name, handle, bio, avatar with matching reread');

    // 12. interrupted onboarding resumes safely: partial writes persist, rest applies later
    const walletC = mkWallet();
    wallets.push(walletC);
    profile.updateProfile(walletC, { displayName: 'Half Done' });
    let partial = queryOne(`SELECT display_name, handle FROM users WHERE wallet_address = ?`, [walletC]);
    assert(partial.display_name === 'Half Done', 'partial draft persists');
    r = profile.updateProfile(walletC, { handle: 'halfdone', bio: 'Back to finish.' });
    assert(r.ok, 'resumed write applies');
    partial = queryOne(`SELECT display_name, handle, bio FROM users WHERE wallet_address = ?`, [walletC]);
    assert(partial.display_name === 'Half Done' && partial.handle === 'halfdone' && partial.bio === 'Back to finish.', 'resumed onboarding completes safely');
    ok('interrupted onboarding resumes safely');

    // 13. identity propagation: Take created as Name A reads as Name B after edit
    const takeId = `take_pt_${Date.now()}`;
    execute(
      `INSERT INTO takes (id, author_wallet, topic, content, category, created_at, status, likes_count, comments_count, duels_count)
       VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', 0, 0, 0)`,
      [takeId, walletA, 'Propagation topic', 'Propagation content', 'CRYPTO', new Date().toISOString()]
    );
    const commId = `comm_pt_${Date.now()}`;
    execute(
      `INSERT INTO comments (id, take_id, author_wallet, content, created_at) VALUES (?, ?, ?, ?, ?)`,
      [commId, takeId, walletA, 'Propagation reply', new Date().toISOString()]
    );
    profile.updateProfile(walletA, { displayName: 'Renamed Rita', handle: 'renamedrita' });
    const takeRow = queryOne(
      `SELECT t.*, u.handle, u.display_name, u.avatar_url FROM takes t LEFT JOIN users u ON t.author_wallet = u.wallet_address WHERE t.id = ?`,
      [takeId]
    );
    assert(takeRow.display_name === 'Renamed Rita' && takeRow.handle === 'renamedrita', 'same Take reads new identity');
    assert(takeRow.id === takeId, 'content id unchanged');
    const commRow = queryOne(
      `SELECT c.*, u.handle, u.display_name FROM comments c LEFT JOIN users u ON c.author_wallet = u.wallet_address WHERE c.id = ?`,
      [commId]
    );
    assert(commRow.display_name === 'Renamed Rita', 'comment reads new identity');
    const avRow = queryOne(
      `SELECT u.avatar_url FROM takes t LEFT JOIN users u ON t.author_wallet = u.wallet_address WHERE t.id = ?`,
      [takeId]
    );
    assert(avRow.avatar_url && avRow.avatar_url.startsWith('/api/users/profile/avatar/'), 'avatar propagates to content reads');
    execute(`DELETE FROM comments WHERE id = ?`, [commId]);
    execute(`DELETE FROM takes WHERE id = ?`, [takeId]);
    ok('Take + comment resolve current identity; ownership/id unchanged');

    // 14. forged client author name cannot alter rendered identity: the takes
    // table carries NO identity columns at all, so there is nothing to forge.
    const takeCols = queryAll(`PRAGMA table_info(takes)`, []).map((c) => c.name);
    assert(
      !takeCols.includes('author_name') && !takeCols.includes('author_handle') && !takeCols.includes('author_avatar'),
      'takes carry no author-controlled identity columns'
    );
    const evilTake = `take_pt_evil_${Date.now()}`;
    execute(
      `INSERT INTO takes (id, author_wallet, topic, content, category, created_at, status, likes_count, comments_count, duels_count)
       VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', 0, 0, 0)`,
      [evilTake, walletB, 'Evil topic', 'Evil content', 'CRYPTO', new Date().toISOString()]
    );
    const evilRow = queryOne(
      `SELECT t.*, u.handle, u.display_name FROM takes t LEFT JOIN users u ON t.author_wallet = u.wallet_address WHERE t.id = ?`,
      [evilTake]
    );
    assert(evilRow.display_name !== 'Mallory' && evilRow.handle !== 'mallory', 'no client-supplied name leaks into reads');
    execute(`DELETE FROM takes WHERE id = ?`, [evilTake]);
    ok('forged author names cannot alter rendered identity');

    console.log('\nAll profile boundary tests passed.');
  } finally {
    for (const w of wallets) {
      try { execute(`DELETE FROM users WHERE wallet_address = ?`, [w]); } catch {}
    }
    try { saveDb(); } catch {}
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    const leftovers = queryOne(`SELECT COUNT(*) AS c FROM users WHERE handle LIKE 'pt\\_%' ESCAPE '\\'`);
    console.log(`fixture leftovers: ${leftovers ? leftovers.c : 0}`);
  }
}

run().catch((e) => {
  console.log(e.message);
  process.exit(1);
});
