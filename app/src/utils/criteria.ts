// Resolution-criteria helpers shared by challenge creation, challenge review,
// and duel detail. Shapes match server/resolvers/* exactly; nothing invented.
export type CryptoOperator = '>=' | '<=' | '>' | '<';

export const CRYPTO_ASSETS = [
  { id: 'solana', label: 'SOL' },
  { id: 'bitcoin', label: 'BTC' },
  { id: 'ethereum', label: 'ETH' },
] as const;

export const WEATHER_CITIES = [
  { city: 'London', latitude: 51.5074, longitude: -0.1278 },
  { city: 'New York', latitude: 40.7128, longitude: -74.006 },
  { city: 'Lagos', latitude: 6.5244, longitude: 3.3792 },
  { city: 'Tokyo', latitude: 35.6762, longitude: 139.6503 },
  { city: 'Sydney', latitude: -33.8688, longitude: 151.2093 },
] as const;

export function parseSourceConfig(raw?: string | null): Record<string, any> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

// Human summary of how a duel is decided. Falls back to an honest
// "unavailable" label instead of inventing criteria.
export function describeCriteria(sourceType?: string | null, raw?: string | null): string {
  const cfg = parseSourceConfig(raw);
  const kind = (sourceType || '').toLowerCase();
  if (kind === 'sports') {
    const home = cfg.homeTeam || 'Home';
    const away = cfg.awayTeam || 'Away';
    const side = cfg.targetSide === 'away' ? 'away wins' : 'home wins';
    return `${home} vs ${away}: side A wins if ${side}.`;
  }
  if (kind === 'weather') {
    const city = cfg.city || 'the city';
    if (cfg.condition === 'temp') {
      return `${city} temperature above ${cfg.threshold ?? '?'}°C at resolution time means side A wins.`;
    }
    return `Rain in ${city} at resolution time means side A wins.`;
  }
  // Crypto is also the backend fallthrough for every other category.
  const asset = String(cfg.assetId || 'solana').toUpperCase();
  const op = String(cfg.operator || cfg.condition || '>=');
  const price = cfg.targetPriceUsd !== undefined && cfg.targetPriceUsd !== null ? `$${cfg.targetPriceUsd}` : 'the target price';
  return `${asset} price ${op} ${price} at resolution time means side A wins.`;
}

export function formatDeadline(tsSeconds?: number | null): string {
  if (!tsSeconds) return 'No deadline shown';
  const d = new Date(tsSeconds * 1000);
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
