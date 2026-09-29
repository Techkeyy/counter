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
import { colors, typography, spacing, borderRadius } from '../theme';
import { api } from '../api';
import { SocialPostCard, FeedItem } from '../components/SocialPostCard';
import { SkeletonPostCard } from '../components/SkeletonLoader';
import { EmptyState, ErrorState } from '../components/StateViews';
import { Icon } from '../components/Icon';

type FeedTab = 'FOR_YOU' | 'FOLLOWING' | 'LIVE';

const CATEGORY_FILTERS: (Category | 'ALL')[] = [
  'ALL',
  'CRYPTO',
  'SPORTS',
  'WEATHER',
  'CULTURE',
];

interface FeedScreenProps {
  onSelectTake: (take: Take) => void;
  onSelectDuel: (duel: Duel) => void;
  onSelectReceipt?: (receipt: Receipt) => void;
  onChallengePress?: (take: Take) => void;
  onCreateTakePress?: () => void;
  userWallet?: string | null;
}

export const FeedScreen: React.FC<FeedScreenProps> = ({
  onSelectTake,
  onSelectDuel,
  onSelectReceipt,
  onChallengePress,
  onCreateTakePress,
  userWallet,
}) => {
  const [activeTab, setActiveTab] = useState<FeedTab>('FOR_YOU');
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
      console.warn('Failed to load feed data:', err);
      setError("Couldn't load your feed.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedCategory]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // Build unified social feed items based on lifecycle forms (TAKE -> DUEL -> RECEIPT)
  const feedItems = useMemo<FeedItem[]>(() => {
    const duelByTakeId = new Map<string, Duel>();
    const duelList = Array.isArray(duels) ? duels : [];
    const takeList = Array.isArray(takes) ? takes : [];

    duelList.forEach((d) => {
      if (d.take_id) {
        duelByTakeId.set(d.take_id, d);
      }
    });

    const items: FeedItem[] = [];

    // 1. Process Takes
    takeList.forEach((t) => {
      const associatedDuel = duelByTakeId.get(t.id);

      if (associatedDuel) {
        if (associatedDuel.status.startsWith('RESOLVED')) {
          // Lifecycle 3: RECEIPT
          items.push({
            id: `receipt_${associatedDuel.id}`,
            type: 'RECEIPT',
            take: t,
            duel: associatedDuel,
            receipt: {
              id: `receipt_${associatedDuel.id}`,
              duel_id: associatedDuel.id,
              take_id: t.id,
              captain_a_wallet: associatedDuel.captain_a_wallet,
              captain_b_wallet: associatedDuel.captain_b_wallet,
              winner_wallet: associatedDuel.winning_side === 1 ? associatedDuel.captain_a_wallet : associatedDuel.captain_b_wallet,
              total_pool: (Number(associatedDuel.side_a_total) || 0) + (Number(associatedDuel.side_b_total) || 0),
              resolution_summary: associatedDuel.resolution_data || `${associatedDuel.proposition_a} settled authoritatively.`,
              resolution_evidence: associatedDuel.resolution_tx || '',
              onchain_signature: associatedDuel.resolution_tx || '',
              created_at: associatedDuel.created_at,
            },
          });
        } else {
          // Lifecycle 2: LIVE DUEL
          items.push({
            id: `duel_${associatedDuel.id}`,
            type: 'DUEL',
            take: t,
            duel: associatedDuel,
          });
        }
      } else {
        // Lifecycle 1: PURE TAKE
        items.push({
          id: `take_${t.id}`,
          type: 'TAKE',
          take: t,
        });
      }
    });

    // 2. Include any Duels that had no corresponding Take record
    duelList.forEach((d) => {
      if (!d.take_id || !takeList.some((t) => t.id === d.take_id)) {
        const syntheticTake: Take = {
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
          items.push({
            id: `receipt_${d.id}`,
            type: 'RECEIPT',
            take: syntheticTake,
            duel: d,
            receipt: {
              id: `receipt_${d.id}`,
              duel_id: d.id,
              captain_a_wallet: d.captain_a_wallet,
              captain_b_wallet: d.captain_b_wallet,
              winner_wallet: d.winning_side === 1 ? d.captain_a_wallet : d.captain_b_wallet,
              total_pool: (Number(d.side_a_total) || 0) + (Number(d.side_b_total) || 0),
              resolution_summary: d.resolution_data || `${d.proposition_a} resolved.`,
              resolution_evidence: d.resolution_tx || '',
              onchain_signature: d.resolution_tx || '',
              created_at: d.created_at,
            },
          });
        } else {
          items.push({
            id: `duel_${d.id}`,
            type: 'DUEL',
            take: syntheticTake,
            duel: d,
          });
        }
      }
    });

    // Filter by Active Primary Tab
    if (activeTab === 'LIVE') {
      return items.filter((i) => i.type === 'DUEL');
    }
    if (activeTab === 'FOLLOWING') {
      // Social following tab: filter takes that have replies or user interactions
      return items.filter((i) => (i.take.comments_count || 0) > 0 || i.type === 'DUEL');
    }

    return items;
  }, [takes, duels, activeTab]);

  return (
    <View style={styles.container}>
      {/* Primary Social Feed Tabs (For You | Following | Live) */}
      <View style={styles.tabHeader}>
        <TouchableOpacity
          style={[styles.primaryTab, activeTab === 'FOR_YOU' && styles.primaryTabActive]}
          onPress={() => setActiveTab('FOR_YOU')}
          activeOpacity={0.8}
        >
          <Text style={[styles.primaryTabText, activeTab === 'FOR_YOU' && styles.primaryTabTextActive]}>
            For You
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.primaryTab, activeTab === 'FOLLOWING' && styles.primaryTabActive]}
          onPress={() => setActiveTab('FOLLOWING')}
          activeOpacity={0.8}
        >
          <Text style={[styles.primaryTabText, activeTab === 'FOLLOWING' && styles.primaryTabTextActive]}>
            Following
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.primaryTab, activeTab === 'LIVE' && styles.primaryTabActive]}
          onPress={() => setActiveTab('LIVE')}
          activeOpacity={0.8}
        >
          <View style={styles.liveTabRow}>
            <View style={styles.liveDot} />
            <Text style={[styles.primaryTabText, activeTab === 'LIVE' && styles.primaryTabTextActive]}>
              Live
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Secondary Category Filters */}
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
              >
                <Text style={[styles.catChipText, isSelected && styles.catChipTextActive]}>
                  {item === 'ALL' ? 'All' : item.charAt(0) + item.slice(1).toLowerCase()}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* Main Content List */}
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
              icon={activeTab === 'LIVE' ? 'swords' : 'message-circle'}
              title={activeTab === 'LIVE' ? 'No live duels right now' : 'No takes yet'}
              subtitle={
                activeTab === 'LIVE'
                  ? 'Challenge a take from the feed to start a 1v1 duel.'
                  : 'Be the first to share an argument on Counter.'
              }
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
    paddingVertical: 13,
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
  liveTabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.brandPrimary,
  },
  categoryBar: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    paddingVertical: 8,
  },
  categoryList: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  catChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
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
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  catChipTextActive: {
    color: colors.brandPrimary,
    fontWeight: '700',
  },
  listContent: {
    padding: spacing.lg,
    paddingBottom: 80,
  },
  skeletonContainer: {
    padding: spacing.lg,
  },
});
