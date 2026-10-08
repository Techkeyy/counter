const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const app = read('App.tsx');
const appJson = read('app.json');
const share = read('src/share.ts');
const feed = read('src/screens/FreshFeedScreen.tsx');
const take = read('src/screens/FreshTakeDetailScreen.tsx');
const duel = read('src/screens/DuelDetailV1Screen.tsx');
const receipt = read('src/screens/FreshReceiptScreen.tsx');
const search = read('src/screens/SearchScreen.tsx');
const api = read('src/api.ts');
const users = read('../server/routes/users.js');
const server = read('../server/index.js');

assert.match(share, /type: CounterEntityType/);
assert.match(share, /type === 'TAKE'/);
assert.match(share, /type === 'DUEL'/);
assert.match(share, /type === 'RECEIPT'/);
assert.match(share, /PRODUCTION_WEB_URL}\/t\//);
assert.match(share, /PRODUCTION_WEB_URL}\/d\//);
assert.match(share, /PRODUCTION_WEB_URL}\/r\//);
assert.match(share, /Share\.share/);
assert.match(share, /Think they're wrong\? Challenge this Take/);
assert.match(feed, /shareCounterEntity\(\{ type: 'TAKE'/);
assert.match(take, /shareCounterEntity\(\{ type: 'TAKE'/);
assert.match(duel, /shareCounterEntity\(\{ type: 'DUEL'/);
assert.match(receipt, /shareCounterEntity\(\{ type: 'RECEIPT'/);
assert.equal((app.match(/Share\.share/g) || []).length, 0, 'App coordinator does not own entity share payloads');

assert.match(app, /const openTake = async/);
assert.match(app, /parsed\.path\?\.startsWith\('receipt\/'\)/);
assert.match(app, /routeToken === 'd' \? 'duel'/);
assert.match(app, /routeToken === 't' \? 'take'/);
assert.match(app, /showSearch/);
assert.match(app, /SearchScreen/);
assert.match(appJson, /"host": "take"/);
assert.match(appJson, /"pathPrefix": "\/t"/);

assert.match(search, /Search people on Counter/);
assert.match(search, /setTimeout\(.*280/s);
assert.match(search, /onSelectProfile/);
assert.match(api, /\/users\/search\?q=/);
assert.match(users, /router\.get\('\/search'/);
assert.match(users, /LIMIT 20/);
assert.match(users, /SELECT wallet_address, handle, display_name, avatar_url, bio/);
assert.match(server, /app\.get\('\/t\/:id'/);
assert.match(server, /og:description/);
assert.match(server, /counter:\/\/take\//);

console.log('Share and user-search source guardrails passed.');
