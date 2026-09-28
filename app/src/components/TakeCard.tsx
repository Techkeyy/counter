import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Take } from '../types';
import { colors, typography, spacing } from '../theme';

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
            source={{ uri: take.author_avatar || `https://avatar.vercel.sh/${take.author_wallet}` }}
            style={styles.avatar}
          />
          <View>
            <View style={styles.nameRow}>
              <Text style={styles.authorName}>{take.author_name || 'Contender'}</Text>
              {(take.author_skr_staked ?? 0) > 100 && (
                <Text style={styles.stakerBadge}>🛡️</Text>
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
          <Text style={styles.statText}>💬 {take.comments_count} comments</Text>
          <Text style={styles.statText}>⚔️ {take.duels_count} duels</Text>
        </View>

        <TouchableOpacity 
          style={styles.challengeButton} 
          onPress={() => onChallenge(take)}
          activeOpacity={0.8}
        >
          <Text style={styles.challengeButtonText}>⚔️ CHALLENGE</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
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
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surfaceLight,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  authorName: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  stakerBadge: {
    fontSize: 12,
  },
  authorHandle: {
    color: colors.textMuted,
    fontSize: 12,
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  categoryText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  topic: {
    color: colors.solanaGreen,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  content: {
    color: colors.textPrimary,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: spacing.md,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    paddingTop: spacing.md,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  statText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  challengeButton: {
    backgroundColor: colors.solanaPurple,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
  },
  challengeButtonText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
