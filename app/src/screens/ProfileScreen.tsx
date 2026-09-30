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
import { colors, typography, spacing, borderRadius, touchMin } from '../theme';
import { api } from '../api';
import { Icon } from '../components/Icon';
import * as Clipboard from 'expo-clipboard';
import { formatUserDisplayName, formatUserHandle, getAvatarUri, formatWalletShort } from '../utils/identity';
import { EmptyState, ErrorState } from '../components/StateViews';

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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadProfile = async () => {
    if (!wallet) return;
    try {
      setLoadError(null);
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
    } catch (err: any) {
      console.warn('Failed to load profile:', err);
      setLoadError(err?.message || "Couldn't load this profile.");
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

  if (loadError && !user) {
    return (
      <View style={styles.container}>
        <ErrorState message={loadError} onRetry={loadProfile} />
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

  // Head-to-head rows derived strictly from this wallet's real duels.
  // No names, scores, or rematch actions are invented.
  const rivalries = (() => {
    const byOpponent = new Map<string, { label: string; duels: number; wins: number; losses: number; latestDuelId: string }>();
    for (const d of myDuels) {
      const isA = d.captain_a_wallet === wallet;
      const oppWallet = isA ? d.captain_b_wallet : d.captain_a_wallet;
      if (!oppWallet) continue;
      const label = formatUserDisplayName({
        display_name: isA ? d.captain_b_name : d.captain_a_name,
        handle: isA ? d.captain_b_handle : d.captain_a_handle,
        wallet: oppWallet,
      });
      const row = byOpponent.get(oppWallet) || { label, duels: 0, wins: 0, losses: 0, latestDuelId: d.id };
      row.duels += 1;
      row.latestDuelId = d.id;
      if (d.status.startsWith('RESOLVED')) {
        const mySide = isA ? 1 : 2;
        if (d.winning_side === mySide) row.wins += 1;
        else row.losses += 1;
      }
      byOpponent.set(oppWallet, row);
    }
    return [...byOpponent.entries()].map(([opponentWallet, r]) => ({
      opponentWallet,
      label: r.label,
      record:
        r.duels === 1
          ? '1 duel'
          : r.wins === r.losses
            ? `${r.duels} duels, even`
            : `${r.duels} duels, you lead ${r.wins}-${r.losses}`,
      latestDuelId: r.latestDuelId,
    })).slice(0, 5);
  })();

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
        {handle ? <Text style={styles.handle}>{handle}</Text> : null}
        {user?.bio ? <Text style={styles.bio}>{user.bio}</Text> : null}
      </View>

      {/* 2. Counts: tappable, real */}
      <View style={styles.countsRow}>
        {([
          { key: 'TAKES', label: 'Takes', count: myTakes.length },
          { key: 'DUELS', label: 'Duels', count: myDuels.length },
          { key: 'RECEIPTS', label: 'Receipts', count: receipts.length },
        ] as const).map((c) => (
          <TouchableOpacity
            key={c.key}
            style={styles.countCell}
            onPress={() => setActiveTab(c.key)}
            activeOpacity={0.8}
            accessibilityLabel={`${c.label}, ${c.count}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === c.key }}
          >
            <Text style={styles.countNumber}>{c.count}</Text>
            <Text style={[styles.countLabel, activeTab === c.key && styles.countLabelActive]}>
              {c.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 3. Compact record (server stats when present, else derived) */}
      {totalDuels > 0 && (
        <View style={styles.recordRow}>
          <Icon name="trophy" size={14} color={colors.textMuted} />
          <Text style={styles.recordText}>
            {wins}W · {losses}L{streak && wins > 0 ? ` · ${streak}` : ''}
          </Text>
        </View>
      )}

      {/* 3. Head-to-head record, computed from your real duels */}
      {rivalries.length > 0 && (
        <View style={styles.statsCard}>
          <View style={styles.rivalryHeaderRow}>
            <View style={styles.rivalryTitleRow}>
              <Icon name="swords" size={15} color={colors.brandPrimary} />
              <Text style={styles.cardHeaderTitle}>Head-to-head</Text>
            </View>
          </View>
          {rivalries.map((r) => (
            <TouchableOpacity
              key={r.opponentWallet}
              style={styles.rivalryItem}
              onPress={() => {
                const duel = myDuels.find((d) => d.id === r.latestDuelId);
                if (duel && onSelectDuel) onSelectDuel(duel);
              }}
              activeOpacity={0.8}
              accessibilityLabel={`Head to head with ${r.label}, ${r.record}`}
              accessibilityRole="button"
            >
              <View style={styles.rivalryCombatants}>
                <Text style={styles.rivalryName} numberOfLines={1}>You</Text>
                <Text style={styles.rivalryVs}>vs</Text>
                <Text style={styles.rivalryName} numberOfLines={1}>{r.label}</Text>
              </View>
              <Text style={styles.rivalryScore}>{r.record}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

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

      {/* 5. Account: wallet lives here, not in the header */}
      <View style={styles.accountCard}>
        <Text style={styles.cardHeaderTitle}>Account</Text>

        <View style={styles.accountRow}>
          <Text style={styles.accountKey}>Wallet Address</Text>
          <View style={styles.walletCopyRow}>
            <Text style={styles.accountValMono}>{formatWalletShort(wallet)}</Text>
            <TouchableOpacity
              onPress={async () => {
                if (wallet) {
                  await Clipboard.setStringAsync(wallet);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }
              }}
              style={styles.copyBtn}
              accessibilityLabel="Copy wallet address"
              accessibilityRole="button"
            >
              <Icon name={copied ? 'check' : 'copy'} size={16} color={copied ? colors.brandPrimary : colors.textSecondary} />
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
          <Text style={styles.accountKey}>Network</Text>
          <Text style={styles.accountVal}>Solana Devnet · test cUSD</Text>
        </View>

        <TouchableOpacity
          style={styles.disconnectBtn}
          onPress={onDisconnect}
          activeOpacity={0.8}
          accessibilityLabel="Disconnect wallet"
          accessibilityRole="button"
        >
          <Text style={styles.disconnectText}>Disconnect wallet</Text>
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
  countsRow: {
    flexDirection: 'row',
    marginBottom: spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.cardBorder,
  },
  countCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    minHeight: touchMin,
    justifyContent: 'center',
  },
  countNumber: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  countLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 1,
  },
  countLabelActive: {
    color: colors.brandPrimary,
    fontWeight: '700',
  },
  recordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
    paddingHorizontal: 2,
  },
  recordText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 13,
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
    minHeight: touchMin,
    justifyContent: 'center',
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
    minHeight: touchMin,
    minWidth: touchMin,
    justifyContent: 'center',
    alignItems: 'center',
  },
  disconnectBtn: {
    marginTop: spacing.sm,
    minHeight: touchMin,
    justifyContent: 'center',
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
