// Canonical resolution templates. Every Counter Verified duel (and every
// MUTUAL duel whose fallback is COUNTER_VERIFIED) must carry one of these
// exact shapes; anything else is rejected at proposal time, never defaulted.
const RESOLUTION_MODES = ['COUNTER_VERIFIED', 'MUTUAL'];
const FALLBACK_MODES = ['REFUND', 'COUNTER_VERIFIED'];

const CRYPTO_ASSETS = ['solana', 'bitcoin', 'ethereum'];
const CRYPTO_OPERATORS = ['>=', '<=', '>', '<'];
const WEATHER_CONDITIONS = ['rain', 'temp'];
const WEATHER_CITIES = [
  { city: 'London', latitude: 51.5074, longitude: -0.1278 },
  { city: 'New York', latitude: 40.7128, longitude: -74.006 },
  { city: 'Lagos', latitude: 6.5244, longitude: 3.3792 },
  { city: 'Tokyo', latitude: 35.6762, longitude: 139.6503 },
  { city: 'Sydney', latitude: -33.8688, longitude: 151.2093 },
];

function parseConfig(raw) {
  if (!raw) return {};
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return null;
  }
}

function validateCryptoConfig(cfg) {
  if (!CRYPTO_ASSETS.includes(cfg.assetId)) {
    return `Unsupported crypto asset '${cfg.assetId}'. Use one of: ${CRYPTO_ASSETS.join(', ')}.`;
  }
  if (!Number.isFinite(Number(cfg.targetPriceUsd)) || Number(cfg.targetPriceUsd) <= 0) {
    return 'Crypto template needs a target price above zero.';
  }
  if (!CRYPTO_OPERATORS.includes(cfg.operator)) {
    return `Unsupported comparison '${cfg.operator}'. Use one of: ${CRYPTO_OPERATORS.join(', ')}.`;
  }
  return null;
}

function validateSportsConfig(cfg) {
  if (!cfg.eventId || String(cfg.eventId).trim().length === 0) return 'Sports template needs an event ID.';
  if (!cfg.homeTeam || String(cfg.homeTeam).trim().length === 0) return 'Sports template needs a home team.';
  if (!cfg.awayTeam || String(cfg.awayTeam).trim().length === 0) return 'Sports template needs an away team.';
  if (cfg.targetSide !== 'home' && cfg.targetSide !== 'away') {
    return "Sports template needs targetSide 'home' or 'away'.";
  }
  return null;
}

function validateWeatherConfig(cfg) {
  if (!Number.isFinite(Number(cfg.latitude)) || !Number.isFinite(Number(cfg.longitude))) {
    return 'Weather template needs numeric latitude and longitude.';
  }
  if (!cfg.city || String(cfg.city).trim().length === 0) return 'Weather template needs a city label.';
  if (!WEATHER_CONDITIONS.includes(cfg.condition)) {
    return `Weather condition must be one of: ${WEATHER_CONDITIONS.join(', ')}.`;
  }
  if (!Number.isFinite(Number(cfg.threshold))) return 'Weather template needs a numeric threshold.';
  return null;
}

// Validate a verified-resolution template for a category. Non-feed categories
// (politics/culture/…) have no dedicated resolver, so they must carry an
// explicit crypto market decider — never an empty or malformed object.
function validateVerifiedTemplate(category, sourceType, rawConfig) {
  const cfg = parseConfig(rawConfig);
  if (cfg === null) return { ok: false, error: 'Resolution config is not valid JSON.' };
  const kind = String(category || '').toLowerCase();
  let problem = null;
  if (kind === 'sports') problem = validateSportsConfig(cfg);
  else if (kind === 'weather') problem = validateWeatherConfig(cfg);
  else problem = validateCryptoConfig(cfg);
  if (problem) return { ok: false, error: problem };
  return { ok: true, config: cfg };
}

function validateResolutionMode(mode) {
  const m = String(mode || 'COUNTER_VERIFIED').toUpperCase();
  if (!RESOLUTION_MODES.includes(m)) {
    return { ok: false, error: 'Resolution mode must be COUNTER_VERIFIED or MUTUAL.' };
  }
  return { ok: true, value: m };
}

function validateFallbackMode(mode) {
  const m = String(mode || 'REFUND').toUpperCase();
  if (!FALLBACK_MODES.includes(m)) {
    return { ok: false, error: 'Fallback must be REFUND or COUNTER_VERIFIED.' };
  }
  return { ok: true, value: m };
}

module.exports = {
  RESOLUTION_MODES,
  FALLBACK_MODES,
  CRYPTO_ASSETS,
  CRYPTO_OPERATORS,
  WEATHER_CONDITIONS,
  WEATHER_CITIES,
  parseConfig,
  validateVerifiedTemplate,
  validateResolutionMode,
  validateFallbackMode,
};
