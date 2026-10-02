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
import { Take, Challenge, Category, ResolutionMode, FallbackMode } from '../types';
import { colors, typography, spacing, borderRadius, touchMin } from '../theme';
import { Icon } from './Icon';
import { api } from '../api';
import { formatUserDisplayName } from '../utils/identity';
import {
  WEATHER_CITIES,
  describeCriteria,
  formatDeadline,
} from '../utils/criteria';

interface ChallengeModalProps {
  visible: boolean;
  take: Take | null;
  onClose: () => void;
  onChallengeCreated: (challenge: Challenge) => void;
}

const STAKE_PRESETS = ['10', '25', '50', '100', '250'];
const CUTOFF_PRESETS = [
  { label: '24 hours', seconds: 24 * 3600 },
  { label: '3 days', seconds: 3 * 24 * 3600 },
  { label: '7 days', seconds: 7 * 24 * 3600 },
];
const AGREEMENT_WINDOWS = [
  { label: '12 hours', seconds: 12 * 3600 },
  { label: '24 hours', seconds: 24 * 3600 },
  { label: '48 hours', seconds: 48 * 3600 },
];

export const ChallengeModal: React.FC<ChallengeModalProps> = ({
  visible,
  take,
  onClose,
  onChallengeCreated,
}) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [stakeAmount, setStakeAmount] = useState('25');
  const [sideATerms, setSideATerms] = useState('');
  const [sideBTerms, setSideBTerms] = useState('');
  const [cutoffSeconds, setCutoffSeconds] = useState(CUTOFF_PRESETS[0].seconds);
  const [resolutionMode, setResolutionMode] = useState<ResolutionMode>('MUTUAL');
  const [fallbackMode, setFallbackMode] = useState<FallbackMode>('REFUND');
  const [agreementSeconds, setAgreementSeconds] = useState(AGREEMENT_WINDOWS[1].seconds);
  // The only Counter Verified template in the MVP.
  const [cityIndex, setCityIndex] = useState(0);
  const [threshold, setThreshold] = useState('30');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (take) {
      setStep(1);
      setSideATerms(take.topic);
      setSideBTerms('');
      setResolutionMode(take.category === 'WEATHER' ? 'COUNTER_VERIFIED' : 'MUTUAL');
      setFallbackMode('REFUND');
      setError(null);
    }
  }, [take]);

  if (!take) return null;
  const category: Category = take.category || 'CRYPTO';
  const isWeather = category === 'WEATHER';
  const usesWeatherContract = isWeather && (resolutionMode === 'COUNTER_VERIFIED' || fallbackMode === 'COUNTER_VERIFIED');

  const buildSourceConfig = (): Record<string, any> => {
    const city = WEATHER_CITIES[cityIndex];
    return {
      provider: 'open-meteo',
      metric: 'temperature_2m',
      operator: '>=',
      latitude: city.latitude,
      longitude: city.longitude,
      city: city.city,
      threshold: Number(threshold),
    };
  };

  const validate = (): string | null => {
    const stake = parseFloat(stakeAmount);
    if (Number.isNaN(stake) || stake <= 0) return 'Enter a valid stake amount in test cUSD.';
    if (!sideATerms.trim() || !sideBTerms.trim()) return 'Write both sides of the dispute in plain words.';
    if (resolutionMode === 'COUNTER_VERIFIED' && !isWeather) {
      return 'Counter Verified currently supports Weather temperature only. Use Settle Together for this Take.';
    }
    if (fallbackMode === 'COUNTER_VERIFIED' && !isWeather) {
      return 'Counter Verified fallback currently supports Weather temperature only.';
    }
    if (usesWeatherContract && !Number.isFinite(Number(threshold))) {
      return 'Enter a numeric Celsius threshold for the Weather decider.';
    }
    return null;
  };

  const cutoffTs = Math.floor(Date.now() / 1000) + cutoffSeconds;
  const resolutionTs = cutoffTs + 48 * 3600;

  const handleSubmit = async () => {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const created = await api.proposeChallenge({
        takeId: take.id,
        targetWallet: take.author_wallet,
        propositionA: sideATerms.trim(),
        propositionB: sideBTerms.trim(),
        category,
        stakeAmountUsd: parseFloat(stakeAmount),
        cutoffTs,
        resolutionTs,
        sourceType: usesWeatherContract ? 'open-meteo' : null,
        sourceConfig: usesWeatherContract ? buildSourceConfig() : null,
        resolutionMode,
        fallbackMode,
        mutualDeadlineTs:
          resolutionMode === 'MUTUAL' ? resolutionTs + agreementSeconds : null,
      });
      setLoading(false);
      onChallengeCreated(created);
      onClose();
    } catch (err: any) {
      setLoading(false);
      setError(err.message || 'Could not send the challenge.');
    }
  };

  const criteriaSummary = usesWeatherContract
    ? describeCriteria('weather', JSON.stringify(buildSourceConfig()))
    : 'Settle together: both captains confirm the winner. If they do not agree by the deadline, everyone is refunded.';

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.content}>
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Icon name="swords" size={20} color={colors.brandPrimary} />
              <Text style={styles.title}>{step === 1 ? 'Challenge to a 1v1' : 'Review challenge'}</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              accessibilityLabel="Close challenge sheet"
              accessibilityRole="button"
            >
              <Icon name="x" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {error && <Text style={styles.errorText}>{error}</Text>}

            {step === 1 ? (
              <>
                <Text style={styles.label}>Opponent</Text>
                <View style={styles.readonlyBox}>
                  <Text style={styles.readonlyText}>
                    {formatUserDisplayName({
                      display_name: take.author_name,
                      handle: take.author_handle,
                      wallet: take.author_wallet,
                    })}
                  </Text>
                </View>

                <Text style={styles.label}>Original Take</Text>
                <View style={styles.takeContext}>
                  <Text style={styles.takeContextTitle}>{take.topic}</Text>
                  {!!take.content?.trim() && <Text style={styles.takeContextReason}>Why: {take.content}</Text>}
                </View>

                <Text style={styles.label}>Side A states (their position)</Text>
                <TextInput
                  style={styles.input}
                  value={sideATerms}
                  onChangeText={setSideATerms}
                  placeholder="What they claim"
                  placeholderTextColor={colors.textMuted}
                  multiline
                  accessibilityLabel="Side A terms"
                />

                <Text style={styles.label}>Side B states (your counter)</Text>
                <TextInput
                  style={styles.input}
                  value={sideBTerms}
                  onChangeText={setSideBTerms}
                  placeholder="What you claim instead"
                  placeholderTextColor={colors.textMuted}
                  multiline
                  accessibilityLabel="Side B terms"
                />

                {usesWeatherContract ? (
                  <>
                    <Text style={styles.label}>Counter Verified · Open-Meteo temperature</Text>
                    <View style={styles.chipRow}>
                      {WEATHER_CITIES.map((c, i) => (
                        <TouchableOpacity
                          key={c.city}
                          style={[styles.chip, cityIndex === i && styles.chipActive]}
                          onPress={() => setCityIndex(i)}
                          accessibilityLabel={c.city}
                        >
                          <Text style={[styles.chipText, cityIndex === i && styles.chipTextActive]}>{c.city}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <TextInput
                      style={styles.input}
                      value={threshold}
                      onChangeText={setThreshold}
                      placeholder="Temperature threshold in °C"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="numeric"
                      accessibilityLabel="Temperature threshold in Celsius"
                    />
                    <Text style={styles.note}>
                      At or after the resolution time, Counter checks Open-Meteo's current temperature for the selected location.
                    </Text>
                  </>
                ) : (
                  <Text style={styles.note}>
                    This Take uses Settle Together. Both captains independently confirm the winner after resolution time; no public oracle is required.
                  </Text>
                )}

                <Text style={styles.label}>Captain stake each (test cUSD)</Text>
                <View style={styles.chipRow}>
                  {STAKE_PRESETS.map((amt) => (
                    <TouchableOpacity
                      key={amt}
                      style={[styles.chip, stakeAmount === amt && styles.chipActive]}
                      onPress={() => setStakeAmount(amt)}
                      accessibilityLabel={`Stake ${amt} cUSD`}
                    >
                      <Text style={[styles.chipText, stakeAmount === amt && styles.chipTextActive]}>${amt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  style={styles.input}
                  value={stakeAmount}
                  onChangeText={setStakeAmount}
                  placeholder="Custom amount"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                  accessibilityLabel="Custom stake amount"
                />

                <Text style={styles.label}>Staking closes</Text>
                <View style={styles.chipRow}>
                  {CUTOFF_PRESETS.map((p) => (
                    <TouchableOpacity
                      key={p.label}
                      style={[styles.chip, cutoffSeconds === p.seconds && styles.chipActive]}
                      onPress={() => setCutoffSeconds(p.seconds)}
                      accessibilityLabel={`Staking closes in ${p.label}`}
                    >
                      <Text style={[styles.chipText, cutoffSeconds === p.seconds && styles.chipTextActive]}>{p.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.label}>How this settles</Text>
                {isWeather && (
                  <TouchableOpacity
                    style={[styles.modeRow, resolutionMode === 'COUNTER_VERIFIED' && styles.modeRowActive]}
                    onPress={() => setResolutionMode('COUNTER_VERIFIED')}
                    activeOpacity={0.8}
                    accessibilityLabel="Settle by Counter Verified"
                    accessibilityRole="radio"
                    accessibilityState={{ selected: resolutionMode === 'COUNTER_VERIFIED' }}
                  >
                    <View style={styles.modeTextCol}>
                      <Text style={styles.modeTitle}>Counter Verified</Text>
                      <Text style={styles.modeDesc}>
                        Counter checks a supported public data source and settles the Duel.
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.modeRow, resolutionMode === 'MUTUAL' && styles.modeRowActive]}
                  onPress={() => setResolutionMode('MUTUAL')}
                  activeOpacity={0.8}
                  accessibilityLabel="Settle together by mutual agreement"
                  accessibilityRole="radio"
                  accessibilityState={{ selected: resolutionMode === 'MUTUAL' }}
                >
                  <View style={styles.modeTextCol}>
                    <Text style={styles.modeTitle}>Settle together</Text>
                    <Text style={styles.modeDesc}>
                      Both captains confirm the winner in-app after resolution time.
                    </Text>
                  </View>
                </TouchableOpacity>

                {resolutionMode === 'MUTUAL' && (
                  <>
                    <Text style={styles.label}>If no agreement</Text>
                    <View style={styles.chipRow}>
                      {(['REFUND', ...(isWeather ? ['COUNTER_VERIFIED'] : [])] as FallbackMode[]).map((fb) => (
                        <TouchableOpacity
                          key={fb}
                          style={[styles.chip, fallbackMode === fb && styles.chipActive]}
                          onPress={() => setFallbackMode(fb)}
                          accessibilityLabel={fb === 'REFUND' ? 'Fallback: refund everyone' : 'Fallback: Counter Verified'}
                        >
                          <Text style={[styles.chipText, fallbackMode === fb && styles.chipTextActive]}>
                            {fb === 'REFUND' ? 'Refund everyone' : 'Counter Verified'}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <Text style={styles.label}>Agreement window after resolution time</Text>
                    <View style={styles.chipRow}>
                      {AGREEMENT_WINDOWS.map((w) => (
                        <TouchableOpacity
                          key={w.label}
                          style={[styles.chip, agreementSeconds === w.seconds && styles.chipActive]}
                          onPress={() => setAgreementSeconds(w.seconds)}
                          accessibilityLabel={`Agreement window ${w.label}`}
                        >
                          <Text style={[styles.chipText, agreementSeconds === w.seconds && styles.chipTextActive]}>
                            {w.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}

                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={() => {
                    const problem = validate();
                    if (problem) setError(problem);
                    else {
                      setError(null);
                      setStep(2);
                    }
                  }}
                  activeOpacity={0.8}
                  accessibilityLabel="Review challenge"
                  accessibilityRole="button"
                >
                  <Text style={styles.primaryText}>Review challenge</Text>
                  <Icon name="arrow-right" size={16} color="#000000" />
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={styles.reviewBox}>
                  <Text style={styles.reviewLabel}>Side A</Text>
                  <Text style={styles.reviewText}>{sideATerms.trim()}</Text>
                </View>
                <View style={styles.reviewBox}>
                  <Text style={styles.reviewLabel}>Side B</Text>
                  <Text style={styles.reviewText}>{sideBTerms.trim()}</Text>
                </View>
                <View style={styles.reviewBox}>
                  <Text style={styles.reviewLabel}>Decided by</Text>
                  <Text style={styles.reviewText}>{criteriaSummary}</Text>
                </View>
                <View style={styles.reviewBox}>
                  <Text style={styles.reviewLabel}>Settlement</Text>
                  <Text style={styles.reviewText}>
                    {resolutionMode === 'MUTUAL'
                      ? `Settle together. If no agreement, ${fallbackMode === 'REFUND' ? 'everyone is refunded' : 'Counter Verified decides'}.`
                      : 'Counter Verified by the criteria above.'}
                  </Text>
                </View>
                <View style={styles.reviewRow}>
                  <View style={styles.reviewHalf}>
                    <Text style={styles.reviewLabel}>Stake each</Text>
                    <Text style={styles.reviewText}>${parseFloat(stakeAmount).toFixed(2)} test cUSD</Text>
                  </View>
                  <View style={styles.reviewHalf}>
                    <Text style={styles.reviewLabel}>Staking closes</Text>
                    <Text style={styles.reviewText}>{formatDeadline(cutoffTs)}</Text>
                  </View>
                </View>
                <View style={styles.vaultNote}>
                  <Icon name="shield-check" size={16} color={colors.success} />
                  <Text style={styles.vaultText}>
                    Stakes lock in the on-chain vault only after both captains accept and initialize.
                  </Text>
                </View>
                <View style={styles.reviewActions}>
                  <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => setStep(1)}
                    activeOpacity={0.8}
                    accessibilityLabel="Back to editing"
                    accessibilityRole="button"
                  >
                    <Text style={styles.backText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.sendButton}
                    onPress={handleSubmit}
                    disabled={loading}
                    activeOpacity={0.8}
                    accessibilityLabel="Send challenge"
                    accessibilityRole="button"
                  >
                    {loading ? (
                      <ActivityIndicator color="#000000" />
                    ) : (
                      <Text style={styles.sendText}>Send challenge</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
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
  body: { marginBottom: spacing.lg },
  errorText: { color: colors.error, fontSize: 13, fontWeight: '700', marginBottom: spacing.sm },
  label: { ...typography.captionBold, color: colors.textSecondary, fontSize: 13, marginBottom: 6, marginTop: spacing.md },
  readonlyBox: {
    backgroundColor: colors.surfaceLight, paddingHorizontal: spacing.md, minHeight: touchMin,
    justifyContent: 'center', borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.cardBorder,
  },
  readonlyText: { color: colors.brandPrimary, fontWeight: '700', fontSize: 14 },
  takeContext: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    marginBottom: spacing.sm,
  },
  takeContextTitle: { ...typography.h3, color: colors.textPrimary, fontSize: 16 },
  takeContextReason: { ...typography.bodyMuted, color: colors.textSecondary, marginTop: 4 },
  input: {
    backgroundColor: colors.surfaceLight, color: colors.textPrimary,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minHeight: touchMin,
    borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.cardBorder, fontSize: 15, marginBottom: spacing.sm,
  },
  twoCol: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  chip: {
    minHeight: touchMin, justifyContent: 'center', paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full, backgroundColor: colors.surfaceLight,
    borderWidth: 1, borderColor: colors.cardBorder,
  },
  chipActive: { borderColor: colors.brandPrimary, backgroundColor: colors.surfaceHighlight },
  chipText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: colors.brandPrimary, fontWeight: '700' },
  note: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginBottom: spacing.sm },
  modeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  modeRowActive: {
    borderColor: colors.brandPrimary,
  },
  modeTextCol: { flex: 1 },
  modeTitle: { ...typography.bodyBold, color: colors.textPrimary, fontSize: 14 },
  modeDesc: { ...typography.bodyMuted, color: colors.textSecondary, fontSize: 13, lineHeight: 18, marginTop: 2 },
  primaryButton: {
    flexDirection: 'row', minHeight: touchMin + 4, backgroundColor: colors.brandPrimary,
    borderRadius: borderRadius.full, alignItems: 'center', justifyContent: 'center', gap: spacing.xs, marginTop: spacing.md,
  },
  primaryText: { ...typography.bodyBold, color: '#000000' },
  reviewBox: {
    backgroundColor: colors.surfaceLight, borderRadius: borderRadius.md, padding: spacing.md,
    marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.cardBorder,
  },
  reviewLabel: { ...typography.captionBold, color: colors.textMuted, fontSize: 12, marginBottom: 4 },
  reviewText: { ...typography.body, color: colors.textPrimary, fontSize: 14, lineHeight: 20 },
  reviewRow: { flexDirection: 'row', gap: spacing.sm },
  reviewHalf: {
    flex: 1, backgroundColor: colors.surfaceLight, borderRadius: borderRadius.md, padding: spacing.md,
    borderWidth: 1, borderColor: colors.cardBorder, marginBottom: spacing.sm,
  },
  vaultNote: {
    flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start',
    backgroundColor: colors.surfaceLight, borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.md,
  },
  vaultText: { flex: 1, color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  reviewActions: { flexDirection: 'row', gap: spacing.sm },
  backButton: {
    minHeight: touchMin + 4, paddingHorizontal: spacing.xl, borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceLight, borderWidth: 1, borderColor: colors.cardBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  backText: { ...typography.bodyBold, color: colors.textPrimary },
  sendButton: {
    flex: 1, minHeight: touchMin + 4, backgroundColor: colors.brandPrimary,
    borderRadius: borderRadius.full, alignItems: 'center', justifyContent: 'center',
  },
  sendText: { ...typography.bodyBold, color: '#000000' },
});
