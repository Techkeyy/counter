import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { colors, spacing, borderRadius } from '../theme';

interface SkeletonProps {
  width?: number | string;
  height: number;
  borderRadius?: number;
  style?: any;
}

export const SkeletonBox: React.FC<SkeletonProps> = ({
  width = '100%',
  height,
  borderRadius: radius = borderRadius.sm,
  style,
}) => {
  const opacityAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacityAnim, {
          toValue: 0.7,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [opacityAnim]);

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height,
          borderRadius: radius,
          backgroundColor: colors.surfaceLight,
          opacity: opacityAnim,
        },
        style,
      ]}
    />
  );
};

export const SkeletonPostCard: React.FC = () => {
  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <SkeletonBox width={40} height={40} borderRadius={borderRadius.full} />
        <View style={styles.headerText}>
          <SkeletonBox width={120} height={14} borderRadius={borderRadius.xs} />
          <SkeletonBox width={80} height={12} borderRadius={borderRadius.xs} style={{ marginTop: 4 }} />
        </View>
      </View>

      {/* Body text */}
      <View style={styles.body}>
        <SkeletonBox width="90%" height={16} borderRadius={borderRadius.xs} />
        <SkeletonBox width="70%" height={16} borderRadius={borderRadius.xs} style={{ marginTop: 6 }} />
      </View>

      {/* Conflict container placeholder */}
      <View style={styles.conflictBox}>
        <SkeletonBox width="100%" height={60} borderRadius={borderRadius.md} />
      </View>

      {/* Action footer */}
      <View style={styles.footer}>
        <SkeletonBox width={60} height={20} borderRadius={borderRadius.sm} />
        <SkeletonBox width={60} height={20} borderRadius={borderRadius.sm} />
        <SkeletonBox width={60} height={20} borderRadius={borderRadius.sm} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  headerText: {
    marginLeft: spacing.sm,
  },
  body: {
    marginBottom: spacing.md,
  },
  conflictBox: {
    marginBottom: spacing.md,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing.xs,
  },
});
