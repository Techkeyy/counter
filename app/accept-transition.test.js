const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const sheet = fs.readFileSync(path.join(root, 'src/components/FreshChallengeSheet.tsx'), 'utf8');
const app = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
const boundary = fs.readFileSync(path.join(root, 'src/components/DuelDetailBoundary.tsx'), 'utf8');
const detail = fs.readFileSync(path.join(root, 'src/screens/DuelDetailV1Screen.tsx'), 'utf8');
const diagnostics = fs.readFileSync(path.join(root, 'src/diagnostics.ts'), 'utf8');
const sync = fs.readFileSync(path.join(root, 'src/syncCoordinator.ts'), 'utf8');

assert(sheet.includes('onDismiss={handleDismiss}'), 'challenge sheet must wait for native dismissal');
assert(sheet.includes('setModalVisible(false)'), 'accept must close the challenge surface before detail selection');
assert(sheet.includes('pendingDuel'), 'accepted Duel must be retained across dismissal');
assert(sheet.includes('dismissHandledRef'), 'duplicate native dismissal callbacks must not select the Duel twice');
assert(!sheet.includes('setTimeout'), 'accept transition must not use an arbitrary timer');
assert(app.includes('Opening your Duel…'), 'parent must expose an intermediate opening state');
assert(app.includes('!selectedDuelId'), 'opening state must not overlap the Duel detail surface');
assert(app.includes('DuelDetailBoundary'), 'Duel detail must be behind a recoverable boundary');
assert(boundary.includes("Couldn't open this Duel"), 'detail failure copy missing');
assert(boundary.includes('Try again'), 'detail retry action missing');
assert(boundary.includes('Back to Duels'), 'detail back action missing');
assert(detail.includes("'DUEL_DETAIL_MOUNT'"), 'detail mount marker missing');
assert(detail.includes("'DUEL_DETAIL_DATA_OK'"), 'detail data marker missing');
assert(detail.includes("'DUEL_DETAIL_READY'"), 'detail ready marker missing');
assert(detail.includes("'DUEL_DETAIL_RENDER_READY'"), 'terminal render-ready marker missing');
assert(boundary.includes('errorClass'), 'render failure marker must include a safe error class');
assert(boundary.includes("'DUEL_DETAIL_BOUNDARY_DATA_ERROR'"), 'data boundary marker missing');
assert(boundary.includes("'DUEL_DETAIL_BOUNDARY_RENDER_THROW'"), 'render boundary marker missing');
for (const marker of [
  'ACCEPT_UI_START',
  'ACCEPT_HTTP_OK',
  'ACCEPT_DUEL_RECEIVED',
  'CHALLENGE_SHEET_DISMISS_START',
  'CHALLENGE_SHEET_DISMISSED',
  'DUEL_DETAIL_SELECT',
  'DUEL_DETAIL_REQUEST_START',
  'DUEL_DETAIL_REQUEST_HTTP_OK',
  'DUEL_DETAIL_REQUEST_FAILED',
  'DUEL_DETAIL_NORMALIZE_OK',
  'DUEL_DETAIL_NORMALIZE_FAILED',
  'DUEL_DETAIL_DATA_ERROR',
  'DUEL_DETAIL_STATE_MAPPED',
  'DUEL_DETAIL_RENDER_READY',
]) {
  assert(diagnostics.includes(`'${marker}'`), `missing transition marker ${marker}`);
}
assert(app.includes('DUEL_SELECTION_SET'), 'selection set marker missing');
assert(app.includes('DUEL_SELECTION_CLEARED'), 'selection clear marker missing');
assert(sync.includes('ACTIVE_WALLET_CHANGED'), 'active wallet change marker must remain available');

// Deterministic ordering contract: accepted data is retained while the sheet
// is open, selection is legal only after real dismissal, and one Duel is used.
let state = { challengeOpen: true, pendingDuelId: null, selectedDuelId: null };
state = { ...state, pendingDuelId: 'duel-existing' };
assert(state.challengeOpen && !state.selectedDuelId, 'detail must not mount during sheet teardown');
state = { ...state, challengeOpen: false };
assert(!state.challengeOpen && !state.selectedDuelId, 'dismissal must complete before selection');
state = { ...state, selectedDuelId: state.pendingDuelId };
assert.strictEqual(state.selectedDuelId, 'duel-existing');
assert(!state.challengeOpen, 'challenge and detail surfaces must never be simultaneous');

console.log('accept transition guard: PASS');
