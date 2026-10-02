export type WalletOperation = 'DUEL_INIT' | 'STAKE' | 'SETTLEMENT' | 'CLAIM';

export type WalletStage =
  | 'START'
  | 'MWA_OPEN'
  | 'MWA_APPROVED'
  | 'MWA_CANCELLED'
  | 'TX_SUBMITTED'
  | 'TX_CONFIRMED'
  | 'BACKEND_VERIFY_START'
  | 'BACKEND_VERIFY_OK'
  | 'BACKEND_VERIFY_FAILED'
  | 'UI_SUCCESS'
  | 'FAILED';

// Physical-UAT markers only. Keep this deliberately small and value-free:
// never include auth tokens, wallet secrets, signatures, or raw request data.
export function walletStage(operation: WalletOperation, stage: WalletStage): void {
  try {
    console.info(`[COUNTER][WALLET][${operation}_${stage}]`);
  } catch {}
}

export function isWalletCancellation(error: unknown): boolean {
  const message = String((error as any)?.message || error || '').toLowerCase();
  return /reject|cancel|declin|dismiss|denied|user cancel/.test(message);
}
