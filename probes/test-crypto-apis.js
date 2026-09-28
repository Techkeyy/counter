const axios = require('axios');

async function testAPIs() {
  const apis = [
    { name: 'Kraken', url: 'https://api.kraken.com/0/public/Ticker?pair=SOLUSD', parse: d => parseFloat(d.result.SOLUSD.c[0]) },
    { name: 'CoinGecko', url: 'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd', parse: d => d.solana.usd },
    { name: 'CryptoCompare', url: 'https://min-api.cryptocompare.com/data/price?fsym=SOL&tsyms=USD', parse: d => d.USD },
    { name: 'Jupiter Price API', url: 'https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112', parse: d => parseFloat(d.data['So11111111111111111111111111111111111111112'].price) }
  ];

  for (const api of apis) {
    try {
      const res = await axios.get(api.url, { timeout: 4000 });
      const price = api.parse(res.data);
      console.log(`[PASS] ${api.name}: SOL/USD = $${price}`);
    } catch (e) {
      console.log(`[FAIL] ${api.name}: ${e.message}`);
    }
  }
}

testAPIs();
