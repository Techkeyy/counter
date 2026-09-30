import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, typography, spacing, borderRadius, touchMin } from '../theme';
import { Icon, IconName } from './Icon';

// Anything the fetch layer reports as a transport failure renders the
// offline variant instead of a generic error.
export function looksOffline(message?: string | null): boolean {
  if (!message) return false;
  return /network request failed|failed to fetch|offline|econn|socket|dns|unreachable|load failed|timeout/i.test(message);
}

interface EmptyStateProps {
  icon?: IconName;
  title: string;
  subtitle: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon = 'swords',
  title,
  subtitle,
  actionLabel,
  onAction,
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.iconCircle}>
        <Icon name={icon} size={32} color={colors.textSecondary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      {actionLabel && onAction && (
        <TouchableOpacity style={styles.button} onPress={onAction} activeOpacity={0.8}>
          <Text style={styles.buttonText}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  message = 'Something went wrong loading this content.',
  onRetry,
}) => {
  const offline = looksOffline(message);
  return (
    <View style={styles.container}>
      <View style={[styles.iconCircle, offline ? styles.offlineCircle : styles.errorCircle]}>
        <Icon
          name={offline ? 'wifi-off' : 'alert-circle'}
          size={32}
          color={offline ? colors.textSecondary : colors.error}
        />
      </View>
      <Text style={styles.title}>{offline ? 'You are offline' : 'Unable to load'}</Text>
      <Text style={styles.subtitle}>
        {offline
          ? 'Check your connection. Your data is safe and nothing was lost.'
          : message}
      </Text>
      {onRetry && (
        <TouchableOpacity
          style={styles.retryButton}
          onPress={onRetry}
          activeOpacity={0.8}
          accessibilityLabel={offline ? 'Retry when back online' : 'Try again'}
          accessibilityRole="button"
        >
          <Icon name="refresh-cw" size={16} color={colors.textPrimary} />
          <Text style={styles.retryButtonText}>Try again</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  errorCircle: {
    backgroundColor: 'rgba(255, 71, 87, 0.1)',
  },
  offlineCircle: {
    backgroundColor: colors.surfaceLight,
  },
  title: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.bodyMuted,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
    maxWidth: 280,
    lineHeight: 18,
  },
  button: {
    backgroundColor: colors.brandPrimary,
    paddingHorizontal: spacing.lg,
    minHeight: touchMin,
    justifyContent: 'center',
    borderRadius: borderRadius.full,
  },
  buttonText: {
    ...typography.bodyBold,
    color: '#000000',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: spacing.lg,
    minHeight: touchMin,
    borderRadius: borderRadius.full,
    gap: spacing.xs,
  },
  retryButtonText: {
    ...typography.bodyBold,
    color: colors.textPrimary,
  },
});

export default EmptyState;
