/**
 * Deterministic source-level contract tests for power-saving wallet recovery.
 * These tests never open a wallet, sign, send, or contact the backend.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const read = (name) => fs.readFileSync(path.join(__dirname, name), 'utf8');
const wallet = read('src/wallet.ts');
const diagnostics = read('src/diagnostics.ts');
const session = read('src/session.ts');
const app = read('App.tsx');
const onboarding = read('src/components/OnboardingModal.tsx');
const help = read('src/components/ConnectionHelp.tsx');
const duel = read('src/screens/DuelDetailV1Screen.tsx');
const stake = read('src/components/BackModal.tsx');

const connectStages = [
  'CONNECT_START', 'CONNECT_STATE_SAVED', 'CONNECT_MWA_TRANSACT_START',
  'CONNECT_CALLBACK_ENTER', 'CONNECT_AUTHORIZE_START', 'CONNECT_AUTHORIZE_OK',
  'CONNECT_AUTH_PERSISTED', 'CONNECT_SIGN_IN_START', 'CONNECT_SIGN_IN_RETURN',
  'CONNECT_VERIFY_START', 'CONNECT_VERIFY_OK', 'CONNECT_PROFILE_START',
  'CONNECT_PROFILE_OK', 'CONNECT_SESSION_SAVED', 'CONNECT_COMPLETE',
  'CONNECT_RESUME_FOUND_PENDING', 'CONNECT_REASSOCIATE_START',
  'CONNECT_REAUTHORIZE_START', 'CONNECT_REAUTHORIZE_OK', 'CONNECT_RECOVERY_COMPLETE',
  'CONNECT_CANCELLED', 'CONNECT_INTERRUPTED', 'CONNECT_TIMEOUT',
  'CONNECT_AUTH_FAILED', 'CONNECT_ERROR',
];

for (const stage of connectStages) assert(diagnostics.includes(`'${stage}'`), `missing diagnostic stage ${stage}`);
assert(wallet.includes('wallet.reauthorize') || wallet.includes('walletWithReauthorize.reauthorize'), 'stored MWA auth must reauthorize');
assert(wallet.includes('auth_token'), 'reauthorization must pass opaque auth_token');
assert(wallet.includes('CONNECT_REAUTHORIZE_OK'), 'reauthorization success must be observable');
assert(wallet.includes('Wallet changed during recovery'), 'account-change protection must stop recovery');
assert(app.includes('loadPendingWalletOperation'), 'app boot/resume must load pending operation');
assert(app.includes('CONNECT_RESUME_FOUND_PENDING'), 'resume recovery marker must be emitted');
assert(app.includes('clearWalletAuthorization'), 'rejected authorization must clear stored MWA token');
assert(app.includes('setConnectionStatus(\'RESTORING\')'), 'recovery must expose restoring state');
assert(session.includes('counter.wallet.authorization.v1'), 'MWA authorization must use a separate secure record');
assert(session.includes('counter.wallet.pending.v1'), 'pending operation must use secure storage');
for (const field of ['auth_token', 'wallet_uri_base', 'chain', 'authorizedAt', 'operationId', 'operationType', 'createdAt', 'updatedAt']) {
  assert(session.includes(field), `secure record missing ${field}`);
}
assert(onboarding.includes('Opening Phantom…'), 'connect UX must name the wallet handoff');
assert(onboarding.includes('Waiting for wallet approval…'), 'connect UX must expose approval wait');
assert(onboarding.includes('Restoring your Counter account…'), 'connect UX must expose account restoration');
assert(help.includes('Connection interrupted'), 'interrupted state must be visible');
assert(help.includes('Counter can safely reconnect to your wallet.'), 'interrupted state must provide safe recovery copy');
assert(!help.includes('disable power'), 'UI must not tell users to disable power saving');
assert(!help.includes('battery-saving modes can interrupt'), 'UI must not make power-saving a user prerequisite');

// Economic operations persist a public signature and query it before any
// backend retry. There is no blind retry path after a known signature.
assert(duel.includes("persistPendingOperation('DUEL_INIT'"));
assert(duel.includes("persistPendingOperation('SETTLEMENT'"));
assert(duel.includes("persistPendingOperation(claimOperation"));
assert(duel.includes("const claimOperation: PendingWalletOperationType = canRefund ? 'REFUND' : 'CLAIM'"));
assert(duel.includes('getSignatureStatuses([signature]'), 'Duel operations must read chain status first');
assert(stake.includes("operationType: 'STAKE'"));
assert(stake.includes('getSignatureStatuses([signature]'), 'stake must read chain status first');
assert(diagnostics.includes("'REFUND'"), 'refund needs its own operation identity');

// The real secure-store harness exercises persistence across a simulated
// process boundary, including replacement MWA auth and pending signatures.
execFileSync(process.execPath, [path.join(__dirname, 'session.test.js')], { stdio: 'inherit' });

console.log('All wallet recovery contract tests passed.');
