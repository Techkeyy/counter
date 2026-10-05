import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  AppState,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import * as Linking from 'expo-linking';
import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { Duel } from '../types';
import { colors, spacing, borderRadius, touchMin } from '../theme';
import { Icon } from './Icon';
import { api } from '../api';
import { getConnection } from '../wallet';
import {
  ChainAccounts,
  buildDepositStakeIx,
  buildUserAtaCreateIxIfNeeded,
  mwaSignSendConfirm,
  usdToBaseUnits,
  CUSD_DECIMALS,
  CUSD_MINT,
} from '../chain';
import { createWalletAttempt, isWalletCancellation, WalletFlowError, walletStage } from '../diagnostics';
import type { WalletAttempt } from '../diagnostics';
import { formatCusd, formatSol, hasFeeBalance, hasStakeBalance, readWalletPreflight } from '../utils/preflight';
import type { WalletPreflight } from '../utils/preflight';
import {
  clearPendingWalletOperation,
  loadPendingWalletOperation,
  savePendingWalletOperation,
} from '../session';

interface BackModalProps {
  visible: boolean;
  duel: Duel | null;
  side: 1 | 2; // 1 = Side A, 2 = Side B
  userWallet: string | null;
  onClose: () => void;
  onStakeRecorded: () => void;
}

export const BackModal: React.FC<BackModalProps> = ({
  visible,
  duel,
  side,
  userWallet,
  onClose,
  onStakeRecorded,
}) => {
  const [amount, setAmount] = useState(String(duel?.stake_amount_usd || '0'));
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsFunding, setNeedsFunding] = useState(false);
  const [funding, setFunding] = useState(false);
  const [balances, setBalances] = useState<WalletPreflight | null>(null);
  const [pendingSignature, setPendingSignature] = useState<string | null>(null);
  const attemptRef = React.useRef<WalletAttempt | null>(null);

  useEffect(() => {
    if (!visible) return;
    setAmount(String(duel?.stake_amount_usd || '0'));
    (async () => {
      try { setBalances(await readWalletPreflight(userWallet)); } catch { setBalances(null); }
    })();
    loadPendingWalletOperation().then((pending) => {
      if (pending?.operationType === 'STAKE' && pending.resourceId === duel?.id) {
        setPendingSignature(pending.signature || null);
        if (!pending.signature) setError('A stake attempt was interrupted. Counter found no signature; review funding before retrying.');
      }
    }).catch(() => {});
  }, [visible, duel?.id, userWallet]);

  useEffect(() => {
    if (!visible) return;
    let previousState = AppState.currentState;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (previousState !== 'active' && nextState === 'active') {
        readWalletPreflight(userWallet).then(setBalances).catch(() => setBalances(null));
        if (pendingSignature) handleCheckStakeStatus();
      }
      previousState = nextState;
    });
    return () => subscription.remove();
  }, [visible, userWallet, pendingSignature]);

  if (!duel) return null;

  const requiredStake = Number(duel.stake_amount_usd || 0);
  const hasSol = hasFeeBalance(balances);
  const hasCusd = hasStakeBalance(balances, requiredStake);
  const canContinue = !!userWallet && hasSol && hasCusd;

  // Devnet test-cUSD faucet. Success is ONLY marked after the wallet's ACTUAL
  // token balance is re-read on-chain — never on HTTP 200 alone. The returned
  // mint must equal the authoritative AXMB7 mint.
  const handleFaucet = async () => {
    if (!userWallet) {
      setError('Connect a Solana wallet first (MWA).');
      return;
    }
    setFunding(true);
    setError(null);
    setStatus('Requesting Counter Test USD from the Devnet faucet.');
    try {
      const res = await api.requestFaucet();
      if (res.tokenMint !== CUSD_MINT.toBase58()) {
        throw new Error(
          `Faucet misconfigured: issued ${res.tokenMint.slice(0, 8)}…, expected the Counter test mint. Funding NOT counted.`
        );
      }
      // Re-read the ACTUAL on-chain balance (retry: mint visibility lags).
      const conn = getConnection();
      const user = new PublicKey(userWallet);
      const ata: PublicKey = getAssociatedTokenAddressSync(CUSD_MINT, user, false);
      let refreshed: number | null = null;
      for (let attempt = 0; attempt < 6; attempt++) {
        try {
          const bal = await conn.getTokenAccountBalance(ata);
          refreshed = Number(bal.value.amount) / 10 ** CUSD_DECIMALS;
          if (refreshed > 0) break;
        } catch {}
        await new Promise((r) => setTimeout(r, 1500));
      }
      if (refreshed === null || refreshed <= 0) {
        throw new Error(
          `Faucet tx ${res.txSignature.slice(0, 8)}… confirmed but the balance refresh failed. Check the explorer link, then retry.`
        );
      }
      setStatus(`Funded $${refreshed.toFixed(2)} Counter Test USD (Devnet, no monetary value). You can deposit now.`);
      setNeedsFunding(false);
      try { setBalances(await readWalletPreflight(userWallet)); } catch {}
    } catch (err: any) {
      const msg: string = err?.message || 'Faucet request failed';
      if (/24 hours|Rate limit|429/i.test(msg)) {
        setError('Faucet rate limit: one Devnet claim per 24 hours per wallet. Try again later.');
      } else {
        setError(msg);
      }
      setStatus(null);
    } finally {
      setFunding(false);
    }
  };

  const handleGetSol = async () => {
    try {
      await Linking.openURL('https://faucet.solana.com/');
    } catch {
      setError('Open the official Solana Devnet faucet to get testnet SOL.');
    }
  };

  const handleDeposit = async () => {
    if (!userWallet) {
      setError('Connect a Solana wallet first to lock your captain stake.');
      return;
    }
    let stakeUsd: number;
    let amountBase: number;
    try {
      stakeUsd = requiredStake;
      amountBase = usdToBaseUnits(String(requiredStake));
    } catch {
      setError('Please enter a valid cUSD stake amount');
      return;
    }

    setLoading(true);
    setError(null);
    const attempt = createWalletAttempt(duel.id, 'STAKE');
    attemptRef.current = attempt;
    setPendingSignature(null);
    walletStage(attempt, 'START');
    setStatus(`Preparing your $${stakeUsd.toFixed(2)} stake.`);
    let backendVerifyStarted = false;

    try {
      await savePendingWalletOperation(undefined, {
        operationId: attempt.attemptId,
        operationType: 'STAKE',
        resourceId: duel.id,
        expectedWallet: userWallet,
        stage: 'CHAIN_ACCOUNTS_START',
      });
      if (!canContinue) throw new Error('Complete the funding steps before opening your wallet.');
      // 1. Canonical accounts from the backend (single-derivation rule).
      const acct = (await api.getChainAccounts(duel.id, userWallet)) as ChainAccounts;
      if (acct.chainStatus !== 'INITIALIZED') {
        throw new Error('Duel is not initialized on-chain yet. Ask a captain to initialize it first.');
      }
      const user = new PublicKey(userWallet);

      // 2. Balance check against the real cUSD token account.
      const conn = getConnection();
      let userAtaExists = false;
      let balanceBase = 0;
      try {
        const bal = await conn.getTokenAccountBalance(new PublicKey(acct.userAta!));
        userAtaExists = true;
        balanceBase = Number(bal.value.amount);
      } catch {
        userAtaExists = false;
      }
      if (balanceBase < amountBase) {
        const have = (balanceBase / 10 ** CUSD_DECIMALS).toFixed(2);
        setNeedsFunding(true);
        throw new Error(
          userAtaExists
            ? `Insufficient Counter Test USD (have $${have}, need $${stakeUsd}). Use the faucet button below, then retry.`
            : `No Counter Test USD yet (need $${stakeUsd}). Use the faucet button below, then retry.`
        );
      }
      setNeedsFunding(false);

      // 3. Build the REAL DepositStake instruction (+ ATA creation if needed).
      setStatus(`Phantom will open to stake $${stakeUsd.toFixed(2)}.`);
      await new Promise((resolve) => setTimeout(resolve, 250));
      const ixs = [];
      const ataIx = buildUserAtaCreateIxIfNeeded(user, userAtaExists);
      if (ataIx) ixs.push(ataIx);
      ixs.push(buildDepositStakeIx(acct, user, side, amountBase));

      // 4. MWA sign + send + confirm on Devnet.
      setStatus('Waiting for wallet approval…');
      const signature = await mwaSignSendConfirm(ixs, user, undefined, attempt);
      await savePendingWalletOperation(undefined, {
        operationId: attempt.attemptId,
        operationType: 'STAKE',
        resourceId: duel.id,
        expectedWallet: userWallet,
        stage: 'TX_CONFIRMED',
        signature,
      });

      // 5. Backend independently verifies the tx before indexing.
      setStatus('Submitting your stake…');
      backendVerifyStarted = true;
      walletStage(attempt, 'BACKEND_VERIFY_START');
      await api.recordStake(duel.id, side, stakeUsd, signature, acct.positionPda);
      walletStage(attempt, 'BACKEND_VERIFY_OK');
      walletStage(attempt, 'UI_SUCCESS');
      setPendingSignature(null);
      await clearPendingWalletOperation();

      setLoading(false);
      setStatus('Stake confirmed');
      onStakeRecorded();
      onClose();
    } catch (err: any) {
      setLoading(false);
      if (backendVerifyStarted) walletStage(attempt, 'BACKEND_VERIFY_FAILED');
      setStatus(null);
      if (err instanceof WalletFlowError && err.signature) {
        setPendingSignature(err.signature);
        await savePendingWalletOperation(undefined, {
          operationId: attempt.attemptId,
          operationType: 'STAKE',
          resourceId: duel.id,
          expectedWallet: userWallet,
          stage: 'TX_SUBMITTED',
          signature: err.signature,
        });
        setError('Stake transaction submitted but not confirmed yet. Check status before retrying.');
      } else {
        setError(isWalletCancellation(err) ? 'Approval cancelled. Nothing was changed.' : "Couldn't submit your stake. Try again.");
      }
    }
  };

  const handleCheckStakeStatus = async () => {
    const signature = pendingSignature;
    if (!signature || !userWallet) {
      setError('No submitted stake transaction was found.');
      return;
    }
    const attempt = attemptRef.current || createWalletAttempt(duel.id, 'STAKE');
    attemptRef.current = attempt;
    setLoading(true);
    setError(null);
    setStatus('Checking stake transaction status…');
    let backendVerifyStarted = false;
    try {
      const status = (await getConnection().getSignatureStatuses([signature], { searchTransactionHistory: true })).value[0];
      if (status?.err) {
        walletStage(attempt, 'TX_CONFIRM_FAILED');
        setPendingSignature(null);
        await clearPendingWalletOperation();
        setStatus(null);
        setError(`Devnet rejected the stake transaction: ${JSON.stringify(status.err)}`);
        return;
      }
      if (!status || !['confirmed', 'finalized'].includes(String(status.confirmationStatus))) {
        walletStage(attempt, 'TX_CONFIRM_FAILED');
        setStatus('Stake transaction is not confirmed yet. Check status again later.');
        return;
      }
      walletStage(attempt, 'TX_CONFIRMED');
      backendVerifyStarted = true;
      walletStage(attempt, 'BACKEND_VERIFY_START');
      const acct = (await api.getChainAccounts(duel.id, userWallet)) as ChainAccounts;
      await api.recordStake(duel.id, side, requiredStake, signature, acct.positionPda);
      walletStage(attempt, 'BACKEND_VERIFY_OK');
      walletStage(attempt, 'UI_SUCCESS');
      setPendingSignature(null);
      await clearPendingWalletOperation();
      setStatus('Stake confirmed');
      onStakeRecorded();
      onClose();
    } catch (err: any) {
      if (backendVerifyStarted) walletStage(attempt, 'BACKEND_VERIFY_FAILED');
      setStatus(null);
      setError(err?.message || 'Transaction confirmed, but Counter could not verify the stake yet. Check status again.');
    } finally {
      setLoading(false);
    }
  };

  const sideColor = side === 1 ? colors.sideA : colors.sideB;
  const proposition = side === 1 ? duel.proposition_a : duel.proposition_b;

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={styles.overlay}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: sideColor }]}>
              Lock your agreed stake
            </Text>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              accessibilityLabel="Close back sheet"
              accessibilityRole="button"
            >
              <Icon name="x" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <View style={styles.propBox}>
            <Text style={styles.propText}>{proposition}</Text>
          </View>

          <Text style={styles.label}>Ready to stake</Text>
          <Text style={styles.explanation}>Your agreed stake is fixed at {requiredStake.toFixed(2)} cUSD. No side selection is needed.</Text>
          <View style={styles.preflightBox}>
            <PreflightRow label="Wallet" value={userWallet ? 'Connected' : 'Connect wallet'} ready={!!userWallet} />
            <PreflightRow label="Devnet SOL" value={formatSol(balances?.sol ?? null)} ready={hasSol} />
            {!hasSol && (
              <TouchableOpacity style={styles.linkBtn} onPress={handleGetSol} accessibilityLabel="Get SOL" accessibilityRole="button">
                <Text style={styles.linkText}>Get SOL</Text>
              </TouchableOpacity>
            )}
            <PreflightRow label="Counter Test USD" value={formatCusd(balances?.testUsd ?? null)} ready={hasCusd} />
            {!hasCusd && (
              <TouchableOpacity style={styles.linkBtn} onPress={handleFaucet} disabled={funding} accessibilityLabel="Get test funds" accessibilityRole="button">
                <Text style={styles.linkText}>{funding ? 'Refreshing…' : 'Get test funds'}</Text>
              </TouchableOpacity>
            )}
            <View style={styles.requiredRow}>
              <Text style={styles.requiredLabel}>Stake required</Text>
              <Text style={styles.requiredValue}>{requiredStake.toFixed(2)} cUSD</Text>
            </View>
          </View>

          {error && <Text style={styles.errorText}>{error}</Text>}
          {status && !error && <Text style={styles.statusText}>{status}</Text>}

          <TouchableOpacity
            style={[styles.submitBtn, { backgroundColor: canContinue ? sideColor : colors.surfaceLight }]}
            onPress={pendingSignature ? handleCheckStakeStatus : handleDeposit}
            disabled={loading || (!pendingSignature && !canContinue)}
            activeOpacity={0.8}
            accessibilityLabel={`Lock ${requiredStake.toFixed(0)} cUSD`}
            accessibilityRole="button"
          >
            {loading ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.submitText}>{pendingSignature ? 'Check status' : canContinue ? `Lock ${requiredStake.toFixed(0)} cUSD` : 'Complete funding first'}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const PreflightRow: React.FC<{ label: string; value: string; ready: boolean }> = ({ label, value, ready }) => (
  <View style={styles.preflightRow}>
    <Text style={styles.preflightLabel}>{ready ? '✓ ' : ''}{label}</Text>
    <Text style={[styles.preflightValue, ready && styles.preflightReady]}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  content: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  closeBtn: {
    minHeight: touchMin,
    minWidth: touchMin,
    justifyContent: 'center',
    alignItems: 'center',
  },
  propBox: {
    backgroundColor: colors.surfaceLight,
    padding: spacing.md,
    borderRadius: 12,
    marginBottom: spacing.md,
    borderLeftWidth: 3,
    borderColor: colors.cardBorder,
  },
  propText: {
    color: colors.textPrimary,
    fontSize: 13,
    lineHeight: 18,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  explanation: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: spacing.md,
  },
  preflightBox: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  preflightRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 30,
  },
  preflightLabel: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  preflightValue: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  preflightReady: { color: colors.success },
  linkBtn: {
    alignSelf: 'flex-start',
    minHeight: touchMin,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  linkText: { color: colors.brandPrimary, fontSize: 13, fontWeight: '800' },
  requiredRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
  },
  requiredLabel: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
  requiredValue: { color: colors.textPrimary, fontSize: 14, fontWeight: '900' },
  presetRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  presetBtn: {
    flex: 1,
    backgroundColor: colors.surfaceLight,
    minHeight: touchMin,
    justifyContent: 'center',
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  presetText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  input: {
    backgroundColor: colors.surfaceLight,
    color: colors.textPrimary,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: spacing.md,
  },
  previewBox: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    padding: spacing.md,
    gap: 6,
    marginBottom: spacing.md,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  previewLabel: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  previewValue: {
    fontSize: 13,
    fontWeight: '800',
  },
  payoutValue: {
    color: colors.solanaGreen,
    fontSize: 13,
    fontWeight: '900',
  },
  errorText: {
    color: colors.duelCrimson,
    fontSize: 12,
    marginBottom: spacing.sm,
  },
  statusText: {
    color: colors.textSecondary,
    fontSize: 12,
    marginBottom: spacing.sm,
  },
  submitBtn: {
    minHeight: touchMin + 4,
    justifyContent: 'center',
    borderRadius: 12,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  submitText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '800',
  },
  faucetBtn: {
    backgroundColor: colors.warning,
    minHeight: touchMin,
    justifyContent: 'center',
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  faucetBtnText: {
    color: '#000',
    fontSize: 13,
    fontWeight: '800',
  },
});
