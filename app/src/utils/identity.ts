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
  if (user.display_name && user.display_name.trim().length > 0) {
    return user.display_name.trim();
  }
  if (user.name && user.name.trim().length > 0) {
    return user.name.trim();
  }
  if (user.handle && user.handle.trim().length > 0) {
    const cleanHandle = user.handle.replace(/^@/, '').trim();
    if (cleanHandle.length > 0) {
      return cleanHandle;
    }
  }
  if (user.wallet) {
    return formatWalletShort(user.wallet);
  }
  return 'Contender';
}

export function formatUserHandle(user?: UserIdentityInput | null): string {
  if (!user) return '@contender';
  if (user.handle && user.handle.trim().length > 0) {
    const clean = user.handle.replace(/^@/, '').trim();
    return `@${clean}`;
  }
  if (user.wallet) {
    return `@${user.wallet.slice(0, 4).toLowerCase()}${user.wallet.slice(-4).toLowerCase()}`;
  }
  return '@contender';
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
