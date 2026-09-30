import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { colors, typography, spacing, borderRadius, touchMin } from '../theme';
import { Icon } from './Icon';
import { ConnectionHelp } from './ConnectionHelp';
import { WalletConnectionStatus } from '../wallet';
import { api } from '../api';

interface OnboardingModalProps {
  visible: boolean;
  onClose: () => void;
  wallet: string | null;
  connectionStatus: WalletConnectionStatus;
  connectionError?: string | null;
  onConnectWallet: () => void;
  onProfileUpdated?: () => void;
}

const BUSY_LABEL: Record<string, string> = {
  CONNECTING: 'Contacting wallet',
  WAITING_FOR_WALLET: 'Opening wallet',
  VERIFYING: 'Verifying ownership',
};

const BUSY_BODY: Record<string, string> = {
  CONNECTING: 'Dispatching a secure request to your Solana wallet app.',
  WAITING_FOR_WALLET: 'Check your wallet app and approve the Counter request there.',
  VERIFYING: 'Confirming the signature with Counter. Almost done.',
};

function isFailure(s: WalletConnectionStatus): boolean {
  return (
    s === 'USER_REJECTED' ||
    s === 'NO_WALLET' ||
    s === 'MWA_TIMEOUT' ||
    s === 'NETWORK_ERROR' ||
    s === 'AUTH_FAILED'
  );
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  visible,
  onClose,
  wallet,
  connectionStatus,
  connectionError,
  onConnectWallet,
  onProfileUpdated,
}) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [displayName, setDisplayName] = useState('');
  const [handle, setHandle] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const busy = BUSY_LABEL[connectionStatus] !== undefined;
  const failed = isFailure(connectionStatus);

  const handleSaveProfile = async () => {
    if (!wallet) {
      setError('Connect your wallet first.');
      return;
    }
    if (!displayName.trim()) {
      setError('Enter a display name.');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      await api.updateProfile({
        display_name: displayName.trim(),
        handle: handle.trim().replace(/^@/, ''),
      });
      if (onProfileUpdated) onProfileUpdated();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Could not save profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {step === 1 ? (
            <View style={styles.stepContent}>
              <View style={styles.iconCircle}>
                <Icon name="swords" size={32} color={colors.brandPrimary} />
              </View>
              <Text style={styles.title}>Welcome to Counter</Text>
              <Text style={styles.lead}>
                A social network where conversations become financially accountable.
              </Text>
              <View style={styles.devnetRow}>
                <Text style={styles.devnetText}>Test build on Solana Devnet</Text>
              </View>

              <View style={styles.featureList}>
                <View style={styles.featureItem}>
                  <View style={styles.bullet}>
                    <Text style={styles.bulletText}>1</Text>
                  </View>
                  <View style={styles.featureTextCol}>
                    <Text style={styles.featureTitle}>Post your take</Text>
                    <Text style={styles.featureDesc}>State a stance on crypto, sports, or culture.</Text>
                  </View>
                </View>
                <View style={styles.featureItem}>
                  <View style={styles.bullet}>
                    <Text style={styles.bulletText}>2</Text>
                  </View>
                  <View style={styles.featureTextCol}>
                    <Text style={styles.featureTitle}>Face challenges</Text>
                    <Text style={styles.featureDesc}>Disagreements become 1v1 duels with locked terms.</Text>
                  </View>
                </View>
                <View style={styles.featureItem}>
                  <View style={styles.bullet}>
                    <Text style={styles.bulletText}>3</Text>
                  </View>
                  <View style={styles.featureTextCol}>
                    <Text style={styles.featureTitle}>Settle on Solana</Text>
                    <Text style={styles.featureDesc}>Winners claim real escrow. Receipts last forever.</Text>
                  </View>
                </View>
              </View>

              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => setStep(2)}
                activeOpacity={0.8}
                accessibilityLabel="Get started"
                accessibilityRole="button"
              >
                <Text style={styles.primaryButtonText}>Get started</Text>
                <Icon name="arrow-right" size={16} color="#000000" />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.stepContent}>
              <Text style={styles.title}>Set up your profile</Text>
              <Text style={styles.lead}>
                Choose how others see you when your takes get challenged.
              </Text>

              {error && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Display name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Alex Rivera"
                  placeholderTextColor={colors.textMuted}
                  value={displayName}
                  onChangeText={setDisplayName}
                  accessibilityLabel="Display name"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Handle</Text>
                <TextInput
                  style={styles.input}
                  placeholder="@alex"
                  placeholderTextColor={colors.textMuted}
                  value={handle}
                  onChangeText={setHandle}
                  autoCapitalize="none"
                  accessibilityLabel="Handle"
                />
              </View>

              {busy ? (
                <View style={styles.statusBox}>
                  <ActivityIndicator size="large" color={colors.brandPrimary} />
                  <Text style={styles.statusTitle}>{BUSY_LABEL[connectionStatus]}</Text>
                  <Text style={styles.statusBody}>{BUSY_BODY[connectionStatus]}</Text>
                </View>
              ) : failed ? (
                <ConnectionHelp status={connectionStatus} detail={connectionError} onRetry={onConnectWallet} />
              ) : !wallet ? (
                <TouchableOpacity
                  style={[styles.primaryButton, { backgroundColor: colors.brandSecondary }]}
                  onPress={onConnectWallet}
                  activeOpacity={0.8}
                  accessibilityLabel="Connect Solana wallet"
                  accessibilityRole="button"
                >
                  <Icon name="wallet" size={16} color="#FFFFFF" />
                  <Text style={[styles.primaryButtonText, { color: '#FFFFFF' }]}>
                    Connect Solana wallet
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={handleSaveProfile}
                  disabled={saving}
                  activeOpacity={0.8}
                  accessibilityLabel="Finish setup"
                  accessibilityRole="button"
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#000000" />
                  ) : (
                    <>
                      <Text style={styles.primaryButtonText}>Finish setup</Text>
                      <Icon name="check" size={16} color="#000000" />
                    </>
                  )}
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.skipButton}
                onPress={onClose}
                activeOpacity={0.8}
                accessibilityLabel="Skip for now"
                accessibilityRole="button"
              >
                <Text style={styles.skipText}>Skip for now</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  container: {
    width: '100%',
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  stepContent: { alignItems: 'center' },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(20, 241, 149, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: { ...typography.h2, color: colors.textPrimary, marginBottom: spacing.xs, textAlign: 'center' },
  lead: { ...typography.bodyMuted, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.md, lineHeight: 20 },
  devnetRow: {
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: spacing.lg,
  },
  devnetText: { ...typography.caption, color: colors.textSecondary },
  featureList: { width: '100%', marginBottom: spacing.xl, gap: spacing.md },
  featureItem: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  bullet: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: colors.surfaceLight, alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },
  bulletText: { ...typography.captionBold, color: colors.brandPrimary },
  featureTextCol: { flex: 1 },
  featureTitle: { ...typography.bodyBold, color: colors.textPrimary },
  featureDesc: { ...typography.caption, color: colors.textSecondary, marginTop: 2, lineHeight: 17, fontSize: 13 },
  primaryButton: {
    flexDirection: 'row',
    width: '100%',
    minHeight: touchMin,
    backgroundColor: colors.brandPrimary,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  primaryButtonText: { ...typography.bodyBold, color: '#000000' },
  skipButton: { marginTop: spacing.sm, minHeight: touchMin, justifyContent: 'center', paddingHorizontal: spacing.lg },
  skipText: { ...typography.caption, color: colors.textMuted, fontSize: 13 },
  inputGroup: { width: '100%', marginBottom: spacing.md },
  label: { ...typography.captionBold, color: colors.textSecondary, marginBottom: spacing.xs, fontSize: 13 },
  input: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    minHeight: touchMin,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    fontSize: 15,
  },
  errorBox: {
    backgroundColor: 'rgba(255, 71, 87, 0.1)',
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    marginBottom: spacing.md,
    width: '100%',
  },
  errorText: { ...typography.caption, color: colors.error, textAlign: 'center', fontSize: 13 },
  statusBox: { alignItems: 'center', width: '100%', paddingVertical: spacing.md, gap: spacing.sm },
  statusTitle: { ...typography.h3, color: colors.textPrimary, marginTop: spacing.sm },
  statusBody: { ...typography.bodyMuted, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
});
