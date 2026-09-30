/**
 * Identity Utilities
 * Provides human-friendly display name, handle, avatar fallback, and wallet formatting.
 */

export function formatWalletShort(wallet?: string | null): string {
  if (!wallet) return 'Anonymous';
  if (wallet.length <= 10) return wallet;
  return `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;
}

interface UserIdentityInput {
  display_name?: string | null;
  name?: string | null;
  handle?: string | null;
  wallet?: string | null;
}

// Designed incomplete-profile state. Wallets are NEVER used as social names:
// surfaces show this label when no linked Counter profile exists yet.
export const INCOMPLETE_PROFILE_NAME = 'Unnamed contender';

function hasRealField(value?: string | null): boolean {
  const v = value?.replace(/^@/, '').trim();
  return !!v && v.length > 0 && !v.startsWith('user_');
}

export function hasRealIdentity(user?: UserIdentityInput | null): boolean {
  if (!user) return false;
  return hasRealField(user.display_name) || hasRealField(user.name) || hasRealField(user.handle);
}

export function formatUserDisplayName(user?: UserIdentityInput | null): string {
  if (!user) return INCOMPLETE_PROFILE_NAME;
  const displayName = user.display_name?.trim();
  if (displayName && displayName.length > 0 && !displayName.startsWith('user_')) {
    return displayName;
  }
  const name = user.name?.trim();
  if (name && name.length > 0 && !name.startsWith('user_')) {
    return name;
  }
  const handle = user.handle?.replace(/^@/, '').trim();
  if (handle && handle.length > 0 && !handle.startsWith('user_')) {
    return handle;
  }
  return INCOMPLETE_PROFILE_NAME;
}

export function formatUserHandle(user?: UserIdentityInput | null): string | null {
  if (!user) return null;
  if (user.handle && user.handle.trim().length > 0) {
    const clean = user.handle.replace(/^@/, '').trim();
    if (clean.length > 0 && !clean.startsWith('user_')) {
      return `@${clean}`;
    }
  }
  // Never fabricate handles (e.g. @6p8vrsbe) from wallet address
  return null;
}

export function getAvatarUri(avatarUrl?: string | null, seed?: string | null): string {
  if (avatarUrl && avatarUrl.startsWith('http')) {
    return avatarUrl;
  }
  const effectiveSeed = seed || avatarUrl || 'counter-contender';
  return `https://api.dicebear.com/7.x/identicon/png?seed=${encodeURIComponent(effectiveSeed)}&backgroundColor=15171e`;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatRelativeTime(iso?: string | null): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  if (diffMs < 0) return 'just now';
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// A settlement signature is only treated as chain evidence when it looks like
// a real base58 Solana signature. Legacy `simulated_*` / `devnet_*` markers
// are history rows, never verification.
export function isRealSignature(sig?: string | null): boolean {
  if (!sig || sig.length < 80 || sig.length > 90) return false;
  if (sig.startsWith('simulated_') || sig.startsWith('devnet_')) return false;
  return /^[1-9A-HJ-NP-Za-km-z]+$/.test(sig);
}
