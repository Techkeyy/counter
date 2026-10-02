const axios = require('axios');

async function resolveWeather(config) {
  // MVP config: { provider: 'open-meteo', metric: 'temperature_2m',
  // city, latitude, longitude, operator: '>=', threshold }
  if (!config || config.provider !== 'open-meteo' || config.metric !== 'temperature_2m' || config.operator !== '>=') {
    return {
      success: false,
      error: 'Weather resolution requires the locked Open-Meteo temperature contract.',
    };
  }
  const latitude = config.latitude || 51.5074;
  const longitude = config.longitude || -0.1278;
  const city = config.city || 'London';
  const threshold = Number(config.threshold);

  try {
    const res = await axios.get(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,precipitation,rain`,
      { timeout: 8000 }
    );
    const current = res.data?.current;
    if (!current) {
      throw new Error(`Weather data not returned for coordinates: ${latitude}, ${longitude}`);
    }

    const observedValue = Number(current.temperature_2m);
    if (!Number.isFinite(observedValue) || !Number.isFinite(threshold)) {
      throw new Error('Open-Meteo did not return a numeric temperature.');
    }
    const sideAWins = observedValue >= threshold;

    return {
      success: true,
      winningSide: sideAWins ? 1 : 2,
      evidence: {
        source: 'Open-Meteo API',
        city,
        coordinates: `${latitude}, ${longitude}`,
        metric: 'temperature_2m',
        operator: '>=',
        observedValue,
        threshold,
        time: current.time,
        resolvedAt: new Date().toISOString(),
      },
      summary: `${city} temperature observed at ${observedValue}°C (Threshold: >= ${threshold}°C). Side ${sideAWins ? 'A' : 'B'} Wins.`,
    };
  } catch (err) {
    return {
      success: false,
      error: `Weather resolution failed: ${err.message}`,
    };
  }
}

module.exports = { resolveWeather };
