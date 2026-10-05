import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { colors, typography, spacing, borderRadius, touchMin } from '../theme';
import { Icon } from './Icon';
import { WalletConnectionStatus } from '../wallet';

interface ConnectionHelpProps {
  status: WalletConnectionStatus;
  detail?: string | null;
  onRetry: () => void;
  busy?: boolean;
}

const HEADLINES: Record<string, { title: string; body: string }> = {
  USER_REJECTED: {
    title: 'Request declined in wallet',
    body: 'That is fine. Nothing was signed and no session was created. Try again when ready.',
  },
  NO_WALLET: {
    title: 'No compatible wallet found',
    body: 'Install a Solana Mobile-compatible wallet on this device, then retry.',
  },
  MWA_TIMEOUT: {
    title: 'Wallet did not respond in time',
    body: 'The secure connection to your wallet app stalled. Retry the connection.',
  },
  NETWORK_ERROR: {
    title: 'Network problem',
    body: 'Counter could not reach its backend. Check your connection and retry.',
  },
  AUTH_FAILED: {
    title: 'Ownership check failed',
    body: 'The wallet signature could not be verified. Retry to get a fresh sign-in.',
  },
  INTERRUPTED: {
    title: 'Connection interrupted',
    body: 'Counter can safely reconnect to your wallet. Try again when you are ready.',
  },
  WALLET_CHANGED: {
    title: 'Wallet changed',
    body: 'Return to the wallet you started with before continuing.',
  },
};

export const ConnectionHelp: React.FC<ConnectionHelpProps> = ({ status, detail, onRetry, busy }) => {
  const [showHelp, setShowHelp] = useState(false);
  const copy = HEADLINES[status] || HEADLINES.AUTH_FAILED;

  return (
    <View style={styles.container}>
      <View style={styles.iconCircle}>
        <Icon
          name={status === 'NETWORK_ERROR' ? 'wifi-off' : status === 'USER_REJECTED' ? 'x' : 'alert-circle'}
          size={28}
          color={colors.warning}
        />
      </View>
      <Text style={styles.title}>{copy.title}</Text>
      <Text style={styles.body}>{copy.body}</Text>

      <TouchableOpacity
        style={styles.retryButton}
        onPress={onRetry}
        disabled={busy}
        activeOpacity={0.8}
        accessibilityLabel="Retry wallet connection"
        accessibilityRole="button"
      >
        {busy ? (
          <ActivityIndicator size="small" color="#000000" />
        ) : (
          <Text style={styles.retryText}>Retry connection</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.helpToggle}
        onPress={() => setShowHelp((v) => !v)}
        activeOpacity={0.8}
        accessibilityLabel="Connection help"
        accessibilityRole="button"
      >
        <Icon name="info" size={16} color={colors.textSecondary} />
        <Text style={styles.helpToggleText}>{showHelp ? 'Hide help' : 'Connection help'}</Text>
      </TouchableOpacity>

      {showHelp && (
        <View style={styles.helpBox}>
          <Text style={styles.helpText}>
            Counter talks to your wallet over a secure on-device connection. If Android
            interrupts the handoff, Counter keeps the operation safe and can reconnect
            without repeating a transaction.
          </Text>
          <Text style={styles.helpText}>
            This test build uses Solana Devnet. Enable Devnet inside your wallet if it
            asks you to pick a network.
          </Text>
          {detail ? (
            <Text style={styles.detailText} numberOfLines={4}>
              {detail}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { alignItems: 'center', width: '100%' },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: { ...typography.h3, color: colors.textPrimary, textAlign: 'center', marginBottom: spacing.xs },
  body: { ...typography.bodyMuted, color: colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: spacing.lg, maxWidth: 300 },
  retryButton: {
    minHeight: touchMin,
    justifyContent: 'center',
    width: '100%',
    backgroundColor: colors.brandPrimary,
    borderRadius: borderRadius.full,
    alignItems: 'center',
  },
  retryText: { ...typography.bodyBold, color: '#000000' },
  helpToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: touchMin,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  helpToggleText: { ...typography.caption, color: colors.textSecondary, fontSize: 13 },
  helpBox: {
    width: '100%',
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  helpText: { ...typography.bodyMuted, color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  detailText: { ...typography.mono, color: colors.textMuted, fontSize: 11, marginTop: spacing.xs },
});
