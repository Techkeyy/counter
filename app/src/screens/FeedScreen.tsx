import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { Take, Duel } from '../types';
import { ALL_CATEGORIES, CategoryFilter, categoryLabel } from '../topics';
import { colors, typography, spacing } from '../theme';
import { api, isUnreachable } from '../api';
import { SocialPostCard, FeedItem } from '../components/SocialPostCard';
import { SkeletonPostCard } from '../components/SkeletonLoader';
import { EmptyState, ErrorState } from '../components/StateViews';

interface FeedScreenProps {
  onSelectTake: (take: Take) => void;
  onSelectDuel: (duel: Duel) => void;
  onChallengePress?: (take: Take) => void;
  onCreateTakePress?: () => void;
  userWallet?: string | null;
  refreshSignal?: number;
}

// One timeline, chronological, no tabs, no category strip. Category discovery
// lives in Duels; Following does not exist as backend semantics.
export const FeedScreen: React.FC<FeedScreenProps> = ({
  onSelectTake,
  onSelectDuel,
  onChallengePress,
  onCreateTakePress,
  refreshSignal,
}) => {
  const [takes, setTakes] = useState<Take[]>([]);
  const [duels, setDuels] = useState<Duel[]>([]);
  const [category, setCategory] = useState<CategoryFilter>('ALL');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const [fetchedTakes, fetchedDuels] = await Promise.all([
        api.getTakes(category === 'ALL' ? undefined : category),
        api.getDuels(category === 'ALL' ? {} : { category }),
      ]);
      setTakes(Array.isArray(fetchedTakes) ? fetchedTakes : []);
      setDuels(Array.isArray(fetchedDuels) ? fetchedDuels : []);
    } catch (err: any) {
      if (isUnreachable(err)) setError('NETWORK_UNREACHABLE');
      else setError("The timeline couldn't load. Try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [category]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (refreshSignal) {
      setRefreshing(true);
      loadData();
    }
  }, [refreshSignal, loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const feedItems = useMemo<FeedItem[]>(() => {
    const duelByTakeId = new Map<string, Duel>();
    const duelList = Array.isArray(duels) ? duels : [];
    const takeList = Array.isArray(takes) ? takes : [];
    duelList.forEach((d) => {
      if (d.take_id) duelByTakeId.set(d.take_id, d);
    });

    const items: FeedItem[] = [];
    takeList.forEach((t) => {
      const duel = duelByTakeId.get(t.id);
      if (!duel) {
        items.push({ id: `take_${t.id}`, type: 'TAKE', take: t });
      } else if (duel.status.startsWith('RESOLVED')) {
        items.push({ id: `settled_${duel.id}`, type: 'SETTLED', take: t, duel });
      } else {
        items.push({ id: `duel_${duel.id}`, type: 'DUEL', take: t, duel });
      }
    });
    duelList.forEach((d) => {
      if (d.take_id && takeList.some((t) => t.id === d.take_id)) return;
      const fallbackTake: Take = {
        id: `take_from_duel_${d.id}`,
        author_wallet: d.captain_a_wallet,
        author_name: d.captain_a_name,
        author_handle: d.captain_a_handle,
        author_avatar: d.captain_a_avatar,
        topic: d.proposition_a,
        content: `${d.proposition_a} vs ${d.proposition_b}`,
        category: d.category,
        created_at: d.created_at,
        status: 'ACTIVE',
        likes_count: 0,
        comments_count: 0,
        duels_count: 1,
      };
      if (d.status.startsWith('RESOLVED')) {
        items.push({ id: `settled_${d.id}`, type: 'SETTLED', take: fallbackTake, duel: d });
      } else {
        items.push({ id: `duel_${d.id}`, type: 'DUEL', take: fallbackTake, duel: d });
      }
    });
    return items;
  }, [takes, duels]);

  return (
    <View style={styles.container}>
      <View style={styles.chipStrip}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={CATEGORIES}
          keyExtractor={(item) => item}
          contentContainerStyle={styles.chipList}
          renderItem={({ item }) => {
            const selected = category === item;
            return (
              <TouchableOpacity
                style={[styles.chip, selected && styles.chipActive]}
                onPress={() => setCategory(item)}
                activeOpacity={0.8}
                accessibilityLabel={`Filter timeline by ${item === 'ALL' ? 'all categories' : item.toLowerCase()}`}
                accessibilityState={{ selected }}
              >
                <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                  {categoryLabel(item)}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>
      {loading ? (
        <View style={styles.skeletonContainer}>
          <SkeletonPostCard />
          <SkeletonPostCard />
          <SkeletonPostCard />
        </View>
      ) : error ? (
        <ErrorState message={error} onRetry={loadData} />
      ) : (
        <FlatList
          data={feedItems}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <SocialPostCard
              item={item}
              onPressTake={onSelectTake}
              onPressDuel={onSelectDuel}
              onChallengePress={onChallengePress}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.brandPrimary}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="message-circle"
              title="No takes yet"
              subtitle="Start the conversation with the first take worth arguing about."
              actionLabel="Post your take"
              onAction={onCreateTakePress}
            />
          }
        />
      )}
    </View>
  );
};

const CATEGORIES: CategoryFilter[] = ALL_CATEGORIES;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  chipStrip: {
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    paddingVertical: spacing.xs,
  },
  chipList: {
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
  },
  chip: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: 20,
  },
  chipActive: {
    backgroundColor: colors.surfaceHighlight,
  },
  chipText: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  chipTextActive: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  separator: {
    height: 1,
    backgroundColor: colors.cardBorder,
    marginLeft: 68,
  },
  listContent: {
    paddingBottom: 96,
  },
  skeletonContainer: {
    padding: spacing.lg,
  },
});
