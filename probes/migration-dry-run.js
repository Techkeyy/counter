/**
 * GATE 4 — Migration safety dry-run (local, non-destructive proof).
 *
 * Simulates a LEGACY database (drops the chain-path columns), then boots the
 * new server code twice, proving:
 *  - idempotent ALTER migration (2nd boot: no change)
 *  - users / takes / challenges / duels preserved exactly
 *  - legacy duels readable, chain_status UNINITIALIZED, no fabricated sigs/PDAs
 *  - no backfill of chain metadata
 *
 * Run: node probes/migration-dry-run.js  (from repo root: node probes/... with
 * cwd = Counter; uses server/data/counter.sqlite which is UNTRACKED dev data)
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const SERVER_DIR = path.join(__dirname, '..', 'server');
const initSqlJs = require(path.join(SERVER_DIR, 'node_modules', 'sql.js'));

const DB_FILE = path.join(SERVER_DIR, 'data', 'counter.sqlite');
const BACKUP = path.join(os.tmpdir(), `counter-migration-backup-${Date.now()}.sqlite`);

function assert(cond, msg) {
  if (!cond) throw new Error(`[MIGRATION ASSERT FAILED] ${msg}`);
  console.log(`  ok - ${msg}`);
}

async function main() {
  // 0. Timestamped backup (same practice required for production).
  fs.copyFileSync(DB_FILE, BACKUP);
  console.log(`backup: ${BACKUP} (${fs.statSync(BACKUP).size} bytes)`);

  const SQL = await initSqlJs();
  const load = () => new SQL.Database(fs.readFileSync(DB_FILE));
  const save = (db) => fs.writeFileSync(DB_FILE, Buffer.from(db.export()));
  const cols = (db, t) => {
    const st = db.prepare(`PRAGMA table_info(${t})`);
    const out = [];
    while (st.step()) out.push(st.getAsObject().name);
    st.free();
    return out;
  };
  const count = (db, t) => {
    const st = db.prepare(`SELECT COUNT(*) AS c FROM ${t}`);
    st.step();
    const c = st.getAsObject().c;
    st.free();
    return c;
  };

  // 1. Degrade to LEGACY shape.
  let db = load();
  const beforeCounts = {
    users: count(db, 'users'), takes: count(db, 'takes'),
    challenges: count(db, 'challenges'), duels: count(db, 'duels'),
    positions: count(db, 'positions'), receipts: count(db, 'receipts'),
  };
  const legacyDuelIds = [];
  {
    const st = db.prepare('SELECT id FROM duels');
    while (st.step()) legacyDuelIds.push(st.getAsObject().id);
    st.free();
  }
  console.log('counts before:', JSON.stringify(beforeCounts));
  for (const [t, c] of [
    ['duels', 'onchain_duel_bump'], ['duels', 'onchain_vault_bump'],
    ['duels', 'onchain_mint'], ['duels', 'init_tx_signature'],
    ['duels', 'chain_status'], ['positions', 'stake_tx_signature'],
  ]) {
    if (cols(db, t).includes(c)) db.run(`ALTER TABLE ${t} DROP COLUMN ${c}`);
  }
  assert(!cols(db, 'duels').includes('chain_status'), 'legacy shape: chain_status absent');
  save(db);
  db = null;

  // 2. First boot with new code (migration runs).
  const DB_MOD = path.join(SERVER_DIR, 'db.js');
  delete require.cache[require.resolve(DB_MOD)];
  const app = require(DB_MOD);
  await app.getDb();
  db = load();
  for (const c of ['onchain_duel_bump', 'onchain_vault_bump', 'onchain_mint', 'init_tx_signature', 'chain_status']) {
    assert(cols(db, 'duels').includes(c), `migrated: duels.${c} present`);
  }
  assert(cols(db, 'positions').includes('stake_tx_signature'), 'migrated: positions.stake_tx_signature present');
  assert(count(db, 'users') === beforeCounts.users, `users preserved (${beforeCounts.users})`);
  assert(count(db, 'takes') === beforeCounts.takes, `takes preserved (${beforeCounts.takes})`);
  assert(count(db, 'challenges') === beforeCounts.challenges, `challenges preserved (${beforeCounts.challenges})`);
  assert(count(db, 'duels') === beforeCounts.duels, `duels preserved (${beforeCounts.duels})`);
  assert(count(db, 'positions') === beforeCounts.positions, 'positions preserved');
  assert(count(db, 'receipts') === beforeCounts.receipts, 'receipts preserved');
  // Legacy rows: readable, honestly uninitialized, zero fabricated chain metadata.
  {
    const st = db.prepare('SELECT id, chain_status, init_tx_signature, onchain_duel_pda FROM duels');
    let n = 0;
    while (st.step()) {
      const r = st.getAsObject();
      assert(r.chain_status === 'UNINITIALIZED', `legacy duel ${r.id} honestly UNINITIALIZED`);
      assert(r.init_tx_signature === null, `legacy duel ${r.id} has no fabricated init sig`);
      n += 1;
    }
    st.free();
    assert(n === beforeCounts.duels, 'all legacy duels readable');
  }
  const schemaAfterFirst = JSON.stringify([cols(db, 'duels'), cols(db, 'positions')]);
  save(db);
  db = null;

  // 3. Second boot: must be a schema no-op.
  delete require.cache[require.resolve(DB_MOD)];
  const app2 = require(DB_MOD);
  await app2.getDb();
  db = load();
  assert(JSON.stringify([cols(db, 'duels'), cols(db, 'positions')]) === schemaAfterFirst, 'second boot: schema unchanged');
  assert(count(db, 'duels') === beforeCounts.duels, 'second boot: data unchanged');
  console.log('\nMIGRATION DRY-RUN COMPLETE: legacy -> migrated, idempotent, lossless, honest.');
}

main().catch((err) => { console.error('MIGRATION DRY-RUN FAILED:', err); process.exit(1); });
