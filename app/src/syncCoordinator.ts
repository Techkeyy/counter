import { useCallback, useEffect, useRef } from 'react';

export type SyncEventType = 'SYNC_REFRESH' | 'ACTIVE_WALLET_CHANGED' | 'MUTATION_SUCCEEDED';

export interface SyncEvent {
  type: SyncEventType;
  reason: string;
  wallet: string | null;
  revision: number;
  at: number;
}

type Listener = (event: SyncEvent) => void;

/**
 * One foreground authority for user-scoped social/Duel refreshes. Screens do
 * not own independent polling timers; they subscribe to this coordinator and
 * reload their authoritative API slice on the same revision.
 */
class SyncCoordinator {
  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private foreground = false;
  private wallet: string | null = null;
  private revision = 0;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setForeground(isForeground: boolean): void {
    if (this.foreground === isForeground) return;
    this.foreground = isForeground;
    if (isForeground) {
      this.startPolling();
      this.requestSync('APP_RESUME');
    } else {
      this.stopPolling();
    }
  }

  setActiveWallet(wallet: string | null): void {
    if (this.wallet === wallet) return;
    this.wallet = wallet;
    this.emit('ACTIVE_WALLET_CHANGED', 'ACTIVE_WALLET_CHANGED');
  }

  requestSync(reason: string): void {
    this.emit('SYNC_REFRESH', reason);
  }

  mutationSucceeded(reason: string): void {
    this.emit('MUTATION_SUCCEEDED', reason);
  }

  dispose(): void {
    this.stopPolling();
    this.listeners.clear();
  }

  private startPolling(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      if (this.foreground) this.requestSync('FOREGROUND_INTERVAL');
    }, 4000);
  }

  private stopPolling(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private emit(type: SyncEventType, reason: string): void {
    this.revision += 1;
    const event: SyncEvent = {
      type,
      reason,
      wallet: this.wallet,
      revision: this.revision,
      at: Date.now(),
    };
    for (const listener of Array.from(this.listeners)) {
      try { listener(event); } catch {}
    }
  }
}

export const syncCoordinator = new SyncCoordinator();

/** Subscribe one screen store with in-flight protection. */
export function useSyncRefresh(load: () => Promise<void> | void): () => Promise<void> {
  const loadRef = useRef(load);
  const inFlightRef = useRef(false);
  useEffect(() => { loadRef.current = load; }, [load]);

  const refresh = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try { await loadRef.current(); } finally { inFlightRef.current = false; }
  }, []);

  useEffect(() => syncCoordinator.subscribe((event) => {
    if (event.type === 'SYNC_REFRESH' || event.type === 'MUTATION_SUCCEEDED' || event.type === 'ACTIVE_WALLET_CHANGED') {
      void refresh();
    }
  }), [refresh]);

  return refresh;
}
