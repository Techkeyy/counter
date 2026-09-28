const axios = require('axios');

async function resolveCrypto(config) {
  // config: { assetId: 'solana' | 'bitcoin' | 'ethereum', targetPriceUsd: 125, operator: '>=' | '<=' | '>' | '<' }
  const assetId = config.assetId || 'solana';
  const targetPrice = Number(config.targetPriceUsd);
  const operator = config.operator || '>=';

  try {
    const res = await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${assetId}&vs_currencies=usd`, {
      timeout: 8000,
    });
    const currentPrice = res.data[assetId]?.usd;
    if (typeof currentPrice !== 'number') {
      throw new Error(`Price not returned for asset: ${assetId}`);
    }

    let sideAWins = false;
    switch (operator) {
      case '>=': sideAWins = currentPrice >= targetPrice; break;
      case '<=': sideAWins = currentPrice <= targetPrice; break;
      case '>':  sideAWins = currentPrice > targetPrice; break;
      case '<':  sideAWins = currentPrice < targetPrice; break;
      default:   sideAWins = currentPrice >= targetPrice; break;
    }

    return {
      success: true,
      winningSide: sideAWins ? 1 : 2,
      evidence: {
        source: 'CoinGecko API',
        asset: assetId,
        observedPrice: currentPrice,
        targetPrice,
        operator,
        resolvedAt: new Date().toISOString(),
      },
      summary: `${assetId.toUpperCase()} was observed at $${currentPrice.toFixed(2)} USD (Target: ${operator} $${targetPrice}). Side ${sideAWins ? 'A' : 'B'} Wins.`,
    };
  } catch (err) {
    return {
      success: false,
      error: `Crypto resolution failed: ${err.message}`,
    };
  }
}

module.exports = { resolveCrypto };
