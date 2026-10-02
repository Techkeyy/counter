import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Challenge, Duel } from '../types';
import { api } from '../api';
import { colors, spacing, touchMin, typography } from '../theme';
import { formatDeadline } from '../utils/criteria';
import { formatUserDisplayName } from '../utils/identity';

interface ChallengeSheetProps {
  challenge: Challenge | null;
  userWallet: string | null;
  onClose: () => void;
  onDecided: (duel?: Duel) => void;
}

export const ChallengeSheetV1: React.FC<ChallengeSheetProps> = ({
  challenge,
  userWallet,
  onClose,
  onDecided,
}) => {
  const [counterMode, setCounterMode] = useState(false);
  const [counterStake, setCounterStake] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    setCounterMode(false);
    setCounterStake('');
    setWorking(false);
    setError(null);
    setStatus(null);
  }, [challenge?.id]);

  if (!challenge) return null;

  const isIncoming = userWallet === challenge.creator_wallet;
  const otherName = isIncoming
    ? formatUserDisplayName({ display_name: challenge.challenger_name, handle: challenge.challenger_handle, wallet: challenge.challenger_wallet })
    : formatUserDisplayName({ display_name: challenge.creator_name, handle: challenge.creator_handle, wallet: challenge.creator_wallet });

  const handleAccept = async () => {
    setWorking(true);
    setError(null);
    setStatus('Accepting challenge…');
    try {
      const result = await api.acceptChallenge(challenge.id);
      setStatus('Duel created');
      setTimeout(() => onDecided(result?.duel), 450);
    } catch (err: any) {
      setWorking(false);
      setStatus(null);
      setError(err?.message || "Couldn't accept this challenge. Try again.");
    }
  };

  const handleDecline = async () => {
    setWorking(true);
    setError(null);
    try {
      await api.declineChallenge(challenge.id);
      onDecided();
    } catch (err: any) {
      setWorking(false);
      setError(err?.message || "Couldn't decline this challenge. Try again.");
    }
  };

  const handleCounter = async () => {
    const stake = Number(counterStake);
    if (!Number.isFinite(stake) || stake <= 0) {
      setError('Choose a stake above zero.');
      return;
    }
    setWorking(true);
    setError(null);
    try {
      await api.createCounteroffer(challenge.id, { stakeAmountUsd: stake });
      onDecided();
    } catch (err: any) {
      setWorking(false);
      setError(err?.message || "Couldn't send your counter. Try again.");
    }
  };

  return (
    <Modal visible={!!challenge} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>{isIncoming ? `${otherName} challenged your Take` : `You challenged ${otherName}`}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton} accessibilityLabel="Close challenge" accessibilityRole="button">
              <Text style={styles.closeText}>×</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {error && <Text style={styles.error}>{error}</Text>}
            {status && <Text style={styles.status}>{status}</Text>}

            <View style={styles.statement}>
              <Text style={styles.label}>{isIncoming ? 'You said' : `${otherName} says`}</Text>
              <Text style={styles.value}>{challenge.proposition_a}</Text>
            </View>
            <View style={styles.statement}>
              <Text style={styles.label}>{isIncoming ? 'They say' : 'You say'}</Text>
              <Text style={styles.value}>{challenge.proposition_b}</Text>
            </View>

            <View style={styles.summary}>
              <Text style={styles.summaryValue}>${Number(challenge.stake_amount_usd || 0).toFixed(0)} each</Text>
              <Text style={styles.summaryValue}>Decide: {formatDeadline(challenge.resolution_ts)}</Text>
              <Text style={styles.summaryValue}>Settle together</Text>
            </View>

            {counterMode && isIncoming ? (
              <View style={styles.counterArea}>
                <Text style={styles.label}>Your counter stake</Text>
                <TextInput
                  style={styles.input}
                  value={counterStake}
                  onChangeText={setCounterStake}
                  placeholder="Amount each"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                  accessibilityLabel="Counter stake amount"
                />
              </View>
            ) : null}
          </ScrollView>

          {isIncoming && (
            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={counterMode ? handleCounter : handleAccept}
                disabled={working}
                accessibilityLabel={counterMode ? 'Send counter' : 'Accept challenge'}
                accessibilityRole="button"
              >
                {working ? <ActivityIndicator color="#000000" /> : <Text style={styles.primaryText}>{counterMode ? 'Send counter' : 'Accept challenge'}</Text>}
              </TouchableOpacity>
              <View style={styles.secondaryActions}>
                <TouchableOpacity style={styles.secondaryButton} onPress={() => { setError(null); setCounterMode((value) => !value); }} disabled={working} accessibilityLabel={counterMode ? 'Back to challenge' : 'Counter'} accessibilityRole="button">
                  <Text style={styles.secondaryText}>{counterMode ? 'Back' : 'Counter'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryButton} onPress={handleDecline} disabled={working} accessibilityLabel="Decline challenge" accessibilityRole="button">
                  <Text style={styles.secondaryText}>Decline</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  content: { maxHeight: '88%', backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.xl },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: spacing.lg },
  title: { ...typography.h2, flex: 1, paddingRight: spacing.md },
  closeButton: { minHeight: touchMin, minWidth: touchMin, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: colors.textSecondary, fontSize: 32, lineHeight: 32, fontWeight: '300' },
  scrollContent: { paddingBottom: spacing.lg },
  error: { ...typography.bodyMuted, color: colors.error, marginBottom: spacing.md },
  status: { ...typography.bodyBold, color: colors.brandPrimary, marginBottom: spacing.md },
  statement: { paddingVertical: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.divider },
  label: { ...typography.captionBold, color: colors.textSecondary, marginBottom: spacing.xs },
  value: { ...typography.h3, lineHeight: 24 },
  summary: { paddingVertical: spacing.lg, gap: spacing.xs },
  summaryValue: { ...typography.bodyBold, color: colors.textPrimary },
  counterArea: { paddingTop: spacing.md },
  input: { minHeight: touchMin, borderRadius: 12, backgroundColor: colors.surfaceLight, color: colors.textPrimary, paddingHorizontal: spacing.md, fontSize: 16 },
  actions: { paddingTop: spacing.md },
  primaryButton: { minHeight: 56, borderRadius: 16, backgroundColor: colors.brandPrimary, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#000000', fontSize: 16, fontWeight: '800' },
  secondaryActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  secondaryButton: { flex: 1, minHeight: touchMin, borderRadius: 12, backgroundColor: colors.surfaceLight, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { ...typography.bodyBold, color: colors.textSecondary },
});
