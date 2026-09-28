import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { User, Rivalry, Receipt } from '../types';
import { ReceiptCard } from '../components/ReceiptCard';
import { colors, spacing } from '../theme';
import { api } from '../api';

interface ProfileScreenProps {
  wallet: string | null;
  onDisconnect: () => void;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
  wallet,
  onDisconnect,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);

  const loadProfile = async () => {
    if (!wallet) return;
    try {
      const profile = await api.getUserProfile(wallet);
      setUser(profile);
      setStats(profile.stats);
      const userReceipts = await api.getUserReceipts(wallet);
      setReceipts(userReceipts);
    } catch (err) {
      console.warn('Failed to load profile:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, [wallet]);

  if (!wallet) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>👛</Text>
        <Text style={styles.emptyTitle}>Wallet Not Connected</Text>
        <Text style={styles.emptySubtitle}>
          Connect via Solana Mobile Wallet Adapter to access your Contender Profile & Arena Status.
        </Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.solanaPurple} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Profile Header */}
      <View style={styles.profileCard}>
        <Image
          source={{ uri: user?.avatar_url || `https://avatar.vercel.sh/${wallet}` }}
          style={styles.avatar}
        />
        <Text style={styles.displayName}>{user?.display_name || 'Solana Contender'}</Text>
        <Text style={styles.handle}>@{user?.handle || wallet.slice(0, 8)}</Text>
        <Text style={styles.bio}>{user?.bio || 'DeFi Trader & Solana Mobile Contender'}</Text>

        <View style={styles.walletBadge}>
          <Text style={styles.walletText}>{wallet.slice(0, 8)}...{wallet.slice(-8)}</Text>
        </View>

        {/* SKR Staking Card */}
        <View style={styles.skrCard}>
          <View style={styles.skrRow}>
            <Text style={styles.skrTitle}>🛡️ Solana Mobile SKR Staked</Text>
            <Text style={styles.skrAmount}>
              {(user?.skr_staked_amount || 0).toLocaleString()} SKR
            </Text>
          </View>
          <Text style={styles.skrStatus}>
            {user?.is_arena_eligible === 1
              ? '✓ ARENA QUALIFIED CONTENDER (ACTIVE SKR STAKE > 0)'
              : 'SPECTATOR MODE (NO ACTIVE SKR STAKE)'}
          </Text>
        </View>
      </View>

      {/* Stats Grid */}
      <View style={styles.statsGrid}>
        <View style={styles.statBox}>
          <Text style={styles.statNumber}>{stats?.wins || 0}</Text>
          <Text style={styles.statLabel}>DUEL WINS</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statNumber}>{stats?.losses || 0}</Text>
          <Text style={styles.statLabel}>LOSSES</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statNumber, { color: colors.solanaGreen }]}>
            ${stats?.disputedVolume || 0}
          </Text>
          <Text style={styles.statLabel}>DISPUTED VOLUME</Text>
        </View>
      </View>

      {/* Recent Settled Receipts */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🏆 SETTLED RESOLUTION RECEIPTS</Text>
        {receipts.length === 0 ? (
          <View style={styles.noReceipts}>
            <Text style={styles.noReceiptsText}>No settled duels on record yet.</Text>
          </View>
        ) : (
          receipts.map((rcpt) => <ReceiptCard key={rcpt.id} receipt={rcpt} />)
        )}
      </View>

      <TouchableOpacity style={styles.disconnectBtn} onPress={onDisconnect} activeOpacity={0.8}>
        <Text style={styles.disconnectText}>DISCONNECT WALLET</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: 60,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
    gap: 10,
    backgroundColor: colors.background,
  },
  emptyIcon: {
    fontSize: 40,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  emptySubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
  },
  profileCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: spacing.lg,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    marginBottom: spacing.md,
    backgroundColor: colors.surfaceLight,
    borderWidth: 2,
    borderColor: colors.solanaPurple,
  },
  displayName: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  handle: {
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: spacing.sm,
  },
  bio: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  walletBadge: {
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: spacing.lg,
  },
  walletText: {
    color: colors.textSecondary,
    fontFamily: 'monospace',
    fontSize: 11,
  },
  skrCard: {
    width: '100%',
    backgroundColor: 'rgba(255, 214, 10, 0.08)',
    borderRadius: 14,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 214, 10, 0.25)',
    gap: 4,
  },
  skrRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skrTitle: {
    color: colors.arenaBadge,
    fontSize: 12,
    fontWeight: '800',
  },
  skrAmount: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '900',
  },
  skrStatus: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '700',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  statBox: {
    flex: 1,
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  statNumber: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 2,
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: spacing.md,
  },
  noReceipts: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: 12,
    alignItems: 'center',
  },
  noReceiptsText: {
    color: colors.textMuted,
    fontSize: 12,
  },
  disconnectBtn: {
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.3)',
  },
  disconnectText: {
    color: colors.duelCrimson,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
