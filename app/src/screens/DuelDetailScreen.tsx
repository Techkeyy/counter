import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Share,
} from 'react-native';
import { PublicKey } from '@solana/web3.js';
import { Duel, Position } from '../types';
import { BackModal } from '../components/BackModal';
import { colors, spacing, touchMin } from '../theme';
import { api, PRODUCTION_WEB_URL } from '../api';
import { Icon } from '../components/Icon';
import { getConnection } from '../wallet';
import { describeCriteria, formatDeadline } from '../utils/criteria';
import { formatWalletShort } from '../utils/identity';
import {
  ChainAccounts,
  buildInitializeDuelIx,
  buildVaultAtaCreateIxIfNeeded,
  buildClaimPayoutIx,
  mwaSignSendConfirm,
} from '../chain';

interface DuelDetailScreenProps {
  duelId: string;
  userWallet: string | null;
  onBack: () => void;
  onViewReceipt: (receiptId: string) => void;
}

export const DuelDetailScreen: React.FC<DuelDetailScreenProps> = ({
  duelId,
  userWallet,
  onBack,
  onViewReceipt,
}) => {
  const [duel, setDuel] = useState<Duel | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showProofDetails, setShowProofDetails] = useState(false);

  // Backer Modal
  const [backModalVisible, setBackModalVisible] = useState(false);
  const [backSide, setBackSide] = useState<1 | 2>(1);

  const loadDuelData = async () => {
    try {
      const data = await api.getDuel(duelId);
      setDuel(data);
      setPositions(data.positions || []);
      setLoadError(null);
    } catch (err: any) {
      console.warn('Failed to load duel:', err);
      setLoadError(err?.message || 'Duel not found');
    } finally {
      setLoading(false);
    }
  };

  const myPosition: Position | null =
    (userWallet && positions.find((p) => p.user_wallet === userWallet)) || null;

  const handleInitialize = async () => {
    if (!userWallet) {
      setMessage('Connect a Solana wallet first (MWA) to initialize.');
      return;
    }
    setInitializing(true);
    setMessage(null);
    try {
      setMessage('Fetching canonical duel accounts…');
      const acct = (await api.getChainAccounts(duelId, userWallet)) as ChainAccounts;
      if (acct.chainStatus === 'INITIALIZED') {
        throw new Error('Duel is already initialized on-chain.');
      }
      const payer = new PublicKey(userWallet);
      const conn = getConnection();
      const vaultAtaInfo = await conn.getAccountInfo(new PublicKey(acct.vaultAta));

      setMessage('Approve initialization in your wallet…');
      const ixs = [];
      const vaultAtaIx = buildVaultAtaCreateIxIfNeeded(
        payer,
        new PublicKey(acct.vaultPda),
        vaultAtaInfo !== null
      );
      if (vaultAtaIx) ixs.push(vaultAtaIx);
      ixs.push(buildInitializeDuelIx(acct, payer));

      setMessage('Sending to Devnet…');
      const signature = await mwaSignSendConfirm(ixs, payer);

      setMessage('Verifying on-chain initialization…');
      await api.initOnChainDuel(duelId, signature);

      setMessage(`Initialized on-chain: ${signature.slice(0, 8)}…`);
      await loadDuelData();
    } catch (err: any) {
      setMessage(`Initialization failed: ${err.message}`);
    } finally {
      setInitializing(false);
    }
  };

  const handleClaim = async () => {
    if (!userWallet) {
      setMessage('Connect your wallet to claim.');
      return;
    }
    setClaiming(true);
    setMessage(null);
    try {
      setMessage('Fetching canonical duel accounts…');
      const acct = (await api.getChainAccounts(duelId, userWallet)) as ChainAccounts;
      const user = new PublicKey(userWallet);

      setMessage('Approve the claim in your wallet…');
      const signature = await mwaSignSendConfirm([buildClaimPayoutIx(acct, user)], user);

      setMessage('Verifying on-chain payout…');
      const res = await api.claimDuel(duelId, signature);

      setMessage(
        `Claimed ${res.payoutUsd !== null ? `$${Number(res.payoutUsd).toFixed(2)}` : 'payout'} cUSD: ${signature.slice(0, 8)}…`
      );
      await loadDuelData();
    } catch (err: any) {
      setMessage(`Claim failed: ${err.message}`);
    } finally {
      setClaiming(false);
    }
  };

  useEffect(() => {
    loadDuelData();
  }, [duelId]);

  const handleResolve = async () => {
    setResolving(true);
    setMessage(null);
    try {
      const res = await api.resolveDuel(duelId);
      if (res.success) {
        setMessage(`Settled! Winner: ${res.winnerWallet.slice(0, 6)}...`);
        await loadDuelData();
      } else {
        setMessage(`Resolution error: ${res.error}`);
      }
    } catch (err: any) {
      setMessage(`Settlement failed: ${err.message}`);
    } finally {
      setResolving(false);
    }
  };

  const handleShare = async () => {
    const link = `${PRODUCTION_WEB_URL}/d/${duel?.share_slug || duelId}`;
    try {
      await Share.share({
        message: `1v1 Duel on Counter: "${duel?.proposition_a}" vs "${duel?.proposition_b}". Back your side: ${link}`,
        url: link,
      });
    } catch (e) {}
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.solanaPurple} />
        <Text style={styles.loadingText}>Loading Duel Escrow & State...</Text>
      </View>
    );
  }

  if (!duel) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Duel not found{loadError ? `: ${loadError}` : ''}.</Text>
        <TouchableOpacity
          onPress={onBack}
          style={styles.backBtn}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Icon name="chevron-left" size={20} color={colors.textPrimary} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const poolA = Number(duel.side_a_total) || 0;
  const poolB = Number(duel.side_b_total) || 0;
  const totalPool = poolA + poolB;
  const oddsA = poolA > 0 ? (totalPool / poolA).toFixed(2) : '2.00';
  const oddsB = poolB > 0 ? (totalPool / poolB).toFixed(2) : '2.00';
  const isResolved = duel.status.startsWith('RESOLVED');
  const chainStatus = duel.chain_status || 'UNINITIALIZED';
  const isInitialized = chainStatus === 'INITIALIZED';
  const isCaptain =
    !!userWallet &&
    (userWallet === duel.captain_a_wallet || userWallet === duel.captain_b_wallet);
  const canClaim =
    isResolved &&
    !!myPosition &&
    myPosition.side === duel.winning_side &&
    !myPosition.claimed;
  const isLoser =
    isResolved && !!myPosition && myPosition.side !== duel.winning_side;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={onBack}
          style={styles.backBtn}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Icon name="chevron-left" size={20} color={colors.textPrimary} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.categoryTag}>{duel.category}</Text>
        <TouchableOpacity
          onPress={handleShare}
          style={styles.shareBtn}
          accessibilityLabel="Share duel"
          accessibilityRole="button"
        >
          <Icon name="share-2" size={18} color={colors.textPrimary} />
          <Text style={styles.shareText}>Share</Text>
        </TouchableOpacity>
      </View>

      {/* Matchup Header */}
      <View style={styles.card}>
        <View style={styles.statusRow}>
          <Text style={styles.duelIdText}>DUEL #{duel.id.slice(0, 8)}</Text>
          <View style={[styles.statusBadge, isResolved && styles.statusResolved]}>
            <Text style={styles.statusBadgeText}>{duel.status.replace('_', ' ')}</Text>
          </View>
        </View>

        <Text style={styles.mainTitle}>{duel.proposition_a} vs {duel.proposition_b}</Text>

        {/* Dynamic Odds Comparison */}
        <View style={styles.oddsBox}>
          <View style={styles.sideBlock}>
            <Text style={[styles.sideName, { color: colors.sideA }]}>
              {duel.captain_a_name || 'Captain A'}
            </Text>
            <Text style={[styles.multiplier, { color: colors.sideA }]}>{oddsA}x</Text>
            <Text style={styles.sidePool}>${poolA} cUSD</Text>
          </View>

          <View style={styles.vsCenter}>
            <Text style={styles.vsLabel}>TOTAL POOL</Text>
            <Text style={styles.totalPoolAmount}>${totalPool} cUSD</Text>
          </View>

          <View style={styles.sideBlock}>
            <Text style={[styles.sideName, { color: colors.sideB }]}>
              {duel.captain_b_name || 'Captain B'}
            </Text>
            <Text style={[styles.multiplier, { color: colors.sideB }]}>{oddsB}x</Text>
            <Text style={styles.sidePool}>${poolB} cUSD</Text>
          </View>
        </View>

        {/* Backing CTA buttons */}
        {!isResolved && (
          <View style={styles.ctaRow}>
            <TouchableOpacity
              style={[styles.ctaBtn, { backgroundColor: colors.sideA }]}
              onPress={() => {
                setBackSide(1);
                setBackModalVisible(true);
              }}
            >
              <Text style={styles.ctaBtnText}>+ Back Side A</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.ctaBtn, { backgroundColor: colors.sideB }]}
              onPress={() => {
                setBackSide(2);
                setBackModalVisible(true);
              }}
            >
              <Text style={styles.ctaBtnText}>+ Back Side B</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Deciding evidence + deadline (exact terms before money) */}
      <View style={styles.section}>
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Decided by</Text>
          </View>
          <Text style={styles.criteriaText}>
            {describeCriteria(duel.source_type || duel.category, duel.source_config)}
          </Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Staking closes</Text>
            <Text style={styles.infoValue}>{formatDeadline(duel.cutoff_ts)}</Text>
          </View>
        </View>
      </View>

      {/* Chain proof: only verifiable content after initialization */}
      {isInitialized ? (
      <View style={styles.section}>
        <TouchableOpacity
          style={styles.proofHeader}
          onPress={() => setShowProofDetails(!showProofDetails)}
          activeOpacity={0.8}
          accessibilityLabel={showProofDetails ? 'Hide chain proof' : 'View chain proof'}
          accessibilityRole="button"
        >
          <View style={styles.proofHeaderLeft}>
            <Icon name="shield-check" size={16} color={colors.success} />
            <Text style={styles.proofHeaderText}>Verified on Solana</Text>
          </View>
          <View style={styles.proofHeaderRight}>
            <Text style={styles.proofToggleText}>
              {showProofDetails ? 'Hide proof' : 'View proof'}
            </Text>
            <Icon
              name={showProofDetails ? 'chevron-down' : 'chevron-right'}
              size={14}
              color={colors.textSecondary}
            />
          </View>
        </TouchableOpacity>

        {showProofDetails && (
          <View style={[styles.infoCard, { marginTop: spacing.sm }]}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Program ID:</Text>
              <Text style={styles.infoMono}>52Qgq...NmT</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Duel PDA:</Text>
              <Text style={styles.infoMono}>
                {duel.onchain_duel_pda ? `${duel.onchain_duel_pda.slice(0, 8)}...` : 'Derived on Devnet'}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Vault PDA:</Text>
              <Text style={styles.infoMono}>
                {duel.onchain_vault_pda ? `${duel.onchain_vault_pda.slice(0, 8)}...` : 'Vault PDA active'}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Resolver Engine:</Text>
              <Text style={styles.infoValue}>{duel.source_type} Deterministic Oracle</Text>
            </View>
          </View>
        )}
      </View>
      ) : (
        <View style={styles.pendingProof}>
          <Icon name="clock" size={16} color={colors.textMuted} />
          <Text style={styles.pendingProofText}>
            Chain proof appears here after a captain initializes this duel on Solana.
          </Text>
        </View>
      )}

      {message && (
        <View style={styles.messageBox}>
          <Text style={styles.messageText}>{message}</Text>
        </View>
      )}

      {/* Authoritative chain binding state — never implied, always shown */}
      <View style={styles.section}>
        <View style={[styles.chainBadge, isInitialized && styles.chainBadgeLive]}>
          <Text style={styles.chainBadgeText}>
            {isInitialized
              ? `ON-CHAIN ${duel.init_tx_signature ? `· ${duel.init_tx_signature.slice(0, 8)}…` : ''}`
              : 'PENDING ON-CHAIN INITIALIZATION'}
          </Text>
        </View>
        {!isInitialized && (
          <Text style={styles.chainHint}>
            Stakes, settlement and claims unlock once a captain binds this duel to the Solana program.
          </Text>
        )}
      </View>

      {/* Captain-only on-chain initialization */}
      {!isInitialized && isCaptain && (
        <TouchableOpacity
          style={styles.initBtn}
          onPress={handleInitialize}
          disabled={initializing}
          activeOpacity={0.8}
        >
          {initializing ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.initBtnText}>Initialize On-Chain (Captain)</Text>
          )}
        </TouchableOpacity>
      )}

      {/* Winner claim (MWA-signed ClaimPayout, backend-verified) */}
      {canClaim && (
        <TouchableOpacity
          style={styles.claimBtn}
          onPress={handleClaim}
          disabled={claiming}
          activeOpacity={0.8}
        >
          {claiming ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.claimBtnText}>
              Claim ${Number(myPosition!.stake_amount).toFixed(2)} + Winnings
            </Text>
          )}
        </TouchableOpacity>
      )}
      {isResolved && myPosition && !!myPosition.claimed && (
        <View style={styles.messageBox}>
          <Text style={styles.messageText}>
            Already claimed{myPosition.claim_tx ? `: ${myPosition.claim_tx.slice(0, 8)}…` : ''}.
          </Text>
        </View>
      )}
      {isLoser && (
        <View style={styles.messageBox}>
          <Text style={styles.messageText}>
            Your side lost this duel. Stakes settled to the winners — no claim available.
          </Text>
        </View>
      )}

      {/* Settlement: only offered when it can succeed */}
      {isInitialized && !isResolved && (
        <TouchableOpacity
          style={styles.resolveBtn}
          onPress={handleResolve}
          disabled={resolving}
          activeOpacity={0.8}
          accessibilityLabel="Resolve duel with oracle data"
          accessibilityRole="button"
        >
          {resolving ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.resolveBtnText}>Resolve duel</Text>
          )}
        </TouchableOpacity>
      )}

      {/* View Settled Receipt if Resolved */}
      {isResolved && (
        <TouchableOpacity
          style={styles.receiptBtn}
          onPress={() => onViewReceipt(`receipt_${duel.id}`)}
          activeOpacity={0.8}
        >
          <Text style={styles.receiptBtnText}>View Settlement Receipt</Text>
        </TouchableOpacity>
      )}

      {/* Outside Backers List */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Backers ({positions.length})</Text>
        {positions.map((pos) => (
          <View key={pos.id} style={styles.posCard}>
            <View style={styles.posHeader}>
              <Text style={styles.posWallet}>{pos.user_wallet.slice(0, 8)}...</Text>
              <Text style={[styles.posSide, pos.side === 1 ? { color: colors.sideA } : { color: colors.sideB }]}>
                {pos.side === 1 ? 'Side A' : 'Side B'}
              </Text>
            </View>
            <Text style={styles.posAmount}>${pos.stake_amount} cUSD Staked</Text>
          </View>
        ))}
      </View>

      <BackModal
        visible={backModalVisible}
        duel={duel}
        side={backSide}
        userWallet={userWallet}
        onClose={() => setBackModalVisible(false)}
        onStakeRecorded={loadDuelData}
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: 60,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minHeight: touchMin,
    paddingHorizontal: spacing.sm,
  },
  backText: {
    color: colors.brandSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  categoryTag: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '800',
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: touchMin,
    paddingHorizontal: spacing.sm,
  },
  shareText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: spacing.xl,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  duelIdText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
  },
  statusBadge: {
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusResolved: {
    backgroundColor: 'rgba(20, 241, 149, 0.2)',
  },
  statusBadgeText: {
    color: colors.textPrimary,
    fontSize: 10,
    fontWeight: '800',
  },
  mainTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 24,
    marginBottom: spacing.lg,
  },
  oddsBox: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceLight,
    borderRadius: 16,
    padding: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  sideBlock: {
    flex: 1,
    alignItems: 'center',
  },
  sideName: {
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 2,
  },
  multiplier: {
    fontSize: 22,
    fontWeight: '900',
  },
  sidePool: {
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  vsCenter: {
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.cardBorder,
  },
  vsLabel: {
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: '800',
  },
  totalPoolAmount: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '900',
  },
  ctaRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  ctaBtn: {
    flex: 1,
    minHeight: touchMin + 4,
    justifyContent: 'center',
    borderRadius: 12,
    alignItems: 'center',
  },
  ctaBtnText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '800',
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: spacing.md,
  },
  proofHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  proofHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  proofHeaderText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  proofHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  proofToggleText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.md,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  infoLabel: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  infoMono: {
    color: colors.textPrimary,
    fontFamily: 'monospace',
    fontSize: 12,
  },
  infoValue: {
    color: colors.solanaGreen,
    fontSize: 12,
    fontWeight: '700',
  },
  criteriaText: {
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  pendingProof: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  pendingProofText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  messageBox: {
    backgroundColor: 'rgba(20, 241, 149, 0.1)',
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderLeftWidth: 3,
    borderColor: colors.solanaGreen,
  },
  messageText: {
    color: colors.solanaGreen,
    fontSize: 13,
    fontWeight: '700',
  },
  chainBadge: {
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  chainBadgeLive: {
    backgroundColor: 'rgba(20, 241, 149, 0.2)',
  },
  chainBadgeText: {
    color: colors.textPrimary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  chainHint: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: spacing.xs,
  },
  initBtn: {
    backgroundColor: colors.warning,
    minHeight: touchMin + 4,
    justifyContent: 'center',
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  initBtnText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '800',
  },
  claimBtn: {
    backgroundColor: colors.brandPrimary,
    minHeight: touchMin + 4,
    justifyContent: 'center',
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  claimBtnText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '800',
  },
  resolveBtn: {
    backgroundColor: colors.brandSecondary,
    minHeight: touchMin + 4,
    justifyContent: 'center',
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  resolveBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '800',
  },
  receiptBtn: {
    backgroundColor: colors.brandPrimary,
    minHeight: touchMin + 4,
    justifyContent: 'center',
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  receiptBtnText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '800',
  },
  posCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  posHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  posWallet: {
    color: colors.textPrimary,
    fontFamily: 'monospace',
    fontSize: 12,
  },
  posSide: {
    fontSize: 12,
    fontWeight: '800',
  },
  posAmount: {
    color: colors.textSecondary,
    fontSize: 12,
  },
});
