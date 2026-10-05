import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Linking,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { PublicKey } from '@solana/web3.js';
import { Duel, MutualVote, Position } from '../types';
import { BackModal } from '../components/BackModal';
import { Icon } from '../components/Icon';
import { api, PRODUCTION_WEB_URL } from '../api';
import { colors, borderRadius, spacing, touchMin, typography } from '../theme';
import { getConnection } from '../wallet';
import {
  buildClaimPayoutIx,
  buildInitializeDuelIx,
  buildVaultAtaCreateIxIfNeeded,
  ChainAccounts,
  mwaSignMessage,
  mwaSignSendConfirm,
  settlementMessage,
} from '../chain';
import {
  createWalletAttempt,
  acceptTransitionStage,
  isWalletCancellation,
  WalletFlowError,
  walletStage,
} from '../diagnostics';
import type { WalletAttempt } from '../diagnostics';
import { formatDeadline } from '../utils/criteria';
import { formatRelativeTime, formatUserDisplayName, isRealSignature } from '../utils/identity';
import { captainSide, mapDuelState, positionFor, stateLabel } from '../utils/duelState';
import { formatSol, hasFeeBalance, readWalletPreflight } from '../utils/preflight';
import type { WalletPreflight } from '../utils/preflight';
import {
  clearPendingWalletOperation,
  loadPendingWalletOperation,
  savePendingWalletOperation,
} from '../session';
import type { PendingWalletOperationType } from '../session';

interface DuelDetailScreenProps {
  duelId: string;
  userWallet: string | null;
  challengeId?: string;
  transitionAttemptId?: string;
  onBack: () => void;
  onViewReceipt: (receiptId: string) => void;
  onDataError?: (error: unknown) => void;
}

type DuelData = Duel & { positions?: Position[]; mutualVotes?: MutualVote[] };

export const DuelDetailV1Screen: React.FC<DuelDetailScreenProps> = ({
  duelId,
  userWallet,
  challengeId,
  transitionAttemptId,
  onBack,
  onViewReceipt,
  onDataError,
}) => {
  const [duel, setDuel] = useState<DuelData | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [mutualVotes, setMutualVotes] = useState<MutualVote[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [voting, setVoting] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [showProof, setShowProof] = useState(false);
  const [stakeVisible, setStakeVisible] = useState(false);
  const [preflight, setPreflight] = useState<WalletPreflight | null>(null);
  const [pendingSignature, setPendingSignature] = useState<string | null>(null);
  const [pendingClaimSignature, setPendingClaimSignature] = useState<string | null>(null);
  const [initializationRecovery, setInitializationRecovery] = useState<'RETRY' | 'CHECK_STATUS' | null>(null);
  const initAttemptRef = useRef<WalletAttempt | null>(null);
  const claimAttemptRef = useRef<WalletAttempt | null>(null);

  const persistPendingOperation = async (
    operationType: PendingWalletOperationType,
    attempt: WalletAttempt,
    stage: string,
    signature?: string,
  ) => {
    await savePendingWalletOperation(undefined, {
      operationId: attempt.attemptId,
      operationType,
      resourceId: duelId,
      expectedWallet: userWallet || undefined,
      stage,
      signature,
    });
  };

  const loadDuelData = async () => {
    try {
      const data = await api.getDuel(duelId);
      setDuel(data);
      setPositions(Array.isArray(data.positions) ? data.positions : []);
      setMutualVotes(Array.isArray(data.mutualVotes) ? data.mutualVotes : []);
      setLoadError(null);
      acceptTransitionStage('DUEL_DETAIL_DATA_OK', {
        challengeId: challengeId || 'direct-open',
        duelId,
        attemptId: transitionAttemptId || 'direct-open',
      });
      const mappedState = mapDuelState({
        duel: data,
        userWallet,
        positions: Array.isArray(data.positions) ? data.positions : [],
        mutualVotes: Array.isArray(data.mutualVotes) ? data.mutualVotes : [],
        mutualState: data.mutualState,
        myVoteSubmitted: data.myVoteSubmitted,
        otherVoteSubmitted: data.otherVoteSubmitted,
      });
      if (mappedState === 'ACCEPTED_NOT_INITIALIZED') {
        acceptTransitionStage('DUEL_DETAIL_READY', {
          challengeId: challengeId || 'direct-open',
          duelId,
          attemptId: transitionAttemptId || 'direct-open',
        });
      }
    } catch (error: any) {
      setLoadError(error?.message || 'Duel not found');
      onDataError?.(error);
    } finally {
      setLoading(false);
    }
  };

  const refreshPreflight = async () => {
    try {
      setPreflight(await readWalletPreflight(userWallet));
    } catch {
      setPreflight(null);
    }
  };

  useEffect(() => {
    acceptTransitionStage('DUEL_DETAIL_MOUNT', {
      challengeId: challengeId || 'direct-open',
      duelId,
      attemptId: transitionAttemptId || 'direct-open',
    });
    loadDuelData();
    refreshPreflight();
  }, [duelId, userWallet]);

  // Recover a public signature that was returned before Android killed or
  // suspended the JS process. A missing signature remains a controlled retry;
  // it is never treated as permission to blindly send a second transaction.
  useEffect(() => {
    let cancelled = false;
    loadPendingWalletOperation().then((pending) => {
      if (cancelled || !pending || pending.resourceId !== duelId) return;
      if (pending.operationType === 'DUEL_INIT') {
        setPendingSignature(pending.signature || null);
        if (!pending.signature) {
          setInitializationRecovery('RETRY');
          setMessage('A setup attempt was interrupted. Counter checked that no signature was recorded; retry setup when ready.');
        }
      } else if (pending.operationType === 'CLAIM' || pending.operationType === 'REFUND') {
        setPendingClaimSignature(pending.signature || null);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [duelId]);

  useEffect(() => {
    let previousState = AppState.currentState;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (previousState !== 'active' && nextState === 'active') {
        loadDuelData();
        refreshPreflight();
        if (pendingSignature) handleCheckInitializationStatus();
      }
      previousState = nextState;
    });
    return () => subscription.remove();
  }, [duelId, userWallet, pendingSignature]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.brandPrimary} />
        <Text style={styles.centerText}>Loading Duel.</Text>
      </View>
    );
  }

  if (!duel) {
    return (
      <View style={styles.center}>
        <Text style={styles.centerText}>Duel not found{loadError ? `: ${loadError}` : ''}.</Text>
        <TouchableOpacity style={styles.secondaryButton} onPress={onBack} accessibilityRole="button" accessibilityLabel="Go back">
          <Text style={styles.secondaryButtonText}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const mySide = captainSide(duel, userWallet);
  const myPosition = positionFor(positions, userWallet);
  const state = mapDuelState({
    duel,
    userWallet,
    positions,
    mutualVotes,
    mutualState: duel.mutualState,
    myVoteSubmitted: duel.myVoteSubmitted,
    otherVoteSubmitted: duel.otherVoteSubmitted,
  });
  const isCaptain = mySide !== null;
  const isInitialized = duel.chain_status === 'INITIALIZED';
  const resolutionReached = Math.floor(Date.now() / 1000) >= Number(duel.resolution_ts || 0);
  const isTerminal = duel.status.startsWith('RESOLVED') || duel.status === 'CANCELLED';
  const hasBothFunded = Number(duel.side_a_total) > 0 && Number(duel.side_b_total) > 0;
  const agreedStake = Number(duel.stake_amount_usd || Math.max(Number(duel.side_a_total) || 0, Number(duel.side_b_total) || 0));
  const nameA = formatUserDisplayName({ display_name: duel.captain_a_name, handle: duel.captain_a_handle, wallet: duel.captain_a_wallet });
  const nameB = formatUserDisplayName({ display_name: duel.captain_b_name, handle: duel.captain_b_handle, wallet: duel.captain_b_wallet });
  const otherName = userWallet === duel.captain_a_wallet ? nameB : nameA;
  const myVote = mutualVotes.find((vote) => vote.captain_wallet === userWallet) || null;
  const votesMatch = mutualVotes.length >= 2 && mutualVotes.every((vote) => Number(vote.winner_side) === Number(mutualVotes[0].winner_side));
  const canClaim = !!myPosition && duel.status.startsWith('RESOLVED') && myPosition.side === duel.winning_side && !myPosition.claimed;
  const canRefund = !!myPosition && duel.status === 'CANCELLED' && !myPosition.claimed;
  const payout = Number(myPosition?.stake_amount || agreedStake) * 2;

  const showError = (error: any, fallback: string) => {
    setMessage(isWalletCancellation(error) ? 'Approval cancelled. Nothing was changed.' : error?.message || fallback);
  };

  const handleInitialize = async () => {
    if (!userWallet || !isCaptain) {
      setMessage('Only the two captains can set up this Duel.');
      return;
    }
    const currentPreflight = await readWalletPreflight(userWallet).catch(() => null);
    setPreflight(currentPreflight);
    if (!hasFeeBalance(currentPreflight)) {
      setMessage('You need a little Devnet SOL to pay network fees. Testnet SOL has no cash value. Get SOL, then return here.');
      return;
    }

    const attempt = createWalletAttempt(duel.id, 'DUEL_INIT');
    initAttemptRef.current = attempt;
    walletStage(attempt, 'START');
    setInitializing(true);
    setPendingSignature(null);
    setInitializationRecovery(null);
    setMessage(null);
    let backendVerifyStarted = false;
    try {
      await persistPendingOperation('DUEL_INIT', attempt, 'CHAIN_ACCOUNTS_START');
      const accounts = (await api.getChainAccounts(duel.id, userWallet)) as ChainAccounts;
      walletStage(attempt, 'CHAIN_ACCOUNTS_OK');
      if (accounts.chainStatus === 'INITIALIZED') throw new Error('Duel is already ready. Refreshing its state.');
      const payer = new PublicKey(userWallet);
      const connection = getConnection();
      const vaultAtaInfo = await connection.getAccountInfo(new PublicKey(accounts.vaultAta));
      const instructions = [];
      const vaultAtaIx = buildVaultAtaCreateIxIfNeeded(payer, new PublicKey(accounts.vaultPda), vaultAtaInfo !== null);
      if (vaultAtaIx) instructions.push(vaultAtaIx);
      instructions.push(buildInitializeDuelIx(accounts, payer));
      setMessage('Waiting for wallet approval…');
      const signature = await mwaSignSendConfirm(instructions, payer, undefined, attempt);
      setPendingSignature(signature);
      await persistPendingOperation('DUEL_INIT', attempt, 'TX_CONFIRMED', signature);
      setMessage('Checking the Duel on Devnet…');
      backendVerifyStarted = true;
      walletStage(attempt, 'BACKEND_VERIFY_START');
      await api.initOnChainDuel(duel.id, signature);
      walletStage(attempt, 'BACKEND_VERIFY_OK');
      walletStage(attempt, 'UI_SUCCESS');
      setPendingSignature(null);
      await clearPendingWalletOperation();
      setInitializationRecovery(null);
      setMessage('Duel ready. Both captains can now lock the agreed stake.');
      await loadDuelData();
    } catch (error: any) {
      if (backendVerifyStarted) walletStage(attempt, 'BACKEND_VERIFY_FAILED');
      if (error instanceof WalletFlowError) {
        if (error.signature) {
          setPendingSignature(error.signature);
          await persistPendingOperation('DUEL_INIT', attempt, 'TX_SUBMITTED', error.signature);
        }
        if (error.signature || error.kind === 'CONFIRMATION_FAILED' || error.kind === 'TIMEOUT') {
          setInitializationRecovery('CHECK_STATUS');
          setMessage('Transaction submitted but not confirmed yet. Check status before retrying.');
        } else if (error.kind === 'NOT_SUBMITTED') {
          setInitializationRecovery('RETRY');
          setMessage("Your wallet approved, but the transaction wasn't submitted. You can retry safely.");
        } else if (error.kind === 'PRE_SUBMIT') {
          setInitializationRecovery('RETRY');
          setMessage("Couldn't get the transaction from your wallet.");
        } else {
          setInitializationRecovery('RETRY');
          setMessage(error.message);
        }
      } else {
        setInitializationRecovery('RETRY');
        showError(error, "Couldn't set up this Duel.");
      }
    } finally {
      setInitializing(false);
    }
  };

  const handleCheckInitializationStatus = async () => {
    const signature = pendingSignature;
    const attempt = initAttemptRef.current || createWalletAttempt(duel.id, 'DUEL_INIT');
    initAttemptRef.current = attempt;
    if (!signature) {
      setInitializationRecovery('RETRY');
      setMessage('No submitted transaction was found. You can retry setup.');
      return;
    }
    setInitializing(true);
    setMessage('Checking transaction status…');
    let backendVerifyStarted = false;
    try {
      const status = (await getConnection().getSignatureStatuses([signature], { searchTransactionHistory: true })).value[0];
      if (status?.err) {
        walletStage(attempt, 'TX_CONFIRM_FAILED');
        setInitializationRecovery('RETRY');
        await clearPendingWalletOperation();
        setMessage(`Devnet rejected the setup transaction: ${JSON.stringify(status.err)}`);
        return;
      }
      if (!status || !['confirmed', 'finalized'].includes(String(status.confirmationStatus))) {
        walletStage(attempt, 'TX_CONFIRM_FAILED');
        setInitializationRecovery('CHECK_STATUS');
        setMessage('Transaction is not confirmed yet. Check status again later.');
        return;
      }
      walletStage(attempt, 'TX_CONFIRMED');
      await persistPendingOperation('DUEL_INIT', attempt, 'TX_CONFIRMED', signature);
      backendVerifyStarted = true;
      walletStage(attempt, 'BACKEND_VERIFY_START');
      await api.initOnChainDuel(duel.id, signature);
      walletStage(attempt, 'BACKEND_VERIFY_OK');
      walletStage(attempt, 'UI_SUCCESS');
      setPendingSignature(null);
      await clearPendingWalletOperation();
      setInitializationRecovery(null);
      setMessage('Duel ready. Both captains can now lock the agreed stake.');
      await loadDuelData();
    } catch (error: any) {
      if (backendVerifyStarted) walletStage(attempt, 'BACKEND_VERIFY_FAILED');
      showError(error, 'Transaction confirmed, but Counter could not verify it yet. Check status again.');
      setInitializationRecovery('CHECK_STATUS');
    } finally {
      setInitializing(false);
    }
  };

  const handleStakeRecorded = async () => {
    setStakeVisible(false);
    await Promise.all([loadDuelData(), refreshPreflight()]);
  };

  const handleVote = async (winnerSide: 1 | 2) => {
    if (!userWallet || !isCaptain) {
      setMessage('Only the two captains choose the result.');
      return;
    }
    const pendingSettlement = await loadPendingWalletOperation().catch(() => null);
    if (pendingSettlement?.operationType === 'SETTLEMENT' && pendingSettlement.resourceId === duel.id) {
      // A message signature is not a Solana transaction signature. Reconcile
      // the authoritative Duel before permitting a second sign-in request.
      const latest: any = await api.getDuel(duel.id).catch(() => null);
      const alreadyRecorded = !!latest?.myVoteSubmitted ||
        (Array.isArray(latest?.mutualVotes) && latest.mutualVotes.some((vote: any) => vote.captain_wallet === userWallet));
      if (alreadyRecorded) {
        await clearPendingWalletOperation();
        setMessage('Your result is already recorded. Refreshing the Duel.');
        await loadDuelData();
        return;
      }
      // The authoritative read found no vote, so this is the only safe retry.
      await clearPendingWalletOperation();
    }
    const currentPreflight = await readWalletPreflight(userWallet).catch(() => null);
    setPreflight(currentPreflight);
    if (!hasFeeBalance(currentPreflight)) {
      setMessage('You need a little Devnet SOL to pay network fees before confirming your result. Get SOL, then return here.');
      return;
    }
    const attempt = createWalletAttempt(duel.id, 'SETTLEMENT');
    walletStage(attempt, 'START');
    setVoting(true);
    setMessage('Your choice stays private. Waiting for wallet approval…');
    let backendVerifyStarted = false;
    try {
      await persistPendingOperation('SETTLEMENT', attempt, 'SIGN_IN_START');
      const signature = await mwaSignMessage(settlementMessage(duel.id, winnerSide, Number(duel.resolution_ts) || 0), userWallet, attempt);
      setMessage('Recording your result…');
      backendVerifyStarted = true;
      walletStage(attempt, 'BACKEND_VERIFY_START');
      const response = await api.postMutualVote(duel.id, winnerSide, signature);
      walletStage(attempt, 'BACKEND_VERIFY_OK');
      walletStage(attempt, 'UI_SUCCESS');
      await clearPendingWalletOperation();
      if (response.match?.matched) {
        try {
          await api.resolveDuel(duel.id);
          setMessage('Both captains chose the same result. The receipt is ready.');
        } catch {
          setMessage('Both captains chose the same result. Settlement is processing.');
        }
      } else {
        setMessage('Your result was submitted. The other captain has been notified.');
      }
      await loadDuelData();
    } catch (error: any) {
      if (backendVerifyStarted) walletStage(attempt, 'BACKEND_VERIFY_FAILED');
      await persistPendingOperation('SETTLEMENT', attempt, 'ERROR');
      showError(error, "Couldn't record your result.");
    } finally {
      setVoting(false);
    }
  };

  const handleResolve = async () => {
    setResolving(true);
    setMessage(null);
    try {
      const response = await api.resolveDuel(duel.id);
      if (!response.success) throw new Error(response.error || 'Settlement is not ready yet.');
      setMessage(duel.status === 'CANCELLED' ? 'Refund is ready.' : 'Settlement complete.');
      await loadDuelData();
    } catch (error: any) {
      showError(error, 'Settlement is not ready yet.');
    } finally {
      setResolving(false);
    }
  };

  const handleClaim = async () => {
    if (!userWallet || (!canClaim && !canRefund)) return;
    if (pendingClaimSignature) {
      await handleCheckClaimStatus();
      return;
    }
    const currentPreflight = await readWalletPreflight(userWallet).catch(() => null);
    setPreflight(currentPreflight);
    if (!hasFeeBalance(currentPreflight)) {
      setMessage('You need a little Devnet SOL to pay the network fee before claiming. Get SOL, then return here.');
      return;
    }
    const claimOperation: PendingWalletOperationType = canRefund ? 'REFUND' : 'CLAIM';
    const attempt = createWalletAttempt(duel.id, claimOperation);
    claimAttemptRef.current = attempt;
    walletStage(attempt, 'START');
    setClaiming(true);
    setMessage('Waiting for wallet approval…');
    let backendVerifyStarted = false;
    try {
      await persistPendingOperation(claimOperation, attempt, 'CHAIN_ACCOUNTS_START');
      const accounts = (await api.getChainAccounts(duel.id, userWallet)) as ChainAccounts;
      walletStage(attempt, 'CHAIN_ACCOUNTS_OK');
      const user = new PublicKey(userWallet);
      const signature = await mwaSignSendConfirm([buildClaimPayoutIx(accounts, user)], user, undefined, attempt);
      await persistPendingOperation(claimOperation, attempt, 'TX_CONFIRMED', signature);
      backendVerifyStarted = true;
      walletStage(attempt, 'BACKEND_VERIFY_START');
      await api.claimDuel(duel.id, signature);
      walletStage(attempt, 'BACKEND_VERIFY_OK');
      walletStage(attempt, 'UI_SUCCESS');
      setPendingClaimSignature(null);
      await clearPendingWalletOperation();
      setMessage(duel.status === 'CANCELLED' ? 'Refund claimed.' : 'Payout claimed.');
      await loadDuelData();
    } catch (error: any) {
      if (backendVerifyStarted) walletStage(attempt, 'BACKEND_VERIFY_FAILED');
      if (error instanceof WalletFlowError && error.signature) {
        setPendingClaimSignature(error.signature);
        await persistPendingOperation(claimOperation, attempt, 'TX_SUBMITTED', error.signature);
        setMessage('Payout transaction submitted but not confirmed yet. Check status before retrying.');
      } else {
        showError(error, 'Could not complete this payout.');
      }
    } finally {
      setClaiming(false);
    }
  };

  const handleCheckClaimStatus = async () => {
    const signature = pendingClaimSignature;
    if (!signature || !userWallet) {
      setMessage('No submitted payout transaction was found.');
      return;
    }
    const claimOperation: PendingWalletOperationType = duel.status === 'CANCELLED' ? 'REFUND' : 'CLAIM';
    const attempt = claimAttemptRef.current || createWalletAttempt(duel.id, claimOperation);
    claimAttemptRef.current = attempt;
    setClaiming(true);
    setMessage('Checking payout transaction status…');
    let backendVerifyStarted = false;
    try {
      const status = (await getConnection().getSignatureStatuses([signature], { searchTransactionHistory: true })).value[0];
      if (status?.err) {
        walletStage(attempt, 'TX_CONFIRM_FAILED');
        setPendingClaimSignature(null);
        await clearPendingWalletOperation();
        setMessage(`Devnet rejected the payout transaction: ${JSON.stringify(status.err)}`);
        return;
      }
      if (!status || !['confirmed', 'finalized'].includes(String(status.confirmationStatus))) {
        walletStage(attempt, 'TX_CONFIRM_FAILED');
        setMessage('Payout transaction is not confirmed yet. Check status again later.');
        return;
      }
      walletStage(attempt, 'TX_CONFIRMED');
      await persistPendingOperation(claimOperation, attempt, 'TX_CONFIRMED', signature);
      backendVerifyStarted = true;
      walletStage(attempt, 'BACKEND_VERIFY_START');
      await api.claimDuel(duel.id, signature);
      walletStage(attempt, 'BACKEND_VERIFY_OK');
      walletStage(attempt, 'UI_SUCCESS');
      setPendingClaimSignature(null);
      await clearPendingWalletOperation();
      setMessage(duel.status === 'CANCELLED' ? 'Refund claimed.' : 'Payout claimed.');
      await loadDuelData();
    } catch (error: any) {
      if (backendVerifyStarted) walletStage(attempt, 'BACKEND_VERIFY_FAILED');
      showError(error, 'Transaction confirmed, but Counter could not verify the payout yet. Check status again.');
    } finally {
      setClaiming(false);
    }
  };

  useEffect(() => {
    if (!pendingClaimSignature) return;
    let previousState = AppState.currentState;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (previousState !== 'active' && nextState === 'active') handleCheckClaimStatus();
      previousState = nextState;
    });
    return () => subscription.remove();
  }, [pendingClaimSignature]);

  const handleShare = async () => {
    const link = `${PRODUCTION_WEB_URL}/d/${duel.share_slug || duel.id}`;
    try {
      await Share.share({ message: `Join this Counter Duel: ${duel.proposition_a} vs ${duel.proposition_b}. ${link}`, url: link });
    } catch {}
  };

  const renderPreflight = (showStake = false) => (
    <View style={styles.preflightBox}>
      <PreflightRow label="Wallet connected" value={userWallet ? 'Connected' : 'Connect wallet'} ready={!!userWallet} />
      <PreflightRow label="Captain eligibility" value={isCaptain ? 'Captain' : 'Not a captain'} ready={isCaptain} />
      <PreflightRow label="Devnet SOL for fees" value={formatSol(preflight?.sol ?? null)} ready={hasFeeBalance(preflight)} />
      {!hasFeeBalance(preflight) && (
        <>
          <Text style={styles.preflightCopy}>You need a little Devnet SOL to pay network fees. This is testnet SOL and has no cash value.</Text>
          <TouchableOpacity style={styles.inlineAction} onPress={() => Linking.openURL('https://faucet.solana.com/')} accessibilityRole="button" accessibilityLabel="Get SOL">
            <Text style={styles.inlineActionText}>Get SOL</Text>
          </TouchableOpacity>
        </>
      )}
      {showStake && <PreflightRow label="Agreed stake" value={`${agreedStake.toFixed(2)} Counter Test USD`} ready={agreedStake > 0} />}
    </View>
  );

  const renderStateContent = () => {
    if (state === 'ACCEPTED_NOT_INITIALIZED') {
      return (
        <View style={styles.stateBox}>
          <Text style={styles.stateTitle}>Ready to Duel</Text>
          <Text style={styles.stateCopy}>Set up the shared Duel first. This is the only step that opens your wallet.</Text>
          {renderPreflight()}
          {isCaptain ? (
            <TouchableOpacity style={[styles.primaryButton, !hasFeeBalance(preflight) && styles.disabledButton]} onPress={pendingSignature ? handleCheckInitializationStatus : handleInitialize} disabled={initializing || (!pendingSignature && !hasFeeBalance(preflight))} accessibilityRole="button" accessibilityLabel={pendingSignature ? 'Check status' : 'Set up this Duel'}>
              {initializing ? <ActivityIndicator color="#000" /> : <Text style={styles.primaryButtonText}>{pendingSignature ? 'Check status' : 'Set up this Duel'}</Text>}
            </TouchableOpacity>
          ) : <Text style={styles.stateCopy}>Waiting for setup. A captain must set up this Duel first.</Text>}
          {initializationRecovery && <Text style={styles.subtleCopy}>If a transaction was submitted, check its status before retrying.</Text>}
        </View>
      );
    }

    if (state === 'FUNDING') {
      const waitingForMine = isCaptain && !myPosition;
      return (
        <View style={styles.stateBox}>
          <Text style={styles.stateTitle}>{waitingForMine ? 'Ready to stake' : 'Funding in progress'}</Text>
          <Text style={styles.stateCopy}>{waitingForMine ? 'Lock the agreed amount on your captain side. The other captain never chooses for you.' : 'Both captains must lock the same agreed amount before the Duel goes live.'}</Text>
          {renderPreflight(true)}
          {waitingForMine && <TouchableOpacity style={styles.primaryButton} onPress={() => setStakeVisible(true)} accessibilityRole="button" accessibilityLabel="Ready to stake"><Text style={styles.primaryButtonText}>Ready to stake</Text></TouchableOpacity>}
          {!waitingForMine && myPosition && <Text style={styles.successCopy}>Your stake is locked. Waiting for the other captain.</Text>}
        </View>
      );
    }

    if (state === 'LIVE') {
      return (
        <View style={styles.stateBox}>
          <Text style={styles.stateTitle}>Duel live</Text>
          <Text style={styles.stateCopy}>Both captains are locked in. Choices open at the decision time.</Text>
          <InfoRow label="Decide" value={formatDeadline(duel.resolution_ts)} />
          <InfoRow label="Captain stakes" value={`${agreedStake.toFixed(2)} Counter Test USD each`} />
        </View>
      );
    }

    if (state === 'READY_TO_SETTLE') {
      const opponentSubmitted = !myVote && duel.otherVoteSubmitted;
      return (
        <View style={styles.stateBox}>
          <Text style={styles.stateTitle}>Who won?</Text>
          <Text style={styles.stateCopy}>{opponentSubmitted ? `${otherName} submitted their result. Choose who won.` : 'Both captains independently confirm the winner. If they do not agree by the deadline, the Duel refunds.'}</Text>
          {isCaptain ? (
            <View style={styles.voteColumn}>
              <TouchableOpacity style={[styles.voteButton, { borderColor: colors.sideA }]} onPress={() => handleVote(1)} disabled={voting} accessibilityRole="button" accessibilityLabel={`${nameA} won`}><Text style={styles.voteButtonText}>{nameA} won</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.voteButton, { borderColor: colors.sideB }]} onPress={() => handleVote(2)} disabled={voting} accessibilityRole="button" accessibilityLabel={`${nameB} won`}><Text style={styles.voteButtonText}>{nameB} won</Text></TouchableOpacity>
            </View>
          ) : <Text style={styles.stateCopy}>Only the two captains choose the result.</Text>}
        </View>
      );
    }

    if (state === 'WAITING_FOR_OTHER_RESULT') {
      return <View style={styles.stateBox}><Text style={styles.stateTitle}>Result submitted</Text><Text style={styles.stateCopy}>Your choice is private. The other captain has been notified.</Text></View>;
    }

    if (state === 'MATCHED_RESULT') {
      return (
        <View style={styles.stateBox}>
          <Text style={styles.stateTitle}>Result confirmed</Text>
          <Text style={styles.stateCopy}>{isTerminal ? 'Both captains chose the same result.' : 'Both captains chose the same result. Settlement is ready.'}</Text>
          {isTerminal && !canClaim && <Text style={styles.successCopy}>{duel.winning_side === 1 ? nameA : nameB} won.</Text>}
          {!isTerminal && <TouchableOpacity style={styles.primaryButton} onPress={handleResolve} disabled={resolving} accessibilityRole="button"><Text style={styles.primaryButtonText}>{resolving ? 'Settling…' : 'Settle result'}</Text></TouchableOpacity>}
          {(canClaim || canRefund) && renderPreflight()}
          {(canClaim || canRefund) && <TouchableOpacity style={[styles.primaryButton, !pendingClaimSignature && !hasFeeBalance(preflight) && styles.disabledButton]} onPress={pendingClaimSignature ? handleCheckClaimStatus : handleClaim} disabled={claiming || (!pendingClaimSignature && !hasFeeBalance(preflight))} accessibilityRole="button"><Text style={styles.primaryButtonText}>{claiming ? 'Checking…' : pendingClaimSignature ? 'Check status' : hasFeeBalance(preflight) ? `Claim ${payout.toFixed(2)} Counter Test USD` : 'Get SOL to claim'}</Text></TouchableOpacity>}
          {isTerminal && !canClaim && <TouchableOpacity style={styles.secondaryButton} onPress={() => onViewReceipt(`receipt_${duel.id}`)} accessibilityRole="button"><Text style={styles.secondaryButtonText}>View receipt</Text></TouchableOpacity>}
        </View>
      );
    }

    if (state === 'EXPIRED_BEFORE_FUNDING') {
      const hasPrincipal = Number(duel.side_a_total || 0) > 0
        || Number(duel.side_b_total || 0) > 0
        || !!myPosition;
      const refundAvailable = duel.status === 'CANCELLED';

      return (
        <View style={styles.stateBox}>
          <Text style={styles.stateTitle}>Duel expired before funding</Text>
          <Text style={styles.stateCopy}>This Duel reached its decision time before both stakes were locked.</Text>
          <Text style={styles.subtleCopy}>No winner can be chosen.</Text>
          {hasPrincipal && !refundAvailable && resolutionReached && <TouchableOpacity style={styles.primaryButton} onPress={handleResolve} disabled={resolving} accessibilityRole="button"><Text style={styles.primaryButtonText}>{resolving ? 'Opening refund…' : 'Make refund available'}</Text></TouchableOpacity>}
          {hasPrincipal && canRefund && renderPreflight()}
          {hasPrincipal && canRefund && <TouchableOpacity style={[styles.primaryButton, !pendingClaimSignature && !hasFeeBalance(preflight) && styles.disabledButton]} onPress={pendingClaimSignature ? handleCheckClaimStatus : handleClaim} disabled={claiming || (!pendingClaimSignature && !hasFeeBalance(preflight))} accessibilityRole="button"><Text style={styles.primaryButtonText}>{claiming ? 'Checking…' : pendingClaimSignature ? 'Check status' : hasFeeBalance(preflight) ? `Get ${payout.toFixed(2)} Counter Test USD back` : 'Get SOL to claim'}</Text></TouchableOpacity>}
          {hasPrincipal && refundAvailable && !canRefund && <TouchableOpacity style={styles.secondaryButton} onPress={() => onViewReceipt(`receipt_${duel.id}`)} accessibilityRole="button"><Text style={styles.secondaryButtonText}>View receipt</Text></TouchableOpacity>}
        </View>
      );
    }

    if (state === 'MISMATCH' || state === 'TIMEOUT') {
      const refundAvailable = duel.status === 'CANCELLED';
      return (
        <View style={styles.stateBox}>
          <Text style={styles.stateTitle}>{state === 'TIMEOUT' ? 'No agreement reached' : 'No agreement'}</Text>
          <Text style={styles.stateCopy}>The captains did not confirm the same result. Both stakes are refundable.</Text>
          {!refundAvailable && !resolutionReached && <Text style={styles.subtleCopy}>Refund opens at the agreed decision time.</Text>}
          {!refundAvailable && resolutionReached && <TouchableOpacity style={styles.primaryButton} onPress={handleResolve} disabled={resolving} accessibilityRole="button"><Text style={styles.primaryButtonText}>{resolving ? 'Opening refund…' : 'Make refund available'}</Text></TouchableOpacity>}
          {canRefund && renderPreflight()}
          {canRefund && <TouchableOpacity style={[styles.primaryButton, !pendingClaimSignature && !hasFeeBalance(preflight) && styles.disabledButton]} onPress={pendingClaimSignature ? handleCheckClaimStatus : handleClaim} disabled={claiming || (!pendingClaimSignature && !hasFeeBalance(preflight))} accessibilityRole="button"><Text style={styles.primaryButtonText}>{claiming ? 'Checking…' : pendingClaimSignature ? 'Check status' : hasFeeBalance(preflight) ? `Get ${payout.toFixed(2)} Counter Test USD back` : 'Get SOL to claim'}</Text></TouchableOpacity>}
          {refundAvailable && !canRefund && <TouchableOpacity style={styles.secondaryButton} onPress={() => onViewReceipt(`receipt_${duel.id}`)} accessibilityRole="button"><Text style={styles.secondaryButtonText}>View receipt</Text></TouchableOpacity>}
        </View>
      );
    }

    return null;
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.iconButton} onPress={onBack} accessibilityRole="button" accessibilityLabel="Go back"><Icon name="chevron-left" size={22} color={colors.textPrimary} /></TouchableOpacity>
          <Text style={styles.topState}>{stateLabel(state)}</Text>
          <TouchableOpacity style={styles.iconButton} onPress={handleShare} accessibilityRole="button" accessibilityLabel="Share Duel"><Icon name="share-2" size={19} color={colors.textPrimary} /></TouchableOpacity>
        </View>

        <Text style={styles.proposition}>{duel.proposition_a}</Text>
        <Text style={styles.vsText}>vs</Text>
        <Text style={styles.proposition}>{duel.proposition_b}</Text>
        <Text style={styles.meta}>Settle together · Decide {formatDeadline(duel.resolution_ts)} · {duel.category}</Text>

        <View style={styles.captainRow}>
          <CaptainCard name={nameA} color={colors.sideA} funded={Number(duel.side_a_total) > 0} />
          <Text style={styles.vsBadge}>VS</Text>
          <CaptainCard name={nameB} color={colors.sideB} funded={Number(duel.side_b_total) > 0} />
        </View>

        {myPosition && <View style={styles.ownershipBox}><Text style={styles.ownershipText}>Your captain stake: {Number(myPosition.stake_amount).toFixed(2)} Counter Test USD{myPosition.claimed ? ' · complete' : ''}</Text></View>}
        {message && <View style={styles.messageBox}><Text style={styles.messageText}>{message}</Text><TouchableOpacity onPress={refreshPreflight} accessibilityRole="button"><Text style={styles.inlineActionText}>Refresh balances</Text></TouchableOpacity></View>}

        {renderStateContent()}

        <View style={styles.timelineBox}>
          <Text style={styles.sectionTitle}>Activity</Text>
          <InfoRow label="Duel created" value={formatRelativeTime(duel.created_at)} />
          <InfoRow label="On-chain setup" value={isInitialized ? 'Ready' : 'Not set up'} />
          <InfoRow label="Funding" value={hasBothFunded ? 'Both captains locked' : 'Waiting for both captains'} />
          {myVote && <InfoRow label="Your result" value="Submitted privately" />}
        </View>

        <TouchableOpacity style={styles.detailsToggle} onPress={() => setShowProof((value) => !value)} accessibilityRole="button" accessibilityLabel="Show technical details"><Text style={styles.detailsText}>Technical details</Text><Icon name={showProof ? 'chevron-down' : 'chevron-right'} size={16} color={colors.textSecondary} /></TouchableOpacity>
        {showProof && <View style={styles.proofBox}>
          <InfoRow label="Program" value="52QgqEmx…6NmT" mono />
          <InfoRow label="Duel account" value={duel.onchain_duel_pda ? `${duel.onchain_duel_pda.slice(0, 12)}…` : 'Not bound'} mono />
          <InfoRow label="Vault account" value={duel.onchain_vault_pda ? `${duel.onchain_vault_pda.slice(0, 12)}…` : 'Not bound'} mono />
          <InfoRow label="Setup transaction" value={duel.init_tx_signature && isRealSignature(duel.init_tx_signature) ? `${duel.init_tx_signature.slice(0, 12)}…` : 'None'} mono />
          <InfoRow label="Resolution" value={duel.resolution_tx && isRealSignature(duel.resolution_tx) ? `${duel.resolution_tx.slice(0, 12)}…` : 'Pending'} mono />
        </View>}
      </ScrollView>

      <BackModal visible={stakeVisible} duel={duel} side={mySide || 1} userWallet={userWallet} onClose={() => setStakeVisible(false)} onStakeRecorded={handleStakeRecorded} />
    </View>
  );
};

const CaptainCard: React.FC<{ name: string; color: string; funded: boolean }> = ({ name, color, funded }) => (
  <View style={styles.captainCard}>
    <Text style={[styles.captainName, { color }]} numberOfLines={1}>{name}</Text>
    <Text style={styles.captainStatus}>{funded ? 'Stake locked' : 'Not locked yet'}</Text>
  </View>
);

const PreflightRow: React.FC<{ label: string; value: string; ready: boolean }> = ({ label, value, ready }) => (
  <View style={styles.preflightRow}><Text style={styles.preflightLabel}>{ready ? '✓ ' : ''}{label}</Text><Text style={[styles.preflightValue, ready && styles.preflightReady]}>{value}</Text></View>
);

const InfoRow: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => (
  <View style={styles.infoRow}><Text style={styles.infoLabel}>{label}</Text><Text style={[styles.infoValue, mono && styles.mono]} numberOfLines={1}>{value}</Text></View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: 112 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl, backgroundColor: colors.background },
  centerText: { color: colors.textSecondary, fontSize: 14, textAlign: 'center' },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  iconButton: { minWidth: touchMin, minHeight: touchMin, justifyContent: 'center', alignItems: 'center' },
  topState: { ...typography.captionBold, color: colors.textSecondary, fontSize: 13 },
  proposition: { ...typography.h1, color: colors.textPrimary, fontSize: 23, lineHeight: 30 },
  vsText: { color: colors.textMuted, fontSize: 12, fontWeight: '800', marginVertical: 2 },
  meta: { ...typography.caption, color: colors.textMuted, marginTop: spacing.sm, marginBottom: spacing.lg },
  captainRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  captainCard: { flex: 1, backgroundColor: colors.background, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider, paddingVertical: spacing.md, minHeight: 76, justifyContent: 'center' },
  captainName: { ...typography.bodyBold, fontSize: 14 },
  captainStatus: { ...typography.caption, color: colors.textSecondary, marginTop: 5 },
  vsBadge: { color: colors.textMuted, fontWeight: '900', fontSize: 11 },
  ownershipBox: { backgroundColor: colors.background, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider, paddingVertical: spacing.md, marginBottom: spacing.md },
  ownershipText: { color: colors.textPrimary, fontSize: 13, fontWeight: '700' },
  messageBox: { backgroundColor: colors.surface, borderLeftWidth: 3, borderLeftColor: colors.brandPrimary, borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.md },
  messageText: { color: colors.textPrimary, fontSize: 13, lineHeight: 19, marginBottom: spacing.xs },
  stateBox: { backgroundColor: colors.background, paddingVertical: spacing.lg, marginBottom: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider },
  stateTitle: { ...typography.h2, color: colors.textPrimary, fontSize: 18, marginBottom: spacing.xs },
  stateCopy: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: spacing.md },
  subtleCopy: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: spacing.sm },
  successCopy: { color: colors.success, fontSize: 13, fontWeight: '800' },
  preflightBox: { backgroundColor: colors.background, paddingVertical: spacing.sm, marginBottom: spacing.md, gap: spacing.xs },
  preflightRow: { minHeight: 30, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  preflightLabel: { color: colors.textPrimary, fontSize: 13, fontWeight: '700' },
  preflightValue: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
  preflightReady: { color: colors.success },
  preflightCopy: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: spacing.xs },
  inlineAction: { minHeight: touchMin, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: spacing.xs },
  inlineActionText: { color: colors.brandPrimary, fontSize: 13, fontWeight: '800' },
  primaryButton: { minHeight: 52, backgroundColor: colors.brandPrimary, borderRadius: borderRadius.full, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md, marginTop: spacing.xs },
  disabledButton: { backgroundColor: colors.surfaceLight },
  primaryButtonText: { color: '#000000', fontSize: 14, fontWeight: '900', textAlign: 'center' },
  secondaryButton: { minHeight: 48, borderRadius: borderRadius.full, borderWidth: 1, borderColor: colors.cardBorder, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  secondaryButtonText: { color: colors.textPrimary, fontSize: 14, fontWeight: '800' },
  voteColumn: { gap: spacing.sm },
  voteButton: { minHeight: 50, borderWidth: 1, borderRadius: borderRadius.full, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.md },
  voteButtonText: { color: colors.textPrimary, fontSize: 14, fontWeight: '800' },
  timelineBox: { backgroundColor: colors.background, paddingVertical: spacing.md, marginBottom: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider },
  sectionTitle: { ...typography.captionBold, color: colors.textMuted, fontSize: 12, textTransform: 'uppercase', marginBottom: spacing.sm },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md, paddingVertical: 6 },
  infoLabel: { color: colors.textSecondary, fontSize: 12 },
  infoValue: { color: colors.textPrimary, fontSize: 12, fontWeight: '700', flex: 1, textAlign: 'right' },
  mono: { fontFamily: 'monospace' },
  detailsToggle: { minHeight: touchMin, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detailsText: { color: colors.textPrimary, fontSize: 14, fontWeight: '800' },
  proofBox: { backgroundColor: colors.surfaceLight, borderRadius: borderRadius.lg, padding: spacing.lg },
});

export const DuelDetailScreen = DuelDetailV1Screen;
