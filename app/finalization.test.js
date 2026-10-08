/* Finalization guardrails: source-level checks for receipt routing, SKR access,
 * Android branding resources, and preservation of economic boundaries. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const app = read('App.tsx');
const receipt = read('src/screens/FreshReceiptScreen.tsx');
const receiptUtil = read('src/utils/receipt.ts');
const arena = read('src/components/SkrArenaEntry.tsx');
const duelDetail = read('src/screens/DuelDetailV1Screen.tsx');
const serverSkr = read('../server/skr.js');
const duelRoute = read('../server/routes/duels.js');
const manifest = read('android/app/src/main/AndroidManifest.xml');

assert(app.includes('const openReceipt = useCallback'), 'App has one canonical receipt opener');
assert(app.includes('const receipt = await api.getReceipt(receiptId)'), 'canonical route re-reads detailed receipt data');
assert(app.includes("notif.target_type === 'RECEIPT'"), 'Activity receipt notifications use canonical route');
assert(app.includes('void openReceipt(receipt)'), 'Profile receipt rows use canonical route');
assert(app.includes('void openReceipt(receiptId)'), 'Duel detail receipt actions use canonical route');
assert(app.includes("parsed.path?.startsWith('receipt/')"), 'counter://receipt/:id remains supported');
assert(app.includes("parts[0] === 'r'"), 'HTTPS /r/:id remains supported');
assert(!app.includes("selectDuel(receiptId.replace('receipt_', '')"), 'receipt action no longer routes through Duel selection');

assert(receipt.includes('No agreement. Both stakes are being returned.'), 'pending refund copy is explicit');
assert(receipt.includes('No agreement. Both stakes were returned.'), 'completed refund copy is explicit');
assert(receipt.includes('Refunded / recorded'), 'completed refund badge is explicit');
assert(receipt.includes('Claimed / recorded'), 'winner receipt keeps claimed semantics');
assert(receiptUtil.includes('formatReceiptParticipant'), 'receipt identity helper exists');
assert(receiptUtil.includes('formatWalletShort'), 'receipt identity falls back to shortened wallet');
assert(!receipt.includes("'Counter user'"), 'receipt surface does not hardcode generic participant identity');

assert(arena.includes("api.getDuels({ isArena: true })"), 'qualified Arena reads the real filtered Duel feed');
assert(arena.includes('Active SKR staking on Solana Mainnet'), 'unqualified Arena explains the authoritative prerequisite');
assert(arena.includes('SKR verified'), 'qualified Arena state is visible');
assert(arena.includes('never changes stake, payout, settlement, or claim behavior'), 'Arena component documents economic isolation');
assert(serverSkr.includes('SKR_PROGRAM_ID'), 'server uses the official SKR staking program');
assert(serverSkr.includes('isStakeEligible'), 'server has an explicit qualification predicate');
assert(duelRoute.includes('AND d.is_arena = 1'), 'Arena is a discovery filter only');
assert(!arena.includes('claimDuel') && !arena.includes('resolveDuel') && !arena.includes('proposeChallenge'), 'Arena surface cannot invoke economic mutations');

assert(manifest.includes('android:icon="@mipmap/ic_launcher"'), 'manifest uses branded launcher resource');
assert(manifest.includes('android:roundIcon="@mipmap/ic_launcher_round"'), 'manifest uses branded round launcher resource');
for (const relative of [
  'android/app/src/main/res/drawable/ic_launcher_foreground.xml',
  'android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml',
  'android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml',
  'android/app/src/main/res/mipmap-anydpi-v21/ic_launcher.xml',
  'android/app/src/main/res/mipmap-anydpi-v21/ic_launcher_round.xml',
]) assert(fs.existsSync(path.join(root, relative)), `launcher resource exists: ${relative}`);

assert(duelDetail.includes('staleVoteMessage'), 'terminal stale vote banner is classified');
assert(duelDetail.includes('!staleVoteMessage'), 'terminal stale vote banner is suppressed');

console.log('finalization guardrails passed');
