/* Source-level guardrails for the approved V1 experience rebase.
 * This deliberately checks the reachable App import graph and the client
 * contract; it does not pretend to be a native-device or APK test.
 */
const fs = require('fs');
const path = require('path');

const root = __dirname;
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(`[ASSERTION FAILED] ${message}`);
};
const includes = (source, text, message) => assert(source.includes(text), message);
const excludes = (source, text, message) => assert(!source.includes(text), message);

const app = read('App.tsx');
const feed = read('src/screens/FreshFeedScreen.tsx');
const profile = read('src/screens/FreshProfileScreen.tsx');
const counterUi = read('src/components/CounterUI.tsx');
const theme = read('src/theme.ts');
const activity = read('src/screens/FreshActivityScreen.tsx');
const faucet = fs.readFileSync(path.join(root, '..', 'server/routes/faucet.js'), 'utf8');
const modal = read('src/components/FreshChallengeModal.tsx');
const sheet = read('src/components/FreshChallengeSheet.tsx');
const stake = read('src/components/BackModal.tsx');
const duels = read('src/screens/FreshDuelsScreen.tsx');
const stateMachine = read('src/utils/duelState.js');
const detail = read('src/screens/DuelDetailV1Screen.tsx');
const receipt = read('src/screens/FreshReceiptScreen.tsx');
const api = read('src/api.ts');
const chain = read('src/chain.ts');
const diagnostics = read('src/diagnostics.ts');

includes(app, "FreshChallengeModal", 'App reaches the reconstructed challenge composer');
includes(app, "FreshChallengeSheet", 'App reaches the reconstructed incoming challenge sheet');
includes(app, "setCurrentTab('DUELS')", 'successful Challenge routes to Duels');
includes(app, 'setCreatedChallenge(created)', 'returned Challenge is retained locally');
includes(app, 'setTabFocus((n) => n + 1)', 'successful Challenge triggers the Duels refresh/focus mechanism');
includes(app, 'duelsActionableCount', 'Duels exposes an actionable lifecycle count');
includes(app, 'activityActionableCount', 'Activity exposes an actionable lifecycle count');
includes(app, 'hasVisibleTakes && currentTab === \'HOME\'', 'Home FAB is only reachable when the feed has visible Takes');
includes(feed, "useState<CategoryFilter>('ALL')", 'fresh Home selects All categories by default');
includes(feed, 'onHasVisibleTakesChange', 'Home reports whether the current feed has visible Takes');
includes(feed, 'filterList', 'Home category controls use a compact horizontal strip');
includes(feed, 'numberOfLines={1}', 'Home category labels stay on one line');
includes(feed, 'placeholderColor={colors.brandPrimary}', 'Home placeholder mark uses the coral brand accent');
assert((feed.match(/action="Post a Take"/g) || []).length === 1, 'empty Home exposes one create-Take CTA');
excludes(feed, 'eyebrow="social predictions"', 'Home does not use a redundant eyebrow');
excludes(duels, 'money between people', 'Duels does not use the redundant money eyebrow');
excludes(profile, 'YOUR MONEY', 'Profile uses human balance copy');
includes(profile, "title={isOwn ? 'Profile' : displayName}", 'own Profile header does not duplicate the display name');
excludes(activity, 'Devnet cUSD Airdropped', 'Activity does not expose stale faucet title copy');
excludes(activity, 'betting', 'Activity does not expose betting copy');
excludes(faucet, 'betting', 'future faucet Activity copy does not mention betting');
includes(counterUi, 'emptyMarkText}>—', 'empty states use the simple conversation dash mark');
excludes(counterUi, 'borderRadius: 28', 'empty states do not wrap the dash in a generic circle');
includes(theme, "textMuted: '#9295A6'", 'muted text contrast is raised for Samsung readability');
for (const screen of [feed, duels, activity, profile, read('src/screens/FreshTakeDetailScreen.tsx'), detail, read('src/screens/FreshReceiptScreen.tsx')]) {
  includes(screen, 'paddingBottom: 112', 'scroll surfaces leave room for bottom navigation and safe area');
}

for (const [name, source] of [['FreshChallengeModal', modal], ['FreshChallengeSheet', sheet]]) {
  excludes(source, 'mwaSign', `${name} does not open the wallet during challenge review/accept`);
  excludes(source, 'transact', `${name} does not invoke MWA during challenge review/accept`);
}
includes(modal, 'decisionTs', 'composer sends only the user-facing decision time');
includes(modal, "resolutionMode: 'MUTUAL'", 'composer fixes the V1 settlement mode');
includes(modal, "fallbackMode: 'REFUND'", 'composer fixes the V1 refund fallback');
excludes(modal, 'cutoffTs', 'composer cannot submit a cutoff override');
excludes(modal, 'mutualDeadlineTs', 'composer cannot submit a mutual deadline override');
includes(modal, 'Settle together', 'composer explains the mutual settlement');
includes(modal, "Different choices return both stakes", 'composer explains the refund outcome');
for (const [minutes, label] of [[15, '15m'], [30, '30m'], [60, '1h'], [180, '3h'], [1440, '24h']]) {
  includes(modal, `{ minutes: ${minutes}, label: '${label}' }`, `Challenge Terms exposes the ${label} option`);
}
includes(modal, 'finalMinutes * 60', 'selected duration becomes the requested resolution time');
excludes(modal, 'Ready to settlement', 'active challenge composer has no broken settlement copy');

for (const label of ['Incoming', 'Sent', 'Active', 'Claimable', 'Completed']) {
  includes(duels, label, `Duels home contains ${label} state/tab`);
}
for (const label of ['Waiting for response', 'Set up this Duel', 'Waiting for setup', 'Ready to stake', 'Funding in progress', 'Duel live', 'Ready to settle', 'Make refund available', 'Duel expired before funding', 'This Duel reached its decision time before both stakes were locked.', 'No winner can be chosen.']) {
  includes(duels + detail + stateMachine, label, `V1 lifecycle contains ${label}`);
}
includes(sheet, 'challenged your Take', 'incoming challenge copy identifies the Take');
includes(sheet, 'You said', 'incoming challenge shows the creator proposition');
includes(sheet, 'challenge.proposition_b', 'incoming challenge shows the challenger proposition');
includes(sheet, 'Accept challenge', 'incoming challenge exposes the authenticated accept action');
includes(sheet, 'Counter', 'incoming challenge exposes the counter path');
includes(sheet, 'Decline', 'incoming challenge exposes the decline path');

includes(detail, 'Ready to Duel', 'Duel setup has the pre-wallet boundary');
includes(stateMachine, 'EXPIRED_BEFORE_FUNDING', 'expired uninitialized Duels have a distinct terminal-pre-funding state');
includes(detail, 'hasPrincipal', 'expired partial-funding states retain only the authoritative refund path');
includes(detail, 'Waiting for wallet approval…', 'Duel actions have the wallet waiting boundary');
includes(detail, 'Set up this Duel', 'Duel setup exposes the first on-chain action');
includes(detail, 'Duel ready', 'Duel setup has a success state');
includes(detail, 'Who won?', 'settlement asks for the real-world result');
includes(detail, 'Both captains independently confirm the winner.', 'settlement explains mutual agreement');
includes(detail, 'Claim', 'claim action uses V1 copy');
includes(detail, 'The other captain has been notified.', 'settlement exposes the first-vote state');
includes(detail, 'submitted their result', 'settlement exposes the opponent-first-vote state');
includes(duels, 'otherVoteSubmitted', 'Duels lifecycle consumes private vote presence without exposing the choice');
includes(duels, 'onActionableCountChange', 'Duels reports actionable lifecycle count');
includes(activity, 'READY_TO_SETTLE', 'Activity recognizes derived ready-to-settle lifecycle items');
includes(activity, 'OPPONENT_SUBMITTED_RESULT', 'Activity recognizes opponent-result lifecycle items');
includes(activity, 'REFUND_READY', 'Activity recognizes refund lifecycle items');
excludes(detail, 'Counter Verified', 'reachable Duel detail does not expose deferred resolver UI');
excludes(detail, 'Seeker Arena', 'reachable Duel detail does not expose deferred Arena UI');
excludes(receipt, 'Counter Verified', 'reachable receipt does not expose deferred resolver UI');
includes(stake, 'Ready to stake', 'stake action has the pre-wallet boundary');
includes(stake, 'Waiting for wallet approval…', 'stake action has the wallet waiting boundary');
includes(stake, 'Submitting your stake…', 'stake action has the backend submission boundary');
includes(stake, 'Stake confirmed', 'stake action has a success state');
includes(detail, 'Recording your result…', 'settlement action has the backend submission boundary');

const proposeBlock = api.slice(api.indexOf('proposeChallenge:'), api.indexOf('createCounteroffer:'));
includes(proposeBlock, 'decisionTs: number', 'API type requires decisionTs');
excludes(proposeBlock, 'cutoffTs', 'API proposal type rejects cutoffTs');
excludes(proposeBlock, 'resolutionTs', 'API proposal type rejects resolutionTs');
excludes(proposeBlock, 'mutualDeadlineTs', 'API proposal type rejects mutualDeadlineTs');
const counterBlock = api.slice(api.indexOf('createCounteroffer:'), api.indexOf('// Duels & Arena'));
excludes(counterBlock, 'cutoffTs?:', 'API counteroffer type rejects cutoffTs');
excludes(counterBlock, 'resolutionTs?:', 'API counteroffer type rejects resolutionTs');

for (const marker of ['START', 'MWA_OPEN', 'MWA_APPROVED', 'MWA_CANCELLED', 'TX_SUBMITTED', 'TX_CONFIRMED', 'BACKEND_VERIFY_START', 'BACKEND_VERIFY_OK', 'BACKEND_VERIFY_FAILED', 'UI_SUCCESS']) {
  includes(diagnostics, marker, `diagnostic marker ${marker} is defined`);
}
for (const operation of ['DUEL_INIT', 'STAKE', 'SETTLEMENT', 'CLAIM']) {
  includes(chain + detail + stake, operation, `wallet diagnostics cover ${operation}`);
}

// The old dashboard shell is intentionally no longer reachable from App.
for (const legacy of ['./src/screens/FeedScreen', './src/screens/DuelsScreen', './src/screens/ActivityScreen', './src/screens/ProfileScreen', './src/screens/TakeDetailScreen', './src/components/ChallengeModalV1', './src/components/ChallengeSheetV1', './src/screens/ReceiptScreen']) {
  excludes(app, legacy, `${legacy} is not imported by the active graph`);
}
const activeSurface = [app, modal, sheet, duels, activity, receipt, read('src/screens/FreshFeedScreen.tsx'), read('src/screens/FreshProfileScreen.tsx')].join('\n');
for (const forbidden of ['odds', 'probability', 'Side A', 'Side B', 'Counter Verified']) {
  excludes(activeSurface, forbidden, `active V1 surfaces do not expose ${forbidden}`);
}
excludes(activeSurface, 'Ready to settlement', 'active reconstructed surfaces use the grammatical Ready to settle copy');
includes(activeSurface, 'Get test funds', 'profile provides the direct test-funds action');
includes(detail, 'Get SOL', 'Duel preflight provides the direct SOL action');
includes(detail, 'hasFeeBalance', 'Duel action is blocked before wallet handoff when fees are insufficient');
includes(activeSurface, 'Settle together', 'the new product language explains mutual settlement');
includes(app, "setCurrentTab('DUELS')", 'Duel overlays keep Duels active in bottom navigation');

console.log('V1 experience rebase source guardrails passed');
