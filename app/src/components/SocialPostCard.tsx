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
import { colors, typography, spacing, borderRadius } from '../theme';
import { Icon } from './Icon';
import {
  formatUserDisplayName,
  formatUserHandle,
  getAvatarUri,
  formatWalletShort,
} from '../utils/identity';

export interface FeedItem {
  id: string;
  type: 'TAKE' | 'DUEL' | 'RECEIPT';
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

export const SocialPostCard: React.FC<SocialPostCardProps> = ({
  item,
  onPressTake,
  onPressDuel,
  onPressReceipt,
  onChallengePress,
}) => {
  const { type, take, duel, receipt } = item;

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

  const handleShare = async () => {
    try {
      const effectiveAuthor = authorHandle || authorDisplayName;
      if (type === 'RECEIPT' && receipt) {
        await Share.share({
          message: `Counter Permanent Receipt: ${authorDisplayName} won the duel on Counter! ${take.content}`,
        });
      } else if (type === 'DUEL' && duel) {
        await Share.share({
          message: `Duel on Counter: ${duel.proposition_a} vs ${duel.proposition_b}. Who is right? Back your side now!`,
        });
      } else {
        await Share.share({
          message: `"${take.content}" - Take by ${effectiveAuthor} on Counter. Think they're wrong? Challenge them!`,
        });
      }
    } catch {
      // ignore user cancel
    }
  };

  // Helper for percentage splits
  const sideATotal = Number(duel?.side_a_total) || 0;
  const sideBTotal = Number(duel?.side_b_total) || 0;
  const totalPool = sideATotal + sideBTotal;
  const sideAPercent = totalPool > 0 ? Math.round((sideATotal / totalPool) * 100) : 50;
  const sideBPercent = totalPool > 0 ? 100 - sideAPercent : 50;

  return (
    <View style={styles.card}>
      {/* 1. Author Header */}
      <View style={styles.header}>
        <Image source={{ uri: avatarUri }} style={styles.avatar} />
        <View style={styles.authorInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.displayName} numberOfLines={1}>
              {authorDisplayName}
            </Text>
            {authorHandle ? (
              <Text style={styles.handle} numberOfLines={1}>
                {authorHandle}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Category Pill */}
        <View style={styles.categoryPill}>
          <Text style={styles.categoryText}>{take.category}</Text>
        </View>
      </View>

      {/* 2. Content based on Lifecycle State */}
      {type === 'TAKE' && (
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => onPressTake(take)}
          style={styles.contentTouchable}
        >
          <Text style={styles.topicText}>{take.topic}</Text>
          <Text style={styles.contentText}>{take.content}</Text>

          {/* Action Row */}
          <View style={styles.actionRow}>
            <View style={styles.leftActions}>
              <TouchableOpacity
                style={styles.socialAction}
                onPress={() => onPressTake(take)}
                activeOpacity={0.7}
              >
                <Icon name="message-circle" size={16} color={colors.textSecondary} />
                <Text style={styles.actionCount}>{take.comments_count || 0}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.socialAction}
                onPress={handleShare}
                activeOpacity={0.7}
              >
                <Icon name="share-2" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {onChallengePress && (
              <TouchableOpacity
                style={styles.challengeButton}
                onPress={() => onChallengePress(take)}
                activeOpacity={0.8}
              >
                <Icon name="swords" size={13} color={colors.textSecondary} />
                <Text style={styles.challengeButtonText}>Challenge</Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      )}

      {type === 'DUEL' && duel && (
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => onPressDuel(duel)}
          style={styles.contentTouchable}
        >
          <Text style={styles.contentText}>{take.content}</Text>

          {/* Duel Conflict Box */}
          <View style={styles.conflictBox}>
            <View style={styles.conflictHeader}>
              <View style={styles.duelBadge}>
                <View style={styles.liveIndicator} />
                <Text style={styles.duelBadgeText}>LIVE DUEL</Text>
              </View>
              <Text style={styles.poolTotalText}>${totalPool.toFixed(2)} Pool</Text>
            </View>

            {/* Split Names & Percentages */}
            <View style={styles.splitRow}>
              <View style={styles.sideColumn}>
                <Text style={styles.sideName} numberOfLines={1}>
                  {duel.captain_a_name || formatWalletShort(duel.captain_a_wallet)}
                </Text>
                <Text style={[styles.sidePercent, { color: colors.sideA }]}>
                  {sideAPercent}% backing
                </Text>
              </View>

              <Text style={styles.vsText}>VS</Text>

              <View style={[styles.sideColumn, { alignItems: 'flex-end' }]}>
                <Text style={styles.sideName} numberOfLines={1}>
                  {duel.captain_b_name || formatWalletShort(duel.captain_b_wallet)}
                </Text>
                <Text style={[styles.sidePercent, { color: colors.sideB }]}>
                  {sideBPercent}% backing
                </Text>
              </View>
            </View>

            {/* Split Progress Bar */}
            <View style={styles.splitBar}>
              <View style={[styles.barSegmentA, { flex: Math.max(sideAPercent, 5) }]} />
              <View style={[styles.barSegmentB, { flex: Math.max(sideBPercent, 5) }]} />
            </View>

            {/* Action Bar */}
            <View style={styles.duelActionRow}>
              <TouchableOpacity
                style={styles.socialAction}
                onPress={handleShare}
                activeOpacity={0.7}
              >
                <Icon name="share-2" size={16} color={colors.textSecondary} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.viewDuelButton}
                onPress={() => onPressDuel(duel)}
                activeOpacity={0.8}
              >
                <Text style={styles.viewDuelButtonText}>View Duel & Back</Text>
                <Icon name="chevron-right" size={14} color="#000000" />
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      )}

      {type === 'RECEIPT' && receipt && (
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => onPressReceipt && onPressReceipt(receipt)}
          style={styles.contentTouchable}
        >
          <Text style={styles.contentText}>{take.content}</Text>

          {/* Permanent Receipt Card */}
          <View style={styles.receiptBox}>
            <View style={styles.receiptBanner}>
              <Icon name="trophy" size={16} color={colors.arenaBadge} />
              <Text style={styles.receiptBannerText}>
                {formatWalletShort(receipt.winner_wallet)} Won the Duel
              </Text>
            </View>

            <Text style={styles.receiptSummary}>{receipt.resolution_summary}</Text>

            <View style={styles.receiptFooter}>
              <View style={styles.chainBadge}>
                <Icon name="shield-check" size={14} color={colors.solanaGreen} />
                <Text style={styles.chainBadgeText}>On-Chain Receipt</Text>
              </View>

              <TouchableOpacity
                style={styles.shareReceiptBtn}
                onPress={handleShare}
                activeOpacity={0.8}
              >
                <Icon name="share-2" size={14} color={colors.textPrimary} />
                <Text style={styles.shareReceiptText}>Share</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
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
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceLight,
  },
  authorInfo: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  nameRow: {
    flexDirection: 'column',
  },
  displayName: {
    ...typography.bodyBold,
    color: colors.textPrimary,
  },
  handle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  categoryPill: {
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  categoryText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '600',
  },
  contentTouchable: {
    marginTop: spacing.xs,
  },
  topicText: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  contentText: {
    ...typography.body,
    color: colors.textPrimary,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceLight,
  },
  leftActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  socialAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  actionCount: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  challengeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 1,
    borderRadius: borderRadius.full,
    gap: spacing.xs,
  },
  challengeButtonText: {
    ...typography.captionBold,
    color: colors.textSecondary,
    fontSize: 12,
  },
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
  duelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  liveIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.duelCrimson,
  },
  duelBadgeText: {
    ...typography.captionBold,
    color: colors.duelCrimson,
    letterSpacing: 0.5,
  },
  poolTotalText: {
    ...typography.captionBold,
    color: colors.solanaGreen,
  },
  splitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  sideColumn: {
    flex: 1,
  },
  sideName: {
    ...typography.bodyBold,
    color: colors.textPrimary,
  },
  sidePercent: {
    ...typography.captionBold,
    marginTop: 2,
  },
  vsText: {
    ...typography.captionBold,
    color: colors.textMuted,
    paddingHorizontal: spacing.sm,
  },
  splitBar: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: colors.surfaceLight,
    marginBottom: spacing.md,
  },
  barSegmentA: {
    backgroundColor: colors.sideA,
  },
  barSegmentB: {
    backgroundColor: colors.sideB,
  },
  duelActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  viewDuelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.solanaGreen,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
    gap: spacing.xs,
  },
  viewDuelButtonText: {
    ...typography.captionBold,
    color: '#000000',
  },
  receiptBox: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  receiptBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  receiptBannerText: {
    ...typography.bodyBold,
    color: colors.arenaBadge,
  },
  receiptSummary: {
    ...typography.bodyMuted,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  receiptFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chainBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  chainBadgeText: {
    ...typography.captionBold,
    color: colors.solanaGreen,
  },
  shareReceiptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    gap: spacing.xs,
  },
  shareReceiptText: {
    ...typography.captionBold,
    color: colors.textPrimary,
  },
});
