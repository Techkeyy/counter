const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (relativePath) => fs.readFileSync(path.join(__dirname, relativePath), 'utf8');
const chain = read('src/chain.ts');
const diagnostics = read('src/diagnostics.ts');
const duelDetail = read('src/screens/DuelDetailV1Screen.tsx');
const app = read('App.tsx');
const protocolNative = read('node_modules/@solana-mobile/mobile-wallet-adapter-protocol/lib/cjs/index.native.js');
const protocolAndroid = read('node_modules/@solana-mobile/mobile-wallet-adapter-protocol/android/src/main/java/com/solanamobile/mobilewalletadapter/reactnative/SolanaMobileWalletAdapterModule.kt');

const requiredMarkers = [
  'MWA_TRANSACT_START',
  'MWA_CALLBACK_ENTER',
  'MWA_AUTHORIZE_START',
  'MWA_AUTHORIZE_OK',
  'MWA_SIGN_SEND_START',
  'MWA_SIGN_SEND_RETURN',
  'MWA_TRANSACT_RETURN',
  'TX_SIGNATURE_PARSED',
  'TX_CONFIRM_START',
  'TX_CONFIRMED',
  'BACKEND_VERIFY_START',
  'BACKEND_VERIFY_OK',
  'UI_SUCCESS',
  'MWA_CANCELLED',
  'MWA_ERROR',
  'MWA_TIMEOUT',
  'TX_CONFIRM_FAILED',
  'BACKEND_VERIFY_FAILED',
];

for (const marker of requiredMarkers) {
  assert.match(diagnostics, new RegExp(`'${marker}'`), `missing diagnostic marker ${marker}`);
}

const boundaryOrder = [
  'MWA_TRANSACT_START',
  'MWA_CALLBACK_ENTER',
  'MWA_AUTHORIZE_START',
  'MWA_AUTHORIZE_OK',
  'MWA_SIGN_SEND_START',
  'MWA_SIGN_SEND_RETURN',
  'MWA_TRANSACT_RETURN',
  'TX_SIGNATURE_PARSED',
  'TX_CONFIRM_START',
  'TX_CONFIRMED',
];
let previous = -1;
for (const marker of boundaryOrder) {
  const position = chain.indexOf(`'${marker}'`);
  assert(position > previous, `MWA marker order is not monotonic at ${marker}`);
  previous = position;
}

assert.match(chain, /getLatestBlockhashAndContext\('confirmed'\)/);
assert.match(chain, /chain: 'solana:devnet'/);
assert.match(chain, /minContextSlot/);
assert.match(chain, /handoffSignatures/);
assert.match(chain, /WalletFlowError/);
assert.doesNotMatch(chain, /cluster:\s*'devnet'/);

assert.match(duelDetail, /walletStage\(attempt, 'CHAIN_ACCOUNTS_OK'\)/);
assert.match(duelDetail, /Couldn't get the transaction from your wallet\./);
assert.match(duelDetail, /Your wallet approved, but the transaction wasn't submitted\./);
assert.match(duelDetail, /Transaction submitted but not confirmed yet\./);
assert.match(duelDetail, /accessibilityLabel=\{pendingSignature \? 'Check status' : 'Set up this Duel'\}/);

const confirmedPosition = duelDetail.indexOf("walletStage(attempt, 'TX_CONFIRMED')");
const backendStartPosition = duelDetail.indexOf("walletStage(attempt, 'BACKEND_VERIFY_START')", confirmedPosition);
const initRequestPosition = duelDetail.indexOf('await api.initOnChainDuel', backendStartPosition);
assert(confirmedPosition >= 0, 'status recovery must record confirmation');
assert(backendStartPosition > confirmedPosition, 'backend verification must follow confirmed transaction');
assert(initRequestPosition > backendStartPosition, 'init-onchain must follow backend verification marker');

assert.match(app, /AppState\.addEventListener\('change'/);
assert.match(app, /lifecycleStage\('APP_BACKGROUND'\)/);
assert.match(app, /lifecycleStage\('APP_RESUME'\)/);

// The installed library owns the timeout boundary; the app must not invent a
// second timer around transact(). These checks pin the versioned behavior used
// by the source audit: callback result propagation plus native 10s/90s bounds.
assert.match(protocolNative, /return await callback\(createMobileWalletProxy/);
assert.match(protocolNative, /if \(didSuccessfullyConnect\) await SolanaMobileWalletAdapter\.endSession\(\)/);
assert.match(protocolAndroid, /ASSOCIATION_TIMEOUT_MS = 10000/);
assert.match(protocolAndroid, /CLIENT_TIMEOUT_MS = 90000/);
assert.match(protocolAndroid, /override fun onActivityResult/);

console.log('MWA handoff source-contract checks: PASS');
