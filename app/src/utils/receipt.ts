import { formatWalletShort } from './identity';

export interface ReceiptIdentity {
  display_name?: string | null;
  handle?: string | null;
  wallet?: string | null;
}

/** Receipt identity is authoritative profile data first, then a public wallet.
 * It intentionally never uses the generic incomplete-profile label. */
export function formatReceiptParticipant(identity: ReceiptIdentity): string {
  const displayName = String(identity.display_name || '').trim();
  if (displayName && !displayName.startsWith('user_')) return displayName;
  const handle = String(identity.handle || '').trim().replace(/^@+/, '');
  if (handle && !handle.startsWith('user_')) return `@${handle}`;
  return formatWalletShort(identity.wallet);
}

export function isRefundReceipt(receipt: { winner_wallet?: string | null; resolution_summary?: string | null }): boolean {
  const winner = String(receipt.winner_wallet || '').toUpperCase();
  const summary = String(receipt.resolution_summary || '').toLowerCase();
  return winner === 'REFUNDED' || /no agreement|refund/.test(summary);
}

export function areBothRefundsRecorded(receipt: { positions?: Array<{ claimed?: number }> }): boolean {
  const positions = Array.isArray(receipt.positions) ? receipt.positions : [];
  return positions.length > 0 && positions.every((position) => Number(position.claimed) === 1);
}
