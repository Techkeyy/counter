import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Image,
  ScrollView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { colors, typography, spacing, borderRadius, touchMin } from '../theme';
import { Icon } from './Icon';
import { ConnectionHelp } from './ConnectionHelp';
import { WalletConnectionStatus } from '../wallet';
import { api } from '../api';
import { getAvatarUri } from '../utils/identity';

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
  const [bio, setBio] = useState('');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarBase64, setAvatarBase64] = useState<string | null>(null);
  const [avatarMime, setAvatarMime] = useState<string>('image/jpeg');
  const [saving, setSaving] = useState(false);
  const [savePhase, setSavePhase] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const submittedRef = useRef(false);

  const busy = BUSY_LABEL[connectionStatus] !== undefined;
  const failed = isFailure(connectionStatus);

  // Canonical persist: draft -> authenticated PUT -> avatar upload ->
  // fresh GET verify -> session state -> close. Never closes on silent loss.
  const persistDraft = async () => {
    if (!wallet || saving) return;
    const name = displayName.trim();
    if (!name) {
      setError('Enter a display name.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      setSavePhase('Saving your profile.');
      await api.updateProfile({
        display_name: name,
        handle: handle.trim(),
        bio: bio.trim(),
      });
      if (avatarBase64) {
        setSavePhase('Uploading your photo.');
        try {
          await api.uploadAvatar(`data:${avatarMime};base64,${avatarBase64}`);
        } catch (avatarErr: any) {
          // Textual profile saved; photo did not. Say so exactly, stay open.
          setError(
            `Profile text saved, but the photo upload failed (${avatarErr?.message || 'upload error'}). You can retry or finish without a photo.`
          );
          setSavePhase(null);
          setSaving(false);
          return;
        }
      }
      setSavePhase('Confirming your profile.');
      const fresh: any = await api.getUserProfile(wallet);
      const u = fresh?.user || fresh;
      const mismatch =
        !u ||
        (u.display_name || '').trim() !== name ||
        (handle.trim() && (u.handle || '').toLowerCase() !== handle.trim().replace(/^@/, '').toLowerCase());
      if (mismatch) {
        setError('Saved, but the confirmed profile looks different. Retry to make sure.');
        setSavePhase(null);
        setSaving(false);
        return;
      }
      if (onProfileUpdated) onProfileUpdated();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Could not save profile.');
    } finally {
      setSavePhase(null);
      setSaving(false);
    }
  };

  // Auto-submit the draft once authentication lands. The modal stays open
  // (App no longer dismisses it on connect) until persistence is verified.
  useEffect(() => {
    if (
      visible &&
      step === 2 &&
      wallet &&
      !busy &&
      !failed &&
      !submittedRef.current &&
      displayName.trim()
    ) {
      submittedRef.current = true;
      persistDraft();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, step, wallet, busy, failed]);

  useEffect(() => {
    if (!visible) {
      submittedRef.current = false;
      setSavePhase(null);
    }
  }, [visible]);

  const pickPhoto = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError('Photo access was denied. Allow access to choose a profile picture.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: true,
      });
      if (result.canceled || !result.assets || result.assets.length === 0) return;
      const asset = result.assets[0];
      if (!asset.base64) {
        setError('Could not read that photo. Try another one.');
        return;
      }
      const lower = (asset.uri || '').toLowerCase();
      setAvatarMime(
        lower.endsWith('.png') ? 'image/png' : lower.endsWith('.webp') ? 'image/webp' : 'image/jpeg'
      );
      setAvatarPreview(asset.uri);
      setAvatarBase64(asset.base64);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Could not open the photo picker.');
    }
  };

  const handleManualSave = () => {
    submittedRef.current = true;
    persistDraft();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <ScrollView showsVerticalScrollIndicator={false}>
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
                This becomes your Counter identity. It saves only after your wallet connects.
              </Text>

              {error && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              <TouchableOpacity
                style={styles.avatarRow}
                onPress={pickPhoto}
                activeOpacity={0.8}
                accessibilityLabel={avatarPreview ? 'Change profile photo' : 'Choose profile photo'}
                accessibilityRole="button"
              >
                <Image
                  source={{ uri: avatarPreview || getAvatarUri(null, wallet) }}
                  style={styles.avatar}
                />
                <View style={styles.avatarTextCol}>
                  <Text style={styles.avatarAction}>
                    {avatarPreview ? 'Change photo' : 'Choose photo (optional)'}
                  </Text>
                  <Text style={styles.avatarHint}>Square crop. Stored on Counter, shown everywhere.</Text>
                </View>
              </TouchableOpacity>

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

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Bio (optional)</Text>
                <TextInput
                  style={[styles.input, styles.bioInput]}
                  placeholder="A line about you"
                  placeholderTextColor={colors.textMuted}
                  value={bio}
                  onChangeText={setBio}
                  multiline
                  accessibilityLabel="Bio"
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
              ) : saving ? (
                <View style={styles.statusBox}>
                  <ActivityIndicator size="large" color={colors.brandPrimary} />
                  <Text style={styles.statusTitle}>{savePhase || 'Saving your profile.'}</Text>
                  <Text style={styles.statusBody}>Do not close yet. Your words and photo are being stored.</Text>
                </View>
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
                  onPress={handleManualSave}
                  activeOpacity={0.8}
                  accessibilityLabel="Save profile and finish"
                  accessibilityRole="button"
                >
                  <Text style={styles.primaryButtonText}>Save and finish</Text>
                  <Icon name="check" size={16} color="#000000" />
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
          </ScrollView>
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
    maxHeight: '92%',
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
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    width: '100%',
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    minHeight: touchMin + 24,
  },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.surfaceHighlight },
  avatarTextCol: { flex: 1 },
  avatarAction: { ...typography.bodyBold, color: colors.brandPrimary, fontSize: 14 },
  avatarHint: { ...typography.caption, color: colors.textSecondary, fontSize: 12, marginTop: 2, lineHeight: 16 },
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
  bioInput: { minHeight: 76, paddingVertical: spacing.sm, textAlignVertical: 'top' },
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
