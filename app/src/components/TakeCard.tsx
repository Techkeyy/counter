import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Take } from '../types';
import { colors, typography, spacing, borderRadius } from '../theme';
import { Icon } from './Icon';

interface TakeCardProps {
  take: Take;
  onPress: (take: Take) => void;
  onChallenge: (take: Take) => void;
}

export const TakeCard: React.FC<TakeCardProps> = ({ take, onPress, onChallenge }) => {
  const getCategoryColor = (cat: string) => {
    switch (cat.toUpperCase()) {
      case 'CRYPTO': return colors.solanaPurple;
      case 'SPORTS': return colors.duelBlue;
      case 'WEATHER': return colors.solanaGreen;
      default: return colors.warningYellow;
    }
  };

  return (
    <TouchableOpacity style={styles.card} onPress={() => onPress(take)} activeOpacity={0.9}>
      <View style={styles.header}>
        <View style={styles.authorRow}>
          <Image
            source={{ uri: take.author_avatar || `https://api.dicebear.com/7.x/identicon/png?seed=${take.author_wallet}` }}
            style={styles.avatar}
          />
          <View>
            <View style={styles.nameRow}>
              <Text style={styles.authorName}>{take.author_name || 'Contender'}</Text>
              {(take.author_skr_staked ?? 0) > 0 && (
                <Icon name="shield-check" size={14} color={colors.solanaGreen} />
              )}
            </View>
            <Text style={styles.authorHandle}>@{take.author_handle || take.author_wallet.slice(0, 6)}</Text>
          </View>
        </View>

        <View style={[styles.categoryBadge, { borderColor: getCategoryColor(take.category) }]}>
          <Text style={[styles.categoryText, { color: getCategoryColor(take.category) }]}>
            {take.category}
          </Text>
        </View>
      </View>

      <Text style={styles.topic}>{take.topic}</Text>
      <Text style={styles.content}>{take.content}</Text>

      <View style={styles.footer}>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Icon name="message-circle" size={14} color={colors.textSecondary} />
            <Text style={styles.statText}>{take.comments_count || 0}</Text>
          </View>
          <View style={styles.statItem}>
            <Icon name="swords" size={14} color={colors.textSecondary} />
            <Text style={styles.statText}>{take.duels_count || 0}</Text>
          </View>
        </View>

        <TouchableOpacity 
          style={styles.challengeButton} 
          onPress={() => onChallenge(take)}
          activeOpacity={0.8}
        >
          <Icon name="swords" size={14} color="#000000" />
          <Text style={styles.challengeButtonText}>CHALLENGE</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceLight,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  authorName: {
    ...typography.bodyBold,
    color: colors.textPrimary,
  },
  authorHandle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  categoryBadge: {
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  categoryText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  topic: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  content: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    lineHeight: 20,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.surfaceLight,
    paddingTop: spacing.sm,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  challengeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.solanaGreen,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    gap: 4,
  },
  challengeButtonText: {
    ...typography.captionBold,
    color: '#000000',
    letterSpacing: 0.5,
  },
});

export default TakeCard;
