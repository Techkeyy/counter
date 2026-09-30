import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Share,
  Linking,
} from 'react-native';
import { Receipt } from '../types';
import { colors, typography, spacing, borderRadius, touchMin } from '../theme';
import { Icon } from '../components/Icon';
import { formatWalletShort, isRealSignature } from '../utils/identity';

interface ReceiptScreenProps {
  receipt: Receipt;
  onBack: () => void;
  onViewDuel?: (duelId: string) => void;
}

export const ReceiptScreen: React.FC<ReceiptScreenProps> = ({
  receipt,
  onBack,
  onViewDuel,
}) => {
  const winnerWallet = receipt.winner_wallet;
  const isCaptainAWinner = winnerWallet === receipt.captain_a_wallet;
  const winnerSideName = isCaptainAWinner ? 'Side A' : 'Side B';
  // Verification is real only for genuine settlement signatures. Legacy
  // history rows (simulated markers) render honestly without chain claims.
  const verified = isRealSignature(receipt.onchain_signature);

  const handleShare = async () => {
    try {
      const amount = `$${(Number(receipt.total_pool) || 0).toFixed(2)} cUSD`;
      await Share.share({
        message: verified
          ? `Counter duel receipt: ${formatWalletShort(winnerWallet)} won ${amount}. Verified on Solana: ${receipt.onchain_signature}`
          : `Counter duel result: ${formatWalletShort(winnerWallet)} won ${amount}.`,
      });
    } catch {
      // user cancelled
    }
  };

  const handleOpenExplorer = () => {
    if (verified) {
      Linking.openURL(
        `https://explorer.solana.com/tx/${receipt.onchain_signature}?cluster=devnet`
      );
    }
  };

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backButton} onPress={onBack} activeOpacity={0.8}>
          <Icon name="chevron-left" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Permanent Receipt</Text>
        <TouchableOpacity style={styles.shareButton} onPress={handleShare} activeOpacity={0.8}>
          <Icon name="share-2" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Physical Ticket Container */}
        <View style={styles.ticket}>
          {/* Ticket Header */}
          <View style={styles.ticketHeader}>
            <View style={styles.iconCircle}>
              <Icon name="trophy" size={28} color={colors.arenaBadge} />
            </View>
            <Text style={styles.ticketTitle}>Duel settled</Text>
            <Text style={styles.ticketSubtitle}>
              {verified ? 'Permanent record on Solana' : 'Outcome recorded by Counter'}
            </Text>
          </View>

          {/* Perforated Divider */}
          <View style={styles.dividerContainer}>
            <View style={styles.leftNotch} />
            <View style={styles.dashedLine} />
            <View style={styles.rightNotch} />
          </View>

          {/* Social Conflict Narrative */}
          <View style={styles.narrativeSection}>
            <Text style={styles.narrativeLabel}>THE DISPUTE</Text>
            <View style={styles.contenderRow}>
              <View style={styles.contenderCol}>
                <Text style={styles.contenderRole}>Captain A</Text>
                <Text style={styles.contenderWallet}>{formatWalletShort(receipt.captain_a_wallet)}</Text>
              </View>
              <Text style={styles.vsBadge}>VS</Text>
              <View style={[styles.contenderCol, { alignItems: 'flex-end' }]}>
                <Text style={styles.contenderRole}>Captain B</Text>
                <Text style={styles.contenderWallet}>{formatWalletShort(receipt.captain_b_wallet)}</Text>
              </View>
            </View>
          </View>

          {/* Resolution Outcome */}
          <View style={styles.outcomeSection}>
            <Text style={styles.narrativeLabel}>ACTUAL OUTCOME</Text>
            <View style={styles.outcomeBox}>
              <Text style={styles.outcomeText}>{receipt.resolution_summary}</Text>
            </View>
          </View>

          {/* Financial Breakdown Table */}
          <View style={styles.financialSection}>
            <Text style={styles.narrativeLabel}>SETTLEMENT TOTALS</Text>

            <View style={styles.row}>
              <Text style={styles.rowLabel}>Winning Side</Text>
              <Text style={[styles.rowValue, { color: colors.solanaGreen }]}>
                {winnerSideName} ({formatWalletShort(winnerWallet)})
              </Text>
            </View>

            <View style={styles.row}>
              <Text style={styles.rowLabel}>Total Escrow Settled</Text>
              <Text style={styles.rowValueHighlight}>
                ${(Number(receipt.total_pool) || 0).toFixed(2)} cUSD
              </Text>
            </View>

            <View style={styles.row}>
              <Text style={styles.rowLabel}>Settlement Date</Text>
              <Text style={styles.rowValue}>
                {new Date(receipt.created_at).toLocaleDateString([], {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </Text>
            </View>
          </View>

          {/* Proof & Verification Section */}
          <View style={styles.proofSection}>
            <Text style={styles.narrativeLabel}>Settlement evidence</Text>

            {verified ? (
              <>
                <View style={styles.chainBadgeRow}>
                  <Icon name="shield-check" size={16} color={colors.success} />
                  <Text style={styles.chainBadgeLabel}>Settled on Solana Devnet</Text>
                </View>
                <TouchableOpacity
                  style={styles.signatureBtn}
                  onPress={handleOpenExplorer}
                  activeOpacity={0.8}
                  accessibilityLabel="Open settlement transaction in explorer"
                  accessibilityRole="button"
                >
                  <View style={styles.sigInfo}>
                    <Text style={styles.sigLabel}>Transaction signature</Text>
                    <Text style={styles.sigValue} numberOfLines={1}>
                      {receipt.onchain_signature}
                    </Text>
                  </View>
                  <Icon name="external-link" size={16} color={colors.success} />
                </TouchableOpacity>
              </>
            ) : (
              <View style={styles.unverifiedBox}>
                <Icon name="clock" size={16} color={colors.textMuted} />
                <Text style={styles.unverifiedText}>
                  Recorded before on-chain verification. No settlement transaction is attached to this record.
                </Text>
              </View>
            )}
          </View>

          {/* Ticket Footer Barcode / Receipt ID */}
          <View style={styles.ticketFooter}>
            <Text style={styles.receiptIdText}>RECEIPT #{receipt.id.slice(-8).toUpperCase()}</Text>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={styles.shareButtonBig}
            onPress={handleShare}
            activeOpacity={0.8}
            accessibilityLabel="Share receipt"
            accessibilityRole="button"
          >
            <Icon name="share-2" size={18} color="#000000" />
            <Text style={styles.shareButtonBigText}>Share receipt</Text>
          </TouchableOpacity>

          {onViewDuel && (
            <TouchableOpacity
              style={styles.viewDuelButton}
              onPress={() => onViewDuel(receipt.duel_id)}
              activeOpacity={0.8}
              accessibilityLabel="View full duel"
              accessibilityRole="button"
            >
              <Text style={styles.viewDuelText}>View full duel</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceLight,
  },
  backButton: {
    minHeight: touchMin,
    minWidth: touchMin,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBarTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  shareButton: {
    minHeight: touchMin,
    minWidth: touchMin,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
  },
  ticket: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    overflow: 'hidden',
  },
  ticketHeader: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(255, 165, 2, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  ticketTitle: {
    ...typography.h2,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  ticketSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 24,
    backgroundColor: colors.surface,
    position: 'relative',
  },
  leftNotch: {
    width: 16,
    height: 24,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    backgroundColor: colors.background,
    position: 'absolute',
    left: 0,
  },
  rightNotch: {
    width: 16,
    height: 24,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    backgroundColor: colors.background,
    position: 'absolute',
    right: 0,
  },
  dashedLine: {
    flex: 1,
    marginHorizontal: 24,
    height: 1,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderStyle: 'dashed',
  },
  narrativeSection: {
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceLight,
  },
  narrativeLabel: {
    ...typography.captionBold,
    color: colors.textMuted,
    fontSize: 10,
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  contenderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  contenderCol: {
    flex: 1,
  },
  contenderRole: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  contenderWallet: {
    ...typography.bodyBold,
    color: colors.textPrimary,
    marginTop: 2,
  },
  vsBadge: {
    ...typography.captionBold,
    color: colors.textMuted,
    paddingHorizontal: spacing.md,
  },
  outcomeSection: {
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceLight,
  },
  outcomeBox: {
    backgroundColor: colors.surfaceLight,
    padding: spacing.md,
    borderRadius: borderRadius.sm,
  },
  outcomeText: {
    ...typography.bodyBold,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  financialSection: {
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceLight,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  rowLabel: {
    ...typography.bodyMuted,
    color: colors.textSecondary,
  },
  rowValue: {
    ...typography.bodyBold,
    color: colors.textPrimary,
  },
  rowValueHighlight: {
    ...typography.h3,
    color: colors.solanaGreen,
  },
  proofSection: {
    padding: spacing.lg,
  },
  chainBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  chainBadgeLabel: {
    ...typography.captionBold,
    color: colors.solanaGreen,
  },
  signatureBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceLight,
    padding: spacing.md,
    borderRadius: borderRadius.md,
  },
  sigInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  sigLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  sigValue: {
    ...typography.mono,
    color: colors.textPrimary,
    fontSize: 11,
    marginTop: 2,
  },
  unverifiedBox: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  unverifiedText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  ticketFooter: {
    padding: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  receiptIdText: {
    ...typography.mono,
    color: colors.textMuted,
    letterSpacing: 2,
  },
  actionsContainer: {
    marginTop: spacing.xl,
    gap: spacing.md,
  },
  shareButtonBig: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandPrimary,
    minHeight: touchMin + 4,
    borderRadius: borderRadius.full,
    gap: spacing.xs,
  },
  shareButtonBigText: {
    ...typography.bodyBold,
    color: '#000000',
  },
  viewDuelButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: touchMin,
  },
  viewDuelText: {
    ...typography.bodyMuted,
    color: colors.textSecondary,
  },
});

export default ReceiptScreen;
