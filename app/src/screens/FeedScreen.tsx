import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { Take, Duel, Receipt, Category } from '../types';
import { colors, typography, spacing, borderRadius, touchMin } from '../theme';
import { api } from '../api';
import { SocialPostCard, FeedItem } from '../components/SocialPostCard';
import { SkeletonPostCard } from '../components/SkeletonLoader';
import { EmptyState, ErrorState } from '../components/StateViews';

// Honest tabs only: chronological latest + open duels. There is no follow
// graph and no ranking backend, so Following / For-You tabs were removed.
type FeedTab = 'LATEST' | 'DUELS';

const CATEGORY_FILTERS: (Category | 'ALL')[] = [
  'ALL',
  'CRYPTO',
  'SPORTS',
  'WEATHER',
  'POLITICS',
  'CULTURE',
];

function categoryLabel(c: Category | 'ALL'): string {
  if (c === 'ALL') return 'All';
  return c.charAt(0) + c.slice(1).toLowerCase();
}

interface FeedScreenProps {
  onSelectTake: (take: Take) => void;
  onSelectDuel: (duel: Duel) => void;
  onSelectReceipt?: (receipt: Receipt) => void;
  onChallengePress?: (take: Take) => void;
  onCreateTakePress?: () => void;
  userWallet?: string | null;
  refreshSignal?: number;
}

export const FeedScreen: React.FC<FeedScreenProps> = ({
  onSelectTake,
  onSelectDuel,
  onSelectReceipt,
  onChallengePress,
  onCreateTakePress,
  refreshSignal,
}) => {
  const [activeTab, setActiveTab] = useState<FeedTab>('LATEST');
  const [selectedCategory, setSelectedCategory] = useState<Category | 'ALL'>('ALL');
  const [takes, setTakes] = useState<Take[]>([]);
  const [duels, setDuels] = useState<Duel[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setError(null);
      const catParam = selectedCategory === 'ALL' ? undefined : selectedCategory;
      const [fetchedTakes, fetchedDuels] = await Promise.all([
        api.getTakes(catParam),
        api.getDuels({ category: catParam }),
      ]);
      setTakes(Array.isArray(fetchedTakes) ? fetchedTakes : []);
      setDuels(Array.isArray(fetchedDuels) ? fetchedDuels : []);
    } catch (err: any) {
      setError(err?.message || "Couldn't load your feed.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedCategory]);

  useEffect(() => {
    if (refreshSignal) {
      setRefreshing(true);
      loadData();
    }
  }, [refreshSignal]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // Unified feed: takes with their duel lifecycle state attached. Settled
  // duels render from duel fields only; receipts always load as backend rows.
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

    if (activeTab === 'DUELS') {
      return items.filter((i) => i.type === 'DUEL');
    }
    return items;
  }, [takes, duels, activeTab]);

  return (
    <View style={styles.container}>
      <View style={styles.tabHeader}>
        {(['LATEST', 'DUELS'] as FeedTab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.primaryTab, activeTab === tab && styles.primaryTabActive]}
            onPress={() => setActiveTab(tab)}
            activeOpacity={0.8}
            accessibilityLabel={tab === 'LATEST' ? 'Latest takes' : 'Open duels'}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === tab }}
          >
            <Text style={[styles.primaryTabText, activeTab === tab && styles.primaryTabTextActive]}>
              {tab === 'LATEST' ? 'Latest' : 'Duels'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.categoryBar}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={CATEGORY_FILTERS}
          keyExtractor={(item) => item}
          contentContainerStyle={styles.categoryList}
          renderItem={({ item }) => {
            const isSelected = selectedCategory === item;
            return (
              <TouchableOpacity
                style={[styles.catChip, isSelected && styles.catChipActive]}
                onPress={() => setSelectedCategory(item)}
                activeOpacity={0.8}
                accessibilityLabel={`Filter by ${categoryLabel(item)}`}
                accessibilityState={{ selected: isSelected }}
              >
                <Text style={[styles.catChipText, isSelected && styles.catChipTextActive]}>
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
              onPressReceipt={(r) => onSelectReceipt && onSelectReceipt(r)}
              onChallengePress={onChallengePress}
            />
          )}
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
              icon={activeTab === 'DUELS' ? 'swords' : 'message-circle'}
              title={activeTab === 'DUELS' ? 'No open duels right now' : 'No takes yet'}
              subtitle={
                activeTab === 'DUELS'
                  ? 'Open 1v1 duels appear here as soon as takes get challenged.'
                  : 'Be the first to post a take worth arguing about.'
              }
              actionLabel={activeTab === 'DUELS' ? undefined : 'Post your take'}
              onAction={activeTab === 'DUELS' ? undefined : onCreateTakePress}
            />
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  tabHeader: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  primaryTab: {
    flex: 1,
    minHeight: touchMin,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  primaryTabActive: {
    borderBottomColor: colors.brandPrimary,
  },
  primaryTabText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  primaryTabTextActive: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  categoryBar: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    paddingVertical: spacing.sm,
  },
  categoryList: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  catChip: {
    minHeight: touchMin,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  catChipActive: {
    backgroundColor: colors.surfaceHighlight,
    borderColor: colors.brandPrimary,
  },
  catChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  catChipTextActive: {
    color: colors.brandPrimary,
    fontWeight: '700',
  },
  listContent: {
    padding: spacing.lg,
    paddingBottom: 96,
  },
  skeletonContainer: {
    padding: spacing.lg,
  },
});
