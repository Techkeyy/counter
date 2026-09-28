import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Duel } from '../types';
import { colors, typography, spacing } from '../theme';

interface DuelCardProps {
  duel: Duel;
  onPress: (duel: Duel) => void;
  onBackSideA: (duel: Duel) => void;
  onBackSideB: (duel: Duel) => void;
}

export const DuelCard: React.FC<DuelCardProps> = ({
  duel,
  onPress,
  onBackSideA,
  onBackSideB,
}) => {
  const poolA = Number(duel.side_a_total) || 0;
  const poolB = Number(duel.side_b_total) || 0;
  const totalPool = poolA + poolB;

  const isCutoff = duel.status === 'CUTOFF_REACHED' || duel.status.startsWith('RESOLVED');
  const isResolved = duel.status.startsWith('RESOLVED');

  const formatCountdown = (ts: number) => {
    const diff = ts - Date.now();
    if (diff <= 0) return 'LOCKED';
    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    return `${hours}h ${mins}m left to back`;
  };

  return (
    <TouchableOpacity style={styles.card} onPress={() => onPress(duel)} activeOpacity={0.9}>
      {/* 1. Category & Context Header */}
      <View style={styles.topRow}>
        <View style={styles.badgeRow}>
          {duel.is_arena === 1 && (
            <View style={styles.arenaBadge}>
              <Text style={styles.arenaBadgeText}>⭐ ARENA DUEL</Text>
            </View>
          )}
          <Text style={styles.categoryText}>{duel.category}</Text>
        </View>

        <View style={[styles.statusPill, isResolved && styles.statusResolvedPill]}>
          <Text style={[styles.statusPillText, isResolved && styles.statusResolvedText]}>
            {isResolved
              ? (duel.winning_side === 1 ? '🏆 SIDE A WON' : '🏆 SIDE B WON')
              : formatCountdown(duel.cutoff_ts)}
          </Text>
        </View>
      </View>

      {/* 2. Human Contenders Debate Box */}
      <View style={styles.debateContainer}>
        {/* Contender A */}
        <View style={[styles.contenderBox, isResolved && duel.winning_side === 1 && styles.winningBox]}>
          <View style={styles.contenderHeader}>
            <Image
              source={{ uri: duel.captain_a_avatar || `https://avatar.vercel.sh/${duel.captain_a_wallet}` }}
              style={styles.avatar}
            />
            <View style={styles.contenderInfo}>
              <Text style={styles.contenderName} numberOfLines={1}>
                {duel.captain_a_name || 'Captain A'}
              </Text>
              <Text style={styles.contenderHandle}>
                @{duel.captain_a_handle || duel.captain_a_wallet.slice(0, 6)}
              </Text>
            </View>
          </View>
          <Text style={styles.argumentText} numberOfLines={3}>
            "{duel.proposition_a}"
          </Text>
          <Text style={styles.poolInfo}>${poolA} cUSD backed</Text>
        </View>

        <View style={styles.vsBadge}>
          <Text style={styles.vsText}>VS</Text>
        </View>

        {/* Contender B */}
        <View style={[styles.contenderBox, isResolved && duel.winning_side === 2 && styles.winningBox]}>
          <View style={styles.contenderHeader}>
            <Image
              source={{ uri: duel.captain_b_avatar || `https://avatar.vercel.sh/${duel.captain_b_wallet}` }}
              style={styles.avatar}
            />
            <View style={styles.contenderInfo}>
              <Text style={styles.contenderName} numberOfLines={1}>
                {duel.captain_b_name || 'Captain B'}
              </Text>
              <Text style={styles.contenderHandle}>
                @{duel.captain_b_handle || duel.captain_b_wallet.slice(0, 6)}
              </Text>
            </View>
          </View>
          <Text style={styles.argumentText} numberOfLines={3}>
            "{duel.proposition_b}"
          </Text>
          <Text style={styles.poolInfo}>${poolB} cUSD backed</Text>
        </View>
      </View>

      {/* 3. Community Backing Action Callout */}
      {!isCutoff ? (
        <View style={styles.actionSection}>
          <Text style={styles.actionPrompt}>Who are you backing?</Text>
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.backBtn, styles.backBtnA]}
              onPress={() => onBackSideA(duel)}
              activeOpacity={0.8}
            >
              <Text style={styles.backBtnTextA}>
                Back {duel.captain_a_name?.split(' ')[0] || 'Side A'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.backBtn, styles.backBtnB]}
              onPress={() => onBackSideB(duel)}
              activeOpacity={0.8}
            >
              <Text style={styles.backBtnTextB}>
                Back {duel.captain_b_name?.split(' ')[0] || 'Side B'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.resolvedFooter}>
          <Text style={styles.totalPoolSummary}>
            💰 Total Disputed Pool: ${totalPool} cUSD
          </Text>
        </View>
      )}
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
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  arenaBadge: {
    backgroundColor: colors.arenaBadgeBg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.arenaBadge,
  },
  arenaBadgeText: {
    color: colors.arenaBadge,
    fontSize: 10,
    fontWeight: '800',
  },
  categoryText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  statusPill: {
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusResolvedPill: {
    backgroundColor: 'rgba(63, 185, 80, 0.15)',
  },
  statusPillText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  statusResolvedText: {
    color: colors.accentGreen,
    fontWeight: '800',
  },
  debateContainer: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  contenderBox: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  winningBox: {
    borderColor: colors.accentGreen,
    backgroundColor: 'rgba(63, 185, 80, 0.08)',
  },
  contenderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surface,
  },
  contenderInfo: {
    flex: 1,
  },
  contenderName: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  contenderHandle: {
    color: colors.textMuted,
    fontSize: 11,
  },
  argumentText: {
    color: colors.textPrimary,
    fontSize: 13,
    lineHeight: 18,
    fontStyle: 'italic',
    marginBottom: 6,
  },
  poolInfo: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  vsBadge: {
    alignSelf: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  vsText: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
  },
  actionSection: {
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    paddingTop: spacing.md,
  },
  actionPrompt: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  backBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  backBtnA: {
    backgroundColor: 'rgba(63, 185, 80, 0.12)',
    borderColor: colors.sideABorder,
  },
  backBtnB: {
    backgroundColor: 'rgba(88, 166, 255, 0.12)',
    borderColor: colors.sideBBorder,
  },
  backBtnTextA: {
    color: colors.sideA,
    fontSize: 12,
    fontWeight: '800',
  },
  backBtnTextB: {
    color: colors.sideB,
    fontSize: 12,
    fontWeight: '800',
  },
  resolvedFooter: {
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    paddingTop: spacing.md,
    alignItems: 'center',
  },
  totalPoolSummary: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
});
