import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Duel } from '../types';
import { colors, typography, spacing, borderRadius, touchMin } from '../theme';
import { Icon } from './Icon';
import { PRODUCTION_WEB_URL } from '../api';
import { formatUserDisplayName } from '../utils/identity';
import { mapDuelState, stateLabel } from '../utils/duelState';

// Compact duel attachment: a genuine object (duel with escrow state), so it
// earns a container. Used by the feed, take threads, and duels-adjacent rows.
export const DuelAttachment: React.FC<{
  duel: Duel;
  onOpen: (duel: Duel) => void;
  compact?: boolean;
}> = ({ duel, onOpen, compact }) => {
  const resolved = duel.status.startsWith('RESOLVED') || duel.status === 'CANCELLED';
  const state = mapDuelState({ duel, userWallet: null });
  const statusLine = stateLabel(state);

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
        <Text style={styles.status} numberOfLines={1}>{statusLine}</Text>
      </View>
      <Text style={styles.terms} numberOfLines={2}>
        {duel.proposition_a} vs {duel.proposition_b}
      </Text>
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
        <Icon name="chevron-right" size={14} color={colors.textMuted} />
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
  terms: { ...typography.bodyBold, color: colors.textPrimary, fontSize: 14, lineHeight: 20, marginBottom: spacing.sm },
  bottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  names: { ...typography.caption, color: colors.textMuted, fontSize: 12, flex: 1 },
});
