const axios = require('axios');

async function resolveWeather(config) {
  // config: { latitude: 51.5074, longitude: -0.1278, city: 'London', condition: 'rain' | 'temp', threshold: 0.1 }
  const latitude = config.latitude || 51.5074;
  const longitude = config.longitude || -0.1278;
  const city = config.city || 'London';
  const condition = config.condition || 'rain';
  const threshold = config.threshold !== undefined ? Number(config.threshold) : 0.1;

  try {
    const res = await axios.get(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,precipitation,rain`,
      { timeout: 8000 }
    );
    const current = res.data?.current;
    if (!current) {
      throw new Error(`Weather data not returned for coordinates: ${latitude}, ${longitude}`);
    }

    let sideAWins = false;
    let observedValue = 0;

    if (condition === 'rain') {
      observedValue = current.precipitation || current.rain || 0;
      sideAWins = observedValue >= threshold;
    } else if (condition === 'temp') {
      observedValue = current.temperature_2m;
      sideAWins = observedValue >= threshold;
    }

    return {
      success: true,
      winningSide: sideAWins ? 1 : 2,
      evidence: {
        source: 'Open-Meteo API',
        city,
        coordinates: `${latitude}, ${longitude}`,
        condition,
        observedValue,
        threshold,
        time: current.time,
        resolvedAt: new Date().toISOString(),
      },
      summary: `${city} ${condition} observed at ${observedValue} (Threshold: ${threshold}). Side ${sideAWins ? 'A' : 'B'} Wins.`,
    };
  } catch (err) {
    return {
      success: false,
      error: `Weather resolution failed: ${err.message}`,
    };
  }
}

module.exports = { resolveWeather };
