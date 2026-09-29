/**
 * Session persistence tests — execute the REAL app/src/session.ts (transpiled
 * on the fly) with an in-memory SecureStore stand-in and a fake backend.
 *
 * Cases: no session / valid session / malformed / expired-rejected /
 * logout-clears. Run: node session.test.js (no network, no device).
 */
const assert = require('assert');
const Module = require('module');
const path = require('path');
const ts = require('typescript');
const fs = require('fs');

const SRC = path.join(__dirname, 'src', 'session.ts');

// In-memory SecureStore stand-in.
const memStore = new Map();
const fakeSecureStore = {
  getItemAsync: async (k) => (memStore.has(k) ? memStore.get(k) : null),
  setItemAsync: async (k, v) => { memStore.set(k, v); },
  deleteItemAsync: async (k) => { memStore.delete(k); },
};

// Fake backend: only token 'good.token.here.valid' validates for wallet 'W'.
const WALLET = '7xKXtg2CW87d97TXJSDEazp8gxHvn2vP8zt4yC2i3xB';
const fakeApi = {
  _token: null,
  _wallet: null,
  setAuthSession(token, wallet) { this._token = token; this._wallet = wallet; },
  async getUserProfile(wallet) {
    if (this._token === 'good.token.here.valid' && wallet === WALLET) {
      return { wallet_address: WALLET, is_arena_eligible: 1, skr_staked_amount: 12.5 };
    }
    const err = new Error('Invalid or expired authentication session');
    err.status = 401;
    throw err;
  },
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'expo-secure-store') return fakeSecureStore;
  if (request === './api' || request.endsWith('/api')) return fakeApi;
  return originalLoad.call(this, request, parent, isMain);
};

const compiled = ts.transpileModule(fs.readFileSync(SRC, 'utf-8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
});
const mod = new Module(SRC, module);
mod.filename = SRC;
mod.paths = Module._nodeModulePaths(path.dirname(SRC));
mod._compile(compiled.outputText, SRC);

const session = mod.exports;

async function main() {
  let n = 0;
  const ok = (name) => { n += 1; console.log(`  ok - ${name}`); };

  // 1. No stored session -> disconnected, nothing crashes.
  memStore.clear();
  let st = await session.restoreSession({ getItem: fakeSecureStore.getItemAsync, setItem: fakeSecureStore.setItemAsync, deleteItem: fakeSecureStore.deleteItemAsync }, fakeApi);
  assert.strictEqual(st.connected, false, 'no session must be disconnected');
  assert.strictEqual(st.publicKey, null);
  ok('no stored session -> disconnected');

  // 2. Valid stored session + backend accepts -> restored profile.
  await session.saveSession({ getItem: fakeSecureStore.getItemAsync, setItem: fakeSecureStore.setItemAsync, deleteItem: fakeSecureStore.deleteItemAsync }, { wallet: WALLET, token: 'good.token.here.valid', displayName: 'Tester', handle: '@tester' });
  st = await session.restoreSession({ getItem: fakeSecureStore.getItemAsync, setItem: fakeSecureStore.setItemAsync, deleteItem: fakeSecureStore.deleteItemAsync }, fakeApi);
  assert.strictEqual(st.connected, true, 'valid session must restore');
  assert.strictEqual(st.publicKey, WALLET);
  assert.strictEqual(st.isArenaEligible, true);
  assert.strictEqual(st.skrStakedAmount, 12.5);
  ok('valid stored session -> same profile restored');

  // 3. Malformed stored session -> cleared + disconnected, never synthesized.
  memStore.set('counter.session.v1', '{not-json!!!');
  st = await session.restoreSession({ getItem: fakeSecureStore.getItemAsync, setItem: fakeSecureStore.setItemAsync, deleteItem: fakeSecureStore.deleteItemAsync }, fakeApi);
  assert.strictEqual(st.connected, false);
  assert.strictEqual(memStore.has('counter.session.v1'), false, 'corrupt entry must be deleted');
  memStore.set('counter.session.v1', JSON.stringify({ v: 1, wallet: 'short', token: 'bad' }));
  st = await session.restoreSession({ getItem: fakeSecureStore.getItemAsync, setItem: fakeSecureStore.setItemAsync, deleteItem: fakeSecureStore.deleteItemAsync }, fakeApi);
  assert.strictEqual(st.connected, false);
  assert.strictEqual(memStore.has('counter.session.v1'), false, 'invalid shape must be deleted');
  ok('malformed stored session -> cleared + disconnected');

  // 4. Expired/rejected backend session -> cleared + disconnected.
  await session.saveSession({ getItem: fakeSecureStore.getItemAsync, setItem: fakeSecureStore.setItemAsync, deleteItem: fakeSecureStore.deleteItemAsync }, { wallet: WALLET, token: 'stale.token.value' });
  st = await session.restoreSession({ getItem: fakeSecureStore.getItemAsync, setItem: fakeSecureStore.setItemAsync, deleteItem: fakeSecureStore.deleteItemAsync }, fakeApi);
  assert.strictEqual(st.connected, false, 'rejected token must be disconnected');
  assert.strictEqual(st.publicKey, null, 'no wallet may be synthesized');
  assert.strictEqual(memStore.has('counter.session.v1'), false, 'rejected session must be cleared');
  ok('expired/rejected backend session -> cleared + disconnected');

  // 5. Logout/disconnect clears persistence.
  await session.saveSession({ getItem: fakeSecureStore.getItemAsync, setItem: fakeSecureStore.setItemAsync, deleteItem: fakeSecureStore.deleteItemAsync }, { wallet: WALLET, token: 'good.token.here.valid' });
  await session.clearSession({ getItem: fakeSecureStore.getItemAsync, setItem: fakeSecureStore.setItemAsync, deleteItem: fakeSecureStore.deleteItemAsync });
  const loaded = await session.loadSessionRecord({ getItem: fakeSecureStore.getItemAsync, setItem: fakeSecureStore.setItemAsync, deleteItem: fakeSecureStore.deleteItemAsync });
  assert.strictEqual(loaded, null);
  ok('logout/disconnect clears persistence');

  console.log(`\nAll ${n} session persistence tests passed (real session.ts).`);
}

main().catch((err) => { console.error('SESSION TESTS FAILED:', err); process.exit(1); });
