/* Deterministic source contract checks for the final reliability pass. */
const fs = require('fs');
const path = require('path');

const root = __dirname;
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(`[ASSERTION FAILED] ${message}`);
};

const api = read('src/api.ts');
const composer = read('src/screens/FreshCreateTakeScreen.tsx');
const app = read('App.tsx');
const coordinator = read('src/syncCoordinator.ts');
const keepalive = read('src/walletKeepalive.ts');
const diagnostics = read('src/diagnostics.ts');
const wallet = read('src/wallet.ts');
const chain = read('src/chain.ts');
const manifest = read('android/app/src/main/AndroidManifest.xml');
const service = read('android/app/src/main/java/app/counter/mobile/WalletKeepaliveService.kt');

assert(api.includes("'X-Counter-Attempt-Id'"), 'Take POST carries an attempt id header');
assert(api.includes('getTakeByAttempt'), 'client has authoritative post-attempt readback');
assert(api.includes("cache: 'no-store'"), 'client disables cached API reads');
assert(composer.includes('Posting…'), 'composer exposes a posting state');
assert(composer.includes('Your text is still here'), 'ambiguous Take responses retain the draft');
assert(composer.includes('getTakeByAttempt'), 'composer reads back an ambiguous attempt before retry');
assert(app.includes('invalidateUserScopedState'), 'wallet change invalidates user-scoped surfaces');
assert(app.includes('syncCoordinator.setForeground'), 'AppState controls one foreground sync coordinator');
assert(app.includes('createdTake'), 'successful Take response is merged into Home immediately');
assert(coordinator.includes("'ACTIVE_WALLET_CHANGED'"), 'coordinator has an authoritative wallet-change event');
assert(coordinator.includes('4000'), 'foreground coordinator cadence is four seconds');
assert(coordinator.includes('APP_RESUME'), 'resume triggers an immediate sync');
assert(keepalive.includes('CounterWalletKeepalive'), 'JS keepalive wrapper uses the native module');
assert(wallet.includes("startWalletKeepalive('CONNECT'"), 'connect starts the native keepalive');
assert(chain.includes('startWalletKeepalive(attempt.operation'), 'economic wallet actions start the native keepalive');
assert(chain.includes('stopWalletKeepalive(attempt.attemptId)'), 'economic wallet actions stop it deterministically');
assert(diagnostics.includes('KEEPALIVE_UNAVAILABLE'), 'native keepalive failure is diagnostic, not a secret-bearing crash');
assert(manifest.includes('FOREGROUND_SERVICE_DATA_SYNC'), 'Android declares the data-sync foreground service permission');
assert(manifest.includes('WAKE_LOCK'), 'Android declares the bounded wake-lock permission');
assert(manifest.includes('WalletKeepaliveService'), 'Android registers the keepalive service');
assert(service.includes('MAX_WINDOW_MS = 90_000L'), 'native keepalive has a bounded ninety-second window');
assert(service.includes('stopForeground(STOP_FOREGROUND_REMOVE)'), 'native keepalive removes its notification on stop');
assert(!/disable (power|battery)|battery optimization/i.test(`${composer}\n${app}\n${service}`), 'new reliability UX does not instruct power-setting changes');

console.log('App reliability contract: PASS (attempt readback, cross-surface sync, wallet invalidation, and native keepalive)');
