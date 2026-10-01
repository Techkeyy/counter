import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { Duel } from '../types';
import { ALL_CATEGORIES, CategoryFilter, categoryLabel } from '../topics';
import { colors, typography, spacing, touchMin } from '../theme';
import { api, isUnreachable } from '../api';
import { SkeletonPostCard } from '../components/SkeletonLoader';
import { EmptyState, ErrorState } from '../components/StateViews';
import { formatUserDisplayName, formatRelativeTime } from '../utils/identity';

type DuelFilter = 'OPEN' | 'YOURS' | 'RESOLVED';

const FILTERS: { key: DuelFilter; label: string }[] = [
  { key: 'OPEN', label: 'Open' },
  { key: 'YOURS', label: 'Yours' },
  { key: 'RESOLVED', label: 'Resolved' },
];

const CATEGORIES: CategoryFilter[] = ALL_CATEGORIES;

interface DuelsScreenProps {
  userWallet: string | null;
  onSelectDuel: (duel: Duel) => void;
  focusSignal?: number;
}

// Scan-first financial list: compact rows (participants, proposition, status,
// pool, deadline). Category discovery lives here on the real backend param.
export const DuelsScreen: React.FC<DuelsScreenProps> = ({ userWallet, onSelectDuel, focusSignal }) => {
  const [duels, setDuels] = useState<Duel[]>([]);
  const [filter, setFilter] = useState<DuelFilter>('OPEN');
  const [category, setCategory] = useState<CategoryFilter>('ALL');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDuels = useCallback(async () => {
    try {
      setError(null);
      const list = await api.getDuels({
        isArena: false,
        category: category === 'ALL' ? undefined : category,
      });
      setDuels(Array.isArray(list) ? list : []);
    } catch (err: any) {
      if (isUnreachable(err)) setError('NETWORK_UNREACHABLE');
      else setError("Duels couldn't load. Try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [category]);

  useEffect(() => {
    loadDuels();
  }, [loadDuels]);

  // Tabs stay mounted; reload when regaining focus.
  const lastFocusRef = React.useRef(focusSignal);
  useEffect(() => {
    if (focusSignal !== undefined && focusSignal !== lastFocusRef.current) {
      lastFocusRef.current = focusSignal;
      setRefreshing(true);
      loadDuels();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSignal]);

  const visible = duels.filter((d) => {
    const resolved = d.status.startsWith('RESOLVED') || d.status === 'CANCELLED';
    if (filter === 'OPEN') return !resolved;
    if (filter === 'RESOLVED') return resolved;
    return !!userWallet && (d.captain_a_wallet === userWallet || d.captain_b_wallet === userWallet);
  });

  const renderRow = (duel: Duel) => {
    const poolA = Number(duel.side_a_total) || 0;
    const poolB = Number(duel.side_b_total) || 0;
    const total = poolA + poolB;
    const resolved = duel.status.startsWith('RESOLVED');
    const modeLabel = (duel.resolution_mode || 'COUNTER_VERIFIED') === 'MUTUAL' ? ' · Settle together' : '';
    const nameA = formatUserDisplayName({
      display_name: duel.captain_a_name,
      handle: duel.captain_a_handle,
      wallet: duel.captain_a_wallet,
    });
    const nameB = formatUserDisplayName({
      display_name: duel.captain_b_name,
      handle: duel.captain_b_handle,
      wallet: duel.captain_b_wallet,
    });
    return (
      <TouchableOpacity
        style={styles.row}
        onPress={() => onSelectDuel(duel)}
        activeOpacity={0.8}
        accessibilityLabel={`Duel ${nameA} versus ${nameB}, pool ${total} cUSD`}
        accessibilityRole="button"
      >
        <View style={styles.line1}>
          <View style={[styles.dot, resolved && styles.dotSettled]} />
          <Text style={styles.participants} numberOfLines={1}>
            {nameA} vs {nameB}
          </Text>
          <Text style={styles.pool}>${total.toFixed(0)}</Text>
        </View>
        <Text style={styles.terms} numberOfLines={2}>
          {duel.proposition_a} vs {duel.proposition_b}
        </Text>
        <View style={styles.line3}>
          <Text style={styles.status}>
            {resolved
              ? duel.status.replace(/_/g, ' ').toLowerCase()
              : duel.chain_status === 'INITIALIZED'
                ? 'Live on-chain'
                : 'Forming'}
            {modeLabel}
          </Text>
          <Text style={styles.time}>
            {resolved
              ? formatRelativeTime(duel.created_at)
              : duel.cutoff_ts
                ? `Closes ${new Date(duel.cutoff_ts * 1000).toLocaleDateString([], { month: 'short', day: 'numeric' })}`
                : ''}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.seg, filter === f.key && styles.segActive]}
            onPress={() => setFilter(f.key)}
            activeOpacity={0.8}
            accessibilityLabel={`Show ${f.label} duels`}
            accessibilityRole="tab"
            accessibilityState={{ selected: filter === f.key }}
          >
            <Text style={[styles.segText, filter === f.key && styles.segTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.catRow}>
        {CATEGORIES.map((c) => (
          <TouchableOpacity
            key={c}
            style={[styles.cat, category === c && styles.catActive]}
            onPress={() => setCategory(c)}
            activeOpacity={0.8}
            accessibilityLabel={`Category ${c}`}
            accessibilityState={{ selected: category === c }}
          >
            <Text style={[styles.catText, category === c && styles.catTextActive]}>
              {categoryLabel(c)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {loading ? (
        <View style={styles.skeleton}>
          <SkeletonPostCard />
          <SkeletonPostCard />
        </View>
      ) : error ? (
        <ErrorState message={error} onRetry={loadDuels} />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(d) => d.id}
          renderItem={({ item }) => renderRow(item)}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadDuels(); }} tintColor={colors.brandPrimary} />
          }
          ListEmptyComponent={
            <EmptyState
              icon="swords"
              title={
                filter === 'YOURS'
                  ? 'No duels of yours yet'
                  : filter === 'RESOLVED'
                    ? 'No settled duels yet'
                    : 'No open duels'
              }
              subtitle={
                filter === 'YOURS'
                  ? 'Duels you captain or back appear here.'
                  : 'Challenge a take from Home to start one.'
              }
            />
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.xs,
    backgroundColor: colors.background,
  },
  seg: {
    flex: 1,
    minHeight: touchMin,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: colors.surface,
  },
  segActive: { backgroundColor: colors.surfaceHighlight },
  segText: { ...typography.captionBold, color: colors.textSecondary, fontSize: 13 },
  segTextActive: { color: colors.textPrimary },
  catRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  cat: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: 20,
  },
  catActive: { backgroundColor: colors.surfaceHighlight },
  catText: { ...typography.caption, color: colors.textMuted, fontSize: 12 },
  catTextActive: { color: colors.brandPrimary, fontWeight: '700' },
  separator: { height: 1, backgroundColor: colors.cardBorder, marginLeft: spacing.lg },
  list: { paddingBottom: 96 },
  skeleton: { padding: spacing.lg },
  row: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  line1: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 2 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.warning },
  dotSettled: { backgroundColor: colors.success },
  participants: { ...typography.bodyBold, color: colors.textPrimary, fontSize: 14, flex: 1 },
  pool: { ...typography.bodyBold, color: colors.success, fontSize: 14 },
  terms: { ...typography.body, color: colors.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: 4 },
  line3: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  status: { ...typography.caption, color: colors.textMuted, fontSize: 12 },
  time: { ...typography.caption, color: colors.textMuted, fontSize: 12 },
});
