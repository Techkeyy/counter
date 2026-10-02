import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { Challenge, Duel, Portfolio } from '../types';
import { colors, typography, spacing, touchMin } from '../theme';
import { api, isUnreachable } from '../api';
import { SkeletonPostCard } from '../components/SkeletonLoader';
import { EmptyState, ErrorState } from '../components/StateViews';
import { formatUserDisplayName, formatRelativeTime } from '../utils/identity';

type DuelFilter = 'INCOMING' | 'SENT' | 'ACTIVE' | 'CLAIMABLE' | 'COMPLETED';

const FILTERS: { key: DuelFilter; label: string }[] = [
  { key: 'INCOMING', label: 'Incoming' },
  { key: 'SENT', label: 'Sent' },
  { key: 'ACTIVE', label: 'Active' },
  { key: 'CLAIMABLE', label: 'Claimable' },
  { key: 'COMPLETED', label: 'Completed' },
];

interface DuelsScreenProps {
  userWallet: string | null;
  onSelectDuel: (duel: Duel) => void;
  onOpenChallenge: (challenge: Challenge) => void;
  createdChallenge?: Challenge | null;
  focusSignal?: number;
}

// Transaction home: pending challenge decisions first, then active and
// resolved economic state from the existing duel/portfolio authorities.
export const DuelsScreen: React.FC<DuelsScreenProps> = ({ userWallet, onSelectDuel, onOpenChallenge, createdChallenge, focusSignal }) => {
  const [duels, setDuels] = useState<Duel[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [filter, setFilter] = useState<DuelFilter>('INCOMING');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDuels = useCallback(async () => {
    try {
      setError(null);
      const [list, pending, nextPortfolio] = await Promise.all([
        api.getDuels({ isArena: false }),
        userWallet ? api.getChallenges() : Promise.resolve([]),
        userWallet ? api.getPortfolio() : Promise.resolve(null),
      ]);
      setDuels(Array.isArray(list) ? list : []);
      setChallenges(Array.isArray(pending) ? pending : []);
      setPortfolio(nextPortfolio);
    } catch (err: any) {
      if (isUnreachable(err)) setError('NETWORK_UNREACHABLE');
      else setError("Duels couldn't load. Try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userWallet]);

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

  const visibleChallenges = createdChallenge &&
    (createdChallenge.status === 'PROPOSED' || createdChallenge.status === 'COUNTERED') &&
    !challenges.some((c) => c.id === createdChallenge.id)
    ? [createdChallenge, ...challenges]
    : challenges;
  const incoming = visibleChallenges.filter((c) => userWallet === c.creator_wallet);
  const sent = visibleChallenges.filter((c) => userWallet === c.challenger_wallet);
  const resolved = (d: Duel) => d.status.startsWith('RESOLVED') || d.status === 'CANCELLED';
  const claimableIds = new Set(
    (portfolio?.positions || [])
      .filter((position) => position.claim_state === 'CLAIMABLE')
      .map((position) => position.duel_id)
  );
  const completedIds = new Set(
    (portfolio?.positions || [])
      .filter((position) => position.claim_state !== 'OPEN')
      .map((position) => position.duel_id)
  );
  const visible = filter === 'INCOMING'
    ? incoming
    : filter === 'SENT'
      ? sent
      : duels.filter((d) => {
          if (filter === 'ACTIVE') return !resolved(d);
          if (filter === 'CLAIMABLE') return claimableIds.has(d.id);
          return resolved(d) && (completedIds.has(d.id) || d.captain_a_wallet === userWallet || d.captain_b_wallet === userWallet);
        });

  const renderChallengeRow = (challenge: Challenge) => {
    const isIncoming = userWallet === challenge.creator_wallet;
    const otherName = isIncoming
      ? formatUserDisplayName({ display_name: challenge.challenger_name, handle: challenge.challenger_handle, wallet: challenge.challenger_wallet })
      : formatUserDisplayName({ display_name: challenge.creator_name, handle: challenge.creator_handle, wallet: challenge.creator_wallet });
    return (
      <TouchableOpacity
        style={styles.row}
        onPress={() => isIncoming && onOpenChallenge(challenge)}
        activeOpacity={isIncoming ? 0.8 : 1}
        accessibilityLabel={isIncoming ? `${otherName} challenged your Take` : `You challenged ${otherName}, waiting for response`}
        accessibilityRole={isIncoming ? 'button' : undefined}
      >
        <View style={styles.line1}>
          <View style={styles.dot} />
          <Text style={styles.participants} numberOfLines={1}>
            {isIncoming ? `${otherName} challenged your Take` : `You challenged ${otherName}`}
          </Text>
        </View>
        <Text style={styles.terms} numberOfLines={2}>
          {challenge.proposition_a} vs {challenge.proposition_b}
        </Text>
        <View style={styles.line3}>
          <Text style={styles.status}>{isIncoming ? 'Review terms' : 'Waiting for response'}</Text>
          <Text style={styles.time}>{challenge.status.toLowerCase()}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderRow = (duel: Duel) => {
    const poolA = Number(duel.side_a_total) || 0;
    const poolB = Number(duel.side_b_total) || 0;
    const total = poolA + poolB;
    const isResolved = resolved(duel);
    const isClaimable = claimableIds.has(duel.id);
    const ownPosition = (portfolio?.positions || []).find((position) => position.duel_id === duel.id);
    const isCaptain = duel.captain_a_wallet === userWallet || duel.captain_b_wallet === userWallet;
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
          <View style={[styles.dot, isResolved && styles.dotSettled]} />
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
            {duel.status === 'CANCELLED'
              ? 'Refunded'
              : isClaimable
              ? 'Claimable'
              : isResolved
                ? 'Completed'
                : duel.chain_status !== 'INITIALIZED'
                  ? isCaptain ? 'Set up this Duel' : 'Waiting for setup'
                  : isCaptain && !ownPosition
                    ? 'Needs your stake'
                    : poolA === 0 || poolB === 0
                      ? 'Waiting for opponent'
                      : duel.resolution_mode === 'MUTUAL' && Number(duel.resolution_ts || 0) <= Date.now() / 1000
                        ? 'Ready to settle'
                        : 'Live'}
          </Text>
          <Text style={styles.time}>
            {isResolved
              ? formatRelativeTime(duel.created_at)
              : duel.resolution_ts
                ? `Decide ${new Date(duel.resolution_ts * 1000).toLocaleDateString([], { month: 'short', day: 'numeric' })}`
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
      {loading ? (
        <View style={styles.skeleton}>
          <SkeletonPostCard />
          <SkeletonPostCard />
        </View>
      ) : error ? (
        <ErrorState message={error} onRetry={loadDuels} />
      ) : (
        <FlatList<Challenge | Duel>
          data={visible}
          keyExtractor={(d) => d.id}
          renderItem={({ item }) => filter === 'INCOMING' || filter === 'SENT'
            ? renderChallengeRow(item as unknown as Challenge)
            : renderRow(item as Duel)}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadDuels(); }} tintColor={colors.brandPrimary} />
          }
          ListEmptyComponent={
            <EmptyState
              icon="swords"
              title={
                filter === 'INCOMING'
                  ? 'No incoming challenges'
                  : filter === 'SENT'
                    ? 'No sent challenges'
                    : filter === 'ACTIVE'
                      ? 'No active duels'
                      : filter === 'CLAIMABLE'
                        ? 'Nothing claimable yet'
                        : 'No completed duels'
              }
              subtitle={
                filter === 'INCOMING'
                  ? 'Challenges to your Takes will appear here.'
                  : filter === 'SENT'
                    ? 'Challenges you send will stay visible while you wait.'
                    : filter === 'ACTIVE'
                      ? 'Accepted Duels and their funding state appear here.'
                      : filter === 'CLAIMABLE'
                        ? 'Settled winning positions will appear here.'
                        : 'Settled positions and receipts remain available here.'
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
