/* Arena and resolution-roadmap guardrails. These are source-level contracts
 * for the native shell; economic behavior remains covered by the existing
 * lifecycle and resolution suites. */
const fs = require('fs');
const path = require('path');

const read = (name) => fs.readFileSync(path.join(__dirname, name), 'utf8');
const app = read('App.tsx');
const arena = read('src/components/SkrArenaEntry.tsx');
const composer = read('src/components/FreshChallengeModal.tsx');
const skr = fs.readFileSync(path.join(__dirname, '..', 'server', 'skr.js'), 'utf8');

const assert = (condition, message) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
};

assert(app.includes("type Tab = 'HOME' | 'DUELS' | 'ARENA' | 'ACTIVITY' | 'PROFILE'"), 'Arena is a first-class bottom-navigation tab');
assert(app.includes("{ key: 'ARENA', label: 'Arena', icon: 'sparkles' }"), 'Arena uses a compact existing icon');
assert(app.includes("currentTab === 'ARENA'"), 'Arena has its own mounted tab pane');
assert(!app.match(/currentTab === 'DUELS'[\s\S]{0,500}SkrArenaEntry/), 'Arena is not embedded above the Duels list');
assert(app.includes('setWalletState(DISCONNECTED);'), 'wallet-scoped state is cleared before a new account paints');

assert(arena.includes('connected: boolean'), 'Arena distinguishes disconnected from unqualified');
assert(arena.includes('Connect your wallet to check SKR access.'), 'Arena exposes the disconnected prerequisite');
assert(arena.includes('Active SKR staking on Solana Mainnet unlocks the Arena.'), 'Arena explains the mainnet qualification boundary');
assert(arena.includes("api.getDuels({ isArena: true })"), 'qualified Arena reads only the curated Duel feed');
assert(arena.includes('never changes stake, payout, settlement'), 'Arena documents economic isolation');
assert(!arena.includes('claimDuel') && !arena.includes('resolveDuel') && !arena.includes('publishArena'), 'Arena cannot invoke economic mutations');

assert(composer.includes('Settle Together'), 'live composer labels the functional resolution option');
assert(composer.includes('LIVE'), 'live resolution option is visibly marked LIVE');
assert(composer.includes('Counter Verified'), 'composer shows the roadmap resolution option');
assert(composer.includes('COMING SOON'), 'roadmap resolution option is visibly marked COMING SOON');
assert(composer.includes('accessibilityState={{ disabled: true }}'), 'roadmap resolution option is non-interactive');
assert(composer.includes("resolutionMode: 'MUTUAL'"), 'challenge payload remains MUTUAL');
assert(composer.includes("fallbackMode: 'REFUND'"), 'challenge payload remains REFUND fallback');

assert(skr.includes("const SKR_NETWORK = 'mainnet-beta'"), 'SKR eligibility is explicitly mainnet');
for (const address of [
  'SKRskrmtL83pcL4YqLWt6iPefDqwXQWHSw9S9vz94BZ',
  'SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3',
  '4HQy82s9CHTv1GsYKnANHMiHfhcqesYkK6sB3RDSYyqw',
  '8isViKbwhuhFhsv2t8vaFL74pKCqaFPQXo1KkeQwZbB8',
  'DPJ58trLsF9yPrBa2pk6UaRkvqW8hWUYjawe788WBuqr',
]) assert(skr.includes(address), `official SKR config includes ${address}`);
assert(!skr.includes('devnet'), 'SKR server boundary contains no Devnet configuration');

console.log('Arena and resolution roadmap guardrails passed.');
