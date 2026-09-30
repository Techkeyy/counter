import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Duel } from '../types';
import { colors, typography, spacing, borderRadius, touchMin } from '../theme';
import { Icon } from './Icon';
import { PRODUCTION_WEB_URL } from '../api';
import {
  formatUserDisplayName,
  formatWalletShort,
  isRealSignature,
} from '../utils/identity';

// Compact duel attachment: a genuine object (duel with escrow state), so it
// earns a container. Used by the feed, take threads, and duels-adjacent rows.
export const DuelAttachment: React.FC<{
  duel: Duel;
  onOpen: (duel: Duel) => void;
  compact?: boolean;
}> = ({ duel, onOpen, compact }) => {
  const poolA = Number(duel.side_a_total) || 0;
  const poolB = Number(duel.side_b_total) || 0;
  const total = poolA + poolB;
  const pctA = total > 0 ? Math.round((poolA / total) * 100) : 50;
  const resolved = duel.status.startsWith('RESOLVED');
  const winner =
    duel.winning_side === 1 ? duel.captain_a_wallet : duel.captain_b_wallet;
  const statusLine = resolved
    ? `${formatWalletShort(winner)} won · $${total.toFixed(2)} settled`
    : duel.chain_status === 'INITIALIZED'
      ? `Live · $${total.toFixed(2)} pool`
      : `Forming · $${total.toFixed(2)} pool`;

  const openLink = `${PRODUCTION_WEB_URL}/d/${duel.share_slug || duel.id}`;

  return (
    <TouchableOpacity
      style={[styles.box, compact && styles.boxCompact]}
      onPress={() => onOpen(duel)}
      activeOpacity={0.85}
      accessibilityLabel={`Open duel, ${statusLine}`}
      accessibilityRole="button"
    >
      <View style={styles.topRow}>
        <View style={[styles.dot, resolved && styles.dotSettled]} />
        <Text style={styles.status} numberOfLines={1}>
          {resolved ? 'Resolved' : duel.chain_status === 'INITIALIZED' ? 'Live duel' : 'Forming duel'}
        </Text>
        <Text style={styles.pool}>${total.toFixed(2)}</Text>
      </View>
      <Text style={styles.terms} numberOfLines={2}>
        {duel.proposition_a} vs {duel.proposition_b}
      </Text>
      <View style={styles.splitBar}>
        <View style={[styles.segA, { flex: Math.max(pctA, 5) }]} />
        <View style={[styles.segB, { flex: Math.max(100 - pctA, 5) }]} />
      </View>
      <View style={styles.bottomRow}>
        <Text style={styles.names} numberOfLines={1}>
          {formatUserDisplayName({
            display_name: duel.captain_a_name,
            handle: duel.captain_a_handle,
            wallet: duel.captain_a_wallet,
          })}{' '}
          vs{' '}
          {formatUserDisplayName({
            display_name: duel.captain_b_name,
            handle: duel.captain_b_handle,
            wallet: duel.captain_b_wallet,
          })}
        </Text>
        {resolved && isRealSignature(duel.resolution_tx) ? (
          <Icon name="shield-check" size={14} color={colors.success} />
        ) : (
          <Icon name="chevron-right" size={14} color={colors.textMuted} />
        )}
      </View>
    </TouchableOpacity>
  );
};

export const DUEL_SHARE_LINK = (duel: Duel) =>
  `${PRODUCTION_WEB_URL}/d/${duel.share_slug || duel.id}`;

const styles = StyleSheet.create({
  box: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  boxCompact: {
    padding: spacing.sm,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.warning },
  dotSettled: { backgroundColor: colors.success },
  status: { ...typography.captionBold, color: colors.textSecondary, fontSize: 12, flex: 1 },
  pool: { ...typography.captionBold, color: colors.success, fontSize: 12 },
  terms: { ...typography.bodyBold, color: colors.textPrimary, fontSize: 14, lineHeight: 20, marginBottom: spacing.sm },
  splitBar: {
    flexDirection: 'row', height: 5, borderRadius: 3, overflow: 'hidden',
    backgroundColor: colors.surfaceLight, marginBottom: spacing.sm,
  },
  segA: { backgroundColor: colors.sideA },
  segB: { backgroundColor: colors.sideB },
  bottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  names: { ...typography.caption, color: colors.textMuted, fontSize: 12, flex: 1 },
});
