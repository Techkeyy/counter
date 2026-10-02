// Canonical resolution contracts. Counter Verified is deliberately narrow in
// the MVP; generic social Takes use MUTUAL + REFUND and do not need an oracle.
const RESOLUTION_MODES = ['COUNTER_VERIFIED', 'MUTUAL'];
const FALLBACK_MODES = ['REFUND', 'COUNTER_VERIFIED'];

const VERIFIED_CATEGORY = 'WEATHER';
const WEATHER_PROVIDER = 'open-meteo';
const WEATHER_METRIC = 'temperature_2m';
const WEATHER_OPERATOR = '>=';
const WEATHER_CITIES = [
  { city: 'London', latitude: 51.5074, longitude: -0.1278 },
  { city: 'New York', latitude: 40.7128, longitude: -74.006 },
  { city: 'Lagos', latitude: 6.5244, longitude: 3.3792 },
  { city: 'Tokyo', latitude: 35.6762, longitude: 139.6503 },
  { city: 'Sydney', latitude: -33.8688, longitude: 151.2093 },
];

function parseConfig(raw) {
  if (raw === undefined || raw === null || raw === '') return {};
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return null;
  }
}

function validateWeatherConfig(rawConfig) {
  const cfg = parseConfig(rawConfig);
  if (cfg === null) return 'Resolution config is not valid JSON.';
  if (cfg.provider !== WEATHER_PROVIDER) return 'Weather provider must be Open-Meteo.';
  if (cfg.metric !== WEATHER_METRIC) return 'Weather metric must be temperature_2m.';
  if (cfg.operator !== WEATHER_OPERATOR) return 'Weather operator must be >=.';
  if (!cfg.city || String(cfg.city).trim().length === 0) return 'Weather template needs a location label.';

  const latitude = Number(cfg.latitude);
  const longitude = Number(cfg.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return 'Weather latitude must be between -90 and 90.';
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return 'Weather longitude must be between -180 and 180.';
  }
  if (!Number.isFinite(Number(cfg.threshold))) {
    return 'Weather threshold must be a numeric Celsius value.';
  }
  return null;
}

// Validate a Counter Verified template. Unsupported categories never fall
// through to a different resolver.
function validateVerifiedTemplate(category, sourceType, rawConfig) {
  const kind = String(category || '').toUpperCase();
  const source = String(sourceType || '').toLowerCase();
  if (kind !== VERIFIED_CATEGORY) {
    return { ok: false, error: 'Counter Verified currently supports Weather temperature only.' };
  }
  if (source && source !== WEATHER_PROVIDER && source !== 'weather') {
    return { ok: false, error: 'Counter Verified weather source must be Open-Meteo.' };
  }
  const error = validateWeatherConfig(rawConfig);
  return error ? { ok: false, error } : { ok: true, config: parseConfig(rawConfig) };
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

// Generic MUTUAL + REFUND is the universal social path and deliberately does
// not need an oracle. Any Counter Verified path, including MUTUAL with a
// Counter Verified fallback, must satisfy the enabled Weather contract.
function validateChallengeContract({ category, sourceType, sourceConfig, resolutionMode, fallbackMode }) {
  const mode = validateResolutionMode(resolutionMode);
  if (!mode.ok) return mode;
  const fallback = validateFallbackMode(fallbackMode);
  if (!fallback.ok) return fallback;

  if (mode.value === 'MUTUAL' && fallback.value === 'REFUND') {
    return { ok: true, mode: mode.value, fallback: fallback.value, config: null };
  }

  const template = validateVerifiedTemplate(category, sourceType, sourceConfig);
  if (!template.ok) return template;
  if (mode.value === 'COUNTER_VERIFIED' && fallback.value !== 'REFUND') {
    return { ok: false, error: 'Counter Verified Duels must use REFUND as their fallback.' };
  }
  return { ok: true, mode: mode.value, fallback: fallback.value, config: template.config };
}

module.exports = {
  RESOLUTION_MODES,
  FALLBACK_MODES,
  VERIFIED_CATEGORY,
  WEATHER_PROVIDER,
  WEATHER_METRIC,
  WEATHER_OPERATOR,
  WEATHER_CITIES,
  parseConfig,
  validateWeatherConfig,
  validateVerifiedTemplate,
  validateResolutionMode,
  validateFallbackMode,
  validateChallengeContract,
};
