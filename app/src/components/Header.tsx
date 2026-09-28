import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { colors, typography, spacing } from '../theme';

interface HeaderProps {
  wallet: string | null;
  isArenaEligible: boolean;
  onConnectWallet: () => void;
  onOpenNotifications?: () => void;
  unreadCount?: number;
}

export const Header: React.FC<HeaderProps> = ({
  wallet,
  isArenaEligible,
  onConnectWallet,
  onOpenNotifications,
  unreadCount = 0,
}) => {
  const formatWallet = (w: string) => {
    return `${w.slice(0, 4)}...${w.slice(-4)}`;
  };

  return (
    <View style={styles.container}>
      <View style={styles.brandRow}>
        <Text style={styles.logoText}>⚔️ COUNTER</Text>
        {isArenaEligible && (
          <View style={styles.arenaBadge}>
            <Text style={styles.arenaBadgeText}>⭐ SKR ARENA</Text>
          </View>
        )}
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.walletButton} onPress={onConnectWallet} activeOpacity={0.8}>
          {wallet ? (
            <View style={styles.connectedRow}>
              <View style={styles.onlineDot} />
              <Text style={styles.walletText}>{formatWallet(wallet)}</Text>
            </View>
          ) : (
            <Text style={styles.connectText}>Connect MWA</Text>
          )}
        </TouchableOpacity>

        {onOpenNotifications && (
          <TouchableOpacity style={styles.bellButton} onPress={onOpenNotifications} activeOpacity={0.8}>
            <Text style={styles.bellIcon}>🔔</Text>
            {unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>{unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  logoText: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 1.5,
    color: colors.textPrimary,
  },
  arenaBadge: {
    backgroundColor: colors.badgeBg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.arenaBadge,
  },
  arenaBadgeText: {
    color: colors.arenaBadge,
    fontSize: 10,
    fontWeight: '800',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  walletButton: {
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  connectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.solanaGreen,
  },
  walletText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  connectText: {
    color: colors.solanaPurple,
    fontSize: 12,
    fontWeight: '700',
  },
  bellButton: {
    position: 'relative',
    padding: 6,
  },
  bellIcon: {
    fontSize: 16,
  },
  unreadBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: colors.duelCrimson,
    width: 14,
    height: 14,
    borderRadius: 7,
    justifyContent: 'center',
    alignItems: 'center',
  },
  unreadText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: '800',
  },
});
