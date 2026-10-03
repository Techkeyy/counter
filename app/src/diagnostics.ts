export type WalletOperation = 'DUEL_INIT' | 'STAKE' | 'SETTLEMENT' | 'CLAIM';

export type WalletStage =
  | 'START'
  | 'CHAIN_ACCOUNTS_OK'
  | 'MWA_OPEN'
  | 'MWA_TRANSACT_START'
  | 'MWA_CALLBACK_ENTER'
  | 'MWA_AUTHORIZE_START'
  | 'MWA_AUTHORIZE_OK'
  | 'MWA_SIGN_SEND_START'
  | 'MWA_SIGN_SEND_RETURN'
  | 'MWA_TRANSACT_RETURN'
  | 'MWA_APPROVED'
  | 'MWA_CANCELLED'
  | 'MWA_ERROR'
  | 'MWA_TIMEOUT'
  | 'TX_SIGNATURE_PARSED'
  | 'TX_CONFIRM_START'
  | 'TX_SUBMITTED'
  | 'TX_CONFIRMED'
  | 'TX_CONFIRM_FAILED'
  | 'BACKEND_VERIFY_START'
  | 'BACKEND_VERIFY_OK'
  | 'BACKEND_VERIFY_FAILED'
  | 'UI_SUCCESS'
  | 'FAILED';

export type WalletFailureKind =
  | 'PRE_SUBMIT'
  | 'NOT_SUBMITTED'
  | 'TIMEOUT'
  | 'CONFIRMATION_FAILED';

export class WalletFlowError extends Error {
  readonly kind: WalletFailureKind;
  readonly signature?: string;
  readonly cause?: unknown;

  constructor(kind: WalletFailureKind, message: string, signature?: string, cause?: unknown) {
    super(message);
    this.name = 'WalletFlowError';
    this.kind = kind;
    this.signature = signature;
    this.cause = cause;
  }
}

// Physical-UAT markers only. Keep this deliberately small and value-free:
// never include auth tokens, wallet secrets, signatures, or raw request data.
export function walletStage(operation: WalletOperation, stage: WalletStage): void {
  try {
    console.info(`[COUNTER][WALLET][${operation}_${stage}]`);
  } catch {}
}

export function lifecycleStage(stage: 'APP_BACKGROUND' | 'APP_RESUME'): void {
  try {
    console.info(`[COUNTER][WALLET][${stage}]`);
  } catch {}
}

export function isWalletCancellation(error: unknown): boolean {
  const value = error as any;
  const message = String(value?.message || error || '').toLowerCase();
  const code = String(value?.code || '').toLowerCase();
  return /reject|cancel|declin|dismiss|denied|user cancel/.test(`${message} ${code}`);
}

export function isWalletTimeout(error: unknown): boolean {
  const value = error as any;
  const message = String(value?.message || error || '').toLowerCase();
  const code = String(value?.code || '').toLowerCase();
  return /timeout|timed out|session_timeout/.test(`${message} ${code}`);
}

export function isWalletNotSubmitted(error: unknown): boolean {
  const value = error as any;
  const message = String(value?.message || error || '').toLowerCase();
  return value?.code === -4 || /not submitted/.test(message);
}
