const fs = require('fs');
const path = require('path');
const { SourceMapConsumer } = require('C:/Users/HomePC/node_modules/.pnpm/source-map@0.5.7/node_modules/source-map');

async function run() {
  const mapPath = path.resolve('app/android/app/build/generated/sourcemaps/react/release/index.android.bundle.map');
  console.log('Loading sourcemap from:', mapPath);
  const rawMap = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  const consumer = new SourceMapConsumer(rawMap);

  const targetLine = 1;
  const targetColumn = 762863;

  console.log(`\n--- Symbolicating line ${targetLine}, col ${targetColumn} ---`);
  const pos = consumer.originalPositionFor({ line: targetLine, column: targetColumn });
  console.log('Original position:', pos);

  console.log('\n--- Checking surrounding columns (+- 200 cols) ---');
  for (let offset = -200; offset <= 200; offset += 20) {
    const p = consumer.originalPositionFor({ line: targetLine, column: targetColumn + offset });
    if (p.source) {
      console.log(`Col ${targetColumn + offset} -> ${p.source}:${p.line}:${p.column} (name: ${p.name})`);
    }
  }
}

run().catch(console.error);
