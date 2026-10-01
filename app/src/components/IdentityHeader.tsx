import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { colors, typography, spacing, touchMin } from '../theme';
import {
  formatUserDisplayName,
  formatUserHandle,
  getAvatarUri,
  formatRelativeTime,
} from '../utils/identity';

interface IdentityHeaderProps {
  displayName?: string | null;
  name?: string | null;
  handle?: string | null;
  wallet?: string | null;
  avatarUrl?: string | null;
  timestamp?: string | null;
  category?: string | null;
  onPress?: () => void;
}

// One shared social identity header: avatar, Display Name, @handle, time.
// Tapping opens the person's profile. Never renders wallet text.
export const IdentityHeader: React.FC<IdentityHeaderProps> = ({
  displayName,
  name,
  handle,
  wallet,
  avatarUrl,
  timestamp,
  category,
  onPress,
}) => {
  const name_ = formatUserDisplayName({ display_name: displayName, name, handle, wallet });
  const handle_ = formatUserHandle({ handle, wallet });
  const time = timestamp ? formatRelativeTime(timestamp) : '';
  const meta = [handle_, time, category ? category.toLowerCase() : '']
    .filter((s) => s && s.length > 0)
    .join(' · ');
  const body = (
    <>
      <Image source={{ uri: getAvatarUri(avatarUrl, wallet) }} style={styles.avatar} />
      <View style={styles.identity}>
        <Text style={styles.displayName} numberOfLines={1}>
          {name_}
        </Text>
        {meta ? (
          <Text style={styles.meta} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
    </>
  );
  if (!onPress) {
    return <View style={styles.row}>{body}</View>;
  }
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityLabel={`Open profile of ${name_}`}
      accessibilityRole="button"
    >
      {body}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: touchMin,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceLight,
  },
  identity: { flex: 1, marginLeft: spacing.sm },
  displayName: { ...typography.bodyBold, color: colors.textPrimary, fontSize: 15 },
  meta: { ...typography.caption, color: colors.textMuted, fontSize: 12, marginTop: 1 },
});
