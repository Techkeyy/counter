import { NativeModules, Platform } from 'react-native';
import { walletKeepaliveStage } from './diagnostics';

export type KeepaliveOperation = 'CONNECT' | 'DUEL_INIT' | 'STAKE' | 'SETTLEMENT' | 'CLAIM' | 'REFUND';

type NativeKeepalive = {
  start?: (operationType: string, operationId: string) => Promise<boolean>;
  stop?: () => Promise<boolean>;
};

const nativeKeepalive = NativeModules.CounterWalletKeepalive as NativeKeepalive | undefined;

/** Start the short native foreground window before any MWA association. */
export async function startWalletKeepalive(operation: KeepaliveOperation, operationId: string): Promise<void> {
  walletKeepaliveStage(operationId, 'KEEPALIVE_START');
  if (Platform.OS !== 'android' || !nativeKeepalive?.start) {
    walletKeepaliveStage(operationId, 'KEEPALIVE_UNAVAILABLE');
    return;
  }
  try {
    const active = await nativeKeepalive.start(operation, operationId);
    walletKeepaliveStage(operationId, active === false ? 'KEEPALIVE_UNAVAILABLE' : 'KEEPALIVE_ACTIVE');
  } catch {
    walletKeepaliveStage(operationId, 'KEEPALIVE_ERROR');
  }
}

/** Stop the native foreground window on every terminal wallet outcome. */
export async function stopWalletKeepalive(operationId: string): Promise<void> {
  try {
    await nativeKeepalive?.stop?.();
  } catch {}
  walletKeepaliveStage(operationId, 'KEEPALIVE_STOP');
}
