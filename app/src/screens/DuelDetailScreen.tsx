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
import { formatDeadline } from '../utils/criteria';
import { formatUserDisplayName, formatRelativeTime, isRealSignature } from '../utils/identity';
import { isWalletCancellation, WalletFlowError, walletStage } from '../diagnostics';

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
  const [mutualVotes, setMutualVotes] = useState<MutualVote[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [pendingInitializationSignature, setPendingInitializationSignature] = useState<string | null>(null);
  const [initializationRecovery, setInitializationRecovery] = useState<'RETRY' | 'CHECK_STATUS' | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showProof, setShowProof] = useState(false);
  const [voting, setVoting] = useState(false);

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
    setPendingInitializationSignature(null);
    setInitializationRecovery(null);
    walletStage('DUEL_INIT', 'START');
    let backendVerifyStarted = false;
    try {
      setMessage('Preparing this Duel.');
      const acct = (await api.getChainAccounts(duelId, userWallet)) as ChainAccounts;
      walletStage('DUEL_INIT', 'CHAIN_ACCOUNTS_OK');
      if (acct.chainStatus === 'INITIALIZED') {
        throw new Error('Duel is already initialized on-chain.');
      }
      const payer = new PublicKey(userWallet);
      const conn = getConnection();
      const vaultAtaInfo = await conn.getAccountInfo(new PublicKey(acct.vaultAta));

      setMessage('Phantom will open for approval.');
      const ixs = [];
      const vaultAtaIx = buildVaultAtaCreateIxIfNeeded(
        payer,
        new PublicKey(acct.vaultPda),
        vaultAtaInfo !== null
      );
      if (vaultAtaIx) ixs.push(vaultAtaIx);
      ixs.push(buildInitializeDuelIx(acct, payer));

      await new Promise((resolve) => setTimeout(resolve, 250));
      setMessage('Waiting for wallet approval…');
      const signature = await mwaSignSendConfirm(ixs, payer, undefined, 'DUEL_INIT');

      setMessage('Creating Duel on Solana…');
      backendVerifyStarted = true;
      walletStage('DUEL_INIT', 'BACKEND_VERIFY_START');
      await api.initOnChainDuel(duelId, signature);
      walletStage('DUEL_INIT', 'BACKEND_VERIFY_OK');
      walletStage('DUEL_INIT', 'UI_SUCCESS');

      setMessage('Duel ready');
      await loadDuelData();
    } catch (err: any) {
      if (backendVerifyStarted) walletStage('DUEL_INIT', 'BACKEND_VERIFY_FAILED');
      if (isWalletCancellation(err)) {
        setMessage('Approval cancelled. Nothing was changed.');
        setInitializationRecovery(null);
      } else if (err instanceof WalletFlowError) {
        if (err.signature) setPendingInitializationSignature(err.signature);
        if (err.kind === 'CONFIRMATION_FAILED' || err.signature) {
          setMessage('Transaction submitted but not confirmed yet.');
          setInitializationRecovery('CHECK_STATUS');
        } else if (err.kind === 'NOT_SUBMITTED') {
          setMessage("Your wallet approved, but the transaction wasn't submitted.");
          setInitializationRecovery('RETRY');
        } else {
          setMessage("Couldn't get the transaction from your wallet.");
          setInitializationRecovery('RETRY');
        }
      } else {
        setMessage("Couldn't create the Duel on Solana. Try again.");
        setInitializationRecovery('RETRY');
      }
    } finally {
      setInitializing(false);
    }
  };

  const handleCheckInitializationStatus = async () => {
    const signature = pendingInitializationSignature;
    if (!signature || !userWallet) {
      setMessage("Couldn't get the transaction from your wallet.");
      setInitializationRecovery('RETRY');
      return;
    }

    setInitializing(true);
    setMessage('Checking transaction status…');
    let backendVerifyStarted = false;
    try {
      const conn = getConnection();
      const result = await conn.getSignatureStatuses([signature], { searchTransactionHistory: true });
      const status = result.value[0];
      if (!status || status.err || (status.confirmationStatus !== 'confirmed' && status.confirmationStatus !== 'finalized')) {
        walletStage('DUEL_INIT', 'TX_CONFIRM_FAILED');
        setMessage('Transaction submitted but not confirmed yet.');
        setInitializationRecovery('CHECK_STATUS');
        return;
      }

      walletStage('DUEL_INIT', 'TX_CONFIRMED');
      backendVerifyStarted = true;
      walletStage('DUEL_INIT', 'BACKEND_VERIFY_START');
      await api.initOnChainDuel(duelId, signature);
      walletStage('DUEL_INIT', 'BACKEND_VERIFY_OK');
      walletStage('DUEL_INIT', 'UI_SUCCESS');
      setPendingInitializationSignature(null);
      setInitializationRecovery(null);
      setMessage('Duel ready');
      await loadDuelData();
    } catch (err: any) {
      if (backendVerifyStarted) walletStage('DUEL_INIT', 'BACKEND_VERIFY_FAILED');
      setMessage('Transaction confirmed, but Counter could not verify it yet. Check status again.');
      setInitializationRecovery('CHECK_STATUS');
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
    walletStage('CLAIM', 'START');
    let backendVerifyStarted = false;
    try {
      setMessage('Preparing your winnings.');
      const acct = (await api.getChainAccounts(duelId, userWallet)) as ChainAccounts;
      const user = new PublicKey(userWallet);

      setMessage('Phantom will open to claim your winnings.');
      await new Promise((resolve) => setTimeout(resolve, 250));
      setMessage('Waiting for wallet approval…');
      const signature = await mwaSignSendConfirm([buildClaimPayoutIx(acct, user)], user, undefined, 'CLAIM');

      setMessage('Claiming your winnings…');
      backendVerifyStarted = true;
      walletStage('CLAIM', 'BACKEND_VERIFY_START');
      await api.claimDuel(duelId, signature);
      walletStage('CLAIM', 'BACKEND_VERIFY_OK');
      walletStage('CLAIM', 'UI_SUCCESS');

      setMessage('Winnings claimed');
      await loadDuelData();
    } catch (err: any) {
      if (backendVerifyStarted) walletStage('CLAIM', 'BACKEND_VERIFY_FAILED');
      setMessage(isWalletCancellation(err) ? 'Approval cancelled. Nothing was changed.' : "Couldn't claim your winnings. Try again.");
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
    walletStage('SETTLEMENT', 'START');
    let backendVerifyStarted = false;
    try {
      setMessage('Your wallet will open to confirm your choice.');
      await new Promise((resolve) => setTimeout(resolve, 250));
      setMessage('Waiting for wallet approval…');
      const signature = await mwaSignMessage(
        settlementMessage(duel.id, side, Number(duel.resolution_ts) || 0),
        userWallet,
        'SETTLEMENT'
      );
      setMessage('Recording your choice…');
      backendVerifyStarted = true;
      walletStage('SETTLEMENT', 'BACKEND_VERIFY_START');
      const res = await api.postMutualVote(duel.id, side, signature);
      walletStage('SETTLEMENT', 'BACKEND_VERIFY_OK');
      walletStage('SETTLEMENT', 'UI_SUCCESS');
      if (res.match?.matched) {
        setMessage('Result confirmed.');
      } else {
        setMessage('Choice recorded. Waiting for @other.');
      }
      await loadDuelData();
    } catch (err: any) {
      if (backendVerifyStarted) walletStage('SETTLEMENT', 'BACKEND_VERIFY_FAILED');
      setMessage(isWalletCancellation(err) ? 'Approval cancelled. Nothing was changed.' : "Couldn't record your choice. Try again.");
    } finally {
      setVoting(false);
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
  const isMutual = duel.resolution_mode === 'MUTUAL';
  const isRefunded = duel.status === 'CANCELLED';
  const resolutionReached = Date.now() / 1000 >= Number(duel.resolution_ts || 0);
  const hasBothFunded = poolA > 0 && poolB > 0;
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
    resolutionReached;
  const humanState = isRefunded
    ? 'Refunded'
    : isResolved
      ? canClaim
        ? 'Claim winnings'
        : 'Completed'
      : !isInitialized
        ? isCaptain
          ? 'Set up this Duel'
          : 'Waiting for setup'
        : isCaptain && !myPosition
          ? 'Needs your stake'
          : !hasBothFunded
            ? 'Waiting for opponent'
            : isMutual && resolutionReached && !myVote
              ? 'Ready to settle'
              : isMutual && myVote && !votesMatch
                ? 'Waiting for @other'
                : 'Live';

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
            {humanState}
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
          Settle together · Decide: {formatDeadline(duel.resolution_ts)}
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
              You backed {myPosition.side === 1 ? nameA : nameB} with $
              {Number(myPosition.stake_amount).toFixed(0)} cUSD
              {myPosition.claimed ? ' · claimed' : isResolved ? (isLoser ? ' · lost' : ' · claimable') : ''}
            </Text>
          </View>
        )}

        {message && (
          <View style={styles.messageBox}>
            <Text style={styles.messageText}>{message}</Text>
            {initializationRecovery && (
              <TouchableOpacity
                style={styles.messageAction}
                onPress={initializationRecovery === 'CHECK_STATUS' ? handleCheckInitializationStatus : handleInitialize}
                disabled={initializing}
                activeOpacity={0.8}
                accessibilityLabel={initializationRecovery === 'CHECK_STATUS' ? 'Check status' : 'Try again'}
                accessibilityRole="button"
              >
                <Text style={styles.messageActionText}>
                  {initializationRecovery === 'CHECK_STATUS' ? 'Check status' : 'Try again'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <Text style={styles.sectionTitle}>Settle together</Text>
        <View style={styles.mutualBox}>
          <Text style={styles.mutualTitle}>What happened?</Text>
          <Text style={styles.mutualLine}>{nameA} says: {duel.proposition_a}</Text>
          <Text style={styles.mutualLine}>{nameB} says: {duel.proposition_b}</Text>
          <Text style={styles.mutualTitle}>Choose the winner</Text>
          <Text style={styles.mutualNote}>
            Your choice isn't final until both of you choose the same result.
          </Text>
          {isMutual && !isResolved && !isRefunded && (
            <>
              {myVote ? (
                <Text style={styles.mutualLine}>
                  You chose {Number(myVote.winner_side) === 1 ? nameA : nameB}.
                </Text>
              ) : null}
              {otherVote ? (
                <Text style={styles.mutualLine}>
                  {otherVote.captain_wallet === duel.captain_a_wallet ? nameA : nameB} chose{' '}
                  {Number(otherVote.winner_side) === 1 ? nameA : nameB}.
                </Text>
              ) : null}
              {votesMatch ? (
                <Text style={styles.mutualMatch}>Result confirmed.</Text>
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
                          ? `Choose ${nameA} as winner`
                          : `Choose ${nameB} as winner`
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
                <Text style={styles.mutualNote}>Choices open at the decision time.</Text>
              )}
              {!isCaptain && (
                <Text style={styles.mutualNote}>Only the two captains choose the result.</Text>
              )}
            </>
          )}
          {isRefunded && (
            <Text style={styles.mutualMatch}>You couldn't agree. Everyone gets their stake back.</Text>
          )}
        </View>

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
            <ProofRow label="Resolution source" value="Captain confirmations and refund rules" />
          </View>
        )}

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
                {pos.side === 1 ? nameA : nameB} · ${Number(pos.stake_amount).toFixed(0)}
              </Text>
            </View>
          ))
        )}
      </ScrollView>

      {!isResolved && !isRefunded && !isInitialized && isCaptain && (
        <View style={styles.ctaBar}>
          <Text style={styles.ctaNote}>
            {pendingInitializationSignature ? 'A transaction is awaiting confirmation.' : 'This creates the Duel on Solana.'}
          </Text>
          <TouchableOpacity
            style={styles.ctaPrimary}
            onPress={pendingInitializationSignature ? handleCheckInitializationStatus : handleInitialize}
            disabled={initializing}
            activeOpacity={0.85}
            accessibilityLabel={pendingInitializationSignature ? 'Check status' : 'Set up this Duel'}
            accessibilityRole="button"
          >
            {initializing ? (
              <ActivityIndicator color="#000000" />
            ) : (
              <Text style={styles.ctaPrimaryText}>{pendingInitializationSignature ? 'Check status' : 'Set up this Duel'}</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
      {!isResolved && !isRefunded && !isInitialized && !isCaptain && (
        <View style={styles.ctaBar}>
          <Text style={styles.ctaNote}>Stakes unlock once a captain binds this duel on-chain.</Text>
        </View>
      )}
      {!isResolved && !isRefunded && isInitialized && (
        <View style={styles.ctaBar}>
          <View style={styles.ctaSplit}>
            <TouchableOpacity
              style={[styles.ctaHalf, { backgroundColor: colors.sideA }]}
              onPress={() => {
                setBackSide(1);
                setBackModalVisible(true);
              }}
              activeOpacity={0.85}
              accessibilityLabel={`Stake with ${nameA}`}
              accessibilityRole="button"
            >
              <Text style={styles.ctaHalfText}>Stake with {nameA}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.ctaHalf, { backgroundColor: colors.sideB }]}
              onPress={() => {
                setBackSide(2);
                setBackModalVisible(true);
              }}
              activeOpacity={0.85}
              accessibilityLabel={`Stake with ${nameB}`}
              accessibilityRole="button"
            >
              <Text style={styles.ctaHalfText}>Stake with {nameB}</Text>
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
            accessibilityLabel="Claim winnings"
            accessibilityRole="button"
          >
            {claiming ? (
              <ActivityIndicator color="#000000" />
            ) : (
              <Text style={styles.ctaPrimaryText}>
                Claim winnings
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
  messageAction: {
    alignSelf: 'flex-start', minHeight: touchMin, justifyContent: 'center',
    marginTop: spacing.xs, paddingHorizontal: spacing.sm,
  },
  messageActionText: { color: colors.brandPrimary, fontSize: 13, fontWeight: '700' },
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
