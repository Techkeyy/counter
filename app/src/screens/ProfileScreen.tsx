import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Share,
} from 'react-native';
import { User, Receipt, Take, Duel } from '../types';
import { colors, typography, spacing, borderRadius } from '../theme';
import { api } from '../api';
import { Icon } from '../components/Icon';
import { formatUserDisplayName, formatUserHandle, getAvatarUri, formatWalletShort } from '../utils/identity';
import { EmptyState } from '../components/StateViews';

interface ProfileScreenProps {
  wallet: string | null;
  onDisconnect: () => void;
  onSelectTake?: (take: Take) => void;
  onSelectDuel?: (duel: Duel) => void;
  onSelectReceipt?: (receipt: Receipt) => void;
}

type ProfileTab = 'TAKES' | 'DUELS' | 'RECEIPTS';

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
  wallet,
  onDisconnect,
  onSelectTake,
  onSelectDuel,
  onSelectReceipt,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [myTakes, setMyTakes] = useState<Take[]>([]);
  const [myDuels, setMyDuels] = useState<Duel[]>([]);
  const [activeTab, setActiveTab] = useState<ProfileTab>('DUELS');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const loadProfile = async () => {
    if (!wallet) return;
    try {
      const [profile, userReceipts, allTakes, allDuels] = await Promise.all([
        api.getUserProfile(wallet),
        api.getUserReceipts(wallet),
        api.getTakes(),
        api.getDuels(),
      ]);

      setUser(profile);
      setStats(profile?.stats || null);
      setReceipts(Array.isArray(userReceipts) ? userReceipts : []);

      // Filter user's own takes and duels
      const takesList = Array.isArray(allTakes) ? allTakes : [];
      setMyTakes(takesList.filter((t) => t.author_wallet === wallet));

      const duelsList = Array.isArray(allDuels) ? allDuels : [];
      setMyDuels(duelsList.filter((d) => d.captain_a_wallet === wallet || d.captain_b_wallet === wallet));
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
      <View style={styles.container}>
        <EmptyState
          icon="wallet-cards"
          title="Wallet Not Connected"
          subtitle="Connect your Solana Mobile wallet to access your Contender Profile, stats, and rivalries."
        />
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.brandPrimary} />
      </View>
    );
  }

  const displayName = formatUserDisplayName({
    display_name: user?.display_name,
    name: user?.display_name,
    handle: user?.handle,
    wallet,
  });
  const handle = formatUserHandle({
    handle: user?.handle,
    wallet,
  });
  const avatarUri = getAvatarUri(user?.avatar_url, wallet);

  // Stats calculation
  const totalDuels = stats?.total_duels || myDuels.length || 0;
  const wins = stats?.wins || 0;
  const losses = stats?.losses || 0;
  const winRate = totalDuels > 0 ? Math.round((wins / totalDuels) * 100) : 0;
  const streak = stats?.streak || (wins > 0 ? `${wins} Streak` : '0 Streak');

  const skrStaked = user?.skr_staked_amount || 0;
  const isArenaEligible = skrStaked > 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* 1. Person First Header */}
      <View style={styles.profileHeader}>
        <Image source={{ uri: avatarUri }} style={styles.avatar} />
        <View style={styles.identityRow}>
          <Text style={styles.displayName}>{displayName}</Text>
          {isArenaEligible && (
            <View style={styles.arenaQualifiedBadge}>
              <Icon name="shield-check" size={13} color={colors.arenaBadge} />
              <Text style={styles.arenaQualifiedText}>Arena Verified</Text>
            </View>
          )}
        </View>
        <Text style={styles.handle}>{handle}</Text>
        <Text style={styles.bio}>
          {user?.bio || 'Contender on Counter. Disputing claims on Solana.'}
        </Text>
      </View>

      {/* 2. Strava-Style Reputation & Competitive Records */}
      <View style={styles.statsCard}>
        <Text style={styles.cardHeaderTitle}>COMPETITIVE RECORD</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{totalDuels}</Text>
            <Text style={styles.statLabel}>Duels</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statNumber, { color: colors.sideA }]}>{wins}</Text>
            <Text style={styles.statLabel}>Wins</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statNumber, { color: colors.danger }]}>{losses}</Text>
            <Text style={styles.statLabel}>Losses</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{winRate}%</Text>
            <Text style={styles.statLabel}>Win Rate</Text>
          </View>
        </View>

        {/* Current Streak Indicator */}
        <View style={styles.streakRow}>
          <Icon name="flame" size={16} color={colors.brandPrimary} />
          <Text style={styles.streakText}>Current Streak: <Text style={styles.streakHighlight}>{streak}</Text></Text>
        </View>
      </View>

      {/* 3. Persistent Rivalries Section */}
      <View style={styles.statsCard}>
        <View style={styles.rivalryHeaderRow}>
          <View style={styles.rivalryTitleRow}>
            <Icon name="swords" size={15} color={colors.brandPrimary} />
            <Text style={styles.cardHeaderTitle}>HEAD-TO-HEAD RIVALRIES</Text>
          </View>
        </View>

        {/* Rivalry Highlight Card */}
        <View style={styles.rivalryItem}>
          <View style={styles.rivalryCombatants}>
            <Text style={styles.rivalryName}>{displayName}</Text>
            <Text style={styles.rivalryVs}>vs</Text>
            <Text style={styles.rivalryName}>Israel</Text>
          </View>
          <Text style={styles.rivalryScore}>3 Duels · Leads 2–1</Text>
          <TouchableOpacity
            style={styles.rematchBtn}
            activeOpacity={0.8}
            accessibilityLabel="Propose rematch"
          >
            <Icon name="refresh-cw" size={12} color={colors.brandPrimary} />
            <Text style={styles.rematchBtnText}>Rematch</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 4. Content Tabs: Takes | Duels | Receipts */}
      <View style={styles.tabsBar}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'DUELS' && styles.tabBtnActive]}
          onPress={() => setActiveTab('DUELS')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabBtnText, activeTab === 'DUELS' && styles.tabBtnTextActive]}>
            Duels ({myDuels.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'TAKES' && styles.tabBtnActive]}
          onPress={() => setActiveTab('TAKES')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabBtnText, activeTab === 'TAKES' && styles.tabBtnTextActive]}>
            Takes ({myTakes.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'RECEIPTS' && styles.tabBtnActive]}
          onPress={() => setActiveTab('RECEIPTS')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabBtnText, activeTab === 'RECEIPTS' && styles.tabBtnTextActive]}>
            Receipts ({receipts.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Tab Content List */}
      <View style={styles.tabContentArea}>
        {activeTab === 'DUELS' && (
          myDuels.length === 0 ? (
            <EmptyState icon="swords" title="No Duels yet" subtitle="Challenge a take to enter your first duel." />
          ) : (
            myDuels.map((d) => (
              <TouchableOpacity
                key={d.id}
                style={styles.contentItemCard}
                onPress={() => onSelectDuel && onSelectDuel(d)}
                activeOpacity={0.8}
              >
                <View style={styles.itemHeader}>
                  <Text style={styles.itemTitle}>{d.proposition_a} vs {d.proposition_b}</Text>
                  <View style={[styles.statusTag, d.status.startsWith('RESOLVED') && styles.statusTagResolved]}>
                    <Text style={styles.statusTagText}>{d.status.replace('_', ' ')}</Text>
                  </View>
                </View>
                <Text style={styles.itemPoolText}>
                  Pool: ${(Number(d.side_a_total) || 0) + (Number(d.side_b_total) || 0)} cUSD
                </Text>
              </TouchableOpacity>
            ))
          )
        )}

        {activeTab === 'TAKES' && (
          myTakes.length === 0 ? (
            <EmptyState icon="message-circle" title="No Takes yet" subtitle="Share your first argument on Counter." />
          ) : (
            myTakes.map((t) => (
              <TouchableOpacity
                key={t.id}
                style={styles.contentItemCard}
                onPress={() => onSelectTake && onSelectTake(t)}
                activeOpacity={0.8}
              >
                <Text style={styles.itemTitle}>{t.topic || t.content}</Text>
                <Text style={styles.itemDate}>{new Date(t.created_at).toLocaleDateString()}</Text>
              </TouchableOpacity>
            ))
          )
        )}

        {activeTab === 'RECEIPTS' && (
          receipts.length === 0 ? (
            <EmptyState icon="check-circle" title="No Receipts yet" subtitle="Resolved duels will appear here as permanent proof." />
          ) : (
            receipts.map((r) => (
              <TouchableOpacity
                key={r.id}
                style={styles.contentItemCard}
                onPress={() => onSelectReceipt && onSelectReceipt(r)}
                activeOpacity={0.8}
              >
                <View style={styles.itemHeader}>
                  <Text style={styles.itemTitle} numberOfLines={1}>{r.resolution_summary}</Text>
                  <Text style={styles.settledAmountTag}>${r.total_pool} cUSD</Text>
                </View>
                <Text style={styles.itemDate}>{new Date(r.created_at).toLocaleDateString()}</Text>
              </TouchableOpacity>
            ))
          )
        )}
      </View>

      {/* 5. Secondary Account & Wallet Section */}
      <View style={styles.accountCard}>
        <Text style={styles.cardHeaderTitle}>CONNECTED ACCOUNT</Text>

        <View style={styles.accountRow}>
          <Text style={styles.accountKey}>Wallet Address</Text>
          <View style={styles.walletCopyRow}>
            <Text style={styles.accountValMono}>{formatWalletShort(wallet)}</Text>
            <TouchableOpacity onPress={() => setCopied(true)} style={styles.copyBtn}>
              <Icon name={copied ? 'check' : 'copy'} size={14} color={copied ? colors.brandPrimary : colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.accountRow}>
          <Text style={styles.accountKey}>Arena Eligibility</Text>
          <Text style={[styles.accountVal, { color: isArenaEligible ? colors.brandPrimary : colors.textSecondary }]}>
            {isArenaEligible ? `Unlocked (${skrStaked} SKR Staked)` : 'Locked (Requires staked SKR > 0)'}
          </Text>
        </View>

        <View style={styles.accountRow}>
          <Text style={styles.accountKey}>Escrow Network</Text>
          <Text style={styles.accountVal}>Solana Devnet (cUSD)</Text>
        </View>

        <TouchableOpacity style={styles.disconnectBtn} onPress={onDisconnect} activeOpacity={0.8}>
          <Text style={styles.disconnectText}>Disconnect Wallet</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: 60,
  },
  profileHeader: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surfaceLight,
    marginBottom: spacing.sm,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: 2,
  },
  displayName: {
    ...typography.h1,
  },
  arenaQualifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.badgeBg,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: borderRadius.xs,
    borderWidth: 1,
    borderColor: colors.badgeBorder,
  },
  arenaQualifiedText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.arenaBadge,
  },
  handle: {
    ...typography.subtitle,
    marginBottom: spacing.xs,
  },
  bio: {
    ...typography.bodyMuted,
    textAlign: 'center',
    maxWidth: 280,
  },
  statsCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  cardHeaderTitle: {
    ...typography.captionBold,
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  statLabel: {
    ...typography.caption,
    marginTop: 2,
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  streakText: {
    ...typography.bodyMuted,
    fontSize: 12,
  },
  streakHighlight: {
    fontWeight: '700',
    color: colors.brandPrimary,
  },
  rivalryHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rivalryTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rivalryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceLight,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginTop: spacing.xs,
  },
  rivalryCombatants: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  rivalryName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  rivalryVs: {
    fontSize: 11,
    color: colors.textMuted,
  },
  rivalryScore: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  rematchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(20, 241, 149, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: borderRadius.sm,
  },
  rematchBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.brandPrimary,
  },
  tabsBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: 3,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: borderRadius.sm,
  },
  tabBtnActive: {
    backgroundColor: colors.surfaceHighlight,
  },
  tabBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  tabBtnTextActive: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  tabContentArea: {
    marginBottom: spacing.lg,
  },
  contentItemCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  itemTitle: {
    ...typography.bodyBold,
    fontSize: 13,
    flex: 1,
    marginRight: spacing.sm,
  },
  itemDate: {
    ...typography.caption,
  },
  itemPoolText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.brandPrimary,
  },
  statusTag: {
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.xs,
  },
  statusTagResolved: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  statusTagText: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.brandPrimary,
  },
  settledAmountTag: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.brandPrimary,
  },
  accountCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    gap: spacing.sm,
  },
  accountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  accountKey: {
    ...typography.bodyMuted,
    fontSize: 13,
  },
  accountVal: {
    ...typography.bodyBold,
    fontSize: 13,
  },
  accountValMono: {
    ...typography.mono,
    fontSize: 12,
  },
  walletCopyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  copyBtn: {
    padding: 4,
  },
  disconnectBtn: {
    marginTop: spacing.sm,
    paddingVertical: 10,
    borderRadius: borderRadius.md,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    alignItems: 'center',
  },
  disconnectText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.danger,
  },
});
