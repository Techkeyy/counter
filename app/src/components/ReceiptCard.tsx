import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Share } from 'react-native';
import { Receipt } from '../types';
import { colors, typography, spacing } from '../theme';

interface ReceiptCardProps {
  receipt: Receipt;
  onPress?: (receipt: Receipt) => void;
}

export const ReceiptCard: React.FC<ReceiptCardProps> = ({ receipt, onPress }) => {
  const handleShare = async () => {
    const deepLink = `counter://receipt/${receipt.id}`;
    const shareMessage = `⚔️ Official Counter Duel Receipt\n🏆 Winner: ${receipt.winner_wallet.slice(0, 6)}...\n💰 Pool: $${receipt.total_pool} cUSD\n📜 Proof: ${receipt.resolution_summary}\n🔗 View on Counter: ${deepLink}`;
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
          <Text style={styles.trophy}>🏆</Text>
          <Text style={styles.headerTitle}>SETTLED RECEIPT</Text>
        </View>
        <TouchableOpacity style={styles.shareButton} onPress={handleShare} activeOpacity={0.8}>
          <Text style={styles.shareText}>📤 SHARE</Text>
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
          <Text style={styles.monoValue}>{receipt.winner_wallet.slice(0, 8)}...{receipt.winner_wallet.slice(-8)}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Devnet Signature:</Text>
          <Text style={styles.sigValue}>{formatSig(receipt.onchain_signature)}</Text>
        </View>
      </View>

      {/* Footer Verified Seal */}
      <View style={styles.footer}>
        <Text style={styles.sealText}>🔒 DETERMINISTIC ORACLE PROOF RECORDED</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
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
  trophy: {
    fontSize: 16,
  },
  headerTitle: {
    color: colors.solanaGreen,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
  },
  shareButton: {
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  shareText: {
    color: colors.textPrimary,
    fontSize: 11,
    fontWeight: '700',
  },
  body: {
    gap: 8,
    marginBottom: spacing.md,
  },
  summary: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    marginBottom: 4,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  infoValue: {
    color: colors.solanaGreen,
    fontSize: 13,
    fontWeight: '800',
  },
  monoValue: {
    color: colors.textPrimary,
    fontFamily: 'monospace',
    fontSize: 11,
  },
  sigValue: {
    color: colors.solanaPurple,
    fontFamily: 'monospace',
    fontSize: 11,
  },
  footer: {
    alignItems: 'center',
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  sealText: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
