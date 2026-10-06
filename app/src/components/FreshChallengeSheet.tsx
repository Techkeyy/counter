import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Challenge, Duel } from '../types';
import { api } from '../api';
import { colors, spacing, typography, touchMin } from '../theme';
import { Avatar, PrimaryButton, SecondaryButton, StatusPill } from './CounterUI';
import { formatDeadline } from '../utils/criteria';
import { formatUserDisplayName } from '../utils/identity';
import { acceptTransitionStage } from '../diagnostics';

type FreshChallengeSheetProps = {
  challenge: Challenge | null;
  userWallet: string | null;
  onClose: () => void;
  onDecided: (duel?: Duel, attemptId?: string) => void;
  onAcceptResolved?: (duel: Duel, attemptId: string, challengeId: string) => void;
};

export const FreshChallengeSheet: React.FC<FreshChallengeSheetProps> = ({ challenge, userWallet, onClose, onDecided, onAcceptResolved }) => {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [counterMode, setCounterMode] = useState(false);
  const [counterStake, setCounterStake] = useState('');
  const [modalVisible, setModalVisible] = useState(Boolean(challenge));
  const [pendingDuel, setPendingDuel] = useState<Duel | null>(null);
  const [pendingAttemptId, setPendingAttemptId] = useState<string | null>(null);
  const dismissHandledRef = useRef(false);

  useEffect(() => {
    if (challenge) {
      setModalVisible(true);
      setWorking(false);
      setError(null);
      setStatus(null);
      setCounterMode(false);
      setCounterStake('');
      setPendingDuel(null);
      setPendingAttemptId(null);
      dismissHandledRef.current = false;
    } else if (modalVisible) {
      setModalVisible(false);
    }
  }, [challenge?.id]);

  const handleDismiss = () => {
    if (pendingDuel && pendingAttemptId && challenge && !dismissHandledRef.current) {
      dismissHandledRef.current = true;
      acceptTransitionStage('CHALLENGE_SHEET_DISMISSED', {
        challengeId: challenge.id,
        duelId: pendingDuel.id,
        attemptId: pendingAttemptId,
      });
      const duel = pendingDuel;
      const attemptId = pendingAttemptId;
      setPendingDuel(null);
      setPendingAttemptId(null);
      onDecided(duel, attemptId);
      return;
    }
    onClose();
  };

  if (!challenge) return null;
  const incoming = userWallet === challenge.creator_wallet;
  const other = incoming ? formatUserDisplayName({ display_name: challenge.challenger_name, handle: challenge.challenger_handle, wallet: challenge.challenger_wallet }) : formatUserDisplayName({ display_name: challenge.creator_name, handle: challenge.creator_handle, wallet: challenge.creator_wallet });
  const decide = async (kind: 'accept' | 'decline' | 'counter') => {
    if (kind === 'counter' && (!Number(counterStake) || Number(counterStake) <= 0)) { setError('Choose a stake above zero.'); return; }
    setWorking(true); setError(null);
    try {
      if (kind === 'accept') {
        const attemptId = `accept_${Date.now().toString(36)}`;
        acceptTransitionStage('ACCEPT_UI_START', { challengeId: challenge.id, attemptId });
        setStatus('Accepting challenge…');
        const result = await api.acceptChallenge(challenge.id);
        acceptTransitionStage('ACCEPT_HTTP_OK', { challengeId: challenge.id, attemptId });
        const duel = result?.duel;
        if (!duel?.id) throw new Error('The accepted Duel was not returned.');
        acceptTransitionStage('ACCEPT_DUEL_RECEIVED', { challengeId: challenge.id, duelId: duel.id, attemptId });
        setPendingDuel(duel);
        setPendingAttemptId(attemptId);
        acceptTransitionStage('CHALLENGE_SHEET_DISMISS_START', { challengeId: challenge.id, duelId: duel.id, attemptId });
        onAcceptResolved?.(duel, attemptId, challenge.id);
        setStatus('Opening your Duel…');
        setModalVisible(false);
      }
      else if (kind === 'decline') { await api.declineChallenge(challenge.id); onDecided(); }
      else { await api.createCounteroffer(challenge.id, { stakeAmountUsd: Number(counterStake) }); onDecided(); }
    } catch (err: any) { setWorking(false); setStatus(null); setError(err?.message || 'That action could not be completed.'); }
  };
  return <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => { if (!working) { setModalVisible(false); onClose(); } }} onDismiss={handleDismiss}><View style={styles.backdrop}><View style={styles.sheet}><View style={styles.head}><View><Text style={styles.eyebrow}>INCOMING CHALLENGE</Text><Text style={styles.title}>{other} challenged your Take</Text></View><TouchableOpacity onPress={onClose} style={styles.close}><Text style={styles.closeText}>×</Text></TouchableOpacity></View><ScrollView contentContainerStyle={styles.scroll}>{error ? <Text style={styles.error}>{error}</Text> : null}{status ? <Text style={styles.status}>{status}</Text> : null}<View style={styles.people}><Avatar uri={challenge.challenger_avatar} wallet={challenge.challenger_wallet} size={42} /><Text style={styles.peopleText}>{other} wants to settle this together.</Text></View><View style={styles.statement}><Text style={styles.label}>You said</Text><Text style={styles.statementText}>{challenge.proposition_a}</Text></View><View style={styles.statement}><Text style={styles.label}>{other} says</Text><Text style={styles.statementText}>{challenge.proposition_b}</Text></View><View style={styles.terms}><StatusPill label={`${Number(challenge.stake_amount_usd || 0).toFixed(0)} cUSD each`} tone="accent" /><Text style={styles.termText}>Decision {formatDeadline(challenge.resolution_ts)}</Text><Text style={styles.termText}>Same choice = winner · different choices = money back</Text></View>{counterMode ? <View><Text style={styles.label}>Your counter stake</Text><TextInput style={styles.input} value={counterStake} onChangeText={setCounterStake} keyboardType="numeric" placeholder="Amount each" placeholderTextColor={colors.textMuted} /></View> : null}</ScrollView>{incoming ? <View style={styles.actions}><PrimaryButton label={counterMode ? 'Send counter' : 'Accept challenge'} onPress={() => decide(counterMode ? 'counter' : 'accept')} loading={working} /><View style={styles.secondary}><SecondaryButton label={counterMode ? 'Back' : 'Counter'} onPress={() => setCounterMode((x) => !x)} disabled={working} /><SecondaryButton label="Decline" onPress={() => decide('decline')} disabled={working} /></View></View> : <View style={styles.actions}><Text style={styles.waiting}>Waiting for your response.</Text></View>}</View></View></Modal>;
};
const styles = StyleSheet.create({ backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' }, sheet: { maxHeight: '92%', backgroundColor: colors.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: spacing.lg }, head: { flexDirection: 'row', justifyContent: 'space-between' }, eyebrow: { ...typography.captionBold, color: colors.brandPrimary }, title: { ...typography.h1, marginTop: 4, flex: 1 }, close: { width: touchMin, height: touchMin, alignItems: 'center', justifyContent: 'center' }, closeText: { color: colors.textSecondary, fontSize: 30 }, scroll: { paddingVertical: spacing.md }, error: { color: colors.error, ...typography.bodyMuted, marginBottom: spacing.md }, status: { color: colors.success, ...typography.bodyBold, marginBottom: spacing.md }, people: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', marginVertical: spacing.lg }, peopleText: { ...typography.bodyMuted, flex: 1 }, statement: { paddingVertical: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }, label: { ...typography.captionBold, color: colors.textMuted, marginBottom: spacing.xs }, statementText: { ...typography.h2, lineHeight: 27 }, terms: { paddingVertical: spacing.lg, gap: spacing.sm }, termText: { ...typography.bodyMuted }, input: { minHeight: touchMin, backgroundColor: colors.surfaceLight, borderRadius: 14, paddingHorizontal: spacing.md, color: colors.textPrimary, fontSize: 16 }, actions: { paddingTop: spacing.md }, secondary: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }, waiting: { ...typography.bodyMuted, textAlign: 'center', padding: spacing.lg },
});
