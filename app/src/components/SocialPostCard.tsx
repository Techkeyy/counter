import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Take, Duel, Receipt } from '../types';
import { colors, typography, spacing, touchMin } from '../theme';
import { Icon } from './Icon';
import { IdentityHeader } from './IdentityHeader';
import { DuelAttachment } from './DuelAttachment';
import { shareCounterEntity } from '../share';
import {
  formatUserDisplayName,
  formatUserHandle,
} from '../utils/identity';

export interface FeedItem {
  id: string;
  type: 'TAKE' | 'DUEL' | 'SETTLED';
  take: Take;
  duel?: Duel;
  receipt?: Receipt;
}

interface SocialPostCardProps {
  item: FeedItem;
  onPressTake: (take: Take) => void;
  onPressDuel: (duel: Duel) => void;
  onChallengePress?: (take: Take) => void;
  onOpenAuthorProfile?: (wallet: string | null) => void;
}

// Timeline row: shared identity header, text, inline actions. No card chrome;
// separation comes from the list divider. Duel state rides as one compact
// attachment so scrolling keeps a stable rhythm.
export const SocialPostCard: React.FC<SocialPostCardProps> = ({
  item,
  onPressTake,
  onPressDuel,
  onChallengePress,
  onOpenAuthorProfile,
}) => {
  const { type, take, duel } = item;

  const authorDisplayName = formatUserDisplayName({
    display_name: take.author_name,
    handle: take.author_handle,
    wallet: take.author_wallet,
  });
  const authorHandle = formatUserHandle({
    handle: take.author_handle,
    wallet: take.author_wallet,
  });

  const shareTake = () => void shareCounterEntity({ type: 'TAKE', id: take.id, take });
  const shareDuel = () => duel ? void shareCounterEntity({ type: 'DUEL', id: duel.id, duel }) : undefined;

  return (
    <View style={styles.row}>
      <TouchableOpacity
        onPress={() => onPressTake(take)}
        activeOpacity={0.9}
        accessibilityLabel={`Open take by ${authorDisplayName}`}
      >
        <IdentityHeader
          displayName={take.author_name}
          handle={take.author_handle}
          wallet={take.author_wallet}
          avatarUrl={take.author_avatar}
          timestamp={take.created_at}
          category={take.category}
          onPress={onOpenAuthorProfile ? () => onOpenAuthorProfile(take.author_wallet) : undefined}
        />
        <Text style={styles.topic}>{take.topic}</Text>
        {!!take.content?.trim() && <Text style={styles.content}>Why: {take.content}</Text>}
      </TouchableOpacity>

      {type !== 'TAKE' && duel && (
        <DuelAttachment duel={duel} onOpen={onPressDuel} compact />
      )}

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.action}
          onPress={() => onPressTake(take)}
          activeOpacity={0.7}
          accessibilityLabel={`Replies, ${take.comments_count || 0}`}
          accessibilityRole="button"
        >
          <Icon name="message-circle" size={18} color={colors.textSecondary} />
          <Text style={styles.count}>{take.comments_count || 0}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.action}
          onPress={type === 'TAKE' ? shareTake : shareDuel}
          activeOpacity={0.7}
          accessibilityLabel="Share"
          accessibilityRole="button"
        >
          <Icon name="share-2" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
        {onChallengePress && type === 'TAKE' && (
          <TouchableOpacity
            style={styles.challenge}
            onPress={() => onChallengePress(take)}
            activeOpacity={0.8}
            accessibilityLabel="Challenge this take"
            accessibilityRole="button"
          >
            <Icon name="swords" size={14} color={colors.brandPrimary} />
            <Text style={styles.challengeText}>Challenge</Text>
          </TouchableOpacity>
        )}
        {type !== 'TAKE' && duel && (
          <TouchableOpacity
            style={styles.challenge}
            onPress={() => onPressDuel(duel)}
            activeOpacity={0.8}
            accessibilityLabel="Open duel"
            accessibilityRole="button"
          >
            <Text style={styles.challengeText}>Open duel</Text>
            <Icon name="chevron-right" size={14} color={colors.brandPrimary} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  topic: { ...typography.h2, color: colors.textPrimary, fontSize: 17, lineHeight: 23, marginBottom: 4, marginLeft: 52 },
  content: {
    ...typography.bodyMuted,
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.sm,
    marginLeft: 52,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 52,
    gap: spacing.lg,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: touchMin,
    minWidth: touchMin,
  },
  count: { ...typography.caption, color: colors.textSecondary, fontSize: 13 },
  challenge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: touchMin,
    paddingHorizontal: spacing.md,
    marginLeft: 'auto',
  },
  challengeText: { ...typography.captionBold, color: colors.brandPrimary, fontSize: 13 },
});
