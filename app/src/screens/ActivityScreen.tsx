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
import { ActivityNotification, Challenge } from '../types';
import { colors, typography, spacing, borderRadius, touchMin } from '../theme';
import { api, isUnreachable } from '../api';
import { Icon, IconName } from '../components/Icon';
import { EmptyState, ErrorState } from '../components/StateViews';

interface ActivityScreenProps {
  onSelectNotification: (notif: ActivityNotification) => void;
  onOpenChallenge: (challenge: Challenge) => void;
  focusSignal?: number;
  onActionableCountChange?: (count: number) => void;
}

type FilterTab = 'ALL' | 'ACTION_REQUIRED';

const ACTIONABLE = [
  'CHALLENGE_RECEIVED',
  'COUNTEROFFER',
  'COUNTEROFFER_RECEIVED',
  'READY_TO_SETTLE',
  'OPPONENT_SUBMITTED_RESULT',
  'REFUND_READY',
  'WINNINGS_READY',
  'DUEL_RESOLVED',
];

export const ActivityScreen: React.FC<ActivityScreenProps> = ({
  onSelectNotification,
  onOpenChallenge,
  focusSignal,
  onActionableCountChange,
}) => {
  const [activities, setActivities] = useState<ActivityNotification[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [filter, setFilter] = useState<FilterTab>('ALL');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const loadActivities = async () => {
    try {
      setError(null);
      const [feed, list] = await Promise.all([api.getActivity(), api.getChallenges()]);
      setActivities(Array.isArray(feed) ? feed : []);
      setChallenges(Array.isArray(list) ? list : []);
    } catch (err: any) {
      if (isUnreachable(err)) setError('NETWORK_UNREACHABLE');
      else setError("Activity couldn't load. Try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadActivities();
  }, []);

  // Tabs stay mounted; reload when regaining focus.
  const lastFocusRef = React.useRef(focusSignal);
  useEffect(() => {
    if (focusSignal !== undefined && focusSignal !== lastFocusRef.current) {
      lastFocusRef.current = focusSignal;
      setRefreshing(true);
      loadActivities();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSignal]);

  useEffect(() => {
    onActionableCountChange?.(activities.filter((item) => item.is_read === 0 && ACTIONABLE.includes(item.type)).length);
  }, [activities, onActionableCountChange]);

  const onRefresh = () => {
    setRefreshing(true);
    loadActivities();
  };

  const getNotificationIcon = (type: string): { icon: IconName; color: string } => {
    switch (type) {
      case 'CHALLENGE_RECEIVED':
        return { icon: 'swords', color: colors.brandPrimary };
      case 'COUNTEROFFER':
      case 'COUNTEROFFER_RECEIVED':
        return { icon: 'refresh-cw', color: colors.brandSecondary };
      case 'DUEL_STARTED':
        return { icon: 'flame', color: colors.error };
      case 'DUEL_RESOLVED':
        return { icon: 'trophy', color: colors.arenaBadge };
      case 'READY_TO_SETTLE':
      case 'OPPONENT_SUBMITTED_RESULT':
        return { icon: 'swords', color: colors.brandPrimary };
      case 'REFUND_READY':
        return { icon: 'refresh-cw', color: colors.warning };
      case 'WINNINGS_READY':
        return { icon: 'trophy', color: colors.success };
      case 'BACKER_JOINED':
        return { icon: 'users', color: colors.success };
      default:
        return { icon: 'bell', color: colors.textSecondary };
    }
  };

  const openItem = (item: ActivityNotification) => {
    if (item.target_type === 'CHALLENGE') {
      const challenge = challenges.find((c) => c.id === item.target_id);
      if (challenge) {
        onOpenChallenge(challenge);
        return;
      }
      setOpeningId(item.id);
      api
        .getChallenges()
        .then((list) => {
          const found = (Array.isArray(list) ? list : []).find((c) => c.id === item.target_id);
          if (found) {
            setChallenges(Array.isArray(list) ? list : []);
            onOpenChallenge(found);
          } else {
            onSelectNotification(item);
          }
        })
        .catch(() => onSelectNotification(item))
        .finally(() => setOpeningId(null));
      return;
    }
    onSelectNotification(item);
  };

  const filteredActivities = activities.filter((item) => {
    if (filter === 'ACTION_REQUIRED') return ACTIONABLE.includes(item.type);
    return true;
  });

  const isToday = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
  };
  const todayItems = filteredActivities.filter((i) => isToday(i.created_at));
  const earlierItems = filteredActivities.filter((i) => !isToday(i.created_at));

  const renderRow = (item: ActivityNotification) => {
    const { icon, color } = getNotificationIcon(item.type);
    const isActionable = ACTIONABLE.includes(item.type);
    return (
      <TouchableOpacity
        style={[styles.itemRow, item.is_read === 0 && styles.itemUnread]}
        onPress={() => openItem(item)}
        activeOpacity={0.8}
        accessibilityLabel={item.title}
        accessibilityRole="button"
      >
        <View style={[styles.iconCircle, { backgroundColor: `${color}1A` }]}>
          <Icon name={icon} size={20} color={color} />
        </View>
        <View style={styles.itemContent}>
          <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.itemMessage} numberOfLines={2}>{item.message}</Text>
          <Text style={styles.itemTime}>
            {new Date(item.created_at).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
            {isActionable ? ' · needs you' : ''}
          </Text>
        </View>
        {isActionable ? (
          <View style={styles.actionPill}>
            {openingId === item.id ? (
              <ActivityIndicator size="small" color="#000000" />
            ) : (
              <Icon name="chevron-right" size={16} color="#000000" />
            )}
          </View>
        ) : (
          <Icon name="chevron-right" size={16} color={colors.textMuted} />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Activity</Text>
        <Text style={styles.subtitle}>What happened and what needs you</Text>
      </View>

      <View style={styles.filterRow}>
        {(['ALL', 'ACTION_REQUIRED'] as FilterTab[]).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterChip, filter === f && styles.filterChipActive]}
            onPress={() => setFilter(f)}
            activeOpacity={0.8}
            accessibilityLabel={f === 'ALL' ? 'All activity' : 'Action required'}
            accessibilityState={{ selected: filter === f }}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f === 'ALL' ? 'All' : 'Needs you'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.brandPrimary} />
        </View>
      ) : error ? (
        <ErrorState message={error} onRetry={loadActivities} />
      ) : (
        <FlatList
          data={[
            ...(todayItems.length > 0 ? [{ header: 'Today' } as any, ...todayItems] : []),
            ...(earlierItems.length > 0 ? [{ header: 'Earlier' } as any, ...earlierItems] : []),
          ]}
          keyExtractor={(item: any) => item.header || item.id}
          renderItem={({ item }: any) => {
            if (item.header) {
              return <Text style={styles.groupHeader}>{item.header}</Text>;
            }
            return renderRow(item as ActivityNotification);
          }}
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
              icon="bell"
              title="All caught up"
              subtitle={
                filter === 'ACTION_REQUIRED'
                  ? 'Nothing needs your decision right now.'
                  : 'Challenges, stakes, resolutions, and receipts land here.'
              }
            />
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  title: { ...typography.h2, color: colors.textPrimary },
  subtitle: { ...typography.bodyMuted, color: colors.textSecondary, marginTop: 2 },
  filterRow: { flexDirection: 'row', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: spacing.sm },
  filterChip: {
    minHeight: touchMin,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  filterChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  filterText: { ...typography.captionBold, color: colors.textSecondary, fontSize: 13 },
  filterTextActive: { color: '#000000' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { paddingBottom: 96 },
  groupHeader: {
    ...typography.captionBold,
    color: colors.textMuted,
    fontSize: 12,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minHeight: touchMin + 8,
    gap: spacing.md,
  },
  itemUnread: {
    backgroundColor: colors.surface,
  },
  iconCircle: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  itemContent: { flex: 1, gap: 1 },
  itemTitle: { ...typography.bodyBold, color: colors.textPrimary, fontSize: 14 },
  itemMessage: { ...typography.body, color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  itemTime: { ...typography.caption, color: colors.textMuted, fontSize: 12, marginTop: 2 },
  actionPill: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.brandPrimary,
    alignItems: 'center', justifyContent: 'center',
  },
});
