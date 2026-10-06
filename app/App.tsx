import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  AppState,
} from 'react-native';
import * as Linking from 'expo-linking';
import { FreshFeedScreen } from './src/screens/FreshFeedScreen';
import { FreshDuelsScreen } from './src/screens/FreshDuelsScreen';
import { FreshCreateTakeScreen } from './src/screens/FreshCreateTakeScreen';
import { DuelDetailBoundary } from './src/components/DuelDetailBoundary';
import { FreshTakeDetailScreen } from './src/screens/FreshTakeDetailScreen';
import { FreshReceiptScreen } from './src/screens/FreshReceiptScreen';
import { FreshProfileScreen } from './src/screens/FreshProfileScreen';
import { FreshActivityScreen } from './src/screens/FreshActivityScreen';
import { FreshChallengeModal } from './src/components/FreshChallengeModal';
import { FreshChallengeSheet } from './src/components/FreshChallengeSheet';
import { OnboardingModal } from './src/components/OnboardingModal';
import { Icon, IconName } from './src/components/Icon';
import { colors, spacing, borderRadius, touchMin } from './src/theme';
import { connectAndAuthenticate, WalletState, WalletConnectionStatus } from './src/wallet';
import {
  SecureSessionStorage,
  restoreSession,
  saveSession,
  clearSession,
  loadWalletAuthorization,
  saveWalletAuthorization,
  clearWalletAuthorization,
  loadPendingWalletOperation,
  savePendingWalletOperation,
  clearPendingWalletOperation,
  DISCONNECTED,
  hasCompleteCounterProfile,
} from './src/session';
import { api } from './src/api';
import { Take, Duel, Receipt, Challenge } from './src/types';
import { acceptTransitionStage, connectStage, duelSelectionStage, lifecycleStage } from './src/diagnostics';
import type { DuelSelectionReason } from './src/diagnostics';
import type { PendingWalletOperation } from './src/session';
import { syncCoordinator } from './src/syncCoordinator';

type Tab = 'HOME' | 'DUELS' | 'ACTIVITY' | 'PROFILE';

const TABS: { key: Tab; label: string; icon: IconName }[] = [
  { key: 'HOME', label: 'Home', icon: 'home' },
  { key: 'DUELS', label: 'Duels', icon: 'swords' },
  { key: 'ACTIVITY', label: 'Activity', icon: 'bell' },
  { key: 'PROFILE', label: 'Profile', icon: 'user' },
];

export default function App() {
  const [currentTab, setCurrentTab] = useState<Tab>('HOME');
  const [walletState, setWalletState] = useState<WalletState>(DISCONNECTED);
  const [connectionStatus, setConnectionStatus] = useState<WalletConnectionStatus>('IDLE');
  const [restoring, setRestoring] = useState(true);
  const [pendingWalletOperation, setPendingWalletOperation] = useState<PendingWalletOperation | null>(null);
  const connectInFlightRef = useRef(false);
  const autoRecoveryAttemptedRef = useRef<string | null>(null);
  const activeWalletRef = useRef<string | null>(null);
  const [surfaceEpoch, setSurfaceEpoch] = useState(0);

  // Selected Detail Views
  const [selectedDuelId, setSelectedDuelId] = useState<string | null>(null);
  const [acceptTransition, setAcceptTransition] = useState<{ challengeId: string; duelId: string; attemptId: string } | null>(null);
  const [detailTransition, setDetailTransition] = useState<{ challengeId: string; duelId: string; attemptId: string } | null>(null);
  const [duelDetailRetry, setDuelDetailRetry] = useState(0);
  const [selectedTake, setSelectedTake] = useState<Take | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);
  const [showComposer, setShowComposer] = useState(false);
  const [linkNotice, setLinkNotice] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [feedRefresh, setFeedRefresh] = useState(0);
  const [tabFocus, setTabFocus] = useState(0);
  const [duelsActionableCount, setDuelsActionableCount] = useState(0);
  const [activityActionableCount, setActivityActionableCount] = useState(0);
  const [hasVisibleTakes, setHasVisibleTakes] = useState(false);
  const [createdTake, setCreatedTake] = useState<Take | null>(null);

  // Modals
  const [challengeTargetTake, setChallengeTargetTake] = useState<Take | null>(null);
  const [reviewChallenge, setReviewChallenge] = useState<Challenge | null>(null);
  const [createdChallenge, setCreatedChallenge] = useState<Challenge | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  // Other-user profile viewing (overlay; own profile lives on the tab).
  const [viewProfileWallet, setViewProfileWallet] = useState<string | null>(null);
  const selectedDuelRef = useRef<string | null>(null);

  useEffect(() => {
    selectedDuelRef.current = selectedDuelId;
  }, [selectedDuelId]);

  const clearDuelSelection = (reason: DuelSelectionReason) => {
    const current = selectedDuelRef.current;
    if (current) duelSelectionStage('DUEL_SELECTION_CLEARED', { duelId: current, reason });
    selectedDuelRef.current = null;
    setSelectedDuelId(null);
  };

  const selectDuel = (duelId: string, reason: DuelSelectionReason) => {
    const current = selectedDuelRef.current;
    if (current && current !== duelId) {
      duelSelectionStage('DUEL_SELECTION_CLEARED', { duelId: current, reason: 'REPLACED_SELECTION' });
    }
    selectedDuelRef.current = duelId;
    duelSelectionStage('DUEL_SELECTION_SET', { duelId, reason });
    setSelectedDuelId(duelId);
  };

  const invalidateUserScopedState = useCallback((nextWallet: string | null) => {
    setSurfaceEpoch((value) => value + 1);
    setFeedRefresh((value) => value + 1);
    setTabFocus((value) => value + 1);
    setCurrentTab('HOME');
    setCreatedTake(null);
    setCreatedChallenge(null);
    setChallengeTargetTake(null);
    setReviewChallenge(null);
    clearDuelSelection(nextWallet ? 'ACCOUNT_CHANGED' : 'DISCONNECT');
    setSelectedTake(null);
    setSelectedReceipt(null);
    setShowComposer(false);
    setViewProfileWallet(null);
    setDuelsActionableCount(0);
    setActivityActionableCount(0);
    setHasVisibleTakes(false);
    syncCoordinator.setActiveWallet(nextWallet);
  }, []);

  // Capture the app-side of the wallet handoff without recording any wallet
  // payload. Pending work is reconciled after resume; it is never silently
  // discarded when Android suspends or recreates the activity.
  useEffect(() => {
    let previousState = AppState.currentState;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (previousState === 'active' && nextState !== 'active') {
        lifecycleStage('APP_BACKGROUND');
        syncCoordinator.setForeground(false);
      } else if (previousState !== 'active' && nextState === 'active') {
        lifecycleStage('APP_RESUME');
        syncCoordinator.setForeground(true);
        if (!connectInFlightRef.current) {
          void loadPendingWalletOperation().then((pending) => {
            if (!pending) return;
            setPendingWalletOperation(pending);
            if (pending.operationType === 'CONNECT') {
              setShowOnboarding(true);
              if (autoRecoveryAttemptedRef.current !== pending.operationId) {
                setConnectionStatus('RESTORING');
              } else {
                setConnectionStatus('INTERRUPTED');
                setConnectionError('Counter can safely reconnect to your wallet.');
              }
            } else {
              setLinkNotice('Checking your transaction…');
            }
          }).catch(() => {});
        }
      }
      previousState = nextState;
    });
    syncCoordinator.setForeground(AppState.currentState === 'active');
    return () => {
      subscription.remove();
      syncCoordinator.setForeground(false);
    };
  }, []);

  // Restore the securely stored session on cold start. The stored token is
  // validated against the backend; invalid/expired sessions are cleared and
  // yield the disconnected state (never synthesized identity).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [restored, pending] = await Promise.all([
          restoreSession(),
          loadPendingWalletOperation(),
        ]);
        if (cancelled) return;
        if (activeWalletRef.current !== restored.publicKey) {
          invalidateUserScopedState(restored.publicKey);
          activeWalletRef.current = restored.publicKey;
        }
        setWalletState(restored);
        if (pending && pending.operationType === 'CONNECT' && restored.connected) {
          // A valid backend session proves that the interrupted connect reached
          // its terminal state before process death. Do not re-open Phantom.
          await clearPendingWalletOperation();
          setPendingWalletOperation(null);
        } else {
          setPendingWalletOperation(pending);
        }
        setConnectionStatus(
          restored.connected
            ? 'CONNECTED'
            : pending?.operationType === 'CONNECT'
              ? 'INTERRUPTED'
              : 'IDLE',
        );
        setShowOnboarding(!restored.connected || restored.needsProfileSetup === true);
        if (pending && pending.operationType !== 'CONNECT') {
          setLinkNotice('Checking your transaction…');
        } else if (pending?.operationType === 'CONNECT' && !restored.connected) {
          setConnectionError('Counter can safely reconnect to your wallet.');
        }
      } catch {
        if (!cancelled) {
          setWalletState(DISCONNECTED);
          setConnectionStatus('IDLE');
          setShowOnboarding(true);
        }
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Handle Deep Linking
  useEffect(() => {
    const handleDeepLink = (event: { url: string }) => {
      const parsed = Linking.parse(event.url);
      if (parsed.path?.startsWith('duel/')) {
        const duelId = parsed.path.replace('duel/', '');
        clearDetailViews();
        openDuel(duelId, 'DEEP_LINK');
      } else if (parsed.path?.startsWith('receipt/')) {
        const receiptId = parsed.path.replace('receipt/', '');
        clearDetailViews();
        setSelectedTake(null);
        setLinkNotice(null);
        api
          .getReceipt(receiptId)
          .then((receipt) => setSelectedReceipt(receipt))
          .catch(() => setLinkNotice('That receipt link could not be opened. It may be invalid or removed.'));
      } else if (parsed.path?.startsWith('d/') || parsed.path?.startsWith('r/')) {
        // HTTPS app-link paths (/d/slug, /r/id) resolve through the same router.
        const parts = (parsed.path || '').split('/');
        if (parts[0] === 'd' && parts[1]) {
          clearDetailViews();
          openDuel(parts[1], 'DEEP_LINK');
        } else if (parts[0] === 'r' && parts[1]) {
          clearDetailViews();
          api
            .getReceipt(parts[1])
            .then((receipt) => setSelectedReceipt(receipt))
            .catch(() => setLinkNotice('That receipt link could not be opened. It may be invalid or removed.'));
        }
      }
    };

    const sub = Linking.addEventListener('url', handleDeepLink);
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink({ url });
    });

    return () => sub.remove();
  }, []);

  const handleConnectWallet = useCallback(async (recovery = false) => {
    if (connectInFlightRef.current) return;
    connectInFlightRef.current = true;
    // Failures never silently return to idle: the outcome status stays
    // visible (with retry/help) until the user succeeds or dismisses.
    // On success the onboarding sheet stays open: it persists the typed
    // profile draft itself and closes only after verified save.
    try {
      const previous = recovery ? await loadPendingWalletOperation() : null;
      const operationId = recovery && previous?.operationType === 'CONNECT'
        ? previous.operationId
        : `connect_${Date.now().toString(36)}`;
      const expectedWallet = recovery ? previous?.expectedWallet : undefined;
      autoRecoveryAttemptedRef.current = operationId;
      const now = Date.now();
      let pending: PendingWalletOperation = {
        v: 1,
        operationId,
        operationType: 'CONNECT',
        stage: 'CONNECT_START',
        expectedWallet,
        createdAt: previous?.createdAt || now,
        updatedAt: now,
      };
      const persistStage = async (stage: string, changes: Partial<PendingWalletOperation> = {}, logMarker = false) => {
        pending = { ...pending, ...changes, stage, updatedAt: Date.now() };
        await savePendingWalletOperation(SecureSessionStorage, pending);
        setPendingWalletOperation(pending);
        if (logMarker) connectStage(operationId, stage as import('./src/diagnostics').ConnectStage);
      };

      if (recovery) connectStage(operationId, 'CONNECT_RESUME_FOUND_PENDING');
      connectStage(operationId, 'CONNECT_START');
      await persistStage('CONNECT_STATE_SAVED', {}, true);
      setConnectionError(null);
      setConnectionStatus(recovery ? 'RESTORING' : 'CONNECTING');
      setShowOnboarding(true);
      const storedAuthorization = await loadWalletAuthorization();
      const outcome = await connectAndAuthenticate((stage) => {
        setConnectionStatus(stage);
      }, undefined, {
        attemptId: operationId,
        authorization: storedAuthorization,
        expectedWallet,
        onMarker: (stage) => persistStage(stage),
        onAuthorization: async (authorization) => {
          await saveWalletAuthorization(SecureSessionStorage, authorization);
          await persistStage('CONNECT_AUTH_PERSISTED', { expectedWallet: authorization.wallet });
        },
      });
      const { state } = outcome;
      if (state.connected && state.publicKey && state.authToken) {
        setConnectionStatus('RESTORING');
        await persistStage('CONNECT_PROFILE_START', { expectedWallet: state.publicKey }, true);
      try {
          const response: any = await api.getUserProfile(state.publicKey);
          const profile = response?.user || response;
          const needsProfileSetup = !hasCompleteCounterProfile(profile);
          await persistStage('CONNECT_PROFILE_OK', {}, true);
          await saveSession(SecureSessionStorage, {
            wallet: state.publicKey,
            token: state.authToken,
          });
          await persistStage('CONNECT_SESSION_SAVED', {}, true);
          if (activeWalletRef.current !== state.publicKey) {
            invalidateUserScopedState(state.publicKey);
            activeWalletRef.current = state.publicKey;
          }
          setWalletState({ ...state, needsProfileSetup });
          setConnectionStatus('CONNECTED');
          setConnectionError(null);
          setShowOnboarding(needsProfileSetup);
          if (recovery) await persistStage('CONNECT_RECOVERY_COMPLETE');
          await persistStage('CONNECT_COMPLETE', {}, true);
          await clearPendingWalletOperation();
          setPendingWalletOperation(null);
          syncCoordinator.requestSync('CONNECT_COMPLETE');
          if (!needsProfileSetup) setFeedRefresh((n) => n + 1);
        } catch (err: any) {
          await persistStage('CONNECT_ERROR');
          setWalletState({ ...state, needsProfileSetup: true });
          setConnectionStatus('NETWORK_ERROR');
          setConnectionError('Counter could not confirm this wallet profile. Reconnect to continue safely.');
          setShowOnboarding(true);
        }
      } else {
        const failureStage = outcome.walletChanged
          ? 'CONNECT_ERROR'
          : outcome.tokenRejected || outcome.status === 'AUTH_FAILED'
            ? 'CONNECT_AUTH_FAILED'
            : outcome.status === 'USER_REJECTED'
              ? 'CONNECT_CANCELLED'
              : outcome.status === 'MWA_TIMEOUT'
                ? 'CONNECT_TIMEOUT'
                : 'CONNECT_INTERRUPTED';
        await persistStage(failureStage, {}, true);
        if (outcome.tokenRejected) await clearWalletAuthorization();
        setWalletState(DISCONNECTED);
        setConnectionStatus(outcome.walletChanged ? 'WALLET_CHANGED' : outcome.status === 'MWA_TIMEOUT' && recovery ? 'INTERRUPTED' : outcome.status);
        setConnectionError(outcome.walletChanged ? 'Wallet changed. Return to the wallet you started with.' : outcome.detail || 'Connection interrupted. Counter can safely reconnect to your wallet.');
        setShowOnboarding(true);
      }
    } catch {
      setConnectionStatus('INTERRUPTED');
      setConnectionError('Connection interrupted. Counter can safely reconnect to your wallet.');
      setShowOnboarding(true);
    } finally {
      connectInFlightRef.current = false;
    }
  }, []);

  // A stored MWA authorization is safe to reuse after process death or an
  // association loss. First-ever connects without one stay explicit and do
  // not launch a wallet repeatedly in the background.
  useEffect(() => {
    if (restoring || walletState.connected || !pendingWalletOperation || pendingWalletOperation.operationType !== 'CONNECT') return;
    if (autoRecoveryAttemptedRef.current === pendingWalletOperation.operationId || connectInFlightRef.current) return;
    let cancelled = false;
    (async () => {
      const authorization = await loadWalletAuthorization();
      if (cancelled) return;
      if (authorization) {
        await handleConnectWallet(true);
      } else {
        setConnectionStatus('INTERRUPTED');
        setConnectionError('Connection interrupted. Counter can safely reconnect to your wallet.');
        setShowOnboarding(true);
      }
    })().catch(() => {});
    return () => { cancelled = true; };
  }, [restoring, walletState.connected, pendingWalletOperation, handleConnectWallet]);

  const handleDisconnectWallet = async () => {
    await clearSession(SecureSessionStorage);
    await clearWalletAuthorization(SecureSessionStorage);
    await clearPendingWalletOperation(SecureSessionStorage);
    setPendingWalletOperation(null);
    activeWalletRef.current = null;
    invalidateUserScopedState(null);
    setWalletState(DISCONNECTED);
    setConnectionStatus('IDLE');
    setShowOnboarding(true);
  };

  const clearDetailViews = (selectionReason: DuelSelectionReason = 'BACK_TO_DUELS') => {
    clearDuelSelection(selectionReason);
    setAcceptTransition(null);
    setDetailTransition(null);
    setDuelDetailRetry(0);
    setSelectedTake(null);
    setSelectedReceipt(null);
    setShowComposer(false);
    setReviewChallenge(null);
    setViewProfileWallet(null);
    setLinkNotice(null);
  };

  const openAuthorProfile = (w: string | null) => {
    if (w) setViewProfileWallet(w);
  };

  const openTab = (tab: Tab) => {
    clearDetailViews();
    setCurrentTab(tab);
    setTabFocus((n) => n + 1);
    if (tab === 'HOME') setFeedRefresh((n) => n + 1);
  };

  // A Duel detail is an overlay, but it belongs to the Duels section. Keep
  // the bottom-nav state truthful when it is opened from Home, Activity, or
  // Profile rather than leaving an unrelated tab highlighted underneath.
  const openDuel = (duelId: string, selectionReason: DuelSelectionReason = 'REPLACED_SELECTION') => {
    setCurrentTab('DUELS');
    selectDuel(duelId, selectionReason);
  };

  const onDuelsActionableCountChange = useCallback((count: number) => {
    setDuelsActionableCount(count);
  }, []);
  const onActivityActionableCountChange = useCallback((count: number) => {
    setActivityActionableCount(count);
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      <View style={styles.content}>
        {linkNotice ? (
          <View style={styles.linkNotice}>
            <Text style={styles.linkNoticeText}>{linkNotice}</Text>
            <TouchableOpacity onPress={() => setLinkNotice(null)} style={styles.linkNoticeBtn} accessibilityLabel="Dismiss link error">
              <Text style={styles.linkNoticeBtnText}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {/* Tabs stay mounted (display none) so scroll position and loaded
            content survive detail navigation. */}
        <View style={[styles.fill, currentTab === 'HOME' ? null : styles.hidden]}>
          <FreshFeedScreen
            key={`home-${surfaceEpoch}`}
            onSelectTake={(take: Take) => setSelectedTake(take)}
            onSelectDuel={(duel: Duel) => openDuel(duel.id, 'DUEL_ROW')}
            onHasVisibleTakesChange={setHasVisibleTakes}
            onChallengePress={(take: Take) => setChallengeTargetTake(take)}
            onCreateTakePress={() => {
              clearDetailViews();
              setShowComposer(true);
            }}
            onOpenProfile={() => openTab('PROFILE')}
            onOpenAuthorProfile={openAuthorProfile}
            userWallet={walletState.publicKey}
            createdTake={createdTake}
            refreshSignal={feedRefresh}
            focusSignal={tabFocus}
          />
        </View>
        <View style={[styles.fill, currentTab === 'DUELS' ? null : styles.hidden]}>
          <FreshDuelsScreen
            key={`duels-${surfaceEpoch}`}
            userWallet={walletState.publicKey}
            onSelectDuel={(duel: Duel) => openDuel(duel.id, 'DUEL_ROW')}
            onOpenChallenge={(challenge) => setReviewChallenge(challenge)}
            createdChallenge={createdChallenge}
            focusSignal={tabFocus}
            onActionableCountChange={onDuelsActionableCountChange}
          />
        </View>
        <View style={[styles.fill, currentTab === 'ACTIVITY' ? null : styles.hidden]}>
          <FreshActivityScreen
            key={`activity-${surfaceEpoch}`}
            onSelectNotification={(notif) => {
              if (notif.target_type === 'DUEL' || notif.target_type === 'RECEIPT') {
                openDuel(notif.target_id.replace('receipt_', ''), 'ACTIVITY_NOTIFICATION');
              }
            }}
            onOpenChallenge={(challenge) => setReviewChallenge(challenge)}
            focusSignal={tabFocus}
            onActionableCountChange={onActivityActionableCountChange}
          />
        </View>
        <View style={[styles.fill, currentTab === 'PROFILE' ? null : styles.hidden]}>
          <FreshProfileScreen
            key={`profile-${surfaceEpoch}`}
            wallet={walletState.publicKey}
            ownWallet={walletState.publicKey}
            onDisconnect={handleDisconnectWallet}
            onSelectTake={(take: Take) => setSelectedTake(take)}
            onSelectDuel={(duel: Duel) => openDuel(duel.id, 'DUEL_ROW')}
            onSelectReceipt={(receipt: Receipt) => setSelectedReceipt(receipt)}
            onProfileSaved={() => setFeedRefresh((n) => n + 1)}
            focusSignal={tabFocus}
          />
        </View>
        {showComposer && (
          <View style={styles.overlay}>
            <FreshCreateTakeScreen
              onSuccess={(take) => {
                setCreatedTake(take);
                setShowComposer(false);
                setCurrentTab('HOME');
                setFeedRefresh((n) => n + 1);
                syncCoordinator.mutationSucceeded('POST_TAKE');
              }}
              onCancel={() => setShowComposer(false)}
            />
          </View>
        )}
        {selectedTake && (
          <View style={styles.overlay}>
            <FreshTakeDetailScreen
              take={selectedTake}
              onBack={() => setSelectedTake(null)}
              onSelectDuel={(duel) => {
                clearDetailViews();
                openDuel(duel.id, 'DUEL_ROW');
              }}
              onChallengeTake={(take) => setChallengeTargetTake(take)}
              onOpenAuthorProfile={openAuthorProfile}
              onTakeDeleted={() => {
                clearDetailViews();
                setFeedRefresh((n) => n + 1);
              }}
              userWallet={walletState.publicKey}
            />
          </View>
        )}
        {acceptTransition && !selectedDuelId && (
          <View style={[styles.overlay, styles.openingOverlay]}>
            <Text style={styles.openingTitle}>Opening your Duel…</Text>
            <Text style={styles.openingCopy}>Your challenge was accepted. Loading the existing Duel.</Text>
          </View>
        )}
        {selectedDuelId && (
          <View style={styles.overlay}>
            <DuelDetailBoundary
              key={`${selectedDuelId}:${duelDetailRetry}`}
              duelId={selectedDuelId}
              userWallet={walletState.publicKey}
              challengeId={detailTransition?.challengeId}
              attemptId={detailTransition?.attemptId}
              onBack={() => {
                clearDuelSelection('BACK_TO_DUELS');
                setAcceptTransition(null);
                setDetailTransition(null);
                setDuelDetailRetry(0);
              }}
              onRetry={() => setDuelDetailRetry((value) => value + 1)}
              onViewReceipt={(receiptId) => selectDuel(receiptId.replace('receipt_', ''), 'RECEIPT_VIEW')}
            />
          </View>
        )}
        {selectedReceipt && (
          <View style={styles.overlay}>
            <FreshReceiptScreen
              receipt={selectedReceipt}
              onBack={() => setSelectedReceipt(null)}
              onViewDuel={(duelId) => {
                clearDetailViews();
                openDuel(duelId, 'RECEIPT_VIEW');
              }}
            />
          </View>
        )}
        {viewProfileWallet && (
          <View style={styles.overlay}>
            <FreshProfileScreen
              wallet={viewProfileWallet}
              ownWallet={walletState.publicKey}
              onBack={() => setViewProfileWallet(null)}
              onDisconnect={handleDisconnectWallet}
              onSelectTake={(take: Take) => {
                clearDetailViews();
                setSelectedTake(take);
              }}
              onSelectDuel={(duel: Duel) => {
                clearDetailViews();
                openDuel(duel.id, 'DUEL_ROW');
              }}
              onSelectReceipt={(receipt: Receipt) => setSelectedReceipt(receipt)}
            />
          </View>
        )}
      </View>

      {hasVisibleTakes && currentTab === 'HOME' && !showComposer && !selectedDuelId && !selectedTake && !selectedReceipt && !viewProfileWallet && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => {
            clearDetailViews();
            setShowComposer(true);
          }}
          activeOpacity={0.85}
          accessibilityLabel="Post a take"
          accessibilityRole="button"
        >
          <Icon name="plus" size={24} color="#000000" />
        </TouchableOpacity>
      )}

      <FreshChallengeModal
        visible={!!challengeTargetTake}
        take={challengeTargetTake}
        onClose={() => setChallengeTargetTake(null)}
        onChallengeCreated={(created) => {
          // Keep the server-returned object locally so the Sent row is
          // visible even before the refreshed transaction-home request lands.
          setCreatedChallenge(created);
          setChallengeTargetTake(null);
          setCurrentTab('DUELS');
          setTabFocus((n) => n + 1);
        }}
      />

      <FreshChallengeSheet
        challenge={reviewChallenge}
        userWallet={walletState.publicKey}
        onClose={() => setReviewChallenge(null)}
        onAcceptResolved={(duel, attemptId) => {
          setAcceptTransition({ challengeId: reviewChallenge?.id || 'unknown', duelId: duel.id, attemptId });
        }}
        onDecided={(duel, attemptId) => {
          setReviewChallenge(null);
          setTabFocus((n) => n + 1);
          if (duel) {
            const transition = acceptTransition;
            acceptTransitionStage('DUEL_DETAIL_SELECT', {
              challengeId: transition?.challengeId || reviewChallenge?.id || 'unknown',
              duelId: duel.id,
              attemptId: attemptId || transition?.attemptId || 'unknown',
            });
            clearDetailViews();
            setDetailTransition({
              challengeId: transition?.challengeId || reviewChallenge?.id || 'unknown',
              duelId: duel.id,
              attemptId: attemptId || transition?.attemptId || 'unknown',
            });
            openDuel(duel.id, 'ACCEPTED_CHALLENGE');
          }
        }}
      />

      <OnboardingModal
        visible={showOnboarding}
        onClose={() => setShowOnboarding(false)}
        wallet={walletState.publicKey}
        connectionStatus={connectionStatus}
        connectionError={connectionError}
        onConnectWallet={handleConnectWallet}
        onProfileUpdated={() => setFeedRefresh((n) => n + 1)}
      />

      <View style={styles.tabBar}>
        {TABS.map((tab) => {
          const active = currentTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={styles.tabItem}
              onPress={() => openTab(tab.key)}
              activeOpacity={0.8}
              accessibilityLabel={tab.label}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <Icon
                name={tab.icon}
                size={22}
                color={active ? colors.brandPrimary : colors.textSecondary}
              />
              {((tab.key === 'DUELS' ? duelsActionableCount : tab.key === 'ACTIVITY' ? activityActionableCount : 0) > 0) && (
                <View style={styles.tabBadge}>
                  <Text style={styles.tabBadgeText}>
                    {Math.min(99, tab.key === 'DUELS' ? duelsActionableCount : activityActionableCount)}
                  </Text>
                </View>
              )}
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
  },
  // Tab panes stay mounted so scroll position survives detail navigation;
  // hidden panes keep state but paint nothing.
  fill: {
    flex: 1,
  },
  hidden: {
    display: 'none',
  },
  // Detail views overlay the tabs without unmounting them.
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background,
  },
  openingOverlay: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  openingTitle: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  openingCopy: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: 84,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.brandPrimary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  linkNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    gap: spacing.md,
  },
  linkNoticeText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 13,
  },
  linkNoticeBtn: {
    minHeight: touchMin,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  linkNoticeBtnText: {
    color: colors.brandPrimary,
    fontWeight: '700',
    fontSize: 13,
  },
  tabBar: {
    flexDirection: 'row',
    minHeight: 64,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    alignItems: 'stretch',
    justifyContent: 'space-around',
    paddingBottom: spacing.xs,
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    minHeight: 60,
    paddingVertical: spacing.xs,
  },
  tabLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 3,
  },
  tabLabelActive: {
    color: colors.brandPrimary,
    fontWeight: '700',
  },
  tabBadge: {
    position: 'absolute',
    top: 2,
    right: 18,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.brandPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeText: {
    color: '#000000',
    fontSize: 10,
    fontWeight: '900',
  },
});
