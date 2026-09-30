import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { Duel } from '../types';
import { colors, typography, spacing, borderRadius, touchMin } from '../theme';
import { api } from '../api';
import { Icon } from '../components/Icon';
import { SkeletonPostCard } from '../components/SkeletonLoader';
import { EmptyState, ErrorState } from '../components/StateViews';
import { formatUserDisplayName } from '../utils/identity';

type DuelFilter = 'ALL' | 'OPEN' | 'SETTLED' | 'ARENA';

const FILTERS: { key: DuelFilter; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'OPEN', label: 'Open' },
  { key: 'SETTLED', label: 'Settled' },
  { key: 'ARENA', label: 'Arena' },
];

interface DuelsScreenProps {
  userWallet: string | null;
  onSelectDuel: (duel: Duel) => void;
}

export const DuelsScreen: React.FC<DuelsScreenProps> = ({ onSelectDuel }) => {
  const [duels, setDuels] = useState<Duel[]>([]);
  const [filter, setFilter] = useState<DuelFilter>('ALL');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDuels = async () => {
    try {
      setError(null);
      const list = await api.getDuels(filter === 'ARENA' ? { isArena: true } : {});
      setDuels(Array.isArray(list) ? list : []);
    } catch (err: any) {
      setError(err?.message || "Couldn't load duels.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadDuels();
  }, [filter]);

  const visible = duels.filter((d) => {
    if (filter === 'OPEN') return !d.status.startsWith('RESOLVED') && d.status !== 'CANCELLED';
    if (filter === 'SETTLED') return d.status.startsWith('RESOLVED');
    return true;
  });

  const renderDuelRow = (duel: Duel) => {
    const poolA = Number(duel.side_a_total) || 0;
    const poolB = Number(duel.side_b_total) || 0;
    const total = poolA + poolB;
    const pctA = total > 0 ? Math.round((poolA / total) * 100) : 50;
    const resolved = duel.status.startsWith('RESOLVED');
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
        accessibilityLabel={`Open duel ${duel.proposition_a} versus ${duel.proposition_b}`}
      >
        <View style={styles.rowTop}>
          <View style={[styles.statusDot, resolved && styles.statusDotSettled]} />
          <Text style={styles.matchup} numberOfLines={2}>
            {nameA} vs {nameB}
          </Text>
        </View>
        <Text style={styles.terms} numberOfLines={2}>
          {duel.proposition_a} vs {duel.proposition_b}
        </Text>
        <View style={styles.splitBar}>
          <View style={[styles.segA, { flex: Math.max(pctA, 5) }]} />
          <View style={[styles.segB, { flex: Math.max(100 - pctA, 5) }]} />
        </View>
        <View style={styles.rowBottom}>
          <Text style={styles.poolText}>${total.toFixed(2)} cUSD pool</Text>
          <Text style={styles.statusText}>
            {resolved ? duel.status.replace(/_/g, ' ') : duel.chain_status === 'INITIALIZED' ? 'On-chain live' : 'Forming'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Duels</Text>
        <Text style={styles.subtitle}>Funded 1v1 disputes settling on Solana</Text>
      </View>
      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.chip, filter === f.key && styles.chipActive]}
            onPress={() => setFilter(f.key)}
            activeOpacity={0.8}
            accessibilityLabel={`Show ${f.label} duels`}
            accessibilityState={{ selected: filter === f.key }}
          >
            <Text style={[styles.chipText, filter === f.key && styles.chipTextActive]}>
              {f.label}
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
          renderItem={({ item }) => renderDuelRow(item)}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadDuels(); }} tintColor={colors.brandPrimary} />
          }
          ListEmptyComponent={
            <EmptyState
              icon="swords"
              title={filter === 'SETTLED' ? 'No settled duels yet' : filter === 'ARENA' ? 'No arena duels yet' : 'No duels yet'}
              subtitle={
                filter === 'ARENA'
                  ? 'High-stakes duels published by verified stakers appear here.'
                  : 'Challenge a take from Home to start the first 1v1 duel.'
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
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  title: { ...typography.h2, color: colors.textPrimary },
  subtitle: { ...typography.bodyMuted, color: colors.textSecondary, marginTop: 2 },
  filterRow: { flexDirection: 'row', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: spacing.sm },
  chip: {
    minHeight: touchMin,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  chipActive: { borderColor: colors.brandPrimary, backgroundColor: colors.surfaceHighlight },
  chipText: { ...typography.captionBold, color: colors.textSecondary, fontSize: 13 },
  chipTextActive: { color: colors.brandPrimary },
  skeleton: { padding: spacing.lg },
  list: { padding: spacing.lg, paddingBottom: 96 },
  row: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.warning },
  statusDotSettled: { backgroundColor: colors.success },
  matchup: { ...typography.bodyBold, color: colors.textPrimary, flex: 1 },
  terms: { ...typography.bodyMuted, color: colors.textSecondary, marginBottom: spacing.md },
  splitBar: { flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: colors.surfaceLight, marginBottom: spacing.sm },
  segA: { backgroundColor: colors.sideA },
  segB: { backgroundColor: colors.sideB },
  rowBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  poolText: { ...typography.captionBold, color: colors.success },
  statusText: { ...typography.caption, color: colors.textMuted },
});
