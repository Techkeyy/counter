import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
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
  const [amount, setAmount] = useState('50');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsFunding, setNeedsFunding] = useState(false);
  const [funding, setFunding] = useState(false);

  if (!duel) return null;

  const currentPoolA = Number(duel.side_a_total) || 0;
  const currentPoolB = Number(duel.side_b_total) || 0;
  const stakeNum = parseFloat(amount) || 0;

  // Calculate new odds if user backs this side
  const simPoolA = side === 1 ? currentPoolA + stakeNum : currentPoolA;
  const simPoolB = side === 2 ? currentPoolB + stakeNum : currentPoolB;
  const simTotal = simPoolA + simPoolB;
  const simOdds = side === 1 
    ? (simPoolA > 0 ? (simTotal / simPoolA).toFixed(2) : '2.00')
    : (simPoolB > 0 ? (simTotal / simPoolB).toFixed(2) : '2.00');

  const potentialPayout = (stakeNum * parseFloat(simOdds)).toFixed(2);

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

  const handleDeposit = async () => {
    if (!userWallet) {
      setError('Connect a Solana wallet first (MWA) to back a side.');
      return;
    }
    let stakeUsd: number;
    let amountBase: number;
    try {
      stakeUsd = parseFloat(amount);
      amountBase = usdToBaseUnits(amount);
    } catch {
      setError('Please enter a valid cUSD stake amount');
      return;
    }

    setLoading(true);
    setError(null);
    setStatus('Fetching canonical duel accounts…');

    try {
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
      setStatus('Approve the stake in your wallet…');
      const ixs = [];
      const ataIx = buildUserAtaCreateIxIfNeeded(user, userAtaExists);
      if (ataIx) ixs.push(ataIx);
      ixs.push(buildDepositStakeIx(acct, user, side, amountBase));

      // 4. MWA sign + send + confirm on Devnet.
      setStatus('Sending to Devnet…');
      const signature = await mwaSignSendConfirm(ixs, user);

      // 5. Backend independently verifies the tx before indexing.
      setStatus('Verifying on-chain deposit…');
      await api.recordStake(duel.id, side, stakeUsd, signature, acct.positionPda);

      setLoading(false);
      setStatus(null);
      onStakeRecorded();
      onClose();
    } catch (err: any) {
      setLoading(false);
      setStatus(null);
      setError(err.message || 'Failed to deposit stake');
    }
  };

  const sideLabel = side === 1 ? 'SIDE A' : 'SIDE B';
  const sideColor = side === 1 ? colors.sideA : colors.sideB;
  const captainName = side === 1 ? duel.captain_a_name : duel.captain_b_name;
  const proposition = side === 1 ? duel.proposition_a : duel.proposition_b;

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={styles.overlay}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: sideColor }]}>
              Back {sideLabel} · {captainName || 'TBD'}
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

          <Text style={styles.label}>Backer Stake (cUSD)</Text>
          <View style={styles.presetRow}>
            {['10', '25', '50', '100', '250'].map((amt) => (
              <TouchableOpacity
                key={amt}
                style={[styles.presetBtn, amount === amt && { borderColor: sideColor, backgroundColor: 'rgba(255,255,255,0.06)' }]}
                onPress={() => setAmount(amt)}
              >
                <Text style={[styles.presetText, amount === amt && { color: sideColor, fontWeight: '800' }]}>
                  ${amt}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TextInput
            style={styles.input}
            value={amount}
            onChangeText={setAmount}
            placeholder="cUSD amount"
            placeholderTextColor={colors.textMuted}
            keyboardType="numeric"
          />

          {/* Live Odds & Return Preview */}
          <View style={styles.previewBox}>
            <View style={styles.previewRow}>
              <Text style={styles.previewLabel}>Effective Odds:</Text>
              <Text style={[styles.previewValue, { color: sideColor }]}>{simOdds}x</Text>
            </View>
            <View style={styles.previewRow}>
              <Text style={styles.previewLabel}>Potential Payout on Win:</Text>
              <Text style={styles.payoutValue}>${potentialPayout} cUSD</Text>
            </View>
          </View>

          {error && <Text style={styles.errorText}>{error}</Text>}
          {status && !error && <Text style={styles.statusText}>{status}</Text>}

          {needsFunding && (
            <TouchableOpacity
              style={styles.faucetBtn}
              onPress={handleFaucet}
              disabled={funding || loading}
              activeOpacity={0.8}
            >
              {funding ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={styles.faucetBtnText}>Get Counter Test USD (Devnet, no cash value)</Text>
              )}
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.submitBtn, { backgroundColor: sideColor }]}
            onPress={handleDeposit}
            disabled={loading}
            activeOpacity={0.8}
            accessibilityLabel={`Deposit ${stakeNum || 0} test cUSD on ${sideLabel}`}
            accessibilityRole="button"
          >
            {loading ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.submitText}>Deposit test cUSD</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

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
