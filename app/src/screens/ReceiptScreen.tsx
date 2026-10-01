import React, { useState, useEffect } from 'react';
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
import { api } from '../api';
import { formatUserDisplayName, isRealSignature } from '../utils/identity';

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
  const [showProof, setShowProof] = useState(false);

  // Participant names + settlement mode come from the real duel record.
  const [captainAName, setCaptainAName] = useState<string | null>(null);
  const [captainBName, setCaptainBName] = useState<string | null>(null);
  const [duelMode, setDuelMode] = useState<string>('COUNTER_VERIFIED');
  const [confirmations, setConfirmations] = useState<any[]>([]);
  useEffect(() => {
    let cancelled = false;
    setCaptainAName(null);
    setCaptainBName(null);
    setConfirmations([]);
    api
      .getDuel(receipt.duel_id)
      .then((duel: any) => {
        if (cancelled || !duel) return;
        setCaptainAName(
          formatUserDisplayName({
            display_name: duel.captain_a_name,
            handle: duel.captain_a_handle,
            wallet: receipt.captain_a_wallet,
          })
        );
        setCaptainBName(
          formatUserDisplayName({
            display_name: duel.captain_b_name,
            handle: duel.captain_b_handle,
            wallet: receipt.captain_b_wallet,
          })
        );
        setDuelMode(duel.resolution_mode || 'COUNTER_VERIFIED');
        if (Array.isArray(duel.mutualVotes)) setConfirmations(duel.mutualVotes);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [receipt.duel_id]);

  const winnerName = isCaptainAWinner ? captainAName : captainBName;

  const handleShare = async () => {
    try {
      const amount = `$${(Number(receipt.total_pool) || 0).toFixed(2)} cUSD`;
      const who = winnerName || winnerSideName;
      await Share.share({
        message: verified
          ? `Counter duel receipt: ${who} won ${amount}. Verified on Solana: ${receipt.onchain_signature}`
          : `Counter duel result: ${who} won ${amount}.`,
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
        <Text style={styles.statusLine}>Resolved</Text>
        <Text style={styles.proposition}>{receipt.resolution_summary}</Text>

        <View style={styles.winnerRow}>
          <Text style={styles.winnerLabel}>Winner</Text>
          <Text style={styles.winnerValue}>
            {winnerSideName}{winnerName ? ` · ${winnerName}` : ''}
          </Text>
        </View>

        <View style={styles.figuresRow}>
          <View style={styles.figure}>
            <Text style={styles.figureLabel}>Pool settled</Text>
            <Text style={styles.figureValue}>
              ${(Number(receipt.total_pool) || 0).toFixed(2)}
            </Text>
          </View>
          <View style={styles.figure}>
            <Text style={styles.figureLabel}>Currency</Text>
            <Text style={styles.figureValue}>test cUSD</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Participants</Text>
        <View style={styles.personRow}>
          <Text style={styles.personSide}>Side A</Text>
          <Text style={styles.personWallet}>{captainAName === null ? 'Resolving name' : captainAName}</Text>
        </View>
        <View style={styles.personRow}>
          <Text style={styles.personSide}>Side B</Text>
          <Text style={styles.personWallet}>{captainBName === null ? 'Resolving name' : captainBName}</Text>
        </View>

        <Text style={styles.sectionTitle}>Resolution</Text>
        <View style={styles.personRow}>
          <Text style={styles.personSide}>Method</Text>
          <Text style={styles.personWallet}>
            {duelMode === 'MUTUAL' ? 'Settled together' : 'Counter Verified'}
          </Text>
        </View>
        <View style={styles.personRow}>
          <Text style={styles.personSide}>Date</Text>
          <Text style={styles.personWallet}>
            {new Date(receipt.created_at).toLocaleDateString([], {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })}
          </Text>
        </View>
        <View style={styles.personRow}>
          <Text style={styles.personSide}>Source</Text>
          <Text style={styles.personWallet}>Deterministic oracle</Text>
        </View>

        <TouchableOpacity
          style={styles.proofToggle}
          onPress={() => setShowProof((v) => !v)}
          activeOpacity={0.8}
          accessibilityLabel={showProof ? 'Hide transaction proof' : 'Show transaction proof'}
          accessibilityRole="button"
        >
          <Text style={styles.proofToggleText}>Transaction proof</Text>
          <Icon name={showProof ? 'chevron-down' : 'chevron-right'} size={16} color={colors.textSecondary} />
        </TouchableOpacity>
        {showProof && (
          verified ? (
            <>
        {duelMode === 'MUTUAL' && confirmations.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Confirmed by</Text>
            {confirmations.map((c: any) => {
              const who =
                c.captain_wallet === receipt.captain_a_wallet
                  ? captainAName
                  : c.captain_wallet === receipt.captain_b_wallet
                    ? captainBName
                    : null;
              return (
                <View key={`${c.captain_wallet}`} style={styles.personRow}>
                  <Text style={styles.personSide}>
                    {(who && who !== 'Counter user' ? who : 'A captain') +
                      ` · Side ${Number(c.winner_side) === 1 ? 'A' : 'B'}`}
                  </Text>
                  <Text style={styles.personWallet}>
                    {new Date(c.updated_at || c.created_at).toLocaleString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
              );
            })}
            <Text style={styles.confirmNote}>
              Each confirmation is wallet-signed and stored with its signature. The
              settlement transaction below is the on-chain record.
            </Text>
          </>
        )}

        <TouchableOpacity
                style={styles.signatureBtn}
                onPress={handleOpenExplorer}
                activeOpacity={0.8}
                accessibilityLabel="Open settlement transaction in explorer"
                accessibilityRole="button"
              >
                <View style={styles.sigInfo}>
                  <Text style={styles.sigLabel}>Settlement transaction</Text>
                  <Text style={styles.sigValue} numberOfLines={1}>
                    {receipt.onchain_signature}
                  </Text>
                </View>
                <Icon name="external-link" size={16} color={colors.success} />
              </TouchableOpacity>
              <Text style={styles.receiptIdText}>Record {receipt.id.slice(-8).toUpperCase()}</Text>
            </>
          ) : (
            <View style={styles.unverifiedBox}>
              <Icon name="clock" size={16} color={colors.textMuted} />
              <Text style={styles.unverifiedText}>
                Recorded before on-chain verification. No settlement transaction is attached to this record.
              </Text>
            </View>
          )
        )}

        <View style={styles.actionsContainer}>
          {verified && (
            <TouchableOpacity
              style={styles.explorerButton}
              onPress={handleOpenExplorer}
              activeOpacity={0.8}
              accessibilityLabel="View on Solana explorer"
              accessibilityRole="button"
            >
              <Icon name="external-link" size={16} color={colors.brandPrimary} />
              <Text style={styles.explorerText}>View on Solana Explorer</Text>
            </TouchableOpacity>
          )}
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
  statusLine: {
    ...typography.captionBold,
    color: colors.success,
    fontSize: 13,
    marginBottom: 4,
  },
  proposition: {
    ...typography.h1,
    color: colors.textPrimary,
    fontSize: 22,
    lineHeight: 30,
    marginBottom: spacing.lg,
  },
  winnerRow: {
    marginBottom: spacing.lg,
  },
  winnerLabel: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 12,
    marginBottom: 2,
  },
  winnerValue: {
    ...typography.h2,
    color: colors.textPrimary,
    fontSize: 20,
  },
  figuresRow: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginBottom: spacing.lg,
  },
  figure: {
    flex: 1,
  },
  figureLabel: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 12,
    marginBottom: 2,
  },
  figureValue: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.success,
  },
  sectionTitle: {
    ...typography.captionBold,
    color: colors.textMuted,
    fontSize: 12,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  personRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  personSide: {
    ...typography.body,
    color: colors.textSecondary,
    fontSize: 14,
  },
  personWallet: {
    ...typography.bodyBold,
    color: colors.textPrimary,
    fontSize: 14,
  },
  confirmNote: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: spacing.sm,
  },
  proofToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: touchMin,
    marginTop: spacing.sm,
  },
  proofToggleText: {
    ...typography.bodyBold,
    color: colors.textPrimary,
    fontSize: 14,
  },
  signatureBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  sigInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  sigLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 12,
  },
  sigValue: {
    ...typography.mono,
    color: colors.textPrimary,
    fontSize: 12,
    marginTop: 2,
  },
  unverifiedBox: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  unverifiedText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  receiptIdText: {
    ...typography.mono,
    color: colors.textMuted,
    fontSize: 12,
    marginTop: spacing.sm,
  },
  actionsContainer: {
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
  explorerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: touchMin + 4,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.brandPrimary,
    gap: spacing.xs,
  },
  explorerText: {
    ...typography.bodyBold,
    color: colors.brandPrimary,
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
