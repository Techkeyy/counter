const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://counter.103-195-188-198.sslip.io';

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: data
        });
      });
    }).on('error', err => reject(err));
  });
}

async function verifyAll() {
  const report = {
    timestamp: new Date().toISOString(),
    vps_backend_base: BASE_URL,
    checks: {}
  };

  console.log('Verifying VPS endpoints at ' + BASE_URL);

  // 1. Health
  try {
    const health = await fetchUrl(`${BASE_URL}/api/health`);
    console.log(`Health status: ${health.statusCode}`);
    report.checks.health = {
      url: `${BASE_URL}/api/health`,
      status: health.statusCode,
      body: JSON.parse(health.data)
    };
  } catch (err) {
    report.checks.health = { error: err.message };
  }

  // 2. Digital Asset Links
  try {
    const assetlinks = await fetchUrl(`${BASE_URL}/.well-known/assetlinks.json`);
    console.log(`Assetlinks status: ${assetlinks.statusCode}`);
    report.checks.assetlinks = {
      url: `${BASE_URL}/.well-known/assetlinks.json`,
      status: assetlinks.statusCode,
      body: JSON.parse(assetlinks.data)
    };
  } catch (err) {
    report.checks.assetlinks = { error: err.message };
  }

  // 3. Shared Duel OG Page
  try {
    const duelOg = await fetchUrl(`${BASE_URL}/d/sol125`);
    console.log(`Duel OG status: ${duelOg.statusCode}`);
    report.checks.duel_og = {
      url: `${BASE_URL}/d/sol125`,
      status: duelOg.statusCode,
      has_og_title: duelOg.data.includes('og:title'),
      has_og_description: duelOg.data.includes('og:description')
    };
  } catch (err) {
    report.checks.duel_og = { error: err.message };
  }

  // 4. Shared Receipt OG Page
  try {
    const receiptOg = await fetchUrl(`${BASE_URL}/r/rcpt_seed_sol_won`);
    console.log(`Receipt OG status: ${receiptOg.statusCode}`);
    report.checks.receipt_og = {
      url: `${BASE_URL}/r/rcpt_seed_sol_won`,
      status: receiptOg.statusCode,
      has_og_title: receiptOg.data.includes('og:title'),
      has_og_image: receiptOg.data.includes('og:image')
    };
  } catch (err) {
    report.checks.receipt_og = { error: err.message };
  }

  // 5. Duels API
  try {
    const duels = await fetchUrl(`${BASE_URL}/api/duels`);
    console.log(`Duels status: ${duels.statusCode}`);
    const duelsData = JSON.parse(duels.data);
    report.checks.duels_api = {
      url: `${BASE_URL}/api/duels`,
      status: duels.statusCode,
      count: Array.isArray(duelsData) ? duelsData.length : 0
    };
  } catch (err) {
    report.checks.duels_api = { error: err.message };
  }

  // 6. Check APK metadata
  const apkPath = path.join(__dirname, '..', 'app', 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
  if (fs.existsSync(apkPath)) {
    const stats = fs.statSync(apkPath);
    report.apk_bundle = {
      path: apkPath,
      size_bytes: stats.size,
      mtime: stats.mtime.toISOString(),
      variant: 'release',
      exists: true
    };
  }

  const outPath = path.join(__dirname, 'uat-readiness-verification.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log('Saved report to ' + outPath);
  return report;
}

verifyAll().catch(console.error);
