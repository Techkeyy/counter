import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Take, Category } from '../types';
import { colors, spacing } from '../theme';
import { api } from '../api';

interface ChallengeModalProps {
  visible: boolean;
  take: Take | null;
  onClose: () => void;
  onChallengeCreated: () => void;
}

export const ChallengeModal: React.FC<ChallengeModalProps> = ({
  visible,
  take,
  onClose,
  onChallengeCreated,
}) => {
  const [stakeAmount, setStakeAmount] = useState('50');
  const [sideATerms, setSideATerms] = useState('');
  const [sideBTerms, setSideBTerms] = useState('');
  const [category, setCategory] = useState<Category>('CRYPTO');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (take) {
      setSideATerms(take.content);
      setSideBTerms(`Contra: ${take.topic} fails to materialize`);
      setCategory(take.category || 'CRYPTO');
    }
  }, [take]);

  const handleSubmit = async () => {
    if (!take) return;
    const stake = parseFloat(stakeAmount);
    if (isNaN(stake) || stake <= 0) {
      setError('Please enter a valid stake amount in cUSD');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await api.proposeChallenge({
        takeId: take.id,
        targetWallet: take.author_wallet,
        propositionA: sideATerms,
        propositionB: sideBTerms,
        category,
        stakeAmountUsd: stake,
        cutoffTs: Date.now() + 24 * 3600 * 1000, // 24 hours lock
        resolutionTs: Date.now() + 48 * 3600 * 1000,
        sourceType: category,
        sourceConfig: {
          category,
          targetPriceUsd: 250,
          condition: 'GTE',
        },
      });

      setLoading(false);
      onChallengeCreated();
      onClose();
    } catch (err: any) {
      setLoading(false);
      setError(err.message || 'Failed to issue challenge');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>⚔️ ISSUE 1V1 CHALLENGE</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {error && <Text style={styles.errorText}>{error}</Text>}

            <Text style={styles.label}>Challenging Contender</Text>
            <View style={styles.readonlyBox}>
              <Text style={styles.readonlyText}>
                @{take?.author_handle || take?.author_wallet.slice(0, 8)}
              </Text>
            </View>

            <Text style={styles.label}>Captain A Terms (Author's Position)</Text>
            <TextInput
              style={styles.input}
              value={sideATerms}
              onChangeText={setSideATerms}
              placeholder="Side A terms"
              placeholderTextColor={colors.textMuted}
              multiline
            />

            <Text style={styles.label}>Captain B Terms (Your Counter-Position)</Text>
            <TextInput
              style={styles.input}
              value={sideBTerms}
              onChangeText={setSideBTerms}
              placeholder="Side B counter terms"
              placeholderTextColor={colors.textMuted}
              multiline
            />

            <Text style={styles.label}>Initial Captain Stake (cUSD)</Text>
            <View style={styles.stakeRow}>
              {['25', '50', '100', '250', '500'].map((amt) => (
                <TouchableOpacity
                  key={amt}
                  style={[styles.stakePreset, stakeAmount === amt && styles.stakePresetActive]}
                  onPress={() => setStakeAmount(amt)}
                >
                  <Text style={[styles.stakePresetText, stakeAmount === amt && styles.stakePresetTextActive]}>
                    ${amt}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={styles.stakeInput}
              value={stakeAmount}
              onChangeText={setStakeAmount}
              placeholder="Custom cUSD amount"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
            />

            <Text style={styles.note}>
              🔒 Stakes will be locked into Counter PDA Vault on-chain once accepted.
            </Text>

            <TouchableOpacity
              style={styles.submitButton}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.submitText}>PROPOSE CHALLENGE</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  content: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.xl,
    maxHeight: '90%',
    borderTopWidth: 1,
    borderColor: colors.cardBorder,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1,
  },
  closeBtn: {
    padding: 4,
  },
  closeText: {
    color: colors.textMuted,
    fontSize: 18,
    fontWeight: '700',
  },
  body: {
    marginBottom: spacing.lg,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
    marginTop: spacing.md,
    textTransform: 'uppercase',
  },
  readonlyBox: {
    backgroundColor: colors.surfaceLight,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  readonlyText: {
    color: colors.solanaGreen,
    fontWeight: '700',
  },
  input: {
    backgroundColor: colors.surfaceLight,
    color: colors.textPrimary,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    minHeight: 50,
  },
  stakeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  stakePreset: {
    flex: 1,
    backgroundColor: colors.surfaceLight,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  stakePresetActive: {
    backgroundColor: 'rgba(153, 69, 255, 0.2)',
    borderColor: colors.solanaPurple,
  },
  stakePresetText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  stakePresetTextActive: {
    color: colors.solanaPurple,
    fontWeight: '900',
  },
  stakeInput: {
    backgroundColor: colors.surfaceLight,
    color: colors.textPrimary,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    fontSize: 16,
    fontWeight: '800',
  },
  note: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  errorText: {
    color: colors.duelCrimson,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  submitButton: {
    backgroundColor: colors.solanaPurple,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  submitText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1,
  },
});
