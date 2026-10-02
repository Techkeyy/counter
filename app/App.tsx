import React, { useState, useEffect } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import * as Linking from 'expo-linking';
import { Header } from './src/components/Header';
import { FeedScreen } from './src/screens/FeedScreen';
import { DuelsScreen } from './src/screens/DuelsScreen';
import { CreateTakeScreen } from './src/screens/CreateTakeScreen';
import { DuelDetailScreen } from './src/screens/DuelDetailScreen';
import { TakeDetailScreen } from './src/screens/TakeDetailScreen';
import { ReceiptScreen } from './src/screens/ReceiptScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { ActivityScreen } from './src/screens/ActivityScreen';
import { ChallengeModalV1 } from './src/components/ChallengeModalV1';
import { ChallengeSheetV1 } from './src/components/ChallengeSheetV1';
import { OnboardingModal } from './src/components/OnboardingModal';
import { Icon, IconName } from './src/components/Icon';
import { colors, spacing, borderRadius, touchMin } from './src/theme';
import { connectAndAuthenticate, WalletState, WalletConnectionStatus } from './src/wallet';
import {
  SecureSessionStorage,
  restoreSession,
  saveSession,
  clearSession,
  DISCONNECTED,
  hasCompleteCounterProfile,
} from './src/session';
import { api } from './src/api';
import { Take, Duel, Receipt, Challenge } from './src/types';

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

  // Selected Detail Views
  const [selectedDuelId, setSelectedDuelId] = useState<string | null>(null);
  const [selectedTake, setSelectedTake] = useState<Take | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);
  const [showComposer, setShowComposer] = useState(false);
  const [linkNotice, setLinkNotice] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [feedRefresh, setFeedRefresh] = useState(0);
  const [tabFocus, setTabFocus] = useState(0);

  // Modals
  const [challengeTargetTake, setChallengeTargetTake] = useState<Take | null>(null);
  const [reviewChallenge, setReviewChallenge] = useState<Challenge | null>(null);
  const [createdChallenge, setCreatedChallenge] = useState<Challenge | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  // Other-user profile viewing (overlay; own profile lives on the tab).
  const [viewProfileWallet, setViewProfileWallet] = useState<string | null>(null);

  // Restore the securely stored session on cold start. The stored token is
  // validated against the backend; invalid/expired sessions are cleared and
  // yield the disconnected state (never synthesized identity).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const restored = await restoreSession();
        if (cancelled) return;
        setWalletState(restored);
        setConnectionStatus(restored.connected ? 'CONNECTED' : 'IDLE');
        setShowOnboarding(!restored.connected || restored.needsProfileSetup === true);
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
        setSelectedDuelId(duelId);
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
          setSelectedDuelId(parts[1]);
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

  const handleConnectWallet = async () => {
    // Failures never silently return to idle: the outcome status stays
    // visible (with retry/help) until the user succeeds or dismisses.
    // On success the onboarding sheet stays open: it persists the typed
    // profile draft itself and closes only after verified save.
    setConnectionError(null);
    setConnectionStatus('CONNECTING');
    const outcome = await connectAndAuthenticate((stage) => {
      setConnectionStatus(stage);
    });
    const { state } = outcome;
    if (state.connected && state.publicKey && state.authToken) {
      try {
        await saveSession(SecureSessionStorage, {
          wallet: state.publicKey,
          token: state.authToken,
        });
      } catch (err) {
        console.warn('[SESSION] persist failed:', (err as Error)?.message);
      }
      try {
        // Authentication creates a placeholder profile for new wallets. The
        // canonical profile read—not the wallet address or cached session—is
        // what decides whether setup is still required.
        const response: any = await api.getUserProfile(state.publicKey);
        const profile = response?.user || response;
        const needsProfileSetup = !hasCompleteCounterProfile(profile);
        setWalletState({ ...state, needsProfileSetup });
        setConnectionStatus('CONNECTED');
        setConnectionError(null);
        setShowOnboarding(needsProfileSetup);
        if (!needsProfileSetup) setFeedRefresh((n) => n + 1);
      } catch (err: any) {
        setWalletState({ ...state, needsProfileSetup: true });
        setConnectionStatus('NETWORK_ERROR');
        setConnectionError('Counter could not confirm this wallet profile. Retry to continue safely.');
        setShowOnboarding(true);
        console.warn('[PROFILE] canonical profile check failed:', err?.message);
      }
    } else {
      await clearSession(SecureSessionStorage);
      setWalletState(DISCONNECTED);
      setConnectionStatus(outcome.status);
      setConnectionError(outcome.detail || null);
      setShowOnboarding(true);
    }
  };

  const handleDisconnectWallet = async () => {
    await clearSession(SecureSessionStorage);
    setWalletState(DISCONNECTED);
    setConnectionStatus('IDLE');
    setShowOnboarding(true);
  };

  const clearDetailViews = () => {
    setSelectedDuelId(null);
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={colors.surface} />

      <Header
        wallet={walletState.publicKey}
        onAvatarPress={() => openTab('PROFILE')}
      />

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
          <FeedScreen
            onSelectTake={(take: Take) => setSelectedTake(take)}
            onSelectDuel={(duel: Duel) => setSelectedDuelId(duel.id)}
            onChallengePress={(take: Take) => setChallengeTargetTake(take)}
            onCreateTakePress={() => {
              clearDetailViews();
              setShowComposer(true);
            }}
            onOpenProfile={() => openTab('PROFILE')}
            onOpenAuthorProfile={openAuthorProfile}
            userWallet={walletState.publicKey}
            refreshSignal={feedRefresh}
            focusSignal={tabFocus}
          />
        </View>
        <View style={[styles.fill, currentTab === 'DUELS' ? null : styles.hidden]}>
          <DuelsScreen
            userWallet={walletState.publicKey}
            onSelectDuel={(duel: Duel) => setSelectedDuelId(duel.id)}
            onOpenChallenge={(challenge) => setReviewChallenge(challenge)}
            createdChallenge={createdChallenge}
            focusSignal={tabFocus}
          />
        </View>
        <View style={[styles.fill, currentTab === 'ACTIVITY' ? null : styles.hidden]}>
          <ActivityScreen
            onSelectNotification={(notif) => {
              if (notif.target_type === 'DUEL' || notif.target_type === 'RECEIPT') {
                setSelectedDuelId(notif.target_id.replace('receipt_', ''));
              }
            }}
            onOpenChallenge={(challenge) => setReviewChallenge(challenge)}
            focusSignal={tabFocus}
          />
        </View>
        <View style={[styles.fill, currentTab === 'PROFILE' ? null : styles.hidden]}>
          <ProfileScreen
            wallet={walletState.publicKey}
            ownWallet={walletState.publicKey}
            onDisconnect={handleDisconnectWallet}
            onSelectTake={(take: Take) => setSelectedTake(take)}
            onSelectDuel={(duel: Duel) => setSelectedDuelId(duel.id)}
            onSelectReceipt={(receipt: Receipt) => setSelectedReceipt(receipt)}
            onProfileSaved={() => setFeedRefresh((n) => n + 1)}
            focusSignal={tabFocus}
          />
        </View>
        {showComposer && (
          <View style={styles.overlay}>
            <CreateTakeScreen
              onSuccess={() => {
                setShowComposer(false);
                setCurrentTab('HOME');
                setFeedRefresh((n) => n + 1);
              }}
              onCancel={() => setShowComposer(false)}
            />
          </View>
        )}
        {selectedTake && (
          <View style={styles.overlay}>
            <TakeDetailScreen
              take={selectedTake}
              onBack={() => setSelectedTake(null)}
              onSelectDuel={(duel) => {
                clearDetailViews();
                setSelectedDuelId(duel.id);
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
        {selectedDuelId && (
          <View style={styles.overlay}>
            <DuelDetailScreen
              duelId={selectedDuelId}
              userWallet={walletState.publicKey}
              onBack={() => setSelectedDuelId(null)}
              onViewReceipt={(receiptId) => setSelectedDuelId(receiptId.replace('receipt_', ''))}
            />
          </View>
        )}
        {selectedReceipt && (
          <View style={styles.overlay}>
            <ReceiptScreen
              receipt={selectedReceipt}
              onBack={() => setSelectedReceipt(null)}
              onViewDuel={(duelId) => {
                clearDetailViews();
                setSelectedDuelId(duelId);
              }}
            />
          </View>
        )}
        {viewProfileWallet && (
          <View style={styles.overlay}>
            <ProfileScreen
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
                setSelectedDuelId(duel.id);
              }}
              onSelectReceipt={(receipt: Receipt) => setSelectedReceipt(receipt)}
            />
          </View>
        )}
      </View>

      {currentTab === 'HOME' && !showComposer && !selectedDuelId && !selectedTake && !selectedReceipt && !viewProfileWallet && (
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

      <ChallengeModalV1
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

      <ChallengeSheetV1
        challenge={reviewChallenge}
        userWallet={walletState.publicKey}
        onClose={() => setReviewChallenge(null)}
        onDecided={(duel) => {
          setReviewChallenge(null);
          setTabFocus((n) => n + 1);
          if (duel) {
            clearDetailViews();
            setSelectedDuelId(duel.id);
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
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
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
});
