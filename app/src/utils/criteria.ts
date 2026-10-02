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
  if (kind === 'weather' || kind === 'open-meteo') {
    const city = cfg.city || 'the city';
    return `At or after the resolution time, Open-Meteo current temperature in ${city} at or above ${cfg.threshold ?? '?'}°C means Side A wins.`;
  }
  return 'Settle together: both captains confirm the winner. If they do not agree by the deadline, everyone is refunded.';
}

export function formatDeadline(tsSeconds?: number | null): string {
  if (!tsSeconds) return 'No deadline shown';
  const d = new Date(tsSeconds * 1000);
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
