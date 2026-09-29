import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Image,
} from 'react-native';
import { Duel } from '../types';
import { BackModal } from '../components/BackModal';
import { colors, typography, spacing, borderRadius } from '../theme';
import { api } from '../api';
import { Icon } from '../components/Icon';
import { SkeletonPostCard } from '../components/SkeletonLoader';
import { EmptyState, ErrorState } from '../components/StateViews';
import { formatUserDisplayName, getAvatarUri } from '../utils/identity';

interface ArenaScreenProps {
  isArenaEligible: boolean;
  skrStakedAmount: number;
  userWallet: string | null;
  onSelectDuel: (duel: Duel) => void;
}

export const ArenaScreen: React.FC<ArenaScreenProps> = ({
  isArenaEligible,
  skrStakedAmount,
  userWallet,
  onSelectDuel,
}) => {
  const [arenaDuels, setArenaDuels] = useState<Duel[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Backer Modal
  const [backModalVisible, setBackModalVisible] = useState(false);
  const [targetDuel, setTargetDuel] = useState<Duel | null>(null);
  const [targetSide, setTargetSide] = useState<1 | 2>(1);

  const loadArenaDuels = async () => {
    try {
      setError(null);
      const duels = await api.getDuels({ isArena: true });
      setArenaDuels(Array.isArray(duels) ? duels : []);
    } catch (err: any) {
      console.warn('Failed to load arena duels:', err);
      setError("Couldn't load Arena duels.");
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

  const handleBackSide = (duel: Duel, side: 1 | 2) => {
    setTargetDuel(duel);
    setTargetSide(side);
    setBackModalVisible(true);
  };

  // Eligibility rule: active staked SKR > 0
  const isEligible = isArenaEligible || skrStakedAmount > 0;

  return (
    <View style={styles.container}>
      {/* Contextual Arena Header */}
      <View style={styles.arenaHeader}>
        <View style={styles.headerTitleRow}>
          <Icon name="trophy" size={20} color={colors.arenaBadge} />
          <Text style={styles.headerTitle}>ARENA</Text>
        </View>

        <Text style={styles.headerSubtitle}>
          Public Duel discovery for verified Solana Mobile stakers.
        </Text>

        {/* Contextual Eligibility Banner */}
        <View style={styles.eligibilityCard}>
          <View style={styles.eligibilityRow}>
            <View style={styles.eligibilityLeft}>
              <Icon
                name={isEligible ? 'shield-check' : 'clock'}
                size={16}
                color={isEligible ? colors.brandPrimary : colors.textMuted}
              />
              <Text style={styles.eligibilityText}>
                {isEligible
                  ? 'Your staked SKR unlocks Arena publishing.'
                  : 'Stake SKR to publish Duels publicly in Arena.'}
              </Text>
            </View>
            <Text style={styles.skrAmountBadge}>{skrStakedAmount} SKR</Text>
          </View>

          <Text style={styles.networkNote}>
            SKR verification runs on Solana Mainnet · Duel stakes settle in Devnet cUSD
          </Text>
        </View>
      </View>

      {/* Arena Duels List */}
      {loading ? (
        <View style={styles.skeletonContainer}>
          <SkeletonPostCard />
          <SkeletonPostCard />
        </View>
      ) : error ? (
        <ErrorState message={error} onRetry={loadArenaDuels} />
      ) : (
        <FlatList
          data={arenaDuels}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.arenaBadge}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="trophy"
              title="No Active Arena Duels"
              subtitle="Verified SKR stakers can promote high-stakes duels into the Arena."
            />
          }
          renderItem={({ item }) => {
            const poolA = Number(item.side_a_total) || 0;
            const poolB = Number(item.side_b_total) || 0;
            const total = poolA + poolB;
            const percentA = total > 0 ? Math.round((poolA / total) * 100) : 50;
            const percentB = 100 - percentA;

            const nameA = formatUserDisplayName({
              name: item.captain_a_name,
              handle: item.captain_a_handle,
              wallet: item.captain_a_wallet,
            });
            const nameB = formatUserDisplayName({
              name: item.captain_b_name,
              handle: item.captain_b_handle,
              wallet: item.captain_b_wallet,
            });

            return (
              <TouchableOpacity
                style={styles.arenaCard}
                onPress={() => onSelectDuel(item)}
                activeOpacity={0.88}
              >
                <View style={styles.cardTopRow}>
                  <View style={styles.arenaTag}>
                    <Icon name="trophy" size={11} color={colors.arenaBadge} />
                    <Text style={styles.arenaTagText}>ARENA DUEL</Text>
                  </View>
                  <Text style={styles.totalPoolText}>${total} cUSD Pool</Text>
                </View>

                {/* Combatants */}
                <View style={styles.combatantsRow}>
                  <View style={styles.combatantSide}>
                    <Image
                      source={{ uri: getAvatarUri(item.captain_a_avatar, item.captain_a_wallet) }}
                      style={[styles.miniAvatar, { borderColor: colors.sideA }]}
                    />
                    <Text style={styles.combatantName} numberOfLines={1}>{nameA}</Text>
                    <Text style={[styles.splitText, { color: colors.sideA }]}>{percentA}% backing</Text>
                  </View>

                  <View style={styles.vsBadge}>
                    <Text style={styles.vsText}>VS</Text>
                  </View>

                  <View style={styles.combatantSide}>
                    <Image
                      source={{ uri: getAvatarUri(item.captain_b_avatar, item.captain_b_wallet) }}
                      style={[styles.miniAvatar, { borderColor: colors.sideB }]}
                    />
                    <Text style={styles.combatantName} numberOfLines={1}>{nameB}</Text>
                    <Text style={[styles.splitText, { color: colors.sideB }]}>{percentB}% backing</Text>
                  </View>
                </View>

                {/* Claim Statement */}
                <Text style={styles.claimText} numberOfLines={2}>"{item.proposition_a}"</Text>

                {/* Backing Bar */}
                <View style={styles.splitBar}>
                  <View style={[styles.barA, { flex: percentA }]} />
                  <View style={[styles.barB, { flex: percentB }]} />
                </View>

                {/* Back Actions */}
                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.actionBtnA]}
                    onPress={() => handleBackSide(item, 1)}
                    activeOpacity={0.8}
                    accessibilityLabel={`Back ${nameA}`}
                  >
                    <Text style={styles.actionBtnTextA}>Back {nameA}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionBtn, styles.actionBtnB]}
                    onPress={() => handleBackSide(item, 2)}
                    activeOpacity={0.8}
                    accessibilityLabel={`Back ${nameB}`}
                  >
                    <Text style={styles.actionBtnTextB}>Back {nameB}</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Back Modal */}
      <BackModal
        visible={backModalVisible}
        duel={targetDuel}
        side={targetSide}
        userWallet={userWallet}
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
  arenaHeader: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.textPrimary,
    letterSpacing: 1,
  },
  headerSubtitle: {
    ...typography.bodyMuted,
    fontSize: 13,
    marginBottom: spacing.md,
  },
  eligibilityCard: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  eligibilityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  eligibilityLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    marginRight: spacing.sm,
  },
  eligibilityText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  skrAmountBadge: {
    ...typography.captionBold,
    color: colors.arenaBadge,
    backgroundColor: colors.badgeBg,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: borderRadius.xs,
  },
  networkNote: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 10,
    marginTop: 2,
  },
  listContent: {
    padding: spacing.lg,
    paddingBottom: 80,
  },
  skeletonContainer: {
    padding: spacing.lg,
  },
  arenaCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  arenaTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.badgeBg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borderRadius.xs,
    borderWidth: 1,
    borderColor: colors.badgeBorder,
  },
  arenaTagText: {
    fontSize: 10,
    fontWeight: '900',
    color: colors.arenaBadge,
    letterSpacing: 0.5,
  },
  totalPoolText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  combatantsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  combatantSide: {
    flex: 1,
    alignItems: 'center',
  },
  miniAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    marginBottom: 2,
    backgroundColor: colors.surfaceLight,
  },
  combatantName: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  splitText: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },
  vsBadge: {
    paddingHorizontal: spacing.sm,
  },
  vsText: {
    fontSize: 10,
    fontWeight: '900',
    color: colors.textMuted,
  },
  claimText: {
    ...typography.body,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginVertical: spacing.sm,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  splitBar: {
    height: 5,
    borderRadius: 2.5,
    flexDirection: 'row',
    overflow: 'hidden',
    backgroundColor: colors.surfaceLight,
    marginBottom: spacing.md,
  },
  barA: {
    backgroundColor: colors.sideA,
  },
  barB: {
    backgroundColor: colors.sideB,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    borderWidth: 1,
  },
  actionBtnA: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderColor: colors.sideA,
  },
  actionBtnB: {
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderColor: colors.sideB,
  },
  actionBtnTextA: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.sideA,
  },
  actionBtnTextB: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.sideB,
  },
});
