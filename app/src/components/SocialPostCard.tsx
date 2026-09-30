import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Share,
} from 'react-native';
import { Take, Duel, Receipt } from '../types';
import { colors, typography, spacing, borderRadius, touchMin } from '../theme';
import { Icon } from './Icon';
import { PRODUCTION_WEB_URL } from '../api';
import {
  formatUserDisplayName,
  formatUserHandle,
  getAvatarUri,
  formatWalletShort,
  formatRelativeTime,
  isRealSignature,
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
  onPressReceipt?: (receipt: Receipt) => void;
  onChallengePress?: (take: Take) => void;
}

function poolTotals(duel?: Duel): { a: number; b: number; total: number; pctA: number } {
  const a = Number(duel?.side_a_total) || 0;
  const b = Number(duel?.side_b_total) || 0;
  const total = a + b;
  const pctA = total > 0 ? Math.round((a / total) * 100) : 50;
  return { a, b, total, pctA };
}

export const SocialPostCard: React.FC<SocialPostCardProps> = ({
  item,
  onPressTake,
  onPressDuel,
  onChallengePress,
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
  const avatarUri = getAvatarUri(take.author_avatar, take.author_wallet);
  const { total, pctA } = poolTotals(duel);
  const pctB = 100 - pctA;

  const handleShareTake = async () => {
    try {
      const by = authorHandle || authorDisplayName;
      await Share.share({
        message: `"${take.content}" by ${by} on Counter. Think they are wrong? Challenge them.`,
      });
    } catch {
      // user cancelled
    }
  };

  const handleShareDuel = async () => {
    if (!duel) return;
    try {
      const link = `${PRODUCTION_WEB_URL}/d/${duel.share_slug || duel.id}`;
      await Share.share({
        message: `1v1 Duel on Counter: ${duel.proposition_a} vs ${duel.proposition_b}. Back your side: ${link}`,
        url: link,
      });
    } catch {
      // user cancelled
    }
  };

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => onPressTake(take)}
        activeOpacity={0.8}
        accessibilityLabel={`Open take by ${authorDisplayName}`}
        accessibilityRole="button"
      >
        <Image source={{ uri: avatarUri }} style={styles.avatar} />
        <View style={styles.authorInfo}>
          <Text style={styles.displayName} numberOfLines={1}>
            {authorDisplayName}
          </Text>
          <View style={styles.metaRow}>
            {authorHandle ? (
              <Text style={styles.handle} numberOfLines={1}>
                {authorHandle}
              </Text>
            ) : null}
            <Text style={styles.timestamp}>{formatRelativeTime(take.created_at)}</Text>
          </View>
        </View>
        <View style={styles.categoryPill}>
          <Text style={styles.categoryText}>{take.category}</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => (type === 'TAKE' ? onPressTake(take) : duel && onPressDuel(duel))}
        activeOpacity={0.9}
        accessibilityLabel={type === 'TAKE' ? 'Open take thread' : 'Open duel'}
      >
        <Text style={styles.topicText}>{take.topic}</Text>
        <Text style={styles.contentText}>{take.content}</Text>
      </TouchableOpacity>

      {type === 'TAKE' && (
        <View style={styles.actionRow}>
          <View style={styles.leftActions}>
            <TouchableOpacity
              style={styles.socialAction}
              onPress={() => onPressTake(take)}
              activeOpacity={0.7}
              accessibilityLabel={`Replies, ${take.comments_count || 0}`}
              accessibilityRole="button"
            >
              <Icon name="message-circle" size={18} color={colors.textSecondary} />
              <Text style={styles.actionCount}>{take.comments_count || 0}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.socialAction}
              onPress={handleShareTake}
              activeOpacity={0.7}
              accessibilityLabel="Share take"
              accessibilityRole="button"
            >
              <Icon name="share-2" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          {onChallengePress && (
            <TouchableOpacity
              style={styles.challengeButton}
              onPress={() => onChallengePress(take)}
              activeOpacity={0.8}
              accessibilityLabel="Challenge this take"
              accessibilityRole="button"
            >
              <Icon name="swords" size={14} color={colors.brandPrimary} />
              <Text style={styles.challengeButtonText}>Challenge</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {type === 'DUEL' && duel && (
        <View style={styles.conflictBox}>
          <View style={styles.conflictHeader}>
            <View style={styles.duelBadge}>
              <View style={styles.liveIndicator} />
              <Text style={styles.duelBadgeText}>Live duel</Text>
            </View>
            <Text style={styles.poolTotalText}>${total.toFixed(2)} pool</Text>
          </View>
          <View style={styles.splitRow}>
            <View style={styles.sideColumn}>
              <Text style={styles.sideName} numberOfLines={1}>
                {duel.captain_a_name || formatWalletShort(duel.captain_a_wallet)}
              </Text>
              <Text style={[styles.sidePercent, { color: colors.sideA }]}>{pctA}% backing</Text>
            </View>
            <Text style={styles.vsText}>VS</Text>
            <View style={[styles.sideColumn, { alignItems: 'flex-end' }]}>
              <Text style={styles.sideName} numberOfLines={1}>
                {duel.captain_b_name || formatWalletShort(duel.captain_b_wallet)}
              </Text>
              <Text style={[styles.sidePercent, { color: colors.sideB }]}>{pctB}% backing</Text>
            </View>
          </View>
          <View style={styles.splitBar}>
            <View style={[styles.barSegmentA, { flex: Math.max(pctA, 5) }]} />
            <View style={[styles.barSegmentB, { flex: Math.max(pctB, 5) }]} />
          </View>
          <View style={styles.duelActionRow}>
            <TouchableOpacity
              style={styles.socialAction}
              onPress={handleShareDuel}
              activeOpacity={0.7}
              accessibilityLabel="Share duel"
              accessibilityRole="button"
            >
              <Icon name="share-2" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.viewDuelButton}
              onPress={() => onPressDuel(duel)}
              activeOpacity={0.8}
              accessibilityLabel="View duel and back a side"
              accessibilityRole="button"
            >
              <Text style={styles.viewDuelButtonText}>View duel</Text>
              <Icon name="chevron-right" size={14} color="#000000" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {type === 'SETTLED' && duel && (
        <View style={styles.settledBox}>
          <View style={styles.settledHeader}>
            <Icon name="trophy" size={16} color={colors.arenaBadge} />
            <Text style={styles.settledTitle}>
              {formatWalletShort(
                duel.winning_side === 1 ? duel.captain_a_wallet : duel.captain_b_wallet
              )}{' '}
              won the duel
            </Text>
          </View>
          <Text style={styles.settledSummary} numberOfLines={3}>
            {duel.resolution_data || `${duel.proposition_a} vs ${duel.proposition_b} settled.`}
          </Text>
          <View style={styles.settledFooter}>
            <Text style={styles.settledPool}>${total.toFixed(2)} pool settled</Text>
            {isRealSignature(duel.resolution_tx) ? (
              <View style={styles.chainNote}>
                <Icon name="shield-check" size={14} color={colors.success} />
                <Text style={styles.chainNoteText}>Settled on Solana</Text>
              </View>
            ) : (
              <Text style={styles.chainNoteText}>Outcome recorded</Text>
            )}
          </View>
          <TouchableOpacity
            style={styles.viewDuelButton}
            onPress={() => onPressDuel(duel)}
            activeOpacity={0.8}
            accessibilityLabel="View settled duel and receipt"
            accessibilityRole="button"
          >
            <Text style={styles.viewDuelButtonText}>View result</Text>
            <Icon name="chevron-right" size={14} color="#000000" />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    minHeight: touchMin,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceLight,
  },
  authorInfo: { flex: 1, marginLeft: spacing.sm },
  displayName: { ...typography.bodyBold, color: colors.textPrimary },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 1 },
  handle: { ...typography.caption, color: colors.textSecondary },
  timestamp: { ...typography.caption, color: colors.textMuted },
  categoryPill: {
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: borderRadius.full,
  },
  categoryText: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  topicText: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.xs },
  contentText: { ...typography.body, color: colors.textPrimary, lineHeight: 21, marginBottom: spacing.md, fontSize: 15 },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceLight,
  },
  leftActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  socialAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: touchMin,
    minWidth: touchMin,
    justifyContent: 'center',
  },
  actionCount: { ...typography.caption, color: colors.textSecondary, fontSize: 13 },
  challengeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.brandPrimary,
    paddingHorizontal: spacing.lg,
    minHeight: touchMin,
    borderRadius: borderRadius.full,
    gap: spacing.xs,
  },
  challengeButtonText: { ...typography.captionBold, color: colors.brandPrimary, fontSize: 13 },
  conflictBox: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  conflictHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  duelBadge: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  liveIndicator: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.error },
  duelBadgeText: { ...typography.captionBold, color: colors.error },
  poolTotalText: { ...typography.captionBold, color: colors.success, fontSize: 13 },
  splitRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  sideColumn: { flex: 1 },
  sideName: { ...typography.bodyBold, color: colors.textPrimary },
  sidePercent: { ...typography.captionBold, marginTop: 2, fontSize: 13 },
  vsText: { ...typography.captionBold, color: colors.textMuted, paddingHorizontal: spacing.sm },
  splitBar: {
    flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden',
    backgroundColor: colors.surfaceLight, marginBottom: spacing.md,
  },
  barSegmentA: { backgroundColor: colors.sideA },
  barSegmentB: { backgroundColor: colors.sideB },
  duelActionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  viewDuelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.brandPrimary,
    paddingHorizontal: spacing.lg,
    minHeight: touchMin,
    borderRadius: borderRadius.full,
    gap: spacing.xs,
  },
  viewDuelButtonText: { ...typography.captionBold, color: '#000000', fontSize: 13 },
  settledBox: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    gap: spacing.sm,
  },
  settledHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  settledTitle: { ...typography.bodyBold, color: colors.textPrimary, flex: 1 },
  settledSummary: { ...typography.bodyMuted, color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  settledFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  settledPool: { ...typography.captionBold, color: colors.textSecondary, fontSize: 13 },
  chainNote: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  chainNoteText: { ...typography.captionBold, color: colors.success, fontSize: 12 },
});
