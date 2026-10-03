import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { getConnection, CUSD_MINT } from '../wallet';
import { CUSD_DECIMALS } from '../chain';

// A small practical floor that covers normal Devnet fees plus the rent-bearing
// accounts created by setup/stake. The copy stays in SOL, never lamports.
export const MIN_DEVNET_SOL = 0.01;

export interface WalletPreflight {
  connected: boolean;
  sol: number | null;
  testUsd: number | null;
}

export function formatSol(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'Unavailable';
  return `${value.toFixed(value < 0.01 ? 3 : 2)} SOL`;
}

export function formatCusd(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'Unavailable';
  return `${value.toFixed(2)} cUSD`;
}

export async function readWalletPreflight(wallet: string | null): Promise<WalletPreflight> {
  if (!wallet) return { connected: false, sol: null, testUsd: null };
  const connection = getConnection();
  const publicKey = new PublicKey(wallet);
  const [lamports, tokenBalance] = await Promise.all([
    connection.getBalance(publicKey, 'confirmed'),
    (async () => {
      try {
        const ata = getAssociatedTokenAddressSync(CUSD_MINT, publicKey, false);
        const balance = await connection.getTokenAccountBalance(ata, 'confirmed');
        return Number(balance.value.amount) / 10 ** CUSD_DECIMALS;
      } catch {
        return 0;
      }
    })(),
  ]);
  return {
    connected: true,
    sol: Number(lamports) / 1_000_000_000,
    testUsd: tokenBalance,
  };
}

export function hasFeeBalance(preflight: WalletPreflight | null): boolean {
  return !!preflight?.connected && preflight.sol !== null && preflight.sol >= MIN_DEVNET_SOL;
}

export function hasStakeBalance(preflight: WalletPreflight | null, required: number): boolean {
  return !!preflight?.connected && preflight.testUsd !== null && preflight.testUsd >= required;
}
