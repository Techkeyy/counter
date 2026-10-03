import React, { useEffect, useMemo, useState } from 'react';
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
import { Take, Challenge } from '../types';
import { api } from '../api';
import { colors, spacing, touchMin, typography } from '../theme';
import { formatUserDisplayName } from '../utils/identity';

interface ChallengeModalProps {
  visible: boolean;
  take: Take | null;
  onClose: () => void;
  onChallengeCreated: (challenge: Challenge) => void;
}

const STAKE_PRESETS = ['10', '25', '50'];
const FIFTEEN_MINUTES = 15 * 60;
const THIRTY_MINUTES = 30 * 60;
const ONE_HOUR = 60 * 60;
const THREE_HOURS = 3 * 60 * 60;
const DAY = 24 * 60 * 60;

function formatDecisionTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDecisionDistance(timestamp: number): string {
  const minutes = Math.max(1, Math.round((timestamp - Math.floor(Date.now() / 1000)) / 60));
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'}`;
}

export const ChallengeModalV1: React.FC<ChallengeModalProps> = ({
  visible,
  take,
  onClose,
  onChallengeCreated,
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [counter, setCounter] = useState('');
  const [stakeAmount, setStakeAmount] = useState('25');
  const [decisionTs, setDecisionTs] = useState(Math.floor(Date.now() / 1000) + DAY);
  const [customDecision, setCustomDecision] = useState(false);
  const [customMinutes, setCustomMinutes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decisionOptions = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    return [
      { label: '15 minutes', value: now + FIFTEEN_MINUTES },
      { label: '30 minutes', value: now + THIRTY_MINUTES },
      { label: '1 hour', value: now + ONE_HOUR },
      { label: '3 hours', value: now + THREE_HOURS },
      { label: '24 hours', value: now + DAY },
    ];
  }, [visible]);

  useEffect(() => {
    if (!take || !visible) return;
    setStep(1);
    setCounter('');
    setStakeAmount('25');
    setDecisionTs(decisionOptions[4]?.value || Math.floor(Date.now() / 1000) + DAY);
    setCustomDecision(false);
    setCustomMinutes('');
    setError(null);
  }, [take?.id, visible, decisionOptions]);

  if (!take) return null;

  const creatorName = formatUserDisplayName({
    display_name: take.author_name,
    handle: take.author_handle,
    wallet: take.author_wallet,
  });
  const originalTake = (take.content || take.topic || '').trim();

  const validateStep = (): string | null => {
    if (step === 1 && !counter.trim()) return 'Write your counter before continuing.';
    if (step >= 2) {
      const stake = Number(stakeAmount);
      if (!Number.isFinite(stake) || stake <= 0) return 'Choose a stake above zero.';
      if (customDecision && (!Number.isFinite(Number(customMinutes)) || Number(customMinutes) < 15)) return 'Choose a custom time of at least 15 minutes.';
      if (!Number.isFinite(decisionTs)) return 'Choose when this should be decided.';
    }
    return null;
  };

  const handleContinue = () => {
    const problem = validateStep();
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    if (step === 2 && customDecision) setDecisionTs(Math.floor(Date.now() / 1000) + Number(customMinutes) * 60);
    setStep((current) => (current === 1 ? 2 : 3));
  };

  const handleSubmit = async () => {
    const problem = validateStep();
    if (problem) {
      setError(problem);
      return;
    }
    setLoading(true);
    setError(null);
    const submitDecisionTs = customDecision
      ? Math.floor(Date.now() / 1000) + Number(customMinutes) * 60
      : decisionTs;
    try {
      const created = await api.proposeChallenge({
        takeId: take.id,
        targetWallet: take.author_wallet,
        propositionA: originalTake,
        propositionB: counter.trim(),
        category: take.category,
        stakeAmountUsd: Number(stakeAmount),
        decisionTs: Math.floor(submitDecisionTs),
        resolutionMode: 'MUTUAL',
        fallbackMode: 'REFUND',
      });
      onChallengeCreated(created);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Could not send the challenge. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.content}>
          <View style={styles.header}>
            <View>
              <Text style={styles.kicker}>STEP {step} OF 3</Text>
              <Text style={styles.title}>
                {step === 1
                  ? `Challenge @${creatorName.replace(/^@/, '')}`
                  : step === 2
                    ? 'Set the terms'
                    : 'Review challenge'}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton} accessibilityLabel="Close challenge" accessibilityRole="button">
              <Text style={styles.closeText}>×</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {error && <Text style={styles.error}>{error}</Text>}

            {step === 1 && (
              <>
                <View style={styles.takeSurface}>
                  <Text style={styles.author}>{creatorName}</Text>
                  <Text style={styles.takeText}>{originalTake}</Text>
                </View>
                <Text style={styles.label}>Your counter</Text>
                <TextInput
                  style={styles.counterInput}
                  value={counter}
                  onChangeText={setCounter}
                  placeholder="Tell them why you disagree"
                  placeholderTextColor={colors.textMuted}
                  multiline
                  textAlignVertical="top"
                  accessibilityLabel="Your counter"
                />
              </>
            )}

            {step === 2 && (
              <>
                <Text style={styles.label}>Stake each</Text>
                <View style={styles.optionRow}>
                  {STAKE_PRESETS.map((amount) => (
                    <TouchableOpacity
                      key={amount}
                      style={[styles.option, stakeAmount === amount && styles.optionActive]}
                      onPress={() => setStakeAmount(amount)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: stakeAmount === amount }}
                    >
                      <Text style={[styles.optionText, stakeAmount === amount && styles.optionTextActive]}>${amount}</Text>
                    </TouchableOpacity>
                  ))}
                  <TextInput
                    style={[styles.customInput, !STAKE_PRESETS.includes(stakeAmount) && styles.customInputActive]}
                    value={STAKE_PRESETS.includes(stakeAmount) ? '' : stakeAmount}
                    onChangeText={setStakeAmount}
                    placeholder="Custom"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numeric"
                    accessibilityLabel="Custom stake amount"
                  />
                </View>

                <Text style={styles.label}>When should this be decided?</Text>
                <View style={styles.decisionList}>
                  {decisionOptions.map((option) => (
                    <TouchableOpacity
                      key={option.label}
                      style={[styles.decisionOption, decisionTs === option.value && styles.decisionActive]}
                      onPress={() => { setCustomDecision(false); setDecisionTs(option.value); }}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: decisionTs === option.value }}
                    >
                      <Text style={[styles.decisionLabel, decisionTs === option.value && styles.decisionLabelActive]}>{option.label}</Text>
                      <Text style={styles.decisionTime}>{formatDecisionTime(option.value)}</Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    style={[styles.decisionOption, customDecision && styles.decisionActive]}
                    onPress={() => setCustomDecision(true)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: customDecision }}
                  >
                    <Text style={[styles.decisionLabel, customDecision && styles.decisionLabelActive]}>Custom</Text>
                    <Text style={styles.decisionTime}>Choose 15 minutes or more</Text>
                  </TouchableOpacity>
                </View>
                {customDecision && (
                  <TextInput
                    style={styles.customTimeInput}
                    value={customMinutes}
                    onChangeText={setCustomMinutes}
                    placeholder="Minutes from now"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numeric"
                    accessibilityLabel="Custom decision time in minutes"
                  />
                )}

                <View style={styles.explanation}>
                  <Text style={styles.explanationTitle}>Settle together</Text>
                  <Text style={styles.explanationText}>Same choice pays the winner. Different choices return both stakes.</Text>
                </View>
              </>
            )}

            {step === 3 && (
              <>
                <View style={styles.reviewLine}>
                  <Text style={styles.reviewLabel}>@{creatorName.replace(/^@/, '')} says</Text>
                  <Text style={styles.reviewValue}>{originalTake}</Text>
                </View>
                <View style={styles.reviewLine}>
                  <Text style={styles.reviewLabel}>You say</Text>
                  <Text style={styles.reviewValue}>{counter.trim()}</Text>
                </View>
                <View style={styles.summaryLine}>
                  <Text style={styles.summaryValue}>${Number(stakeAmount).toFixed(0)} each</Text>
                  <Text style={styles.summaryValue}>Ends in {formatDecisionDistance(customDecision ? Math.floor(Date.now() / 1000) + Number(customMinutes) * 60 : decisionTs)}</Text>
                  <Text style={styles.summaryValue}>Same choice pays the winner · Different choices return both stakes</Text>
                </View>
              </>
            )}
          </ScrollView>

          <View style={styles.actions}>
            {step > 1 && (
              <TouchableOpacity style={styles.backButton} onPress={() => { setError(null); setStep((current) => (current === 3 ? 2 : 1)); }} accessibilityLabel="Back" accessibilityRole="button">
                <Text style={styles.backText}>Back</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.primaryButton, step > 1 && styles.primaryButtonWithBack]}
              onPress={step === 3 ? handleSubmit : handleContinue}
              disabled={loading}
              accessibilityLabel={step === 3 ? 'Send challenge' : 'Continue'}
              accessibilityRole="button"
            >
              {loading ? <ActivityIndicator color="#000000" /> : <Text style={styles.primaryText}>{step === 3 ? 'Send challenge' : 'Continue'}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  content: { maxHeight: '92%', backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.xl },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.lg },
  kicker: { ...typography.captionBold, color: colors.brandSecondary, letterSpacing: 1 },
  title: { ...typography.h2, marginTop: spacing.xs },
  closeButton: { minHeight: touchMin, minWidth: touchMin, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: colors.textSecondary, fontSize: 32, lineHeight: 32, fontWeight: '300' },
  scrollContent: { paddingBottom: spacing.lg },
  error: { color: colors.error, ...typography.bodyMuted, marginBottom: spacing.md },
  takeSurface: { paddingVertical: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.divider, marginBottom: spacing.xl },
  author: { ...typography.bodyBold, color: colors.textSecondary, marginBottom: spacing.sm },
  takeText: { ...typography.h2, lineHeight: 28 },
  label: { ...typography.bodyBold, color: colors.textSecondary, marginBottom: spacing.sm, marginTop: spacing.md },
  counterInput: { minHeight: 132, backgroundColor: colors.surfaceLight, borderRadius: 14, padding: spacing.lg, color: colors.textPrimary, fontSize: 17, lineHeight: 24 },
  optionRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  option: { minHeight: touchMin, minWidth: 70, paddingHorizontal: spacing.md, borderRadius: 12, backgroundColor: colors.surfaceLight, justifyContent: 'center', alignItems: 'center' },
  optionActive: { backgroundColor: colors.brandPrimary },
  optionText: { color: colors.textSecondary, fontWeight: '700' },
  optionTextActive: { color: '#000000' },
  customInput: { flex: 1, minHeight: touchMin, minWidth: 86, borderRadius: 12, backgroundColor: colors.surfaceLight, color: colors.textPrimary, paddingHorizontal: spacing.md, textAlign: 'center' },
  customInputActive: { borderWidth: 1, borderColor: colors.brandPrimary },
  decisionList: { gap: spacing.sm },
  decisionOption: { padding: spacing.md, borderRadius: 12, backgroundColor: colors.surfaceLight },
  decisionActive: { backgroundColor: 'rgba(20,241,149,0.16)' },
  decisionLabel: { ...typography.bodyBold, color: colors.textPrimary },
  decisionLabelActive: { color: colors.brandPrimary },
  decisionTime: { ...typography.caption, marginTop: 2 },
  customTimeInput: { minHeight: touchMin, marginTop: spacing.sm, borderRadius: 12, backgroundColor: colors.surfaceLight, color: colors.textPrimary, paddingHorizontal: spacing.md, fontSize: 16 },
  explanation: { marginTop: spacing.xl, paddingVertical: spacing.lg, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.divider },
  explanationTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.xs },
  explanationText: { ...typography.body, color: colors.textSecondary },
  reviewLine: { paddingVertical: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.divider },
  reviewLabel: { ...typography.captionBold, color: colors.textSecondary, marginBottom: spacing.xs },
  reviewValue: { ...typography.h3, lineHeight: 24 },
  summaryLine: { paddingVertical: spacing.lg, gap: spacing.xs },
  summaryValue: { ...typography.bodyBold, color: colors.textSecondary },
  actions: { flexDirection: 'row', gap: spacing.sm, paddingTop: spacing.md },
  backButton: { minHeight: 56, paddingHorizontal: spacing.lg, borderRadius: 16, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.surfaceLight },
  backText: { ...typography.bodyBold, color: colors.textSecondary },
  primaryButton: { flex: 1, minHeight: 56, borderRadius: 16, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.brandPrimary },
  primaryButtonWithBack: { flex: 1 },
  primaryText: { color: '#000000', fontSize: 16, fontWeight: '800' },
});
