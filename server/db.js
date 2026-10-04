const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DB_DIR, 'counter.sqlite');

let db = null;
let transactionDepth = 0;

async function getDb() {
  if (db) return db;

  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  const SQL = await initSqlJs();
  if (fs.existsSync(DB_FILE)) {
    const fileBuffer = fs.readFileSync(DB_FILE);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // Initialize schema
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      wallet_address TEXT PRIMARY KEY,
      handle TEXT UNIQUE,
      display_name TEXT,
      avatar_url TEXT,
      bio TEXT,
      skr_staked_amount REAL DEFAULT 0,
      is_arena_eligible INTEGER DEFAULT 0,
      is_age_verified INTEGER DEFAULT 0,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS auth_nonces (
      wallet_address TEXT PRIMARY KEY,
      nonce TEXT,
      expires_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS takes (
      id TEXT PRIMARY KEY,
      author_wallet TEXT,
      topic TEXT,
      content TEXT,
      category TEXT,
      created_at TEXT,
      status TEXT DEFAULT 'ACTIVE',
      likes_count INTEGER DEFAULT 0,
      comments_count INTEGER DEFAULT 0,
      duels_count INTEGER DEFAULT 0,
      record_origin TEXT DEFAULT 'USER',
      FOREIGN KEY(author_wallet) REFERENCES users(wallet_address)
    );

    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      take_id TEXT,
      author_wallet TEXT,
      content TEXT,
      created_at TEXT,
      FOREIGN KEY(take_id) REFERENCES takes(id),
      FOREIGN KEY(author_wallet) REFERENCES users(wallet_address)
    );

    CREATE TABLE IF NOT EXISTS challenges (
      id TEXT PRIMARY KEY,
      take_id TEXT,
      challenger_wallet TEXT,
      creator_wallet TEXT,
      proposition_a TEXT,
      proposition_b TEXT,
      category TEXT,
      source_type TEXT,
      source_config TEXT,
      stake_amount_usd REAL,
      cutoff_ts INTEGER,
      resolution_ts INTEGER,
      status TEXT DEFAULT 'PROPOSED',
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS counteroffers (
      id TEXT PRIMARY KEY,
      challenge_id TEXT,
      proposer_wallet TEXT,
      stake_amount_usd REAL,
      cutoff_ts INTEGER,
      resolution_ts INTEGER,
      proposition_a TEXT,
      proposition_b TEXT,
      source_config TEXT,
      status TEXT DEFAULT 'PENDING',
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS duels (
      id TEXT PRIMARY KEY,
      onchain_duel_id TEXT UNIQUE,
      challenge_id TEXT,
      take_id TEXT,
      onchain_duel_pda TEXT,
      onchain_vault_pda TEXT,
      vault_token_account TEXT,
      captain_a_wallet TEXT,
      captain_b_wallet TEXT,
      side_a_total REAL DEFAULT 0,
      side_b_total REAL DEFAULT 0,
      terms_hash TEXT,
      proposition_a TEXT,
      proposition_b TEXT,
      category TEXT,
      source_type TEXT,
      source_config TEXT,
      cutoff_ts INTEGER,
      resolution_ts INTEGER,
      status TEXT DEFAULT 'ACCEPTING_STAKES',
      winning_side INTEGER DEFAULT 0,
      resolution_data TEXT,
      resolution_tx TEXT,
      is_arena INTEGER DEFAULT 0,
      share_slug TEXT UNIQUE,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS positions (
      id TEXT PRIMARY KEY,
      duel_id TEXT,
      user_wallet TEXT,
      side INTEGER,
      stake_amount REAL,
      position_pda TEXT,
      claimed INTEGER DEFAULT 0,
      claim_tx TEXT,
      payout_amount REAL,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS receipts (
      id TEXT PRIMARY KEY,
      duel_id TEXT UNIQUE,
      take_id TEXT,
      captain_a_wallet TEXT,
      captain_b_wallet TEXT,
      winner_wallet TEXT,
      total_pool REAL,
      resolution_summary TEXT,
      resolution_evidence TEXT,
      onchain_signature TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS activity (
      id TEXT PRIMARY KEY,
      user_wallet TEXT,
      type TEXT,
      source_wallet TEXT,
      target_id TEXT,
      target_type TEXT,
      title TEXT,
      message TEXT,
      is_read INTEGER DEFAULT 0,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      reporter_wallet TEXT,
      target_type TEXT,
      target_id TEXT,
      reason TEXT,
      status TEXT DEFAULT 'PENDING',
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS blocks (
      id TEXT PRIMARY KEY,
      blocker_wallet TEXT,
      blocked_wallet TEXT,
      created_at TEXT,
      UNIQUE(blocker_wallet, blocked_wallet)
    );
  `);

  saveDb();
  // Chain-path columns (added after initial schema; ALTER is idempotent via PRAGMA check).
  ensureColumn('duels', 'onchain_duel_bump', 'INTEGER');
  ensureColumn('duels', 'onchain_vault_bump', 'INTEGER');
  ensureColumn('duels', 'onchain_mint', 'TEXT');
  ensureColumn('duels', 'init_tx_signature', 'TEXT');
  ensureColumn('duels', 'chain_status', "TEXT DEFAULT 'UNINITIALIZED'");
  ensureColumn('positions', 'stake_tx_signature', 'TEXT');
  ensureColumn('positions', 'payout_amount', 'REAL');
  ensureColumn('takes', 'record_origin', "TEXT DEFAULT 'USER'");
  // Settlement-mode columns (explicit duel terms; legacy rows default to the
  // historical Counter Verified behavior).
  ensureColumn('duels', 'resolution_mode', "TEXT DEFAULT 'COUNTER_VERIFIED'");
  ensureColumn('duels', 'fallback_mode', "TEXT DEFAULT 'REFUND'");
  ensureColumn('duels', 'mutual_deadline_ts', 'INTEGER');
  ensureColumn('challenges', 'resolution_mode', "TEXT DEFAULT 'COUNTER_VERIFIED'");
  ensureColumn('challenges', 'fallback_mode', "TEXT DEFAULT 'REFUND'");
  ensureColumn('challenges', 'mutual_deadline_ts', 'INTEGER');
  db.run(`CREATE TABLE IF NOT EXISTS mutual_votes (
    duel_id TEXT,
    captain_wallet TEXT,
    winner_side INTEGER,
    message TEXT,
    signature TEXT,
    created_at TEXT,
    updated_at TEXT,
    PRIMARY KEY (duel_id, captain_wallet)
  )`);
  // One durable settlement attempt per Duel. This is the backend idempotence
  // boundary for automatic mismatch cancellation and normal mutual settlement:
  // an API retry must never submit a second ResolveDuel transaction.
  db.run(`CREATE TABLE IF NOT EXISTS duel_settlement_attempts (
    duel_id TEXT PRIMARY KEY,
    mode TEXT NOT NULL,
    state TEXT NOT NULL,
    tx_signature TEXT,
    result_json TEXT,
    error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  saveDb();
  return db;
}

function saveDb() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_FILE, buffer);
}

// Helpers for SQL execution with sql.js
function columnExists(table, column) {
  const rows = queryAll(`PRAGMA table_info(${table})`, []);
  return rows.some((r) => r.name === column);
}

function ensureColumn(table, column, type) {
  if (!columnExists(table, column)) {
    db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function queryOne(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

function execute(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.run(params);
  stmt.free();
  if (transactionDepth === 0) saveDb();
}

// Run a group of related writes as one durable unit. sql.js exposes SQLite's
// transaction semantics synchronously; suppressing intermediate saveDb calls
// prevents a crash from persisting a half-applied boundary.
function transaction(callback) {
  if (transactionDepth > 0) return callback();
  db.run('BEGIN');
  transactionDepth = 1;
  try {
    const result = callback();
    db.run('COMMIT');
    transactionDepth = 0;
    saveDb();
    return result;
  } catch (error) {
    try { db.run('ROLLBACK'); } finally { transactionDepth = 0; }
    throw error;
  }
}

module.exports = {
  getDb,
  saveDb,
  queryAll,
  queryOne,
  execute,
  transaction,
};
