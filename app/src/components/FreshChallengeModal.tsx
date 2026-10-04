import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Challenge, Take } from '../types';
import { api } from '../api';
import { colors, spacing, typography, touchMin } from '../theme';
import { Avatar, PrimaryButton, Rule, StatusPill } from './CounterUI';
import { formatUserDisplayName } from '../utils/identity';

const DURATION_OPTIONS = [
  { minutes: 15, label: '15m' },
  { minutes: 30, label: '30m' },
  { minutes: 60, label: '1h' },
  { minutes: 180, label: '3h' },
  { minutes: 1440, label: '24h' },
];

export const FreshChallengeModal: React.FC<{ visible: boolean; take: Take | null; onClose: () => void; onChallengeCreated: (challenge: Challenge) => void }> = ({ visible, take, onClose, onChallengeCreated }) => {
  const [step, setStep] = useState(1);
  const [counter, setCounter] = useState('');
  const [stake, setStake] = useState('30');
  const [minutes, setMinutes] = useState(30);
  const [customMinutes, setCustomMinutes] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (visible) { setStep(1); setCounter(''); setStake('30'); setMinutes(30); setCustomMinutes(''); setError(null); setWorking(false); } }, [visible, take?.id]);
  const name = formatUserDisplayName({ display_name: take?.author_name, handle: take?.author_handle, wallet: take?.author_wallet });
  const original = (take?.topic || '').trim();
  const finalMinutes = customMinutes ? Number(customMinutes) : minutes;
  const dueLabel = useMemo(() => {
    if (finalMinutes >= 60 && finalMinutes % 60 === 0) {
      const hours = finalMinutes / 60;
      return `${hours} hour${hours === 1 ? '' : 's'}`;
    }
    return `${finalMinutes} minutes`;
  }, [finalMinutes]);
  const next = () => { if (!counter.trim()) { setError('Write the counter you want to stand behind.'); return; } if (step === 2 && (!Number(stake) || Number(stake) <= 0 || !Number.isFinite(finalMinutes) || finalMinutes < 15)) { setError('Choose a stake and at least 15 minutes.'); return; } setError(null); setStep((s) => Math.min(3, s + 1)); };
  const submit = async () => {
    if (!take) return;
    setWorking(true); setError(null);
    try { const created = await api.proposeChallenge({ takeId: take.id, targetWallet: take.author_wallet, propositionA: original, propositionB: counter.trim(), category: take.category, stakeAmountUsd: Number(stake), decisionTs: Math.floor(Date.now() / 1000) + finalMinutes * 60, resolutionMode: 'MUTUAL', fallbackMode: 'REFUND' }); onChallengeCreated(created); }
    catch (err: any) { setError(err?.message || 'Could not send the challenge.'); }
    finally { setWorking(false); }
  };
  if (!take) return null;
  return <Modal visible={visible} transparent animationType="slide"><View style={styles.backdrop}><View style={styles.sheet}><View style={styles.sheetTop}><View><Text style={styles.eyebrow}>CHALLENGE · {step}/3</Text><Text style={styles.title}>{step === 1 ? `Disagree with ${name}` : step === 2 ? 'Make it fair' : 'Check the terms'}</Text></View><TouchableOpacity onPress={onClose} style={styles.close}><Text style={styles.closeText}>×</Text></TouchableOpacity></View><ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
    {error ? <Text style={styles.error}>{error}</Text> : null}
    {step === 1 ? <><View style={styles.original}><View style={styles.person}><Avatar uri={take.author_avatar} wallet={take.author_wallet} size={36} /><View><Text style={styles.author}>{name}</Text><StatusPill label="Their Take" tone="accent" /></View></View><Text style={styles.originalText}>{original}</Text></View><Text style={styles.label}>Your counter</Text><TextInput style={styles.bigInput} value={counter} onChangeText={setCounter} placeholder="Say what you believe instead…" placeholderTextColor={colors.textMuted} multiline textAlignVertical="top" /></> : null}
    {step === 2 ? <><Text style={styles.label}>Stake each</Text><View style={styles.optionRow}>{['10','25','30','50'].map((value) => <TouchableOpacity key={value} style={[styles.option, stake === value && styles.optionActive]} onPress={() => setStake(value)}><Text style={[styles.optionText, stake === value && styles.optionTextActive]}>${value}</Text></TouchableOpacity>)}<TextInput style={[styles.customStake, !['10','25','30','50'].includes(stake) && styles.optionActive]} value={['10','25','30','50'].includes(stake) ? '' : stake} onChangeText={setStake} placeholder="Other" placeholderTextColor={colors.textMuted} keyboardType="numeric" /></View><Text style={styles.label}>Decide in</Text><View style={styles.optionRow}>{DURATION_OPTIONS.map(({ minutes: value, label }) => <TouchableOpacity key={value} style={[styles.option, minutes === value && !customMinutes && styles.optionActive]} onPress={() => { setMinutes(value); setCustomMinutes(''); }}><Text style={[styles.optionText, minutes === value && !customMinutes && styles.optionTextActive]}>{label}</Text></TouchableOpacity>)}<TextInput style={styles.customStake} value={customMinutes} onChangeText={setCustomMinutes} placeholder="Custom" placeholderTextColor={colors.textMuted} keyboardType="numeric" /></View><View style={styles.ruleBox}><Text style={styles.ruleTitle}>Settle together</Text><Text style={styles.ruleBody}>Same choice = winner. Different choices return both stakes.</Text></View></> : null}
    {step === 3 ? <><View style={styles.review}><Text style={styles.reviewLabel}>{name} says</Text><Text style={styles.reviewText}>{original}</Text><Rule /><Text style={styles.reviewLabel}>You say</Text><Text style={styles.reviewText}>{counter.trim()}</Text></View><View style={styles.summary}><Text style={styles.summaryBig}>${Number(stake).toFixed(0)} cUSD each</Text><Text style={styles.summaryText}>Ends in {dueLabel}</Text><Text style={styles.summaryText}>Same result → winner · different results → refund</Text></View></> : null}
  </ScrollView><View style={styles.actions}>{step > 1 ? <TouchableOpacity style={styles.backBtn} onPress={() => setStep((s) => s - 1)}><Text style={styles.backText}>Back</Text></TouchableOpacity> : null}<View style={styles.primaryWrap}><PrimaryButton label={step === 3 ? 'Send challenge' : 'Continue'} onPress={step === 3 ? submit : next} loading={working} /></View></View></View></View></Modal>;
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' }, sheet: { maxHeight: '94%', backgroundColor: colors.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingTop: spacing.lg }, sheetTop: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.lg }, eyebrow: { ...typography.captionBold, color: colors.brandPrimary }, title: { ...typography.h1, marginTop: 4 }, close: { width: touchMin, height: touchMin, alignItems: 'center', justifyContent: 'center' }, closeText: { color: colors.textSecondary, fontSize: 30 }, scroll: { padding: spacing.lg, paddingBottom: spacing.xl }, error: { ...typography.bodyMuted, color: colors.error, marginBottom: spacing.md }, original: { paddingVertical: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }, person: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md }, author: { ...typography.bodyBold }, originalText: { ...typography.h2, lineHeight: 27 }, label: { ...typography.bodyBold, marginTop: spacing.xl, marginBottom: spacing.sm }, bigInput: { minHeight: 140, borderRadius: 16, backgroundColor: colors.surfaceLight, padding: spacing.lg, color: colors.textPrimary, fontSize: 17, lineHeight: 25 }, optionRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', flexWrap: 'wrap' }, option: { minHeight: touchMin, paddingHorizontal: spacing.lg, borderRadius: 22, backgroundColor: colors.surfaceLight, justifyContent: 'center' }, optionActive: { backgroundColor: colors.brandPrimary }, optionText: { ...typography.bodyBold, color: colors.textSecondary }, optionTextActive: { color: colors.background }, customStake: { minHeight: touchMin, minWidth: 78, backgroundColor: colors.surfaceLight, borderRadius: 22, paddingHorizontal: spacing.md, color: colors.textPrimary }, ruleBox: { marginTop: spacing.xl, padding: spacing.lg, backgroundColor: 'rgba(124,140,255,0.1)', borderRadius: 16 }, ruleTitle: { ...typography.bodyBold, color: colors.cobalt }, ruleBody: { ...typography.bodyMuted, marginTop: 4 }, review: { padding: spacing.lg, backgroundColor: colors.surfaceLight, borderRadius: 16, gap: spacing.sm }, reviewLabel: { ...typography.captionBold, color: colors.textMuted }, reviewText: { ...typography.body, fontSize: 17 }, summary: { paddingTop: spacing.xl, gap: spacing.sm }, summaryBig: { ...typography.h2 }, summaryText: { ...typography.bodyMuted }, actions: { flexDirection: 'row', gap: spacing.sm, padding: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider }, backBtn: { minHeight: 56, paddingHorizontal: spacing.md, justifyContent: 'center' }, backText: { ...typography.bodyBold, color: colors.textSecondary }, primaryWrap: { flex: 1 },
});
