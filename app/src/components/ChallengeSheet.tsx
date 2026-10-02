import React, { useState, useEffect } from 'react';
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
import { Challenge, Duel } from '../types';
import { colors, typography, spacing, borderRadius, touchMin } from '../theme';
import { Icon } from './Icon';
import { api } from '../api';
import { describeCriteria, formatDeadline } from '../utils/criteria';
import { formatUserDisplayName, INCOMPLETE_PROFILE_NAME } from '../utils/identity';

interface ChallengeSheetProps {
  challenge: Challenge | null;
  userWallet: string | null;
  onClose: () => void;
  onDecided: (duel?: Duel) => void;
}

export const ChallengeSheet: React.FC<ChallengeSheetProps> = ({
  challenge,
  userWallet,
  onClose,
  onDecided,
}) => {
  const [mode, setMode] = useState<'REVIEW' | 'COUNTER'>('REVIEW');
  const [counterStake, setCounterStake] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [challengerName, setChallengerName] = useState<string>(INCOMPLETE_PROFILE_NAME);

  useEffect(() => {
    setChallengerName(INCOMPLETE_PROFILE_NAME);
    if (!challenge) return;
    let cancelled = false;
    const otherWallet = userWallet === challenge.creator_wallet
      ? challenge.challenger_wallet
      : challenge.creator_wallet;
    const fallbackName = userWallet === challenge.creator_wallet
      ? formatUserDisplayName({ display_name: challenge.challenger_name, handle: challenge.challenger_handle, wallet: otherWallet })
      : formatUserDisplayName({ display_name: challenge.creator_name, handle: challenge.creator_handle, wallet: otherWallet });
    setChallengerName(fallbackName);
    api
      .getUserProfile(otherWallet)
      .then((user) => {
        if (!cancelled && user) {
          setChallengerName(
            formatUserDisplayName({
              display_name: user.display_name,
              handle: user.handle,
              wallet: otherWallet,
            })
          );
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [challenge?.id, userWallet]);

  if (!challenge) return null;

  const isIncoming = userWallet === challenge.creator_wallet;
  const status = challenge.status;
  const isGenericMutual = (challenge.resolution_mode || 'COUNTER_VERIFIED') === 'MUTUAL'
    && (challenge.fallback_mode || 'REFUND') === 'REFUND';

  const run = async (fn: () => Promise<any>, after: (res: any) => void) => {
    setWorking(true);
    setError(null);
    try {
      const res = await fn();
      after(res);
    } catch (err: any) {
      setError(err?.message || 'That did not work. Try again.');
    } finally {
      setWorking(false);
    }
  };

  const handleAccept = () =>
    run(() => api.acceptChallenge(challenge.id), (res) => onDecided(res?.duel));
  const handleDecline = () =>
    run(() => api.declineChallenge(challenge.id), () => onDecided());
  const handleCounter = () => {
    const stake = parseFloat(counterStake);
    if (Number.isNaN(stake) || stake <= 0) {
      setError('Enter a counter stake above zero.');
      return;
    }
    run(
      () => api.createCounteroffer(challenge.id, { stakeAmountUsd: stake }),
      () => onDecided()
    );
  };

  return (
    <Modal visible={!!challenge} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.content}>
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Icon name="swords" size={20} color={colors.brandPrimary} />
              <Text style={styles.title}>
                {status === 'COUNTERED' ? 'Countered challenge' : 'Challenge review'}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              accessibilityLabel="Close challenge review"
              accessibilityRole="button"
            >
              <Icon name="x" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {error && <Text style={styles.errorText}>{error}</Text>}

            <View style={styles.statusRow}>
              <Text style={styles.statusText}>
                {isIncoming ? `From ${challengerName} · ${status.toLowerCase()}` : `You challenged ${challengerName} · waiting for response`}
              </Text>
            </View>

            <View style={styles.termsBox}>
              <Text style={styles.termsLabel}>Side A</Text>
              <Text style={styles.termsText}>{challenge.proposition_a}</Text>
            </View>
            <View style={styles.termsBox}>
              <Text style={styles.termsLabel}>Side B (you, if you accept)</Text>
              <Text style={styles.termsText}>{challenge.proposition_b}</Text>
            </View>

            <View style={styles.factsRow}>
              <View style={styles.fact}>
                <Text style={styles.factLabel}>Stake each</Text>
                <Text style={styles.factValue}>
                  ${Number(challenge.stake_amount_usd || 0).toFixed(2)} test cUSD
                </Text>
              </View>
              <View style={styles.fact}>
                <Text style={styles.factLabel}>Staking closes</Text>
                <Text style={styles.factValue}>{formatDeadline(challenge.cutoff_ts)}</Text>
              </View>
            </View>

            <View style={styles.factsBox}>
              <Text style={styles.factLabel}>Decided by</Text>
              <Text style={styles.factValue}>
                {isGenericMutual ? 'No oracle. Both captains confirm the winner after resolution time.' : describeCriteria(challenge.source_type || challenge.category, challenge.source_config)}
              </Text>
            </View>
            <View style={styles.factsBox}>
              <Text style={styles.factLabel}>Settlement</Text>
              <Text style={styles.factValue}>
                {(challenge.resolution_mode || 'COUNTER_VERIFIED') === 'MUTUAL'
                  ? `Settle together. If no agreement, ${(challenge.fallback_mode || 'REFUND') === 'REFUND' ? 'everyone is refunded' : 'Counter Verified decides'}.`
                  : 'Counter Verified checks Open-Meteo current temperature at or after the resolution time.'}
              </Text>
            </View>

            {mode === 'COUNTER' && isIncoming ? (
              <>
                <Text style={styles.label}>Your counter stake (test cUSD)</Text>
                <TextInput
                  style={styles.input}
                  value={counterStake}
                  onChangeText={setCounterStake}
                  placeholder="e.g. 40"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                  accessibilityLabel="Counter stake amount"
                />
                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    style={styles.secondaryButton}
                    onPress={() => setMode('REVIEW')}
                    activeOpacity={0.8}
                    accessibilityLabel="Back to review"
                    accessibilityRole="button"
                  >
                    <Text style={styles.secondaryText}>Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={handleCounter}
                    disabled={working}
                    activeOpacity={0.8}
                    accessibilityLabel="Send counteroffer"
                    accessibilityRole="button"
                  >
                    {working ? (
                      <ActivityIndicator color="#000000" />
                    ) : (
                      <Text style={styles.primaryText}>Send counter</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            ) : status === 'PROPOSED' || status === 'COUNTERED' ? (
              <View style={styles.actionsCol}>
                {isIncoming && (
                  <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={handleAccept}
                    disabled={working}
                    activeOpacity={0.8}
                    accessibilityLabel="Accept challenge and form duel"
                    accessibilityRole="button"
                  >
                    {working ? (
                      <ActivityIndicator color="#000000" />
                    ) : (
                      <Text style={styles.primaryText}>Accept and form duel</Text>
                    )}
                  </TouchableOpacity>
                )}
                <View style={styles.actionsRow}>
                  {isIncoming && (
                    <TouchableOpacity
                      style={styles.secondaryButton}
                      onPress={() => setMode('COUNTER')}
                      disabled={working}
                      activeOpacity={0.8}
                      accessibilityLabel="Propose different stake"
                      accessibilityRole="button"
                    >
                      <Text style={styles.secondaryText}>Counter</Text>
                    </TouchableOpacity>
                  )}
                  {isIncoming && (
                    <TouchableOpacity
                      style={styles.dangerButton}
                      onPress={handleDecline}
                      disabled={working}
                      activeOpacity={0.8}
                      accessibilityLabel="Decline challenge"
                      accessibilityRole="button"
                    >
                      <Text style={styles.dangerText}>Decline</Text>
                    </TouchableOpacity>
                  )}
                </View>
                {!isIncoming && <Text style={styles.note}>This Challenge is waiting for the Take creator to review it.</Text>}
              </View>
            ) : (
              <Text style={styles.note}>This challenge is {status.toLowerCase()}. No action needed.</Text>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  content: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.xl,
    maxHeight: '92%',
    borderTopWidth: 1,
    borderColor: colors.cardBorder,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { ...typography.h3, color: colors.textPrimary },
  closeBtn: { minHeight: touchMin, minWidth: touchMin, justifyContent: 'center', alignItems: 'center' },
  errorText: { color: colors.error, fontSize: 13, fontWeight: '700', marginBottom: spacing.sm },
  statusRow: { marginBottom: spacing.md },
  statusText: { ...typography.caption, color: colors.textSecondary, fontSize: 13 },
  termsBox: {
    backgroundColor: colors.surfaceLight, borderRadius: borderRadius.md, padding: spacing.md,
    marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.cardBorder,
  },
  termsLabel: { ...typography.captionBold, color: colors.textMuted, fontSize: 12, marginBottom: 4 },
  termsText: { ...typography.body, color: colors.textPrimary, fontSize: 14, lineHeight: 20 },
  factsRow: { flexDirection: 'row', gap: spacing.sm },
  fact: {
    flex: 1, backgroundColor: colors.surfaceLight, borderRadius: borderRadius.md, padding: spacing.md,
    borderWidth: 1, borderColor: colors.cardBorder, marginBottom: spacing.sm,
  },
  factsBox: {
    backgroundColor: colors.surfaceLight, borderRadius: borderRadius.md, padding: spacing.md,
    borderWidth: 1, borderColor: colors.cardBorder, marginBottom: spacing.md,
  },
  factLabel: { ...typography.captionBold, color: colors.textMuted, fontSize: 12, marginBottom: 4 },
  factValue: { ...typography.body, color: colors.textPrimary, fontSize: 14, lineHeight: 20 },
  label: { ...typography.captionBold, color: colors.textSecondary, fontSize: 13, marginBottom: 6, marginTop: spacing.sm },
  input: {
    backgroundColor: colors.surfaceLight, color: colors.textPrimary,
    paddingHorizontal: spacing.md, minHeight: touchMin,
    borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.cardBorder, fontSize: 15,
  },
  actionsCol: { gap: spacing.sm, marginTop: spacing.sm },
  actionsRow: { flexDirection: 'row', gap: spacing.sm },
  primaryButton: {
    flex: 1, minHeight: touchMin + 4, backgroundColor: colors.brandPrimary,
    borderRadius: borderRadius.full, alignItems: 'center', justifyContent: 'center',
  },
  primaryText: { ...typography.bodyBold, color: '#000000' },
  secondaryButton: {
    flex: 1, minHeight: touchMin + 4, backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.full, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.cardBorder,
  },
  secondaryText: { ...typography.bodyBold, color: colors.textPrimary },
  dangerButton: {
    flex: 1, minHeight: touchMin + 4, borderRadius: borderRadius.full,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.error,
  },
  dangerText: { ...typography.bodyBold, color: colors.error },
  note: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: spacing.sm },
});
