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
import { colors, spacing } from '../theme';
import { api } from '../api';

interface ActivityScreenProps {
  onSelectNotification: (notif: ActivityNotification) => void;
}

export const ActivityScreen: React.FC<ActivityScreenProps> = ({
  onSelectNotification,
}) => {
  const [activities, setActivities] = useState<ActivityNotification[]>([]);
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

  const getIconForType = (type: string) => {
    switch (type) {
      case 'CHALLENGE_RECEIVED': return '⚔️';
      case 'COUNTEROFFER': return '🔄';
      case 'DUEL_STARTED': return '🔥';
      case 'DUEL_RESOLVED': return '🏆';
      case 'BACKER_JOINED': return '💰';
      default: return '🔔';
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🔔 ACTIVITY & CHALLENGE INBOX</Text>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.solanaPurple} />
        </View>
      ) : (
        <FlatList
          data={activities}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.itemCard, item.is_read === 0 && styles.itemUnread]}
              onPress={() => onSelectNotification(item)}
              activeOpacity={0.8}
            >
              <Text style={styles.itemIcon}>{getIconForType(item.type)}</Text>
              <View style={styles.itemContent}>
                <Text style={styles.itemTitle}>{item.title}</Text>
                <Text style={styles.itemMessage}>{item.message}</Text>
                <Text style={styles.itemDate}>
                  {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            </TouchableOpacity>
          )}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.solanaPurple}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>📭</Text>
              <Text style={styles.emptyTitle}>Inbox Zero</Text>
              <Text style={styles.emptySubtitle}>
                No pending challenges or duel updates.
              </Text>
            </View>
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
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1,
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
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: 14,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: 'center',
    gap: spacing.md,
  },
  itemUnread: {
    borderColor: colors.solanaPurple,
    backgroundColor: 'rgba(153, 69, 255, 0.05)',
  },
  itemIcon: {
    fontSize: 22,
  },
  itemContent: {
    flex: 1,
    gap: 2,
  },
  itemTitle: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  itemMessage: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
  },
  itemDate: {
    color: colors.textMuted,
    fontSize: 10,
    marginTop: 2,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 8,
  },
  emptyIcon: {
    fontSize: 32,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  emptySubtitle: {
    color: colors.textMuted,
    fontSize: 12,
  },
});
