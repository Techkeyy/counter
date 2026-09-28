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

  // Calculate dynamic odds multipliers
  const oddsA = poolA > 0 ? (totalPool / poolA).toFixed(2) : '2.00';
  const oddsB = poolB > 0 ? (totalPool / poolB).toFixed(2) : '2.00';

  // Ratio percentage for odds bar
  const percentA = totalPool > 0 ? Math.round((poolA / totalPool) * 100) : 50;
  const percentB = 100 - percentA;

  const isCutoff = duel.status === 'CUTOFF_REACHED' || duel.status.startsWith('RESOLVED');
  const isResolved = duel.status.startsWith('RESOLVED');

  const formatCountdown = (ts: number) => {
    const diff = ts - Date.now();
    if (diff <= 0) return 'LOCK REACHED';
    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    return `${hours}h ${mins}m left`;
  };

  return (
    <TouchableOpacity style={styles.card} onPress={() => onPress(duel)} activeOpacity={0.9}>
      {/* Top Banner */}
      <View style={styles.topRow}>
        <View style={styles.categoryRow}>
          {duel.is_arena === 1 && (
            <View style={styles.arenaTag}>
              <Text style={styles.arenaTagText}>ARENA</Text>
            </View>
          )}
          <Text style={styles.categoryBadge}>{duel.category}</Text>
        </View>

        <View style={[styles.statusBadge, isResolved && styles.statusResolved]}>
          <Text style={styles.statusText}>
            {isResolved ? (duel.winning_side === 1 ? 'SIDE A WON' : 'SIDE B WON') : formatCountdown(duel.cutoff_ts)}
          </Text>
        </View>
      </View>

      {/* Head to Head Captains */}
      <View style={styles.matchupContainer}>
        {/* Side A */}
        <View style={styles.sideColumn}>
          <Image
            source={{ uri: duel.captain_a_avatar || `https://avatar.vercel.sh/${duel.captain_a_wallet}` }}
            style={[styles.captainAvatar, { borderColor: colors.sideA }]}
          />
          <Text style={styles.captainName} numberOfLines={1}>
            {duel.captain_a_name || 'Captain A'}
          </Text>
          <Text style={styles.propositionText} numberOfLines={2}>
            {duel.proposition_a}
          </Text>
          <Text style={[styles.oddsMultiplier, { color: colors.sideA }]}>
            {oddsA}x
          </Text>
        </View>

        {/* VS Badge */}
        <View style={styles.vsContainer}>
          <View style={styles.vsCircle}>
            <Text style={styles.vsText}>VS</Text>
          </View>
          <Text style={styles.totalPoolText}>${totalPool} cUSD</Text>
        </View>

        {/* Side B */}
        <View style={styles.sideColumn}>
          <Image
            source={{ uri: duel.captain_b_avatar || `https://avatar.vercel.sh/${duel.captain_b_wallet}` }}
            style={[styles.captainAvatar, { borderColor: colors.sideB }]}
          />
          <Text style={styles.captainName} numberOfLines={1}>
            {duel.captain_b_name || 'Captain B'}
          </Text>
          <Text style={styles.propositionText} numberOfLines={2}>
            {duel.proposition_b}
          </Text>
          <Text style={[styles.oddsMultiplier, { color: colors.sideB }]}>
            {oddsB}x
          </Text>
        </View>
      </View>

      {/* Parimutuel Odds Bar */}
      <View style={styles.oddsBarContainer}>
        <View style={[styles.oddsBarA, { flex: percentA }]} />
        <View style={[styles.oddsBarB, { flex: percentB }]} />
      </View>
      <View style={styles.oddsLabelsRow}>
        <Text style={[styles.poolLabel, { color: colors.sideA }]}>${poolA} ({percentA}%)</Text>
        <Text style={[styles.poolLabel, { color: colors.sideB }]}>${poolB} ({percentB}%)</Text>
      </View>

      {/* Outside Backers Action Bar */}
      {!isCutoff && (
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.backButton, { backgroundColor: 'rgba(20, 241, 149, 0.15)', borderColor: colors.sideA }]}
            onPress={() => onBackSideA(duel)}
            activeOpacity={0.8}
          >
            <Text style={[styles.backButtonText, { color: colors.sideA }]}>+ Back Side A</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.backButton, { backgroundColor: 'rgba(153, 69, 255, 0.15)', borderColor: colors.sideB }]}
            onPress={() => onBackSideB(duel)}
            activeOpacity={0.8}
          >
            <Text style={[styles.backButtonText, { color: colors.sideB }]}>+ Back Side B</Text>
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 18,
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
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  arenaTag: {
    backgroundColor: colors.badgeBg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.arenaBadge,
  },
  arenaTagText: {
    color: colors.arenaBadge,
    fontSize: 9,
    fontWeight: '900',
  },
  categoryBadge: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  statusBadge: {
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusResolved: {
    backgroundColor: 'rgba(20, 241, 149, 0.2)',
  },
  statusText: {
    color: colors.textPrimary,
    fontSize: 11,
    fontWeight: '700',
  },
  matchupContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sideColumn: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  captainAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 2,
    marginBottom: 6,
    backgroundColor: colors.surfaceLight,
  },
  captainName: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  propositionText: {
    color: colors.textSecondary,
    fontSize: 11,
    textAlign: 'center',
    minHeight: 28,
  },
  oddsMultiplier: {
    fontSize: 18,
    fontWeight: '900',
    marginTop: 4,
  },
  vsContainer: {
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  vsCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: 4,
  },
  vsText: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '900',
  },
  totalPoolText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '800',
  },
  oddsBarContainer: {
    height: 6,
    borderRadius: 3,
    flexDirection: 'row',
    overflow: 'hidden',
    backgroundColor: colors.surfaceLight,
    marginBottom: 4,
  },
  oddsBarA: {
    backgroundColor: colors.sideA,
  },
  oddsBarB: {
    backgroundColor: colors.sideB,
  },
  oddsLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  poolLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    paddingTop: spacing.md,
  },
  backButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 12,
    fontWeight: '800',
  },
});
