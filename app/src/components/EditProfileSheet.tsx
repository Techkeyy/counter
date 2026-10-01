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
  Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { User } from '../types';
import { colors, typography, spacing, borderRadius, touchMin } from '../theme';
import { Icon } from './Icon';
import { api } from '../api';
import { findProfileMismatch, getAvatarUri, normalizeIdentityHandle } from '../utils/identity';

interface EditProfileSheetProps {
  user: User | null;
  wallet: string;
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const NAME_MAX = 40;
const BIO_MAX = 160;

export const EditProfileSheet: React.FC<EditProfileSheetProps> = ({
  user,
  wallet,
  visible,
  onClose,
  onSaved,
}) => {
  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [handle, setHandle] = useState(user?.handle || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarBase64, setAvatarBase64] = useState<string | null>(null);
  const [avatarMime, setAvatarMime] = useState<string>('image/jpeg');
  const [avatarChanged, setAvatarChanged] = useState(false);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setDisplayName(user?.display_name || '');
      setHandle(user?.handle || '');
      setBio(user?.bio || '');
      setAvatarPreview(null);
      setAvatarBase64(null);
      setAvatarChanged(false);
      setRemoveAvatar(false);
      setError(null);
    }
  }, [visible]);

  const shownAvatar =
    avatarPreview || (!removeAvatar ? getAvatarUri(user?.avatar_url, wallet) : getAvatarUri(null, wallet));

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
      setAvatarChanged(true);
      setRemoveAvatar(false);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Could not open the photo picker.');
    }
  };

  const handleSave = async () => {
    const name = displayName.trim();
    if (name.length === 0) {
      setError('Display name cannot be empty.');
      return;
    }
    if (name.length > NAME_MAX) {
      setError(`Display name must be ${NAME_MAX} characters or fewer.`);
      return;
    }
    if (bio.trim().length > BIO_MAX) {
      setError(`Bio must be ${BIO_MAX} characters or fewer.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const putUser = await api.updateProfile({
        displayName: name,
        handle: handle.trim(),
        bio: bio.trim(),
      });
      const expected = {
        displayName: name,
        handle: normalizeIdentityHandle(handle),
        bio: bio.trim(),
      };
      const putMismatch = findProfileMismatch(putUser, { ...expected, avatar: 'ignore' });
      if (putMismatch) {
        throw new Error(`Saved, but the confirmed profile looks different (${putMismatch}).`);
      }
      if (removeAvatar) {
        await api.removeAvatar();
      } else if (avatarChanged && avatarBase64) {
        await api.uploadAvatar(`data:${avatarMime};base64,${avatarBase64}`);
      }
      const fresh = await api.getUserProfile(wallet);
      const getMismatch = findProfileMismatch(fresh, {
        ...expected,
        avatar: removeAvatar ? 'empty' : avatarChanged ? 'present' : 'ignore',
      });
      if (getMismatch) {
        throw new Error(`Saved, but the confirmed profile looks different (${getMismatch}).`);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Could not save profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>Edit profile</Text>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              accessibilityLabel="Close edit profile"
              accessibilityRole="button"
            >
              <Icon name="x" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {error && <Text style={styles.errorText}>{error}</Text>}

            <View style={styles.avatarRow}>
              <Image source={{ uri: shownAvatar }} style={styles.avatar} />
              <View style={styles.avatarActions}>
                <TouchableOpacity
                  style={styles.avatarBtn}
                  onPress={pickPhoto}
                  activeOpacity={0.8}
                  accessibilityLabel="Choose profile photo"
                  accessibilityRole="button"
                >
                  <Text style={styles.avatarBtnText}>Choose photo</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.avatarBtnSecondary}
                  onPress={() => {
                    setRemoveAvatar(true);
                    setAvatarPreview(null);
                    setAvatarBase64(null);
                    setAvatarChanged(false);
                  }}
                  activeOpacity={0.8}
                  accessibilityLabel="Remove profile photo"
                  accessibilityRole="button"
                >
                  <Text style={styles.avatarBtnSecondaryText}>Remove</Text>
                </TouchableOpacity>
              </View>
            </View>

            <Text style={styles.label}>Display name</Text>
            <TextInput
              style={styles.input}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Your name"
              placeholderTextColor={colors.textMuted}
              maxLength={NAME_MAX + 10}
              accessibilityLabel="Display name"
            />

            <Text style={styles.label}>Handle</Text>
            <TextInput
              style={styles.input}
              value={handle}
              onChangeText={setHandle}
              placeholder="handle"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Handle, letters numbers underscore"
            />
            <Text style={styles.hint}>Lowercase letters, numbers, underscore. Shown with @.</Text>

            <Text style={styles.label}>Bio</Text>
            <TextInput
              style={[styles.input, styles.bioInput]}
              value={bio}
              onChangeText={setBio}
              placeholder="A line about you"
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={BIO_MAX + 20}
              accessibilityLabel="Bio"
            />

            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={onClose}
                activeOpacity={0.8}
                accessibilityLabel="Cancel editing"
                accessibilityRole="button"
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={handleSave}
                disabled={saving}
                activeOpacity={0.8}
                accessibilityLabel="Save profile"
                accessibilityRole="button"
              >
                {saving ? (
                  <ActivityIndicator color="#000000" />
                ) : (
                  <Text style={styles.saveText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
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
  title: { ...typography.h3, color: colors.textPrimary, fontSize: 18 },
  closeBtn: { minHeight: touchMin, minWidth: touchMin, justifyContent: 'center', alignItems: 'center' },
  errorText: { color: colors.error, fontSize: 13, fontWeight: '700', marginBottom: spacing.sm },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginBottom: spacing.md },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.surfaceLight },
  avatarActions: { flex: 1, gap: spacing.sm },
  avatarBtn: {
    minHeight: touchMin, justifyContent: 'center', alignItems: 'center',
    borderRadius: borderRadius.full, backgroundColor: colors.surfaceLight,
    borderWidth: 1, borderColor: colors.cardBorder,
  },
  avatarBtnText: { ...typography.bodyBold, color: colors.textPrimary, fontSize: 13 },
  avatarBtnSecondary: {
    minHeight: touchMin, justifyContent: 'center', alignItems: 'center',
    borderRadius: borderRadius.full,
  },
  avatarBtnSecondaryText: { ...typography.bodyBold, color: colors.textSecondary, fontSize: 13 },
  label: { ...typography.captionBold, color: colors.textSecondary, fontSize: 13, marginBottom: 6, marginTop: spacing.sm },
  input: {
    backgroundColor: colors.surfaceLight, color: colors.textPrimary,
    paddingHorizontal: spacing.md, minHeight: touchMin,
    borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.cardBorder, fontSize: 15,
  },
  bioInput: { minHeight: 88, paddingVertical: spacing.sm, textAlignVertical: 'top' },
  hint: { color: colors.textMuted, fontSize: 12, marginTop: 4, marginBottom: spacing.xs },
  actionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg, marginBottom: spacing.md },
  cancelBtn: {
    flex: 1, minHeight: touchMin + 4, borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceLight, borderWidth: 1, borderColor: colors.cardBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  cancelText: { ...typography.bodyBold, color: colors.textPrimary },
  saveBtn: {
    flex: 2, minHeight: touchMin + 4, borderRadius: borderRadius.full,
    backgroundColor: colors.brandPrimary, alignItems: 'center', justifyContent: 'center',
  },
  saveText: { ...typography.bodyBold, color: '#000000' },
});
