const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const duelId = 'duel_lifecycle_test';
const walletA = 'eMMEh84r6rodPg3QNKfUX8dhi34Swd1kChsrDG54obK';
const walletB = 'PgJhWQpVfcNU5oQ5JzPbUKdL2oQquerWddW5p6MpcJs';

function baseDuel(overrides = {}) {
  return {
    id: duelId,
    challenge_id: 'challenge_lifecycle_test',
    take_id: 'take_lifecycle_test',
    captain_a_wallet: walletA,
    captain_b_wallet: walletB,
    captain_a_name: 'Captain A',
    captain_b_name: 'Captain B',
    captain_a_handle: 'captain_a',
    captain_b_handle: 'captain_b',
    captain_a_avatar: null,
    captain_b_avatar: null,
    proposition_a: 'The first captain wins',
    proposition_b: 'The second captain wins',
    topic: 'Lifecycle regression',
    take_content: '',
    category: 'CULTURE',
    source_type: null,
    source_config: null,
    side_a_total: 0,
    side_b_total: 0,
    stake_amount_usd: 10,
    chain_status: 'UNINITIALIZED',
    status: 'ACCEPTING_STAKES',
    resolution_ts: 4102444800,
    mutual_deadline_ts: 4102444800,
    winning_side: 0,
    mutualState: 'AWAITING_VOTES',
    myVoteSubmitted: false,
    otherVoteSubmitted: false,
    onchain_duel_pda: null,
    onchain_vault_pda: null,
    init_tx_signature: null,
    share_slug: 'lifecycle-test',
    created_at: '2026-10-06T00:00:00.000Z',
    ...overrides,
  };
}

const positions = (claimed = false) => [
  { user_wallet: walletA, side: 1, stake_amount: 10, claimed },
  { user_wallet: walletB, side: 2, stake_amount: 10, claimed },
];

function fixtureFor(name) {
  switch (name) {
    case 'ACCEPTED_NOT_INITIALIZED':
      return { duel: baseDuel(), positions: [], mutualVotes: [] };
    case 'EXPIRED_BEFORE_FUNDING':
      return { duel: baseDuel({ resolution_ts: 1, mutual_deadline_ts: 2 }), positions: [], mutualVotes: [] };
    case 'READY_TO_SETTLE':
      return { duel: baseDuel({ chain_status: 'INITIALIZED', side_a_total: 10, side_b_total: 10, resolution_ts: 1 }), positions: positions(), mutualVotes: [] };
    case 'CANCELLED':
      return { duel: baseDuel({ chain_status: 'INITIALIZED', status: 'CANCELLED', side_a_total: 10, side_b_total: 10, resolution_ts: 1 }), positions: positions(), mutualVotes: [] };
    case 'REFUNDED':
      return { duel: baseDuel({ chain_status: 'INITIALIZED', status: 'CANCELLED', side_a_total: 10, side_b_total: 10, resolution_ts: 1 }), positions: positions(true), mutualVotes: [] };
    case 'COMPLETED':
      return { duel: baseDuel({ chain_status: 'INITIALIZED', status: 'RESOLVED_SIDE_A', winning_side: 1, side_a_total: 10, side_b_total: 10, resolution_ts: 1 }), positions: positions(true), mutualVotes: [] };
    case 'REQUEST_ERROR':
      return { error: new Error('request_failed:503') };
    default:
      throw new Error(`Unknown lifecycle fixture: ${name}`);
  }
}

function createReactHarness() {
  let hookIndex = 0;
  let expectedHookCount = null;
  let hookValues = [];
  let effectDeps = [];
  let effectQueue = [];
  let rerenderRequested = false;

  const React = {
    Fragment: Symbol('Fragment'),
    createElement(type, props, ...children) {
      const normalizedProps = { ...(props || {}) };
      if (children.length === 1) normalizedProps.children = children[0];
      else if (children.length > 1) normalizedProps.children = children;
      if (typeof type === 'function') return type(normalizedProps);
      if (type === React.Fragment) return children;
      return { type, props: normalizedProps };
    },
    useState(initial) {
      const index = hookIndex++;
      if (!(index in hookValues)) hookValues[index] = typeof initial === 'function' ? initial() : initial;
      const setValue = (next) => {
        hookValues[index] = typeof next === 'function' ? next(hookValues[index]) : next;
        rerenderRequested = true;
      };
      return [hookValues[index], setValue];
    },
    useRef(initial) {
      const index = hookIndex++;
      if (!(index in hookValues)) hookValues[index] = { current: initial };
      return hookValues[index];
    },
    useEffect(effect, deps) {
      const index = hookIndex++;
      const previousDeps = effectDeps[index];
      const changed = !previousDeps || !deps || deps.length !== previousDeps.length || deps.some((value, i) => !Object.is(value, previousDeps[i]));
      if (changed) {
        effectDeps[index] = deps;
        effectQueue.push(effect);
      }
    },
    __beginRender() {
      hookIndex = 0;
      rerenderRequested = false;
    },
    __endRender() {
      if (expectedHookCount === null) expectedHookCount = hookIndex;
      assert.equal(hookIndex, expectedHookCount, 'same mounted Duel-detail component must keep a stable hook count');
    },
    __takeEffects() {
      const effects = effectQueue;
      effectQueue = [];
      return effects;
    },
    __needsRender() {
      return rerenderRequested;
    },
    __resetMount() {
      hookIndex = 0;
      expectedHookCount = null;
      hookValues = [];
      effectDeps = [];
      effectQueue = [];
      rerenderRequested = false;
    },
  };
  return React;
}

function installLoader(React, state) {
  const originalLoad = Module._load;
  const originalResolve = Module._resolveFilename;
  const originalTs = require.extensions['.ts'];
  const originalTsx = require.extensions['.tsx'];
  const host = (name) => name;
  const native = {
    ActivityIndicator: host('ActivityIndicator'),
    AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
    Linking: { openURL: async () => {} },
    ScrollView: host('ScrollView'),
    Share: { share: async () => {} },
    StyleSheet: { hairlineWidth: 1, create: (styles) => styles },
    Text: host('Text'),
    TouchableOpacity: host('TouchableOpacity'),
    View: host('View'),
  };
  const api = {
    PRODUCTION_WEB_URL: 'https://counter.103-195-188-198.sslip.io',
    api: {
      getDuel: async (_id, options) => {
        if (state.fixture.error) throw state.fixture.error;
        options?.onHttpResponse?.(200, true);
        return {
          ...state.fixture.duel,
          positions: state.fixture.positions,
          mutualVotes: state.fixture.mutualVotes,
        };
      },
    },
  };
  const diagnostics = {
    acceptTransitionStage: (stage, context) => state.events.push({ stage, context }),
    createWalletAttempt: () => ({ attemptId: 'lifecycle-test', duelId }),
    isWalletCancellation: () => false,
    WalletFlowError: class WalletFlowError extends Error {},
    walletStage: () => {},
  };
  const mocks = {
    react: React,
    'react-native': native,
    '@solana/web3.js': { PublicKey: class PublicKey { constructor(value) { this.value = value; } } },
    '@solana/spl-token': { getAssociatedTokenAddressSync: () => ({}) },
    'react-native-svg': { Svg: host('Svg'), Path: host('Path'), Circle: host('Circle'), Rect: host('Rect'), Polyline: host('Polyline'), Line: host('Line') },
    'expo-clipboard': { setStringAsync: async () => {} },
    'expo-linking': { openURL: async () => {} },
    '../api': api,
    '../wallet': { getConnection: () => ({ getSignatureStatuses: async () => ({ value: [null] }) }) },
    '../chain': {
      buildClaimPayoutIx: () => ({}), buildInitializeDuelIx: () => ({}), buildVaultAtaCreateIxIfNeeded: () => null,
      mwaSignMessage: async () => '', mwaSignSendConfirm: async () => '', settlementMessage: () => '',
    },
    '../diagnostics': diagnostics,
    '../utils/criteria': { formatDeadline: (ts) => (ts ? 'Oct 6, 2026' : 'No deadline shown') },
    '../utils/identity': { formatRelativeTime: () => 'now', formatUserDisplayName: (value) => value?.display_name || value?.handle || 'Counter user', formatWalletShort: (value) => value ? `${value.slice(0, 4)}…${value.slice(-4)}` : 'Unavailable', isRealSignature: () => false },
    '../utils/preflight': { formatSol: () => '0.000 SOL', hasFeeBalance: () => false, readWalletPreflight: async () => null },
    '../session': { clearPendingWalletOperation: async () => {}, loadPendingWalletOperation: async () => null, savePendingWalletOperation: async () => {} },
    '../syncCoordinator': { useSyncRefresh: (load) => load },
    '../theme': { colors: { brandPrimary: '#ff6b5f', background: '#000', surface: '#111', surfaceLight: '#222', textPrimary: '#fff', textSecondary: '#aaa', textMuted: '#777', divider: '#333', cardBorder: '#444', sideA: '#f00', sideB: '#00f', success: '#0f0' }, borderRadius: { md: 8, lg: 12, full: 999 }, spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 }, touchMin: 44, typography: { h1: {}, h2: {}, caption: {}, captionBold: {}, bodyBold: {} } },
    '../components/BackModal': { BackModal: () => null },
    '../components/Icon': { Icon: () => null },
  };
  const resolveRequest = (request, parent) => {
    try { return originalResolve(request, parent, false); } catch {}
    if (request.startsWith('.')) {
      for (const ext of ['.tsx', '.ts', '.js']) {
        try { return originalResolve(request + ext, parent, false); } catch {}
      }
    }
    return null;
  };
  Module._load = function(request, parent, isMain) {
    if (mocks[request]) return mocks[request];
    return originalLoad(request, parent, isMain);
  };
  const compile = (module, filename) => {
    const source = fs.readFileSync(filename, 'utf8');
    const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true, allowSyntheticDefaultImports: true } });
    module._compile(output.outputText, filename);
  };
  require.extensions['.ts'] = compile;
  require.extensions['.tsx'] = compile;
  return () => {
    Module._load = originalLoad;
    require.extensions['.ts'] = originalTs;
    require.extensions['.tsx'] = originalTsx;
  };
}

function collectText(node, result = []) {
  if (node == null) return result;
  if (typeof node === 'string' || typeof node === 'number') { result.push(String(node)); return result; }
  if (Array.isArray(node)) { node.forEach((child) => collectText(child, result)); return result; }
  if (node.props) collectText(node.props.children, result);
  return result;
}

async function settleMountedComponent(React, Component, state) {
  React.__resetMount();
  const props = { duelId, userWallet: walletA, onBack: () => {}, onViewReceipt: () => {}, onDataError: () => { state.dataError = true; } };
  let tree;
  const render = () => {
    React.__beginRender();
    tree = Component(props);
    React.__endRender();
  };
  render();
  for (let round = 0; round < 24; round += 1) {
    const effects = React.__takeEffects();
    for (const effect of effects) await effect();
    await new Promise((resolve) => setImmediate(resolve));
    if (React.__needsRender()) {
      render();
      continue;
    }
    if (!React.__takeEffects().length) break;
  }
  return collectText(tree);
}

async function main() {
  const React = createReactHarness();
  const state = { fixture: null, events: [], dataError: false };
  const restore = installLoader(React, state);
  try {
    const { DuelDetailV1Screen } = require(path.join(__dirname, 'src', 'screens', 'DuelDetailV1Screen.tsx'));
    const cases = ['ACCEPTED_NOT_INITIALIZED', 'EXPIRED_BEFORE_FUNDING', 'READY_TO_SETTLE', 'CANCELLED', 'REFUNDED', 'COMPLETED', 'REQUEST_ERROR'];
    const results = [];
    for (const name of cases) {
      state.fixture = fixtureFor(name);
      state.events = [];
      state.dataError = false;
      const text = await settleMountedComponent(React, DuelDetailV1Screen, state);
      const stages = state.events.map((event) => event.stage);
      assert.ok(stages.includes('DUEL_DETAIL_MOUNT'), `${name}: mount marker missing`);
      assert.ok(!stages.includes('DUEL_DETAIL_BOUNDARY_RENDER_THROW'), `${name}: render boundary threw`);
      assert.ok(!stages.includes('DUEL_DETAIL_RENDER_FAILED'), `${name}: render failed`);
      if (name === 'REQUEST_ERROR') {
        assert.ok(state.dataError, 'request error must remain a controlled data-error path');
        assert.ok(stages.includes('DUEL_DETAIL_DATA_ERROR'), 'request error marker missing');
      } else {
        assert.ok(stages.includes('DUEL_DETAIL_STATE_MAPPED'), `${name}: state mapping marker missing`);
        assert.ok(stages.includes('DUEL_DETAIL_RENDER_READY'), `${name}: render-ready marker missing`);
      }
      if (name === 'EXPIRED_BEFORE_FUNDING') {
        assert.ok(text.includes('Duel expired before funding'), 'expired terminal copy missing');
        assert.ok(stages.includes('DUEL_DETAIL_STATE_MAPPED'), 'expired state mapping missing');
      }
      results.push(`${name}: PASS`);
    }
    console.log(`Duel-detail mounted lifecycle regression: PASS (${results.join(', ')})`);
  } finally {
    restore();
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
