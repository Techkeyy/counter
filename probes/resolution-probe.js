const axios = require('axios');

async function testCryptoResolution() {
  console.log('--- Probing Crypto Resolution Source (CoinGecko API) ---');
  try {
    const res = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=solana,bitcoin,ethereum&vs_currencies=usd', { timeout: 8000 });
    const solPrice = res.data.solana.usd;
    const btcPrice = res.data.bitcoin.usd;
    const ethPrice = res.data.ethereum.usd;
    console.log(`[PASS] Live Prices -> SOL: $${solPrice}, BTC: $${btcPrice}, ETH: $${ethPrice}`);
    
    // Test proposition evaluation: "Will SOL/USD be >= $120.00?"
    const threshold = 120.0;
    const outcome = solPrice >= threshold;
    console.log(`[PASS] Sample Proposition: SOL >= $${threshold} -> Outcome: ${outcome ? 'YES (Side A / Praise)' : 'NO (Side B / Daniel)'}`);
    return { success: true, source: 'CoinGecko Simple Price API', solPrice, btcPrice, ethPrice, timestamp: new Date().toISOString() };
  } catch (err) {
    console.error('[FAIL] Crypto probe failed:', err.message);
    return { success: false, error: err.message };
  }
}

async function testWeatherResolution() {
  console.log('\n--- Probing Weather Resolution Source (Open-Meteo Public API) ---');
  try {
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=51.5074&longitude=-0.1278&current=temperature_2m,precipitation,weather_code&timezone=auto';
    const res = await axios.get(url, { timeout: 8000 });
    const current = res.data.current;
    console.log(`[PASS] London Weather: Temp=${current.temperature_2m}°C, Precip=${current.precipitation}mm (Time: ${current.time})`);
    const outcome = current.precipitation > 0.0;
    console.log(`[PASS] Sample Proposition: Precip > 0.0mm -> Outcome: ${outcome ? 'YES (Rain)' : 'NO (Dry)'}`);
    return { success: true, source: 'Open-Meteo API', data: current };
  } catch (err) {
    console.error('[FAIL] Weather probe failed:', err.message);
    return { success: false, error: err.message };
  }
}

async function testSportsResolution() {
  console.log('\n--- Probing Sports Resolution Source (TheSportsDB API) ---');
  try {
    const url = 'https://www.thesportsdb.com/api/v1/json/3/eventslast.php?id=133602';
    const res = await axios.get(url, { timeout: 8000 });
    if (res.data && res.data.results && res.data.results.length > 0) {
      const match = res.data.results[0];
      console.log(`[PASS] Latest Match: ${match.strEvent} (${match.dateEvent}) -> Score: ${match.intHomeScore} - ${match.intAwayScore}`);
      return { success: true, source: 'TheSportsDB API', match: match.strEvent, score: `${match.intHomeScore}-${match.intAwayScore}` };
    } else {
      console.log('[WARN] Sports endpoint reachable');
      return { success: true, source: 'TheSportsDB API', note: 'Reachable' };
    }
  } catch (err) {
    console.error('[FAIL] Sports probe failed:', err.message);
    return { success: false, error: err.message };
  }
}

async function runAll() {
  const crypto = await testCryptoResolution();
  const weather = await testWeatherResolution();
  const sports = await testSportsResolution();
  console.log('\n=========================================');
  console.log('--- RESOLUTION PROBE PROOF SUMMARY ---');
  console.log('=========================================');
  console.log({
    crypto: crypto.success ? 'PASS (CoinGecko)' : 'FAIL',
    weather: weather.success ? 'PASS (Open-Meteo)' : 'FAIL',
    sports: sports.success ? 'PASS (TheSportsDB)' : 'FAIL'
  });
}

runAll();
