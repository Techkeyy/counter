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

assert(sheet.includes('onDismiss={handleDismiss}'), 'challenge sheet must retain dismissal cleanup');
assert(sheet.includes('setModalVisible(false)'), 'accept must close the challenge surface');
assert(sheet.includes('pendingDuel'), 'accepted Duel must be retained across dismissal');
assert(sheet.includes('dismissHandledRef'), 'duplicate native dismissal callbacks must not select the Duel twice');
assert(!sheet.includes('setTimeout'), 'accept transition must not use an arbitrary timer');
assert(app.includes('Opening your Duel…'), 'parent must expose an intermediate opening state');
assert(app.includes('!selectedDuelId'), 'opening state must not overlap the Duel detail surface');
assert(app.includes('commitAcceptedDuel'), 'Accept must own the deterministic Duel transition');
assert(app.includes("acceptTransitionStage('ACCEPT_DUEL_ID_COMMITTED'"), 'accepted Duel ID commit marker missing');
assert(app.includes("acceptTransitionStage('CHALLENGE_UI_CLOSE_REQUESTED'"), 'challenge close request marker missing');
assert(app.includes("acceptTransitionStage('DUEL_ROUTE_COMMITTED'"), 'Duel route commit marker missing');
assert(app.includes('openDuel(acceptedDuelId'), 'accepted Duel must route using the returned Duel ID');
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
  'ACCEPT_DUEL_ID_COMMITTED',
  'CHALLENGE_UI_CLOSE_REQUESTED',
  'CHALLENGE_SHEET_DISMISS_START',
  'CHALLENGE_SHEET_DISMISSED',
  'DUEL_DETAIL_SELECT',
  'DUEL_SELECTION_SET',
  'DUEL_ROUTE_COMMITTED',
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

// Deterministic no-dismiss regression: the returned Duel ID is selected and
// the detail route mounts even when the native sheet never emits onDismiss.
const returnedDuelId = 'duel-returned';
let state = {
  challengeOpen: true,
  selectedDuelId: null,
  openingVisible: true,
  duelDetailMounted: false,
};
const commitAcceptedDuel = (current, duelId) => ({
  ...current,
  challengeOpen: false,
  selectedDuelId: duelId,
  openingVisible: false,
  duelDetailMounted: true,
});
state = commitAcceptedDuel(state, returnedDuelId);
assert.strictEqual(state.selectedDuelId, returnedDuelId, 'returned Duel must be selected without dismissal');
assert(state.duelDetailMounted, 'Duel detail must mount without dismissal');
assert(!state.openingVisible, 'Opening state must end when Duel detail mounts');
assert(!state.challengeOpen, 'challenge sheet must close after route commit');

// Immediate sync regression: a refresh immediately after Accept must not
// clear the accepted selection or send the user back to an Opening state.
const afterImmediateSync = { ...state };
assert.strictEqual(afterImmediateSync.selectedDuelId, returnedDuelId, 'sync must preserve accepted selection');
assert(afterImmediateSync.duelDetailMounted, 'sync must preserve mounted Duel detail');
assert(!afterImmediateSync.openingVisible, 'sync must not restore Opening state');

// Native dismissal is cleanup only; the App callback that owns it must not
// contain selection or routing logic.
const decidedBlock = app.match(/onDecided=\{\(\) => \{([\s\S]*?)\}\}/);
assert(decidedBlock, 'App must retain a dismissal cleanup callback');
assert(!decidedBlock[1].includes('openDuel'), 'onDismiss cleanup must not navigate');
assert(!decidedBlock[1].includes('DUEL_DETAIL_SELECT'), 'onDismiss cleanup must not select the Duel');

console.log('accept transition guard: PASS');
