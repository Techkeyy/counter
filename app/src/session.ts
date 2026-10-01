import * as SecureStore from 'expo-secure-store';
import { api, setAuthSession } from './api';
import type { WalletState } from './wallet';

function hasRealProfileField(value?: unknown): boolean {
  const text = String(value ?? '').replace(/^@+/, '').trim();
  return text.length > 0 && !text.startsWith('user_');
}

// Canonical returning-user gate shared by cold restore and connect flow. The
// backend's authenticated profile is authoritative; wallet ownership alone
// never counts as a complete social identity.
export function hasCompleteCounterProfile(user?: {
  display_name?: unknown;
  handle?: unknown;
} | null): boolean {
  if (!user) return false;
  return hasRealProfileField(user.display_name) && hasRealProfileField(user.handle);
}

// Secure Counter session persistence.
//
// Authentication/session material (backend bearer token + wallet identity) is
// stored in OS-backed secure storage (Android Keystore / iOS Keychain via
// expo-secure-store) — never in plaintext AsyncStorage, never with private
// keys or seed material (none ever exists on this client).
//
// Restore rule: a stored session is only a CANDIDATE. It becomes the active
// identity iff the backend accepts it (profile read with the stored token for
// the stored wallet). Anything else → securely cleared + disconnected. No
// profile or wallet is ever synthesized.

const SESSION_KEY = 'counter.session.v1';

export interface StoredSession {
  v: 1;
  wallet: string;
  token: string;
  displayName?: string;
  handle?: string;
  savedAt: number;
}

export interface SessionStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  deleteItem(key: string): Promise<void>;
}

export const SecureSessionStorage: SessionStorage = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  deleteItem: (key) => SecureStore.deleteItemAsync(key),
};

export const DISCONNECTED: WalletState = {
  connected: false,
  publicKey: null,
  authToken: null,
  isArenaEligible: false,
  skrStakedAmount: 0,
};

export function validateSessionShape(raw: unknown): StoredSession | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== 1) return null;
  if (typeof r.wallet !== 'string' || r.wallet.length < 32 || r.wallet.length > 44) return null;
  if (typeof r.token !== 'string' || r.token.length < 16 || !r.token.includes('.')) return null;
  if (r.displayName !== undefined && typeof r.displayName !== 'string') return null;
  if (r.handle !== undefined && typeof r.handle !== 'string') return null;
  return {
    v: 1,
    wallet: r.wallet,
    token: r.token,
    displayName: typeof r.displayName === 'string' ? r.displayName : undefined,
    handle: typeof r.handle === 'string' ? r.handle : undefined,
    savedAt: typeof r.savedAt === 'number' ? r.savedAt : Date.now(),
  };
}

export async function saveSession(
  storage: SessionStorage,
  session: Omit<StoredSession, 'v' | 'savedAt'>
): Promise<void> {
  const record: StoredSession = { v: 1, savedAt: Date.now(), ...session };
  if (!validateSessionShape(record)) {
    throw new Error('Refusing to persist invalid session shape');
  }
  await storage.setItem(SESSION_KEY, JSON.stringify(record));
}

export async function loadSessionRecord(storage: SessionStorage): Promise<StoredSession | null> {
  let raw: string | null;
  try {
    raw = await storage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Corrupt entry: remove so it can never be misread later.
    try {
      await storage.deleteItem(SESSION_KEY);
    } catch {}
    return null;
  }
  const valid = validateSessionShape(parsed);
  if (!valid) {
    try {
      await storage.deleteItem(SESSION_KEY);
    } catch {}
    return null;
  }
  return valid;
}

export async function clearSession(storage: SessionStorage): Promise<void> {
  try {
    await storage.deleteItem(SESSION_KEY);
  } catch {
    // Clearing is best-effort; a missing entry is already the desired state.
  }
}

interface AuthApi {
  setAuthSession(token: string, wallet: string): void;
  getUserProfile(wallet: string): Promise<{
    wallet_address: string;
    display_name?: string;
    handle?: string;
    is_arena_eligible?: number;
    skr_staked_amount?: number;
    user?: {
      wallet_address: string;
      display_name?: string;
      handle?: string;
      is_arena_eligible?: number;
      skr_staked_amount?: number;
    };
  }>;
}

/**
 * Restore the Counter identity from secure storage.
 * The stored token is validated against the backend for the stored wallet;
 * invalid/expired/rejected sessions are securely cleared and yield
 * DISCONNECTED. Never synthesizes identity.
 */
export async function restoreSession(
  storage: SessionStorage = SecureSessionStorage,
  authApi: AuthApi = { setAuthSession, getUserProfile: (wallet: string) => api.getUserProfile(wallet) }
): Promise<WalletState> {
  const record = await loadSessionRecord(storage);
  if (!record) return DISCONNECTED;
  try {
    authApi.setAuthSession(record.token, record.wallet);
    const response = await authApi.getUserProfile(record.wallet);
    const profile = (response as any)?.user || response;
    if (!profile || profile.wallet_address !== record.wallet) {
      throw new Error('Profile wallet mismatch');
    }
    return {
      connected: true,
      publicKey: record.wallet,
      authToken: record.token,
      isArenaEligible: profile.is_arena_eligible === 1,
      skrStakedAmount: Number(profile.skr_staked_amount) || 0,
      needsProfileSetup: !hasCompleteCounterProfile(profile),
    };
  } catch {
    await clearSession(storage);
    return DISCONNECTED;
  }
}
