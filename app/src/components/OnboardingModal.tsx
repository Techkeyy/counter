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
import { colors, typography, spacing, borderRadius } from '../theme';
import { Icon } from './Icon';
import { api } from '../api';

interface OnboardingModalProps {
  visible: boolean;
  onClose: () => void;
  wallet: string | null;
  onConnectWallet: () => void;
  onProfileUpdated?: () => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  visible,
  onClose,
  wallet,
  onConnectWallet,
  onProfileUpdated,
}) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [displayName, setDisplayName] = useState('');
  const [handle, setHandle] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSaveProfile = async () => {
    if (!wallet) {
      setError('Please connect your wallet first.');
      return;
    }
    if (!displayName.trim()) {
      setError('Please enter a display name.');
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
      setError(err.message || 'Failed to update profile.');
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
              <View style={styles.badgeRow}>
                <View style={styles.iconCircle}>
                  <Icon name="swords" size={32} color={colors.solanaGreen} />
                </View>
              </View>

              <Text style={styles.title}>Welcome to Counter</Text>
              <Text style={styles.lead}>
                A social network where conversations become financially accountable.
              </Text>

              <View style={styles.featureList}>
                <View style={styles.featureItem}>
                  <View style={styles.bullet}>
                    <Text style={styles.bulletText}>1</Text>
                  </View>
                  <View style={styles.featureTextCol}>
                    <Text style={styles.featureTitle}>Post Your Take</Text>
                    <Text style={styles.featureDesc}>State your stance clearly on crypto, sports, or culture.</Text>
                  </View>
                </View>

                <View style={styles.featureItem}>
                  <View style={styles.bullet}>
                    <Text style={styles.bulletText}>2</Text>
                  </View>
                  <View style={styles.featureTextCol}>
                    <Text style={styles.featureTitle}>Face Challenges</Text>
                    <Text style={styles.featureDesc}>When someone disagrees, 1v1 terms lock in escrow.</Text>
                  </View>
                </View>

                <View style={styles.featureItem}>
                  <View style={styles.bullet}>
                    <Text style={styles.bulletText}>3</Text>
                  </View>
                  <View style={styles.featureTextCol}>
                    <Text style={styles.featureTitle}>Permanent Receipts</Text>
                    <Text style={styles.featureDesc}>Solana settles the winner. Your track record is forever.</Text>
                  </View>
                </View>
              </View>

              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => setStep(2)}
                activeOpacity={0.8}
              >
                <Text style={styles.primaryButtonText}>Get Started</Text>
                <Icon name="arrow-right" size={16} color="#000000" />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.stepContent}>
              <Text style={styles.title}>Set Up Contender Profile</Text>
              <Text style={styles.lead}>
                Choose how others see you when challenging your takes.
              </Text>

              {error && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Display Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Wale Adeyemi"
                  placeholderTextColor={colors.textMuted}
                  value={displayName}
                  onChangeText={setDisplayName}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Handle</Text>
                <TextInput
                  style={styles.input}
                  placeholder="@wale"
                  placeholderTextColor={colors.textMuted}
                  value={handle}
                  onChangeText={setHandle}
                  autoCapitalize="none"
                />
              </View>

              {!wallet ? (
                <TouchableOpacity
                  style={[styles.primaryButton, { backgroundColor: colors.solanaPurple }]}
                  onPress={onConnectWallet}
                  activeOpacity={0.8}
                >
                  <Icon name="wallet" size={16} color="#FFFFFF" />
                  <Text style={[styles.primaryButtonText, { color: '#FFFFFF' }]}>
                    Connect Solana Wallet
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={handleSaveProfile}
                  disabled={saving}
                  activeOpacity={0.8}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#000000" />
                  ) : (
                    <>
                      <Text style={styles.primaryButtonText}>Finish Setup</Text>
                      <Icon name="check" size={16} color="#000000" />
                    </>
                  )}
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.skipButton}
                onPress={onClose}
                activeOpacity={0.8}
              >
                <Text style={styles.skipText}>Skip for Now</Text>
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
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
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
  stepContent: {
    alignItems: 'center',
  },
  badgeRow: {
    marginBottom: spacing.md,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(20, 241, 149, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  lead: {
    ...typography.bodyMuted,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
    lineHeight: 18,
  },
  featureList: {
    width: '100%',
    marginBottom: spacing.xl,
    gap: spacing.md,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  bullet: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  bulletText: {
    ...typography.captionBold,
    color: colors.solanaGreen,
  },
  featureTextCol: {
    flex: 1,
  },
  featureTitle: {
    ...typography.bodyBold,
    color: colors.textPrimary,
  },
  featureDesc: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  primaryButton: {
    flexDirection: 'row',
    width: '100%',
    backgroundColor: colors.solanaGreen,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  primaryButtonText: {
    ...typography.bodyBold,
    color: '#000000',
  },
  skipButton: {
    marginTop: spacing.md,
    paddingVertical: spacing.xs,
  },
  skipText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  inputGroup: {
    width: '100%',
    marginBottom: spacing.md,
  },
  label: {
    ...typography.captionBold,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  errorBox: {
    backgroundColor: 'rgba(255, 71, 87, 0.1)',
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    marginBottom: spacing.md,
    width: '100%',
  },
  errorText: {
    ...typography.caption,
    color: colors.danger,
    textAlign: 'center',
  },
});

export default OnboardingModal;
