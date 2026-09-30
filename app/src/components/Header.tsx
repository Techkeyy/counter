import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { colors, typography, spacing, touchMin } from '../theme';
import { Icon } from './Icon';
import { getAvatarUri } from '../utils/identity';

interface HeaderProps {
  wallet: string | null;
  onAvatarPress: () => void;
}

// Restrained authenticated header: wordmark plus identity avatar. Wallet,
// compose, and notifications live where they belong (Profile, FAB, Activity).
export const Header: React.FC<HeaderProps> = ({ wallet, onAvatarPress }) => {
  const avatarUri = getAvatarUri(null, wallet);

  return (
    <View style={styles.container}>
      <View style={styles.brandCol}>
        <Text style={styles.logoText}>Counter</Text>
        <Text style={styles.netText}>Devnet test build</Text>
      </View>

      <TouchableOpacity
        style={styles.avatarButton}
        onPress={onAvatarPress}
        activeOpacity={0.8}
        accessibilityLabel={wallet ? 'Open your profile' : 'Connect wallet in profile'}
        accessibilityRole="button"
      >
        {wallet ? (
          <Image source={{ uri: avatarUri }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarFallback}>
            <Icon name="user" size={20} color={colors.textSecondary} />
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  brandCol: {
    justifyContent: 'center',
  },
  logoText: {
    ...typography.h2,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: colors.textPrimary,
  },
  netText: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 1,
  },
  avatarButton: {
    width: touchMin,
    height: touchMin,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceLight,
  },
  avatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default Header;
