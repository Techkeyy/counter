import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Share } from 'react-native';
import { Receipt } from '../types';
import { colors, typography, spacing, borderRadius } from '../theme';
import { Icon } from './Icon';

interface ReceiptCardProps {
  receipt: Receipt;
  onPress?: (receipt: Receipt) => void;
}

export const ReceiptCard: React.FC<ReceiptCardProps> = ({ receipt, onPress }) => {
  const handleShare = async () => {
    const deepLink = `counter://receipt/${receipt.id}`;
    const shareMessage = `Official Counter Duel Receipt\nWinner: ${receipt.winner_wallet.slice(0, 6)}...\nPool: $${receipt.total_pool} cUSD\nProof: ${receipt.resolution_summary}\nView on Counter: ${deepLink}`;
    try {
      await Share.share({
        message: shareMessage,
        url: deepLink,
      });
    } catch (err) {
      console.warn('Share error:', err);
    }
  };

  const formatSig = (sig: string) => {
    return sig ? `${sig.slice(0, 8)}...${sig.slice(-8)}` : 'On-Chain Verified';
  };

  return (
    <View style={styles.card}>
      {/* Header Banner */}
      <View style={styles.header}>
        <View style={styles.badgeRow}>
          <Icon name="trophy" size={16} color={colors.solanaGreen} />
          <Text style={styles.headerTitle}>SETTLED RECEIPT</Text>
        </View>
        <TouchableOpacity style={styles.shareButton} onPress={handleShare} activeOpacity={0.8}>
          <Icon name="share-2" size={12} color="#000000" />
          <Text style={styles.shareText}>SHARE</Text>
        </TouchableOpacity>
      </View>

      {/* Main Resolution Details */}
      <View style={styles.body}>
        <Text style={styles.summary}>{receipt.resolution_summary}</Text>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Disputed Pool:</Text>
          <Text style={styles.infoValue}>${receipt.total_pool} cUSD</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Winner Wallet:</Text>
          <Text style={styles.monoValue}>
            {receipt.winner_wallet.slice(0, 8)}...{receipt.winner_wallet.slice(-8)}
          </Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Devnet Signature:</Text>
          <Text style={styles.sigValue}>{formatSig(receipt.onchain_signature)}</Text>
        </View>
      </View>

      {/* Footer Verified Seal */}
      <View style={styles.footer}>
        <Icon name="shield-check" size={14} color={colors.solanaGreen} />
        <Text style={styles.sealText}>DETERMINISTIC ORACLE PROOF RECORDED</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(20, 241, 149, 0.3)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    paddingBottom: spacing.sm,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    color: colors.solanaGreen,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.solanaGreen,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
    gap: 4,
  },
  shareText: {
    color: '#000',
    fontSize: 10,
    fontWeight: '800',
  },
  body: {
    marginBottom: spacing.md,
  },
  summary: {
    ...typography.body,
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.md,
    lineHeight: 22,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  infoLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  infoValue: {
    ...typography.bodyBold,
    color: colors.solanaGreen,
  },
  monoValue: {
    ...typography.mono,
    color: colors.textPrimary,
  },
  sigValue: {
    ...typography.mono,
    color: colors.solanaPurple,
    fontSize: 11,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceLight,
    paddingVertical: 6,
    borderRadius: borderRadius.sm,
    gap: 6,
  },
  sealText: {
    ...typography.captionBold,
    color: colors.solanaGreen,
    letterSpacing: 0.5,
  },
});

export default ReceiptCard;
