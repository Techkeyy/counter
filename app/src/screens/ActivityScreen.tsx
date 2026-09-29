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
import { ActivityNotification } from '../types';
import { colors, typography, spacing, borderRadius } from '../theme';
import { api } from '../api';
import { Icon, IconName } from '../components/Icon';
import { EmptyState } from '../components/StateViews';

interface ActivityScreenProps {
  onSelectNotification: (notif: ActivityNotification) => void;
}

type FilterTab = 'ALL' | 'ACTION_REQUIRED';

export const ActivityScreen: React.FC<ActivityScreenProps> = ({
  onSelectNotification,
}) => {
  const [activities, setActivities] = useState<ActivityNotification[]>([]);
  const [filter, setFilter] = useState<FilterTab>('ALL');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadActivities = async () => {
    try {
      const data = await api.getActivity();
      setActivities(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn('Failed to load activity:', err);
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
        return { icon: 'swords', color: colors.solanaGreen };
      case 'COUNTEROFFER':
        return { icon: 'refresh-cw', color: colors.solanaPurple };
      case 'DUEL_STARTED':
        return { icon: 'flame', color: colors.duelCrimson };
      case 'DUEL_RESOLVED':
        return { icon: 'trophy', color: colors.arenaBadge };
      case 'BACKER_JOINED':
        return { icon: 'users', color: colors.solanaGreen };
      default:
        return { icon: 'bell', color: colors.textSecondary };
    }
  };

  const filteredActivities = activities.filter((item) => {
    if (filter === 'ACTION_REQUIRED') {
      return (
        item.type === 'CHALLENGE_RECEIVED' ||
        item.type === 'COUNTEROFFER' ||
        item.type === 'DUEL_RESOLVED'
      );
    }
    return true;
  });

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Activity</Text>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterChip, filter === 'ALL' && styles.filterChipActive]}
          onPress={() => setFilter('ALL')}
          activeOpacity={0.8}
        >
          <Text style={[styles.filterText, filter === 'ALL' && styles.filterTextActive]}>
            All
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterChip, filter === 'ACTION_REQUIRED' && styles.filterChipActive]}
          onPress={() => setFilter('ACTION_REQUIRED')}
          activeOpacity={0.8}
        >
          <Text
            style={[
              styles.filterText,
              filter === 'ACTION_REQUIRED' && styles.filterTextActive,
            ]}
          >
            Action Required
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.solanaGreen} />
        </View>
      ) : (
        <FlatList
          data={filteredActivities}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const { icon, color } = getNotificationIcon(item.type);
            const isActionable =
              item.type === 'CHALLENGE_RECEIVED' ||
              item.type === 'COUNTEROFFER' ||
              item.type === 'DUEL_RESOLVED';

            return (
              <TouchableOpacity
                style={[styles.itemCard, item.is_read === 0 && styles.itemUnread]}
                onPress={() => onSelectNotification(item)}
                activeOpacity={0.8}
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
                      <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={() => onSelectNotification(item)}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.actionBtnText}>
                          {item.type === 'CHALLENGE_RECEIVED'
                            ? 'Review Challenge'
                            : item.type === 'COUNTEROFFER'
                            ? 'Review Counter'
                            : 'View Receipt'}
                        </Text>
                        <Icon name="arrow-right" size={12} color="#000000" />
                      </TouchableOpacity>
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
              tintColor={colors.solanaGreen}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="bell"
              title="Inbox Zero"
              subtitle={
                filter === 'ACTION_REQUIRED'
                  ? 'No actions required right now. You are all caught up!'
                  : 'No activity yet. Challenges, duels, and receipts will appear here.'
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
  header: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceLight,
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceLight,
  },
  filterChipActive: {
    backgroundColor: colors.solanaGreen,
  },
  filterText: {
    ...typography.captionBold,
    color: colors.textSecondary,
  },
  filterTextActive: {
    color: '#000000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: spacing.md,
  },
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
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  itemContent: {
    flex: 1,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  itemTitle: {
    ...typography.bodyBold,
    color: colors.textPrimary,
  },
  itemDate: {
    ...typography.caption,
    color: colors.textMuted,
  },
  itemMessage: {
    ...typography.bodyMuted,
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  actionRow: {
    marginTop: spacing.sm,
    flexDirection: 'row',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.solanaGreen,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    gap: 4,
  },
  actionBtnText: {
    ...typography.captionBold,
    color: '#000000',
    fontSize: 11,
  },
});

export default ActivityScreen;
