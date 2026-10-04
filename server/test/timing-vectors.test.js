const assert = require('node:assert/strict');
const { deriveChallengeTiming } = require('../routes/challenges');

const now = 2_000_000;
const cases = [
  ['invalid input uses the safe fifteen-minute floor', 'not-a-time', now + 900],
  ['past input clamps to the safe floor', now - 1, now + 900],
  ['exact floor remains valid', now + 900, now + 900],
  ['future input is preserved', now + 7_200, now + 7_200],
  ['long input caps the hidden staking buffer', now + 172_800, now + 172_800],
];

for (const [label, input, expectedResolution] of cases) {
  const result = deriveChallengeTiming(input, now);
  assert.equal(result.ok, true, label);
  assert.equal(result.resolutionTs, expectedResolution, label);
  assert(result.cutoffTs > now && result.cutoffTs < result.resolutionTs, `${label}: cutoff is strictly between now and resolution`);
  assert.equal(result.mutualDeadlineTs, result.resolutionTs + 86_400, `${label}: mutual deadline is server-derived`);
}

const capped = deriveChallengeTiming(now + 172_800, now);
assert.equal(capped.resolutionTs - capped.cutoffTs, 3_600, 'long Duel uses the one-hour maximum hidden stake buffer');

console.log('Challenge timing boundary vectors: PASS (6/6)');
