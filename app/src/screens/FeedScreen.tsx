import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Take, Duel, Category } from '../types';
import { TakeCard } from '../components/TakeCard';
import { DuelCard } from '../components/DuelCard';
import { ChallengeModal } from '../components/ChallengeModal';
import { BackModal } from '../components/BackModal';
import { colors, spacing } from '../theme';
import { api } from '../api';

interface FeedScreenProps {
  onSelectTake: (take: Take) => void;
  onSelectDuel: (duel: Duel) => void;
  onCreateTakePress: () => void;
}

const CATEGORIES: ('ALL' | Category)[] = ['ALL', 'CRYPTO', 'SPORTS', 'WEATHER'];

export const FeedScreen: React.FC<FeedScreenProps> = ({
  onSelectTake,
  onSelectDuel,
  onCreateTakePress,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<'ALL' | Category>('ALL');
  const [takes, setTakes] = useState<Take[]>([]);
  const [duels, setDuels] = useState<Duel[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Modals
  const [challengeModalVisible, setChallengeModalVisible] = useState(false);
  const [targetTake, setTargetTake] = useState<Take | null>(null);

  const [backModalVisible, setBackModalVisible] = useState(false);
  const [targetDuel, setTargetDuel] = useState<Duel | null>(null);
  const [targetSide, setTargetSide] = useState<1 | 2>(1);

  const loadData = async () => {
    try {
      const catParam = selectedCategory === 'ALL' ? undefined : selectedCategory;
      const [fetchedTakes, fetchedDuels] = await Promise.all([
        api.getTakes(catParam),
        api.getDuels({ category: catParam }),
      ]);
      setTakes(fetchedTakes);
      setDuels(fetchedDuels);
    } catch (err) {
      console.warn('Failed to load feed data:', err);
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

  const handleChallenge = (take: Take) => {
    setTargetTake(take);
    setChallengeModalVisible(true);
  };

  const handleBackSideA = (duel: Duel) => {
    setTargetDuel(duel);
    setTargetSide(1);
    setBackModalVisible(true);
  };

  const handleBackSideB = (duel: Duel) => {
    setTargetDuel(duel);
    setTargetSide(2);
    setBackModalVisible(true);
  };

  return (
    <View style={styles.container}>
      {/* Category Tabs */}
      <View style={styles.categoryRow}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={CATEGORIES}
          keyExtractor={(item) => item}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.catPill,
                selectedCategory === item && styles.catPillActive,
              ]}
              onPress={() => setSelectedCategory(item)}
            >
              <Text
                style={[
                  styles.catText,
                  selectedCategory === item && styles.catTextActive,
                ]}
              >
                {item}
              </Text>
            </TouchableOpacity>
          )}
          contentContainerStyle={styles.catList}
        />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.solanaPurple} />
          <Text style={styles.loadingText}>Loading Live Feed & Duels...</Text>
        </View>
      ) : (
        <FlatList
          data={[
            { type: 'DUELS_HEADER' },
            ...duels.map((d) => ({ type: 'DUEL', data: d })),
            { type: 'TAKES_HEADER' },
            ...takes.map((t) => ({ type: 'TAKE', data: t })),
          ]}
          keyExtractor={(item, index) => `${item.type}_${index}`}
          renderItem={({ item }: any) => {
            if (item.type === 'DUELS_HEADER') {
              return duels.length > 0 ? (
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>🔥 LIVE 1V1 DUELS & BACKER POOLS</Text>
                </View>
              ) : null;
            }
            if (item.type === 'DUEL') {
              return (
                <DuelCard
                  duel={item.data}
                  onPress={onSelectDuel}
                  onBackSideA={handleBackSideA}
                  onBackSideB={handleBackSideB}
                />
              );
            }
            if (item.type === 'TAKES_HEADER') {
              return (
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>💬 CONTROVERSIAL TAKES (CHALLENGEABLE)</Text>
                </View>
              );
            }
            if (item.type === 'TAKE') {
              return (
                <TakeCard
                  take={item.data}
                  onPress={onSelectTake}
                  onChallenge={handleChallenge}
                />
              );
            }
            return null;
          }}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.solanaPurple}
            />
          }
        />
      )}

      {/* Floating Action Button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={onCreateTakePress}
        activeOpacity={0.8}
      >
        <Text style={styles.fabText}>+ POST TAKE</Text>
      </TouchableOpacity>

      {/* Modals */}
      <ChallengeModal
        visible={challengeModalVisible}
        take={targetTake}
        onClose={() => setChallengeModalVisible(false)}
        onChallengeCreated={loadData}
      />

      <BackModal
        visible={backModalVisible}
        duel={targetDuel}
        side={targetSide}
        onClose={() => setBackModalVisible(false)}
        onStakeRecorded={loadData}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  categoryRow: {
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  catList: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  catPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  catPillActive: {
    backgroundColor: 'rgba(153, 69, 255, 0.25)',
    borderColor: colors.solanaPurple,
  },
  catText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  catTextActive: {
    color: colors.solanaPurple,
    fontWeight: '900',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  listContent: {
    padding: spacing.md,
    paddingBottom: 80,
  },
  sectionHeader: {
    marginVertical: spacing.md,
  },
  sectionTitle: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    backgroundColor: colors.solanaGreen,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    shadowColor: colors.solanaGreen,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  fabText: {
    color: '#000',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
});
