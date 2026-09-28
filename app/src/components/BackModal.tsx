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
import { Duel } from '../types';
import { colors, spacing } from '../theme';
import { api } from '../api';

interface BackModalProps {
  visible: boolean;
  duel: Duel | null;
  side: 1 | 2; // 1 = Side A, 2 = Side B
  onClose: () => void;
  onStakeRecorded: () => void;
}

export const BackModal: React.FC<BackModalProps> = ({
  visible,
  duel,
  side,
  onClose,
  onStakeRecorded,
}) => {
  const [amount, setAmount] = useState('50');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const handleDeposit = async () => {
    if (stakeNum <= 0) {
      setError('Please enter a valid cUSD stake amount');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await api.recordStake(duel.id, side, stakeNum);
      setLoading(false);
      onStakeRecorded();
      onClose();
    } catch (err: any) {
      setLoading(false);
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
              + BACK {sideLabel} ({captainName})
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>✕</Text>
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

          <TouchableOpacity
            style={[styles.submitBtn, { backgroundColor: sideColor }]}
            onPress={handleDeposit}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.submitText}>CONFIRM & DEPOSIT CUSD</Text>
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
    padding: 4,
  },
  closeText: {
    color: colors.textMuted,
    fontSize: 18,
    fontWeight: '700',
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
    paddingVertical: 8,
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
  submitBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  submitText: {
    color: '#000',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
});
