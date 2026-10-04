const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const sourcePath = path.join(__dirname, 'src', 'utils', 'duelsLoad.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const moduleShim = { exports: {} };
new Function('require', 'module', 'exports', compiled)(require, moduleShim, moduleShim.exports);
const { loadDuelsScreenData } = moduleShim.exports;

(async () => {
  const result = await loadDuelsScreenData(
    async () => [],
    async () => [],
    async () => { throw new Error('503 Portfolio balance is temporarily unavailable.'); },
    true,
  );

  assert.deepEqual(result.duels, [], 'successful empty Duels response must remain usable');
  assert.deepEqual(result.challenges, [], 'successful empty challenge response must remain usable');
  assert.equal(result.portfolio, null, 'failed auxiliary portfolio must degrade to no portfolio');
  assert.equal(result.portfolioUnavailable, true, 'portfolio RPC failure must be observable as degraded auxiliary state');

  await assert.rejects(
    () => loadDuelsScreenData(
      async () => { throw new Error('Duels route failed'); },
      async () => [],
      async () => null,
      true,
    ),
    /Duels route failed/,
    'base Duels failure must still reach the screen error state',
  );

  console.log('Duels load regression: PASS (portfolio 503 does not mask successful empty Duels)');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
