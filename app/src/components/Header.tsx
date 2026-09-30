import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { colors, typography, spacing, borderRadius, touchMin } from '../theme';
import { Icon } from './Icon';
import { WalletConnectionStatus } from '../wallet';

interface HeaderProps {
  wallet: string | null;
  connectionStatus: WalletConnectionStatus;
  onConnectWallet: () => void;
  onOpenActivity?: () => void;
  onComposeTake?: () => void;
}

function shortWallet(w: string): string {
  return `${w.slice(0, 4)}...${w.slice(-4)}`;
}

export const Header: React.FC<HeaderProps> = ({
  wallet,
  connectionStatus,
  onConnectWallet,
  onOpenActivity,
  onComposeTake,
}) => {
  const busy = connectionStatus === 'CONNECTING' || connectionStatus === 'WAITING_FOR_WALLET' || connectionStatus === 'VERIFYING';
  const walletLabel =
    connectionStatus === 'CONNECTED' && wallet
      ? shortWallet(wallet)
      : connectionStatus === 'CONNECTING'
        ? 'Connecting'
        : connectionStatus === 'WAITING_FOR_WALLET'
          ? 'Opening wallet'
          : connectionStatus === 'VERIFYING'
            ? 'Verifying'
            : 'Connect';

  return (
    <View style={styles.container}>
      <View style={styles.brandRow}>
        <Icon name="swords" size={22} color={colors.brandPrimary} accessibilityLabel="Counter home" />
        <Text style={styles.logoText}>COUNTER</Text>
        <View style={styles.devnetBadge} accessibilityLabel="Test build on Solana Devnet">
          <Text style={styles.devnetText}>Test build · Solana Devnet</Text>
        </View>
      </View>

      <View style={styles.actionsRow}>
        {onComposeTake && (
          <TouchableOpacity
            style={styles.composeButton}
            onPress={onComposeTake}
            activeOpacity={0.8}
            accessibilityLabel="Post a take"
            accessibilityRole="button"
          >
            <Icon name="plus" size={20} color="#000000" />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.walletButton}
          onPress={onConnectWallet}
          activeOpacity={0.8}
          disabled={busy}
          accessibilityLabel={wallet ? `Wallet ${shortWallet(wallet)}` : 'Connect Solana wallet'}
          accessibilityRole="button"
        >
          {busy ? (
            <ActivityIndicator size="small" color={colors.brandPrimary} />
          ) : wallet ? (
            <View style={styles.connectedRow}>
              <View style={styles.onlineDot} />
              <Text style={styles.walletText}>{walletLabel}</Text>
            </View>
          ) : (
            <View style={styles.connectedRow}>
              <Icon name="wallet" size={16} color={colors.brandPrimary} />
              <Text style={styles.connectText}>{walletLabel}</Text>
            </View>
          )}
        </TouchableOpacity>

        {onOpenActivity && (
          <TouchableOpacity
            style={styles.iconButton}
            onPress={onOpenActivity}
            activeOpacity={0.8}
            accessibilityLabel="Open activity"
            accessibilityRole="button"
          >
            <Icon name="bell" size={20} color={colors.textPrimary} />
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
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  logoText: {
    ...typography.h3,
    fontWeight: '900',
    letterSpacing: 1.5,
    color: colors.textPrimary,
  },
  devnetBadge: {
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  devnetText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 11,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  composeButton: {
    width: touchMin,
    height: touchMin,
    borderRadius: touchMin / 2,
    backgroundColor: colors.brandPrimary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  walletButton: {
    minHeight: touchMin,
    justifyContent: 'center',
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
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
    backgroundColor: colors.brandPrimary,
  },
  walletText: {
    ...typography.mono,
    color: colors.textPrimary,
    fontSize: 13,
  },
  connectText: {
    ...typography.bodyBold,
    color: colors.brandPrimary,
    fontSize: 13,
  },
  iconButton: {
    width: touchMin,
    height: touchMin,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: touchMin / 2,
  },
});

export default Header;
