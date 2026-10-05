import React, { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api, isAmbiguousMutationError } from '../api';
import { Take } from '../types';
import { ALL_CATEGORIES, CategoryFilter, categoryLabel } from '../topics';
import { colors, spacing, typography, touchMin } from '../theme';
import { PrimaryButton, ScreenHeader } from '../components/CounterUI';

export const FreshCreateTakeScreen: React.FC<{ onSuccess: (take: Take) => void; onCancel: () => void }> = ({ onSuccess, onCancel }) => {
  const [topic, setTopic] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('ALL');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const submit = async () => {
    if (!topic.trim()) { setError('Start with the Take you want people to react to.'); return; }
    if (working) return;
    const currentAttemptId = attemptId || `take_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    if (!attemptId) setAttemptId(currentAttemptId);
    setWorking(true); setError(null);
    try {
      const take = await api.createTake(topic.trim(), content.trim(), category === 'ALL' ? 'CULTURE' : category, currentAttemptId);
      onSuccess(take);
    } catch (err: any) {
      if (isAmbiguousMutationError(err)) {
        try {
          const existing = await api.getTakeByAttempt(currentAttemptId);
          if (existing?.id) { onSuccess(existing); return; }
        } catch {}
      }
      setError("Couldn't post this Take. Your text is still here. Retry when you're ready.");
    }
    finally { setWorking(false); }
  };
  return <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScreenHeader eyebrow="new conversation" title="Post a Take" onBack={onCancel} />
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.prompt}>What do you think will happen?</Text>
      <TextInput autoFocus style={styles.topic} value={topic} onChangeText={setTopic} placeholder="Arsenal wins the league" placeholderTextColor={colors.textMuted} multiline maxLength={160} accessibilityLabel="Your Take" />
      <Text style={styles.counter}>{topic.length}/160</Text>
      <Text style={styles.label}>Why? <Text style={styles.optional}>Optional</Text></Text>
      <TextInput style={styles.reason} value={content} onChangeText={setContent} placeholder="Give people a reason to care…" placeholderTextColor={colors.textMuted} multiline maxLength={400} textAlignVertical="top" accessibilityLabel="Why this Take" />
      <Text style={styles.label}>Category</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>{ALL_CATEGORIES.filter((x) => x !== 'ALL').map((item) => <TouchableOpacity key={item} style={[styles.category, category === item && styles.categoryActive]} onPress={() => setCategory(item)} accessibilityRole="radio" accessibilityState={{ selected: category === item }}><Text style={[styles.categoryText, category === item && styles.categoryTextActive]}>{categoryLabel(item)}</Text></TouchableOpacity>)}</ScrollView>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
    <View style={styles.footer}><PrimaryButton label="Post" onPress={submit} loading={working} loadingLabel="Posting…" disabled={!topic.trim()} /></View>
  </KeyboardAvoidingView>;
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background }, content: { padding: spacing.lg, paddingBottom: spacing.xxl }, prompt: { ...typography.h2, marginTop: spacing.lg, marginBottom: spacing.md }, topic: { minHeight: 116, color: colors.textPrimary, fontSize: 25, lineHeight: 31, fontWeight: '700', paddingVertical: spacing.sm }, counter: { alignSelf: 'flex-end', ...typography.caption, marginBottom: spacing.xl }, label: { ...typography.bodyBold, marginBottom: spacing.sm, marginTop: spacing.lg }, optional: { ...typography.caption, fontWeight: '400' }, reason: { minHeight: 120, backgroundColor: colors.surfaceLight, borderRadius: 16, padding: spacing.md, color: colors.textPrimary, fontSize: 16, lineHeight: 23 }, categoryRow: { gap: spacing.sm }, category: { minHeight: touchMin, paddingHorizontal: spacing.md, borderRadius: 20, backgroundColor: colors.surfaceLight, justifyContent: 'center' }, categoryActive: { backgroundColor: colors.brandPrimary }, categoryText: { ...typography.captionBold, color: colors.textSecondary }, categoryTextActive: { color: colors.background }, error: { color: colors.error, ...typography.bodyMuted, marginTop: spacing.lg }, footer: { padding: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
});
