export type WalletOperation = 'DUEL_INIT' | 'STAKE' | 'SETTLEMENT' | 'CLAIM' | 'REFUND';

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

export interface WalletAttempt {
  duelId: string;
  operation: WalletOperation;
  attemptId: string;
}

let attemptSequence = 0;

/** Create a value-free correlation identity for one wallet operation. */
export function createWalletAttempt(duelId: string, operation: WalletOperation): WalletAttempt {
  attemptSequence += 1;
  return {
    duelId,
    operation,
    attemptId: `${operation.toLowerCase()}_${Date.now().toString(36)}_${attemptSequence.toString(36)}`,
  };
}

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
// never include auth tokens, wallet secrets, or raw request data. A public
// transaction signature is intentionally not logged; the backend/API remains
// the authoritative signature ledger.
export function walletStage(attempt: WalletAttempt, stage: WalletStage): void {
  try {
    console.info(
      `[COUNTER][WALLET][duel=${attempt.duelId}][attempt=${attempt.attemptId}]` +
      `[operation=${attempt.operation}][stage=${stage}]`
    );
  } catch {}
}

export function lifecycleStage(stage: 'APP_BACKGROUND' | 'APP_RESUME'): void {
  try {
    console.info(`[COUNTER][WALLET][${stage}]`);
  } catch {}
}

export type WalletKeepaliveStage =
  | 'KEEPALIVE_START'
  | 'KEEPALIVE_ACTIVE'
  | 'KEEPALIVE_STOP'
  | 'KEEPALIVE_UNAVAILABLE'
  | 'KEEPALIVE_ERROR';

/** Keepalive markers are correlation-only and never carry wallet material. */
export function walletKeepaliveStage(operationId: string, stage: WalletKeepaliveStage): void {
  try {
    console.info(`[COUNTER][WALLET_KEEPALIVE][operation=${operationId}][stage=${stage}]`);
  } catch {}
}

export type ConnectStage =
  | 'CONNECT_START'
  | 'CONNECT_STATE_SAVED'
  | 'CONNECT_MWA_TRANSACT_START'
  | 'CONNECT_CALLBACK_ENTER'
  | 'CONNECT_AUTHORIZE_START'
  | 'CONNECT_AUTHORIZE_OK'
  | 'CONNECT_AUTH_PERSISTED'
  | 'CONNECT_SIGN_IN_START'
  | 'CONNECT_SIGN_IN_RETURN'
  | 'CONNECT_VERIFY_START'
  | 'CONNECT_VERIFY_OK'
  | 'CONNECT_PROFILE_START'
  | 'CONNECT_PROFILE_OK'
  | 'CONNECT_SESSION_SAVED'
  | 'CONNECT_COMPLETE'
  | 'CONNECT_RESUME_FOUND_PENDING'
  | 'CONNECT_REASSOCIATE_START'
  | 'CONNECT_REAUTHORIZE_START'
  | 'CONNECT_REAUTHORIZE_OK'
  | 'CONNECT_RECOVERY_COMPLETE'
  | 'CONNECT_CANCELLED'
  | 'CONNECT_INTERRUPTED'
  | 'CONNECT_TIMEOUT'
  | 'CONNECT_AUTH_FAILED'
  | 'CONNECT_ERROR';

/** Connect markers are correlation-only: never append wallet or auth values. */
export function connectStage(attemptId: string, stage: ConnectStage): void {
  try {
    console.info(`[COUNTER][CONNECT][attempt=${attemptId}][stage=${stage}]`);
  } catch {}
}

export type AcceptTransitionStage =
  | 'ACCEPT_UI_START'
  | 'ACCEPT_HTTP_OK'
  | 'ACCEPT_DUEL_RECEIVED'
  | 'ACCEPT_DUEL_ID_COMMITTED'
  | 'CHALLENGE_UI_CLOSE_REQUESTED'
  | 'CHALLENGE_SHEET_DISMISS_START'
  | 'CHALLENGE_SHEET_DISMISSED'
  | 'DUEL_DETAIL_SELECT'
  | 'DUEL_ROUTE_COMMITTED'
  | 'DUEL_DETAIL_MOUNT'
  | 'DUEL_DETAIL_REQUEST_START'
  | 'DUEL_DETAIL_REQUEST_HTTP_OK'
  | 'DUEL_DETAIL_REQUEST_FAILED'
  | 'DUEL_DETAIL_NORMALIZE_OK'
  | 'DUEL_DETAIL_NORMALIZE_FAILED'
  | 'DUEL_DETAIL_DATA_OK'
  | 'DUEL_DETAIL_DATA_ERROR'
  | 'DUEL_DETAIL_STATE_MAPPED'
  | 'DUEL_DETAIL_READY'
  | 'DUEL_DETAIL_RENDER_READY'
  | 'DUEL_DETAIL_RENDER_FAILED'
  | 'DUEL_DETAIL_BOUNDARY_DATA_ERROR'
  | 'DUEL_DETAIL_BOUNDARY_RENDER_THROW';

export interface AcceptTransitionContext {
  challengeId: string;
  duelId?: string;
  attemptId: string;
  mappedState?: string;
  httpStatus?: number;
  errorClass?: string;
  errorCode?: string;
}

// Accept/detail transition markers are deliberately value-free. They correlate
// one public challenge/Duel without recording auth, wallet, or transaction data.
export function acceptTransitionStage(stage: AcceptTransitionStage, context: AcceptTransitionContext): void {
  try {
    const duelPart = context.duelId ? `[duel=${context.duelId}]` : '';
    const safePart = (label: string, value?: string) => {
      const safe = String(value || '');
      return /^[A-Za-z0-9_.:-]{1,80}$/.test(safe) ? `[${label}=${safe}]` : '';
    };
    console.info(
      `[COUNTER][ACCEPT_TRANSITION][challenge=${context.challengeId}]` +
      `${duelPart}[attempt=${context.attemptId}][stage=${stage}]` +
      safePart('mappedState', context.mappedState) +
      safePart('httpStatus', context.httpStatus === undefined ? undefined : String(context.httpStatus)) +
      safePart('errorClass', context.errorClass) +
      safePart('errorCode', context.errorCode)
    );
  } catch {}
}

export type DuelSelectionStage = 'DUEL_SELECTION_SET' | 'DUEL_SELECTION_CLEARED';
export type DuelSelectionReason =
  | 'BACK_TO_DUELS'
  | 'ACCOUNT_CHANGED'
  | 'DISCONNECT'
  | 'REPLACED_SELECTION'
  | 'DUEL_ROW'
  | 'ACTIVITY_NOTIFICATION'
  | 'DEEP_LINK'
  | 'ACCEPTED_CHALLENGE'
  | 'RECEIPT_VIEW';

/** Selection markers carry only the public Duel id and a bounded lifecycle reason. */
export function duelSelectionStage(
  stage: DuelSelectionStage,
  context: { duelId?: string; reason: DuelSelectionReason },
): void {
  try {
    const duelPart = context.duelId ? `[duel=${context.duelId}]` : '';
    console.info(`[COUNTER][DUEL_SELECTION]${duelPart}[stage=${stage}][reason=${context.reason}]`);
  } catch {}
}

export type SyncDiagnosticStage = 'SYNC_REFRESH' | 'ACTIVE_WALLET_CHANGED' | 'MUTATION_SUCCEEDED';

/** Sync markers deliberately omit the active wallet value and all auth material. */
export function syncStage(stage: SyncDiagnosticStage, reason: string): void {
  try {
    const safeReason = String(reason || '').replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 80) || 'UNKNOWN';
    console.info(`[COUNTER][SYNC][stage=${stage}][reason=${safeReason}]`);
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
