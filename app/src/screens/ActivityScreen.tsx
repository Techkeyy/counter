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
import { api } from '../api';
import { Icon, IconName } from '../components/Icon';
import { EmptyState, ErrorState } from '../components/StateViews';

interface ActivityScreenProps {
  onSelectNotification: (notif: ActivityNotification) => void;
  onOpenChallenge: (challenge: Challenge) => void;
}

type FilterTab = 'ALL' | 'ACTION_REQUIRED';

const ACTIONABLE = ['CHALLENGE_RECEIVED', 'COUNTEROFFER', 'COUNTEROFFER_RECEIVED', 'DUEL_RESOLVED'];

export const ActivityScreen: React.FC<ActivityScreenProps> = ({
  onSelectNotification,
  onOpenChallenge,
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
      setError(err?.message || "Couldn't load activity.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadActivities();
  }, []);

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

  const actionLabel = (type: string): string => {
    if (type === 'CHALLENGE_RECEIVED' || type === 'COUNTEROFFER' || type === 'COUNTEROFFER_RECEIVED') {
      return 'Review challenge';
    }
    return 'View receipt';
  };

  const filteredActivities = activities.filter((item) => {
    if (filter === 'ACTION_REQUIRED') return ACTIONABLE.includes(item.type);
    return true;
  });

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
          data={filteredActivities}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const { icon, color } = getNotificationIcon(item.type);
            const isActionable = ACTIONABLE.includes(item.type);
            return (
              <TouchableOpacity
                style={[styles.itemCard, item.is_read === 0 && styles.itemUnread]}
                onPress={() => openItem(item)}
                activeOpacity={0.8}
                accessibilityLabel={item.title}
                accessibilityRole="button"
              >
                <View style={[styles.iconCircle, { backgroundColor: `${color}1A` }]}>
                  <Icon name={icon} size={20} color={color} />
                </View>
                <View style={styles.itemContent}>
                  <View style={styles.cardTop}>
                    <Text style={styles.itemTitle}>{item.title}</Text>
                    <Text style={styles.itemDate}>
                      {new Date(item.created_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  </View>
                  <Text style={styles.itemMessage}>{item.message}</Text>
                  {isActionable && (
                    <View style={styles.actionRow}>
                      <View style={styles.actionBtn}>
                        {openingId === item.id ? (
                          <ActivityIndicator size="small" color="#000000" />
                        ) : (
                          <>
                            <Text style={styles.actionBtnText}>{actionLabel(item.type)}</Text>
                            <Icon name="arrow-right" size={12} color="#000000" />
                          </>
                        )}
                      </View>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
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
  listContent: { padding: spacing.md, paddingBottom: 96 },
  itemCard: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  itemUnread: {
    borderColor: 'rgba(20, 241, 149, 0.4)',
    backgroundColor: colors.surface,
  },
  iconCircle: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', marginRight: spacing.md,
  },
  itemContent: { flex: 1 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  itemTitle: { ...typography.bodyBold, color: colors.textPrimary, flex: 1 },
  itemDate: { ...typography.caption, color: colors.textMuted, marginLeft: spacing.sm },
  itemMessage: { ...typography.bodyMuted, color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  actionRow: { marginTop: spacing.sm, flexDirection: 'row' },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.brandPrimary,
    paddingHorizontal: spacing.md,
    minHeight: touchMin,
    borderRadius: borderRadius.full,
    gap: 4,
  },
  actionBtnText: { ...typography.captionBold, color: '#000000', fontSize: 12 },
});
