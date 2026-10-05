import React from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, borderRadius, spacing, touchMin, typography } from '../theme';
import { getAvatarUri } from '../utils/identity';

export const Avatar: React.FC<{ uri?: string | null; wallet?: string | null; size?: number; placeholderColor?: string }> = ({ uri, wallet, size = 44, placeholderColor }) => (
  <Image source={{ uri: getAvatarUri(uri, wallet || '', placeholderColor) }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surfaceLight }} />
);

export const ScreenHeader: React.FC<{ eyebrow?: string; title: string; right?: React.ReactNode; onBack?: () => void }> = ({ eyebrow, title, right, onBack }) => (
  <View style={styles.header}>
    <View style={styles.headerLead}>
      {onBack ? <TouchableOpacity onPress={onBack} style={styles.back} accessibilityLabel="Back"><Text style={styles.backText}>‹</Text></TouchableOpacity> : null}
      <View>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.title}>{title}</Text>
      </View>
    </View>
    {right}
  </View>
);

export const PrimaryButton: React.FC<{ label: string; onPress?: () => void; disabled?: boolean; loading?: boolean; loadingLabel?: string; accessibilityLabel?: string }> = ({ label, onPress, disabled, loading, loadingLabel, accessibilityLabel }) => (
  <TouchableOpacity style={[styles.primary, disabled && styles.primaryDisabled]} onPress={onPress} disabled={disabled || loading} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={accessibilityLabel || label}>
    {loading ? (loadingLabel ? <Text style={styles.primaryText}>{loadingLabel}</Text> : <ActivityIndicator color={colors.background} />) : <Text style={styles.primaryText}>{label}</Text>}
  </TouchableOpacity>
);

export const SecondaryButton: React.FC<{ label: string; onPress?: () => void; disabled?: boolean }> = ({ label, onPress, disabled }) => (
  <TouchableOpacity style={styles.secondary} onPress={onPress} disabled={disabled} activeOpacity={0.8} accessibilityRole="button">
    <Text style={styles.secondaryText}>{label}</Text>
  </TouchableOpacity>
);

export const StatusPill: React.FC<{ label: string; tone?: 'accent' | 'success' | 'warning' | 'danger' | 'muted' }> = ({ label, tone = 'muted' }) => (
  <View style={[styles.pill, tone === 'accent' && styles.pillAccent, tone === 'success' && styles.pillSuccess, tone === 'warning' && styles.pillWarning, tone === 'danger' && styles.pillDanger]}>
    <Text style={[styles.pillText, tone === 'accent' && styles.pillAccentText, tone === 'success' && styles.pillSuccessText, tone === 'warning' && styles.pillWarningText, tone === 'danger' && styles.pillDangerText]}>{label}</Text>
  </View>
);

export const Rule: React.FC = () => <View style={styles.rule} />;

export const PreflightRow: React.FC<{ label: string; value: string; ready?: boolean; actionLabel?: string; onAction?: () => void }> = ({ label, value, ready, actionLabel, onAction }) => (
  <View style={styles.preflightRow}>
    <View style={styles.preflightCopy}>
      <Text style={styles.preflightLabel}>{label}</Text>
      <Text style={styles.preflightValue}>{value}</Text>
    </View>
    {ready ? <Text style={styles.check}>✓</Text> : actionLabel ? <TouchableOpacity onPress={onAction} style={styles.inlineAction} accessibilityRole="button"><Text style={styles.inlineActionText}>{actionLabel}</Text></TouchableOpacity> : <Text style={styles.pending}>Needs action</Text>}
  </View>
);

export const EmptyState: React.FC<{ title: string; body: string; action?: string; onAction?: () => void }> = ({ title, body, action, onAction }) => (
  <View style={styles.empty}>
    <View style={styles.emptyMark} accessibilityLabel="No conversation yet"><Text style={styles.emptyMarkText}>—</Text></View>
    <Text style={styles.emptyTitle}>{title}</Text>
    <Text style={styles.emptyBody}>{body}</Text>
    {action ? <PrimaryButton label={action} onPress={onAction} /> : null}
  </View>
);

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  headerLead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  back: { width: touchMin, height: touchMin, alignItems: 'flex-start', justifyContent: 'center' },
  backText: { color: colors.textPrimary, fontSize: 38, lineHeight: 38, fontWeight: '300' },
  eyebrow: { ...typography.captionBold, color: colors.brandPrimary, textTransform: 'uppercase', marginBottom: 2 },
  title: { ...typography.h1 },
  primary: { minHeight: 56, borderRadius: borderRadius.full, backgroundColor: colors.brandPrimary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
  primaryDisabled: { backgroundColor: colors.surfaceHighlight, opacity: 0.65 },
  primaryText: { color: colors.background, fontSize: 16, fontWeight: '800' },
  secondary: { minHeight: touchMin, borderRadius: borderRadius.full, backgroundColor: colors.surfaceLight, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  secondaryText: { color: colors.textPrimary, fontSize: 14, fontWeight: '700' },
  pill: { borderRadius: borderRadius.full, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: colors.surfaceLight },
  pillAccent: { backgroundColor: 'rgba(255,114,94,0.15)' },
  pillSuccess: { backgroundColor: 'rgba(155,226,143,0.14)' },
  pillWarning: { backgroundColor: 'rgba(255,200,87,0.14)' },
  pillDanger: { backgroundColor: 'rgba(255,123,123,0.14)' },
  pillText: { ...typography.captionBold, color: colors.textSecondary },
  pillAccentText: { color: colors.brandPrimary },
  pillSuccessText: { color: colors.success },
  pillWarningText: { color: colors.warning },
  pillDangerText: { color: colors.danger },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: colors.divider },
  preflightRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 66, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  preflightCopy: { flex: 1 },
  preflightLabel: { ...typography.bodyBold },
  preflightValue: { ...typography.caption, color: colors.textSecondary, marginTop: 3 },
  check: { color: colors.success, fontSize: 23, fontWeight: '800', paddingHorizontal: spacing.sm },
  pending: { color: colors.warning, ...typography.captionBold },
  inlineAction: { minHeight: touchMin, justifyContent: 'center', paddingHorizontal: spacing.sm },
  inlineActionText: { color: colors.brandPrimary, ...typography.captionBold },
  empty: { alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, flex: 1 },
  // A quiet conversation mark, not a generic circular illustration.
  emptyMark: { width: 56, height: 32, justifyContent: 'center', alignItems: 'center', marginBottom: spacing.lg },
  emptyMarkText: { color: colors.brandPrimary, fontSize: 42, lineHeight: 32, fontWeight: '300' },
  emptyTitle: { ...typography.h2, textAlign: 'center', marginBottom: spacing.sm },
  emptyBody: { ...typography.bodyMuted, textAlign: 'center', maxWidth: 300, marginBottom: spacing.lg },
});
