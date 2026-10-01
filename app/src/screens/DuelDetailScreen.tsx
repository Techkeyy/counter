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
import { Duel, Position, MutualVote } from '../types';
import { BackModal } from '../components/BackModal';
import { colors, typography, spacing, borderRadius, touchMin } from '../theme';
import { api, PRODUCTION_WEB_URL } from '../api';
import { Icon } from '../components/Icon';
import { getConnection } from '../wallet';
import {
  ChainAccounts,
  buildInitializeDuelIx,
  buildVaultAtaCreateIxIfNeeded,
  buildClaimPayoutIx,
  mwaSignSendConfirm,
  mwaSignMessage,
  settlementMessage,
} from '../chain';
import { describeCriteria, formatDeadline } from '../utils/criteria';
import { formatUserDisplayName, formatRelativeTime, isRealSignature } from '../utils/identity';

interface DuelDetailScreenProps {
  duelId: string;
  userWallet: string | null;
  onBack: () => void;
  onViewReceipt: (receiptId: string) => void;
  isArenaEligible?: boolean;
  skrStakedAmount?: number;
}

export const DuelDetailScreen: React.FC<DuelDetailScreenProps> = ({
  duelId,
  userWallet,
  onBack,
  onViewReceipt,
  isArenaEligible,
  skrStakedAmount,
}) => {
  const [duel, setDuel] = useState<Duel | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [mutualVotes, setMutualVotes] = useState<MutualVote[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showProof, setShowProof] = useState(false);
  const [voting, setVoting] = useState(false);
  const [publishingArena, setPublishingArena] = useState(false);
  const [arenaSkR, setArenaSkr] = useState<number | null>(null);

  const [backModalVisible, setBackModalVisible] = useState(false);
  const [backSide, setBackSide] = useState<1 | 2>(1);

  const loadDuelData = async () => {
    try {
      const data = await api.getDuel(duelId);
      setDuel(data);
      setPositions(data.positions || []);
      setMutualVotes(Array.isArray((data as any).mutualVotes) ? (data as any).mutualVotes : []);
      setLoadError(null);
    } catch (err: any) {
      setLoadError(err?.message || 'Duel not found');
    } finally {
      setLoading(false);
    }
  };

  const myPosition: Position | null =
    (userWallet && positions.find((p) => p.user_wallet === userWallet)) || null;

  const handleInitialize = async () => {
    if (!userWallet) {
      setMessage('Connect a wallet first to initialize.');
      return;
    }
    setInitializing(true);
    setMessage(null);
    try {
      setMessage('Fetching canonical duel accounts.');
      const acct = (await api.getChainAccounts(duelId, userWallet)) as ChainAccounts;
      if (acct.chainStatus === 'INITIALIZED') {
        throw new Error('Duel is already initialized on-chain.');
      }
      const payer = new PublicKey(userWallet);
      const conn = getConnection();
      const vaultAtaInfo = await conn.getAccountInfo(new PublicKey(acct.vaultAta));

      setMessage('Approve initialization in your wallet.');
      const ixs = [];
      const vaultAtaIx = buildVaultAtaCreateIxIfNeeded(
        payer,
        new PublicKey(acct.vaultPda),
        vaultAtaInfo !== null
      );
      if (vaultAtaIx) ixs.push(vaultAtaIx);
      ixs.push(buildInitializeDuelIx(acct, payer));

      setMessage('Sending to Devnet.');
      const signature = await mwaSignSendConfirm(ixs, payer);

      setMessage('Verifying on-chain initialization.');
      await api.initOnChainDuel(duelId, signature);

      setMessage(`Bound on-chain: ${signature.slice(0, 8)}.`);
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
      setMessage('Fetching canonical duel accounts.');
      const acct = (await api.getChainAccounts(duelId, userWallet)) as ChainAccounts;
      const user = new PublicKey(userWallet);

      setMessage('Approve the claim in your wallet.');
      const signature = await mwaSignSendConfirm([buildClaimPayoutIx(acct, user)], user);

      setMessage('Verifying on-chain payout.');
      const res = await api.claimDuel(duelId, signature);

      setMessage(
        `Claimed ${res.payoutUsd !== null ? `$${Number(res.payoutUsd).toFixed(2)}` : 'payout'} test cUSD.`
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

  const handleVote = async (side: 1 | 2) => {
    if (!userWallet || !duel) {
      setMessage('Connect a captain wallet to confirm a result.');
      return;
    }
    setVoting(true);
    setMessage(null);
    try {
      setMessage('Sign the result in your wallet.');
      const signature = await mwaSignMessage(
        settlementMessage(duel.id, side, Number(duel.resolution_ts) || 0),
        userWallet
      );
      setMessage('Recording your confirmation.');
      const res = await api.postMutualVote(duel.id, side, signature);
      if (res.match?.matched) {
        setMessage(`Both captains agree: Side ${res.match.winnerSide === 1 ? 'A' : 'B'}. Settle when ready.`);
      } else {
        setMessage('Confirmation recorded. Waiting for the other captain.');
      }
      await loadDuelData();
    } catch (err: any) {
      setMessage(`Confirmation failed: ${err.message}`);
    } finally {
      setVoting(false);
    }
  };

  const handlePublishArena = async () => {
    if (!userWallet) {
      setMessage('Connect a wallet first.');
      return;
    }
    setPublishingArena(true);
    setMessage(null);
    try {
      const res = await api.publishArena(duelId);
      setArenaSkr(typeof res.skrStake === 'number' ? res.skrStake : null);
      setMessage('Published to Seeker Arena.');
      await loadDuelData();
    } catch (err: any) {
      setMessage(err?.message || 'Arena publish failed.');
    } finally {
      setPublishingArena(false);
    }
  };

  const handleRecheckArena = async () => {
    if (!userWallet) return;
    setPublishingArena(true);
    try {
      const profile: any = await api.getUserProfile(userWallet);
      const u = profile?.user || profile;
      setArenaSkr(Number(u?.skr_staked_amount) || 0);
      setMessage(
        Number(u?.skr_staked_amount) > 0
          ? `Verified: ${u.skr_staked_amount} SKR staked on Mainnet.`
          : 'No active SKR stake found. Stake in your Seeker wallet first.'
      );
    } catch (err: any) {
      setMessage(err?.message || 'Could not recheck stake.');
    } finally {
      setPublishingArena(false);
    }
  };

  const handleResolve = async () => {
    setResolving(true);
    setMessage(null);
    try {
      const res = await api.resolveDuel(duelId);
      if (res.success) {
        setMessage('Settled. View the receipt for the outcome.');
        await loadDuelData();
      } else {
        setMessage(`Resolution issue: ${res.error}`);
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
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.brandPrimary} />
        <Text style={styles.centerText}>Loading duel.</Text>
      </View>
    );
  }

  if (!duel) {
    return (
      <View style={styles.center}>
        <Text style={styles.centerText}>Duel not found{loadError ? `: ${loadError}` : ''}.</Text>
        <TouchableOpacity
          onPress={onBack}
          style={styles.ghostBtn}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Text style={styles.ghostText}>Back</Text>
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
  const nameA = formatUserDisplayName({
    display_name: duel.captain_a_name,
    handle: duel.captain_a_handle,
    wallet: duel.captain_a_wallet,
  });
  const nameB = formatUserDisplayName({
    display_name: duel.captain_b_name,
    handle: duel.captain_b_handle,
    wallet: duel.captain_b_wallet,
  });
  const resolutionMode = duel.resolution_mode || 'COUNTER_VERIFIED';
  const isMutual = resolutionMode === 'MUTUAL';
  const myVote = userWallet
    ? mutualVotes.find((v) => v.captain_wallet === userWallet)
    : undefined;
  const otherVote = userWallet
    ? mutualVotes.find((v) => v.captain_wallet !== userWallet)
    : mutualVotes[0];
  const votesMatch =
    mutualVotes.length >= 2 &&
    mutualVotes.every((v) => Number(v.winner_side) === Number(mutualVotes[0].winner_side));
  const votingOpen =
    !isResolved &&
    isInitialized &&
    Date.now() / 1000 >= Number(duel.resolution_ts || 0);
  const effectiveSkr = arenaSkR !== null && arenaSkR !== undefined ? arenaSkR : skrStakedAmount || 0;

  const timeline: { label: string; detail: string }[] = [
    { label: 'Duel formed', detail: formatRelativeTime(duel.created_at) },
  ];
  if (isInitialized && duel.init_tx_signature) {
    timeline.push({ label: 'Bound on-chain', detail: `${duel.init_tx_signature.slice(0, 8)}` });
  }
  if (isResolved && duel.resolution_tx) {
    timeline.push({ label: 'Resolved', detail: `${duel.resolution_tx.slice(0, 8)}` });
  }
  if (myPosition?.claimed && myPosition.claim_tx) {
    timeline.push({ label: 'You claimed', detail: `${myPosition.claim_tx.slice(0, 8)}` });
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.topBar}>
          <TouchableOpacity
            onPress={onBack}
            style={styles.iconBtn}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <Icon name="chevron-left" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.topState}>
            {isResolved
              ? duel.status.replace(/_/g, ' ').toLowerCase()
              : isInitialized
                ? 'Live on-chain'
                : 'Forming'}
          </Text>
          <TouchableOpacity
            onPress={handleShare}
            style={styles.iconBtn}
            accessibilityLabel="Share duel"
            accessibilityRole="button"
          >
            <Icon name="share-2" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <Text style={styles.proposition}>
          {duel.proposition_a} vs {duel.proposition_b}
        </Text>
        <Text style={styles.meta}>
          {duel.category.toLowerCase()} · closes {formatDeadline(duel.cutoff_ts)}
        </Text>

        <View style={styles.sidesRow}>
          <View style={styles.sideCol}>
            <Text style={styles.sideName} numberOfLines={1}>{nameA}</Text>
            <Text style={[styles.sideOdds, { color: colors.sideA }]}>{oddsA}x</Text>
            <Text style={styles.sidePool}>${poolA.toFixed(0)} cUSD</Text>
          </View>
          <View style={styles.poolCenter}>
            <Text style={styles.poolLabel}>Pool</Text>
            <Text style={styles.poolTotal}>${totalPool.toFixed(0)}</Text>
          </View>
          <View style={[styles.sideCol, { alignItems: 'flex-end' }]}>
            <Text style={styles.sideName} numberOfLines={1}>{nameB}</Text>
            <Text style={[styles.sideOdds, { color: colors.sideB }]}>{oddsB}x</Text>
            <Text style={styles.sidePool}>${poolB.toFixed(0)} cUSD</Text>
          </View>
        </View>
        <View style={styles.splitBar}>
          <View style={[styles.segA, { flex: Math.max(totalPool > 0 ? Math.round((poolA / totalPool) * 100) : 50, 5) }]} />
          <View style={[styles.segB, { flex: 5 }]} />
        </View>

        {myPosition && (
          <View style={styles.positionRow}>
            <Icon name="wallet" size={16} color={colors.textSecondary} />
            <Text style={styles.positionText}>
              You backed {myPosition.side === 1 ? 'Side A' : 'Side B'} with $
              {Number(myPosition.stake_amount).toFixed(0)} cUSD
              {myPosition.claimed ? ' · claimed' : isResolved ? (isLoser ? ' · lost' : ' · claimable') : ''}
            </Text>
          </View>
        )}

        {message && (
          <View style={styles.messageBox}>
            <Text style={styles.messageText}>{message}</Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>How this settles</Text>
        <Text style={styles.criteriaText}>
          {describeCriteria(duel.source_type || duel.category, duel.source_config)}
        </Text>
        <View style={styles.modeRow}>
          <Icon
            name={isMutual ? 'users' : 'shield-check'}
            size={16}
            color={isMutual ? colors.brandSecondary : colors.success}
          />
          <Text style={styles.modeText}>
            {isMutual
              ? `Settle together. If no agreement${duel.mutual_deadline_ts ? ` by ${formatDeadline(duel.mutual_deadline_ts)}` : ''}, ${(duel.fallback_mode || 'REFUND') === 'REFUND' ? 'everyone is refunded' : 'Counter Verified decides'}.`
              : 'Counter Verified by the rule above.'}
          </Text>
        </View>

        {isMutual && !isResolved && (
          <View style={styles.mutualBox}>
            <Text style={styles.mutualTitle}>Captain confirmations</Text>
            {myVote ? (
              <Text style={styles.mutualLine}>
                You say Side {Number(myVote.winner_side) === 1 ? 'A' : 'B'} won.
              </Text>
            ) : null}
            {otherVote ? (
              <Text style={styles.mutualLine}>
                {otherVote.captain_wallet === duel.captain_a_wallet ? nameA : nameB} says Side{' '}
                {Number(otherVote.winner_side) === 1 ? 'A' : 'B'} won.
              </Text>
            ) : (
              <Text style={styles.mutualLine}>Awaiting the other captain.</Text>
            )}
            {votesMatch ? (
              <Text style={styles.mutualMatch}>
                Both sides agree. This result becomes final once settled on Solana.
              </Text>
            ) : null}
            {isCaptain && isInitialized && votingOpen && (
              <View style={styles.voteRow}>
                {([1, 2] as const).map((side) => (
                  <TouchableOpacity
                    key={side}
                    style={styles.voteBtn}
                    onPress={() => handleVote(side)}
                    disabled={voting}
                    activeOpacity={0.85}
                    accessibilityLabel={
                      side === 1
                        ? `Agree, ${nameA} won`
                        : `Agree, ${nameB} won`
                    }
                    accessibilityRole="button"
                  >
                    {voting ? (
                      <ActivityIndicator color="#000000" />
                    ) : (
                      <Text style={styles.voteBtnText}>
                        {side === 1 ? `${nameA} won` : `${nameB} won`}
                      </Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {isCaptain && isInitialized && !votingOpen && (
              <Text style={styles.mutualNote}>
                Confirmations open at resolution time. You can disagree freely until then.
              </Text>
            )}
            {!isCaptain && (
              <Text style={styles.mutualNote}>
                Only the two captains confirm. Backers watch the outcome here.
              </Text>
            )}
          </View>
        )}

        <Text style={styles.sectionTitle}>Timeline</Text>
        {timeline.map((t) => (
          <View key={t.label} style={styles.timelineRow}>
            <View style={styles.timelineDot} />
            <Text style={styles.timelineLabel}>{t.label}</Text>
            <Text style={styles.timelineDetail}>{t.detail}</Text>
          </View>
        ))}

        <TouchableOpacity
          style={styles.proofToggle}
          onPress={() => setShowProof((v) => !v)}
          activeOpacity={0.8}
          accessibilityLabel={showProof ? 'Hide details and proof' : 'Show details and proof'}
          accessibilityRole="button"
        >
          <Text style={styles.proofToggleText}>Details and proof</Text>
          <Icon name={showProof ? 'chevron-down' : 'chevron-right'} size={16} color={colors.textSecondary} />
        </TouchableOpacity>
        {showProof && (
          <View style={styles.proofBox}>
            <ProofRow label="Program" value="52Qgq...NmT" mono />
            <ProofRow label="Duel account" value={duel.onchain_duel_pda ? `${duel.onchain_duel_pda.slice(0, 8)}` : 'Not bound yet'} mono />
            <ProofRow label="Vault account" value={duel.onchain_vault_pda ? `${duel.onchain_vault_pda.slice(0, 8)}` : 'Not bound yet'} mono />
            <ProofRow label="Init transaction" value={duel.init_tx_signature ? `${duel.init_tx_signature.slice(0, 12)}` : 'None'} mono />
            <ProofRow label="Resolve transaction" value={duel.resolution_tx && isRealSignature(duel.resolution_tx) ? `${duel.resolution_tx.slice(0, 12)}` : 'None yet'} mono />
            <ProofRow label="Resolution source" value={`${duel.source_type || duel.category} deterministic oracle`} />
          </View>
        )}

        <Text style={styles.sectionTitle}>Seeker Arena</Text>
        <View style={styles.arenaBox}>
          <View style={styles.arenaRow}>
            <Icon
              name="trophy"
              size={16}
              color={duel.is_arena ? colors.arenaBadge : colors.textMuted}
            />
            <Text style={styles.arenaText}>
              {duel.is_arena
                ? 'Published in Seeker Arena.'
                : effectiveSkr > 0
                  ? `Your ${effectiveSkr} staked SKR unlocks Arena publishing.`
                  : 'Arena publishing needs active SKR staked on Mainnet.'}
            </Text>
          </View>
          {isCaptain && !duel.is_arena && (
            <View style={styles.arenaActions}>
              <TouchableOpacity
                style={styles.arenaBtn}
                onPress={handlePublishArena}
                disabled={publishingArena}
                activeOpacity={0.85}
                accessibilityLabel="Publish duel to Seeker Arena"
                accessibilityRole="button"
              >
                {publishingArena ? (
                  <ActivityIndicator color="#000000" />
                ) : (
                  <Text style={styles.arenaBtnText}>Publish to Seeker Arena</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.arenaRecheck}
                onPress={handleRecheckArena}
                disabled={publishingArena}
                activeOpacity={0.8}
                accessibilityLabel="Recheck SKR stake"
                accessibilityRole="button"
              >
                <Text style={styles.arenaRecheckText}>Recheck stake</Text>
              </TouchableOpacity>
            </View>
          )}
          <Text style={styles.arenaNote}>
            SKR grants access and reputation only. It never changes odds, winners, or stakes. Stake in your Seeker wallet.
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Backers ({positions.length})</Text>
        {positions.length === 0 ? (
          <Text style={styles.emptyNote}>No backers yet. Pools grow as people back a side.</Text>
        ) : (
          positions.map((pos) => (
            <View key={pos.id} style={styles.backerRow}>
              <Text style={styles.backerWallet} numberOfLines={1}>
                {formatUserDisplayName({
                  display_name: pos.display_name,
                  handle: pos.handle,
                  wallet: pos.user_wallet,
                })}
              </Text>
              <Text style={[styles.backerSide, pos.side === 1 ? { color: colors.sideA } : { color: colors.sideB }]}>
                {pos.side === 1 ? 'Side A' : 'Side B'} · ${Number(pos.stake_amount).toFixed(0)}
              </Text>
            </View>
          ))
        )}
      </ScrollView>

      {!isResolved && !isInitialized && isCaptain && (
        <View style={styles.ctaBar}>
          <TouchableOpacity
            style={styles.ctaPrimary}
            onPress={handleInitialize}
            disabled={initializing}
            activeOpacity={0.85}
            accessibilityLabel="Initialize duel on-chain"
            accessibilityRole="button"
          >
            {initializing ? (
              <ActivityIndicator color="#000000" />
            ) : (
              <Text style={styles.ctaPrimaryText}>Initialize on-chain</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
      {!isResolved && !isInitialized && !isCaptain && (
        <View style={styles.ctaBar}>
          <Text style={styles.ctaNote}>Stakes unlock once a captain binds this duel on-chain.</Text>
        </View>
      )}
      {!isResolved && isInitialized && (
        <View style={styles.ctaBar}>
          <View style={styles.ctaSplit}>
            <TouchableOpacity
              style={[styles.ctaHalf, { backgroundColor: colors.sideA }]}
              onPress={() => {
                setBackSide(1);
                setBackModalVisible(true);
              }}
              activeOpacity={0.85}
              accessibilityLabel="Back Side A"
              accessibilityRole="button"
            >
              <Text style={styles.ctaHalfText}>Back A</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.ctaHalf, { backgroundColor: colors.sideB }]}
              onPress={() => {
                setBackSide(2);
                setBackModalVisible(true);
              }}
              activeOpacity={0.85}
              accessibilityLabel="Back Side B"
              accessibilityRole="button"
            >
              <Text style={styles.ctaHalfText}>Back B</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      {canClaim && (
        <View style={styles.ctaBar}>
          <TouchableOpacity
            style={styles.ctaPrimary}
            onPress={handleClaim}
            disabled={claiming}
            activeOpacity={0.85}
            accessibilityLabel="Claim payout"
            accessibilityRole="button"
          >
            {claiming ? (
              <ActivityIndicator color="#000000" />
            ) : (
              <Text style={styles.ctaPrimaryText}>
                Claim ${Number(myPosition!.stake_amount).toFixed(0)} plus winnings
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}
      {isResolved && !canClaim && (
        <View style={styles.ctaBar}>
          <TouchableOpacity
            style={styles.ctaPrimary}
            onPress={() => onViewReceipt(`receipt_${duel.id}`)}
            activeOpacity={0.85}
            accessibilityLabel="View settlement receipt"
            accessibilityRole="button"
          >
            <Text style={styles.ctaPrimaryText}>View receipt</Text>
          </TouchableOpacity>
        </View>
      )}

      <BackModal
        visible={backModalVisible}
        duel={duel}
        side={backSide}
        userWallet={userWallet}
        onClose={() => setBackModalVisible(false)}
        onStakeRecorded={loadDuelData}
      />
    </View>
  );
};

const ProofRow: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => (
  <View style={proofStyles.row}>
    <Text style={proofStyles.label}>{label}</Text>
    <Text style={[proofStyles.value, mono && proofStyles.mono]} numberOfLines={1}>
      {value}
    </Text>
  </View>
);

const proofStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, gap: spacing.md },
  label: { ...typography.caption, color: colors.textSecondary, fontSize: 12 },
  value: { ...typography.captionBold, color: colors.textPrimary, fontSize: 12, flex: 1, textAlign: 'right' },
  mono: { fontFamily: 'monospace' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xl },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background, gap: spacing.md, padding: spacing.xl },
  centerText: { color: colors.textSecondary, fontSize: 14, textAlign: 'center' },
  ghostBtn: {
    minHeight: touchMin, paddingHorizontal: spacing.xl, justifyContent: 'center',
    borderRadius: borderRadius.full, borderWidth: 1, borderColor: colors.cardBorder,
  },
  ghostText: { ...typography.bodyBold, color: colors.textPrimary },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  iconBtn: { minHeight: touchMin, minWidth: touchMin, justifyContent: 'center', alignItems: 'center' },
  topState: { ...typography.captionBold, color: colors.textSecondary, fontSize: 13 },
  proposition: { ...typography.h1, color: colors.textPrimary, fontSize: 22, lineHeight: 30, marginBottom: 4 },
  meta: { ...typography.caption, color: colors.textMuted, fontSize: 12, marginBottom: spacing.lg },
  sidesRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  sideCol: { flex: 1 },
  sideName: { ...typography.bodyBold, color: colors.textPrimary, fontSize: 15, marginBottom: 2 },
  sideOdds: { fontSize: 22, fontWeight: '800' },
  sidePool: { ...typography.caption, color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  poolCenter: { alignItems: 'center', paddingHorizontal: spacing.md },
  poolLabel: { ...typography.caption, color: colors.textMuted, fontSize: 11 },
  poolTotal: { fontSize: 16, fontWeight: '800', color: colors.textPrimary },
  splitBar: {
    flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden',
    backgroundColor: colors.surface, marginBottom: spacing.lg,
  },
  segA: { backgroundColor: colors.sideA },
  segB: { backgroundColor: colors.sideB },
  positionRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface, borderRadius: borderRadius.md,
    padding: spacing.md, marginBottom: spacing.lg,
  },
  positionText: { ...typography.body, color: colors.textPrimary, fontSize: 14, flex: 1 },
  messageBox: {
    backgroundColor: colors.surface, borderRadius: borderRadius.md,
    padding: spacing.md, marginBottom: spacing.lg,
    borderLeftWidth: 3, borderColor: colors.brandPrimary,
  },
  messageText: { color: colors.textPrimary, fontSize: 13, lineHeight: 19 },
  sectionTitle: { ...typography.captionBold, color: colors.textMuted, fontSize: 12, marginBottom: spacing.sm, marginTop: spacing.md },
  criteriaText: { ...typography.body, color: colors.textPrimary, fontSize: 14, lineHeight: 21, marginBottom: spacing.sm },
  modeRow: {
    flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start',
    backgroundColor: colors.surface, borderRadius: borderRadius.md,
    padding: spacing.md, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.cardBorder,
  },
  modeText: { flex: 1, color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  mutualBox: {
    backgroundColor: colors.surface, borderRadius: borderRadius.md,
    padding: spacing.md, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.cardBorder,
  },
  mutualTitle: { ...typography.captionBold, color: colors.textMuted, fontSize: 12, marginBottom: 4 },
  mutualLine: { ...typography.body, color: colors.textPrimary, fontSize: 14, marginBottom: 2 },
  mutualMatch: { ...typography.bodyBold, color: colors.success, fontSize: 13, lineHeight: 19 },
  mutualNote: { ...typography.bodyMuted, color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  voteRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  voteBtn: {
    flex: 1, minHeight: touchMin + 4, backgroundColor: colors.brandPrimary,
    borderRadius: borderRadius.full, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  voteBtnText: { ...typography.bodyBold, color: '#000000', fontSize: 13, textAlign: 'center' },
  arenaBox: {
    backgroundColor: colors.surface, borderRadius: borderRadius.md,
    padding: spacing.md, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.cardBorder,
  },
  arenaRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', marginBottom: spacing.sm },
  arenaText: { flex: 1, color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  arenaActions: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', marginBottom: spacing.sm },
  arenaBtn: {
    flex: 1, minHeight: touchMin, backgroundColor: colors.brandPrimary,
    borderRadius: borderRadius.full, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  arenaBtnText: { ...typography.bodyBold, color: '#000000', fontSize: 13 },
  arenaRecheck: { minHeight: touchMin, justifyContent: 'center', paddingHorizontal: spacing.md },
  arenaRecheckText: { color: colors.brandPrimary, fontWeight: '700', fontSize: 13 },
  arenaNote: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  timelineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6 },
  timelineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.brandPrimary },
  timelineLabel: { ...typography.body, color: colors.textPrimary, fontSize: 14, flex: 1 },
  timelineDetail: { ...typography.mono, color: colors.textMuted, fontSize: 12 },
  proofToggle: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    minHeight: touchMin, marginTop: spacing.sm,
  },
  proofToggleText: { ...typography.bodyBold, color: colors.textPrimary, fontSize: 14 },
  proofBox: {
    backgroundColor: colors.surface, borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginBottom: spacing.sm,
  },
  backerRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.surface,
  },
  backerWallet: { ...typography.mono, color: colors.textPrimary, fontSize: 13 },
  backerSide: { fontSize: 13, fontWeight: '700' },
  emptyNote: { ...typography.bodyMuted, color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  ctaBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  ctaNote: { ...typography.bodyMuted, color: colors.textSecondary, fontSize: 13, textAlign: 'center', lineHeight: 19 },
  ctaPrimary: {
    minHeight: 56, backgroundColor: colors.brandPrimary,
    borderRadius: borderRadius.full, alignItems: 'center', justifyContent: 'center',
  },
  ctaPrimaryText: { ...typography.bodyBold, color: '#000000', fontSize: 15 },
  ctaSplit: { flexDirection: 'row', gap: spacing.sm },
  ctaHalf: {
    flex: 1, minHeight: 56, borderRadius: borderRadius.full,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaHalfText: { ...typography.bodyBold, color: '#000000', fontSize: 15 },
});
