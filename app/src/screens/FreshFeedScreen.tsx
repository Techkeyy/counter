import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Take, Duel } from '../types';
import { ALL_CATEGORIES, CategoryFilter, categoryLabel } from '../topics';
import { hasRealIdentity, formatUserDisplayName, formatUserHandle, formatRelativeTime } from '../utils/identity';
import { colors, spacing, typography, touchMin } from '../theme';
import { api, isUnreachable } from '../api';
import { Avatar, EmptyState, Rule, ScreenHeader, StatusPill } from '../components/CounterUI';

interface FreshFeedScreenProps {
  onSelectTake: (take: Take) => void;
  onSelectDuel: (duel: Duel) => void;
  onChallengePress?: (take: Take) => void;
  onCreateTakePress?: () => void;
  onOpenProfile?: () => void;
  onOpenAuthorProfile?: (wallet: string | null) => void;
  onHasVisibleTakesChange?: (hasVisibleTakes: boolean) => void;
  userWallet?: string | null;
  refreshSignal?: number;
  focusSignal?: number;
}

export const FreshFeedScreen: React.FC<FreshFeedScreenProps> = ({
  onSelectTake, onSelectDuel, onChallengePress, onCreateTakePress, onOpenProfile,
  onOpenAuthorProfile, onHasVisibleTakesChange, userWallet, refreshSignal, focusSignal,
}) => {
  const [takes, setTakes] = useState<Take[]>([]);
  const [duels, setDuels] = useState<Duel[]>([]);
  const [category, setCategory] = useState<CategoryFilter>('ALL');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileIncomplete, setProfileIncomplete] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const [nextTakes, nextDuels] = await Promise.all([
        api.getTakes(category === 'ALL' ? undefined : category),
        api.getDuels(category === 'ALL' ? {} : { category }),
      ]);
      const visibleTakes = Array.isArray(nextTakes) ? nextTakes : [];
      setTakes(visibleTakes);
      onHasVisibleTakesChange?.(visibleTakes.length > 0);
      setDuels(Array.isArray(nextDuels) ? nextDuels : []);
      if (userWallet) {
        try {
          const profile: any = await api.getUserProfile(userWallet);
          setProfileIncomplete(!hasRealIdentity({ display_name: profile?.display_name, handle: profile?.handle, wallet: userWallet }));
        } catch { setProfileIncomplete(false); }
      } else setProfileIncomplete(false);
    } catch (err: any) {
      setError(isUnreachable(err) ? 'NETWORK_UNREACHABLE' : 'The feed could not load.');
    } finally { setLoading(false); setRefreshing(false); }
  }, [category, onHasVisibleTakesChange, userWallet]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { if (refreshSignal) { setRefreshing(true); loadData(); } }, [refreshSignal, loadData]);
  const focusRef = React.useRef(focusSignal);
  useEffect(() => {
    if (focusSignal !== undefined && focusSignal !== focusRef.current) { focusRef.current = focusSignal; setRefreshing(true); loadData(); }
  }, [focusSignal, loadData]);

  const duelByTake = useMemo(() => new Map(duels.filter((d) => d.take_id).map((d) => [d.take_id as string, d])), [duels]);

  const renderTake = ({ item }: { item: Take }) => {
    const duel = duelByTake.get(item.id);
    const displayName = formatUserDisplayName({ display_name: item.author_name, handle: item.author_handle, wallet: item.author_wallet });
    const handle = formatUserHandle({ handle: item.author_handle, wallet: item.author_wallet });
    return (
      <View>
        <TouchableOpacity style={styles.post} onPress={() => onSelectTake(item)} activeOpacity={0.86} accessibilityRole="button">
          <View style={styles.authorRow}>
            <TouchableOpacity onPress={() => onOpenAuthorProfile?.(item.author_wallet)} accessibilityLabel={`Open ${displayName} profile`}><Avatar uri={item.author_avatar} wallet={item.author_wallet} size={42} /></TouchableOpacity>
            <View style={styles.authorCopy}><Text style={styles.name} numberOfLines={1}>{displayName}</Text><Text style={styles.meta}>{handle} · {formatRelativeTime(item.created_at)}</Text></View>
            <StatusPill label={categoryLabel(item.category as CategoryFilter)} />
          </View>
          <Text style={styles.topic}>{item.topic}</Text>
          {!!item.content?.trim() && <Text style={styles.why}><Text style={styles.whyLabel}>Why </Text>{item.content}</Text>}
          {duel ? <TouchableOpacity style={styles.duelHint} onPress={() => onSelectDuel(duel)}><Text style={styles.duelHintText}>Duel in progress</Text><Text style={styles.duelHintArrow}>›</Text></TouchableOpacity> : null}
          <View style={styles.actions}><Text style={styles.actionText}>{item.comments_count || 0} replies</Text><Text style={styles.actionDot}>·</Text><Text style={styles.actionText}>{item.duels_count || 0} duels</Text><View style={styles.actionSpacer} />{onChallengePress && item.author_wallet !== userWallet ? <TouchableOpacity style={styles.challenge} onPress={() => onChallengePress(item)} accessibilityRole="button"><Text style={styles.challengeText}>Challenge</Text></TouchableOpacity> : null}</View>
        </TouchableOpacity>
        <Rule />
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title="Home" right={<TouchableOpacity onPress={onOpenProfile} style={styles.avatarButton} accessibilityLabel="Open profile"><Avatar wallet={userWallet} size={36} placeholderColor={colors.brandPrimary} /></TouchableOpacity>} />
      <View style={styles.intro}><Text style={styles.introTitle}>Say what you think.</Text><Text style={styles.introBody}>Make a Take. Let someone challenge it.</Text></View>
      <FlatList style={styles.filterList} horizontal data={ALL_CATEGORIES} keyExtractor={(x) => x} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters} renderItem={({ item }) => <TouchableOpacity onPress={() => setCategory(item)} style={[styles.filter, category === item && styles.filterActive]} accessibilityRole="tab" accessibilityState={{ selected: category === item }}><Text numberOfLines={1} ellipsizeMode="clip" style={[styles.filterText, category === item && styles.filterTextActive]}>{categoryLabel(item)}</Text></TouchableOpacity>} />
      {loading ? <View style={styles.loading}><Text style={styles.loadingText}>Finding fresh Takes…</Text></View> : error ? <EmptyState title={error} body="Check your connection and try again." action="Retry" onAction={loadData} /> : <FlatList data={takes} keyExtractor={(x) => x.id} renderItem={renderTake} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={colors.brandPrimary} />} contentContainerStyle={takes.length ? styles.list : styles.emptyList} ListEmptyComponent={<EmptyState title="The room is quiet" body="Be the first person to post a Take worth arguing about." action="Post a Take" onAction={onCreateTakePress} />} />}
      {profileIncomplete && !loading && !error ? <TouchableOpacity style={styles.profileNudge} onPress={onOpenProfile} accessibilityRole="button"><Text style={styles.profileNudgeText}>Finish your profile so people recognize you</Text><Text style={styles.profileNudgeArrow}>›</Text></TouchableOpacity> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background }, avatarButton: { minWidth: touchMin, minHeight: touchMin, justifyContent: 'center', alignItems: 'flex-end' }, intro: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md }, introTitle: { ...typography.display, fontSize: 29 }, introBody: { ...typography.bodyMuted, marginTop: spacing.xs }, filterList: { flexGrow: 0 }, filters: { paddingHorizontal: spacing.lg, paddingRight: spacing.lg, paddingBottom: spacing.md, gap: spacing.xs }, filter: { height: 36, minHeight: 36, minWidth: 46, flexShrink: 0, alignSelf: 'flex-start', alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: 18 }, filterActive: { backgroundColor: colors.surfaceHighlight }, filterText: { ...typography.captionBold, color: colors.textMuted }, filterTextActive: { color: colors.warmIvory }, list: { paddingBottom: 112 }, emptyList: { flexGrow: 1, paddingBottom: 112 }, post: { paddingHorizontal: spacing.lg, paddingVertical: spacing.lg }, authorRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md }, authorCopy: { flex: 1, marginLeft: spacing.sm }, name: { ...typography.bodyBold }, meta: { ...typography.caption, marginTop: 2 }, topic: { ...typography.h1, fontSize: 24, lineHeight: 29, marginBottom: spacing.sm }, why: { ...typography.body, color: colors.textSecondary }, whyLabel: { color: colors.textMuted, fontWeight: '800' }, duelHint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, backgroundColor: 'rgba(124,140,255,0.1)', borderRadius: 12 }, duelHintText: { color: colors.cobalt, ...typography.captionBold }, duelHintArrow: { color: colors.cobalt, fontSize: 22 }, actions: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.lg, minHeight: touchMin }, actionText: { ...typography.caption, color: colors.textMuted }, actionDot: { color: colors.textMuted, paddingHorizontal: spacing.sm }, actionSpacer: { flex: 1 }, challenge: { minHeight: touchMin, justifyContent: 'center', paddingHorizontal: spacing.md }, challengeText: { color: colors.brandPrimary, ...typography.captionBold }, rule: { marginLeft: spacing.lg }, loading: { padding: spacing.xl, alignItems: 'center' }, loadingText: { ...typography.bodyMuted }, profileNudge: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.md, minHeight: 50, backgroundColor: colors.surfaceLight, borderRadius: 16, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center' }, profileNudgeText: { flex: 1, ...typography.bodyBold, fontSize: 13 }, profileNudgeArrow: { color: colors.brandPrimary, fontSize: 24 },
});
