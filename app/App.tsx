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
import { ChallengeModal } from './src/components/ChallengeModal';
import { ChallengeSheet } from './src/components/ChallengeSheet';
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

  // Modals
  const [challengeTargetTake, setChallengeTargetTake] = useState<Take | null>(null);
  const [reviewChallenge, setReviewChallenge] = useState<Challenge | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);

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
        setShowOnboarding(!restored.connected);
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
      setWalletState(state);
      setConnectionStatus('CONNECTED');
      setConnectionError(null);
      setShowOnboarding(false);
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
    setLinkNotice(null);
  };

  const openTab = (tab: Tab) => {
    clearDetailViews();
    setCurrentTab(tab);
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
        {showComposer ? (
          <CreateTakeScreen
            onSuccess={() => {
              setShowComposer(false);
              setCurrentTab('HOME');
              setFeedRefresh((n) => n + 1);
            }}
            onCancel={() => setShowComposer(false)}
          />
        ) : selectedDuelId ? (
          <DuelDetailScreen
            duelId={selectedDuelId}
            userWallet={walletState.publicKey}
            onBack={() => setSelectedDuelId(null)}
            onViewReceipt={(receiptId) => setSelectedDuelId(receiptId.replace('receipt_', ''))}
            isArenaEligible={walletState.isArenaEligible}
            skrStakedAmount={walletState.skrStakedAmount}
          />
        ) : selectedTake ? (
          <TakeDetailScreen
            take={selectedTake}
            onBack={() => setSelectedTake(null)}
            onSelectDuel={(duel) => {
              clearDetailViews();
              setSelectedDuelId(duel.id);
            }}
            onChallengeTake={(take) => setChallengeTargetTake(take)}
            userWallet={walletState.publicKey}
          />
        ) : selectedReceipt ? (
          <ReceiptScreen
            receipt={selectedReceipt}
            onBack={() => setSelectedReceipt(null)}
            onViewDuel={(duelId) => {
              clearDetailViews();
              setSelectedDuelId(duelId);
            }}
          />
        ) : (
          <>
            {currentTab === 'HOME' && (
              <FeedScreen
                onSelectTake={(take: Take) => setSelectedTake(take)}
                onSelectDuel={(duel: Duel) => setSelectedDuelId(duel.id)}
                onChallengePress={(take: Take) => setChallengeTargetTake(take)}
                onCreateTakePress={() => {
                  clearDetailViews();
                  setShowComposer(true);
                }}
                onOpenProfile={() => openTab('PROFILE')}
                userWallet={walletState.publicKey}
                refreshSignal={feedRefresh}
              />
            )}

            {currentTab === 'DUELS' && (
              <DuelsScreen
                userWallet={walletState.publicKey}
                onSelectDuel={(duel: Duel) => setSelectedDuelId(duel.id)}
              />
            )}

            {currentTab === 'ACTIVITY' && (
              <ActivityScreen
                onSelectNotification={(notif) => {
                  if (notif.target_type === 'DUEL' || notif.target_type === 'RECEIPT') {
                    setSelectedDuelId(notif.target_id.replace('receipt_', ''));
                  }
                }}
                onOpenChallenge={(challenge) => setReviewChallenge(challenge)}
              />
            )}

            {currentTab === 'PROFILE' && (
              <ProfileScreen
                wallet={walletState.publicKey}
                onDisconnect={handleDisconnectWallet}
                onSelectTake={(take: Take) => setSelectedTake(take)}
                onSelectDuel={(duel: Duel) => setSelectedDuelId(duel.id)}
                onSelectReceipt={(receipt: Receipt) => setSelectedReceipt(receipt)}
              />
            )}
          </>
        )}
      </View>

      {currentTab === 'HOME' && !showComposer && !selectedDuelId && !selectedTake && !selectedReceipt && (
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

      <ChallengeModal
        visible={!!challengeTargetTake}
        take={challengeTargetTake}
        onClose={() => setChallengeTargetTake(null)}
        onChallengeCreated={() => {
          setChallengeTargetTake(null);
          setCurrentTab('HOME');
        }}
      />

      <ChallengeSheet
        challenge={reviewChallenge}
        userWallet={walletState.publicKey}
        onClose={() => setReviewChallenge(null)}
        onDecided={(duel) => {
          setReviewChallenge(null);
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
