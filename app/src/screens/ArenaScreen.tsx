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
import { Duel } from '../types';
import { DuelCard } from '../components/DuelCard';
import { BackModal } from '../components/BackModal';
import { colors, spacing } from '../theme';
import { api } from '../api';

interface ArenaScreenProps {
  isArenaEligible: boolean;
  skrStakedAmount: number;
  onSelectDuel: (duel: Duel) => void;
}

export const ArenaScreen: React.FC<ArenaScreenProps> = ({
  isArenaEligible,
  skrStakedAmount,
  onSelectDuel,
}) => {
  const [arenaDuels, setArenaDuels] = useState<Duel[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Backer Modal
  const [backModalVisible, setBackModalVisible] = useState(false);
  const [targetDuel, setTargetDuel] = useState<Duel | null>(null);
  const [targetSide, setTargetSide] = useState<1 | 2>(1);

  const loadArenaDuels = async () => {
    try {
      const duels = await api.getDuels({ isArena: true });
      setArenaDuels(duels);
    } catch (err) {
      console.warn('Failed to load arena duels:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadArenaDuels();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadArenaDuels();
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
      {/* High-Stakes SKR Gate Banner */}
      <View style={styles.gateBanner}>
        <View style={styles.gateHeader}>
          <Text style={styles.gateIcon}>⭐</Text>
          <View style={styles.gateTitleColumn}>
            <Text style={styles.gateTitle}>HIGH-STAKES SKR ARENA</Text>
            <Text style={styles.gateSubtitle}>
              Solana Mobile Staker Gated ($1,000+ Parimutuel Pools)
            </Text>
          </View>
        </View>

        <View style={styles.stakeStatusCard}>
          <View style={styles.stakeStatusRow}>
            <Text style={styles.stakeStatusLabel}>Your Staked SKR:</Text>
            <Text style={styles.stakeStatusValue}>
              {skrStakedAmount.toLocaleString()} SKR
            </Text>
          </View>
          <View style={styles.stakeStatusRow}>
            <Text style={styles.stakeStatusLabel}>Arena Status:</Text>
            <Text
              style={[
                styles.stakeStatusBadge,
                isArenaEligible ? styles.eligibleText : styles.ineligibleText,
              ]}
            >
              {isArenaEligible ? 'QUALIFIED CONTENDER' : 'SPECTATOR (ACTIVE SKR STAKE > 0 REQUIRED)'}
            </Text>
          </View>
        </View>
      </View>

      {/* Arena Duels List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.arenaBadge} />
          <Text style={styles.loadingText}>Fetching Marquee Arena Matchups...</Text>
        </View>
      ) : (
        <FlatList
          data={arenaDuels}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <DuelCard
              duel={item}
              onPress={onSelectDuel}
              onBackSideA={handleBackSideA}
              onBackSideB={handleBackSideB}
            />
          )}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.arenaBadge}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>⚔️</Text>
              <Text style={styles.emptyTitle}>No Active Arena Duels</Text>
              <Text style={styles.emptySubtitle}>
                Verified SKR Stakers can create high-stakes duels from the Feed.
              </Text>
            </View>
          }
        />
      )}

      {/* Backer Modal */}
      <BackModal
        visible={backModalVisible}
        duel={targetDuel}
        side={targetSide}
        onClose={() => setBackModalVisible(false)}
        onStakeRecorded={loadArenaDuels}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  gateBanner: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  gateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: spacing.md,
  },
  gateIcon: {
    fontSize: 24,
  },
  gateTitleColumn: {
    flex: 1,
  },
  gateTitle: {
    color: colors.arenaBadge,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 1,
  },
  gateSubtitle: {
    color: colors.textSecondary,
    fontSize: 11,
  },
  stakeStatusCard: {
    backgroundColor: colors.surfaceLight,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 214, 10, 0.2)',
    gap: 6,
  },
  stakeStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stakeStatusLabel: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  stakeStatusValue: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '800',
  },
  stakeStatusBadge: {
    fontSize: 11,
    fontWeight: '800',
  },
  eligibleText: {
    color: colors.solanaGreen,
  },
  ineligibleText: {
    color: colors.warningYellow,
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
    paddingBottom: 40,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 8,
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  emptySubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
});
