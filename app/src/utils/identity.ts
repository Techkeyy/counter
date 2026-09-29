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

export function formatUserDisplayName(user?: UserIdentityInput | null): string {
  if (!user) return 'Contender';
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
  if (user.wallet) {
    return formatWalletShort(user.wallet);
  }
  return 'Contender';
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
