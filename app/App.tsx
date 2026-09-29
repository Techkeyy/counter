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
import { ArenaScreen } from './src/screens/ArenaScreen';
import { CreateTakeScreen } from './src/screens/CreateTakeScreen';
import { DuelDetailScreen } from './src/screens/DuelDetailScreen';
import { TakeDetailScreen } from './src/screens/TakeDetailScreen';
import { ReceiptScreen } from './src/screens/ReceiptScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { ActivityScreen } from './src/screens/ActivityScreen';
import { ChallengeModal } from './src/components/ChallengeModal';
import { OnboardingModal } from './src/components/OnboardingModal';
import { Icon } from './src/components/Icon';
import { colors, spacing, borderRadius } from './src/theme';
import { connectAndAuthenticate, WalletState } from './src/wallet';
import { api } from './src/api';
import { Take, Duel, Receipt } from './src/types';

type Tab = 'FEED' | 'ARENA' | 'CREATE' | 'ACTIVITY' | 'PROFILE';

export default function App() {
  const [currentTab, setCurrentTab] = useState<Tab>('FEED');
  const [walletState, setWalletState] = useState<WalletState>({
    connected: false,
    publicKey: null,
    authToken: null,
    isArenaEligible: false,
    skrStakedAmount: 0,
  });

  // Selected Detail Views
  const [selectedDuelId, setSelectedDuelId] = useState<string | null>(null);
  const [selectedTake, setSelectedTake] = useState<Take | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);

  // Modals
  const [challengeTargetTake, setChallengeTargetTake] = useState<Take | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Handle Deep Linking
  useEffect(() => {
    const handleDeepLink = (event: { url: string }) => {
      const parsed = Linking.parse(event.url);
      console.log('[DEEP LINK PARSED]:', parsed);
      if (parsed.path?.startsWith('duel/')) {
        const duelId = parsed.path.replace('duel/', '');
        setSelectedDuelId(duelId);
        setSelectedTake(null);
        setSelectedReceipt(null);
      } else if (parsed.path?.startsWith('receipt/')) {
        // counter://receipt/:id must render the permanent receipt, not the duel.
        const receiptId = parsed.path.replace('receipt/', '');
        setSelectedDuelId(null);
        setSelectedTake(null);
        setSelectedReceipt(null);
        api
          .getReceipt(receiptId)
          .then((receipt) => setSelectedReceipt(receipt))
          .catch((err) => console.warn('[DEEP LINK] receipt fetch failed:', err?.message));
      }
    };

    const sub = Linking.addEventListener('url', handleDeepLink);
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink({ url });
    });

    return () => sub.remove();
  }, []);

  const handleConnectWallet = async () => {
    const state = await connectAndAuthenticate();
    setWalletState(state);
    if (!state.connected) {
      setShowOnboarding(true);
    }
  };

  const handleDisconnectWallet = () => {
    setWalletState({
      connected: false,
      publicKey: null,
      authToken: null,
      isArenaEligible: false,
      skrStakedAmount: 0,
    });
  };

  const clearDetailViews = () => {
    setSelectedDuelId(null);
    setSelectedTake(null);
    setSelectedReceipt(null);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={colors.surface} />

      {/* Top Header */}
      <Header
        wallet={walletState.publicKey}
        isArenaEligible={walletState.isArenaEligible}
        onConnectWallet={handleConnectWallet}
        onOpenNotifications={() => {
          clearDetailViews();
          setCurrentTab('ACTIVITY');
        }}
        unreadCount={0}
      />

      {/* Main Content Router */}
      <View style={styles.content}>
        {selectedDuelId ? (
          <DuelDetailScreen
            duelId={selectedDuelId}
            userWallet={walletState.publicKey}
            onBack={() => setSelectedDuelId(null)}
            onViewReceipt={(receiptId) => setSelectedDuelId(receiptId.replace('receipt_', ''))}
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
            {currentTab === 'FEED' && (
              <FeedScreen
                onSelectTake={(take: Take) => setSelectedTake(take)}
                onSelectDuel={(duel: Duel) => setSelectedDuelId(duel.id)}
                onSelectReceipt={(receipt: Receipt) => setSelectedReceipt(receipt)}
                onChallengePress={(take: Take) => setChallengeTargetTake(take)}
                onCreateTakePress={() => setCurrentTab('CREATE')}
                userWallet={walletState.publicKey}
              />
            )}

            {currentTab === 'ARENA' && (
              <ArenaScreen
                isArenaEligible={walletState.isArenaEligible}
                skrStakedAmount={walletState.skrStakedAmount}
                userWallet={walletState.publicKey}
                onSelectDuel={(duel: Duel) => setSelectedDuelId(duel.id)}
              />
            )}

            {currentTab === 'CREATE' && (
              <CreateTakeScreen
                onSuccess={() => setCurrentTab('FEED')}
                onCancel={() => setCurrentTab('FEED')}
              />
            )}

            {currentTab === 'ACTIVITY' && (
              <ActivityScreen
                onSelectNotification={(notif) => {
                  if (notif.target_type === 'DUEL' || notif.target_type === 'RECEIPT') {
                    setSelectedDuelId(notif.target_id.replace('receipt_', ''));
                  }
                }}
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

      {/* Challenge Bottom Sheet Modal */}
      <ChallengeModal
        visible={!!challengeTargetTake}
        take={challengeTargetTake}
        onClose={() => setChallengeTargetTake(null)}
        onChallengeCreated={() => {
          setChallengeTargetTake(null);
          setCurrentTab('FEED');
        }}
      />

      {/* Onboarding Flow Modal */}
      <OnboardingModal
        visible={showOnboarding}
        onClose={() => setShowOnboarding(false)}
        wallet={walletState.publicKey}
        onConnectWallet={handleConnectWallet}
      />

      {/* Bottom Navigation Bar with Vector Icons (Zero Emojis) */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => {
            clearDetailViews();
            setCurrentTab('FEED');
          }}
          activeOpacity={0.8}
        >
          <Icon
            name="swords"
            size={20}
            color={currentTab === 'FEED' ? colors.solanaGreen : colors.textSecondary}
          />
          <Text style={[styles.tabLabel, currentTab === 'FEED' && styles.tabLabelActive]}>
            Feed
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => {
            clearDetailViews();
            setCurrentTab('ARENA');
          }}
          activeOpacity={0.8}
        >
          <Icon
            name="trophy"
            size={20}
            color={currentTab === 'ARENA' ? colors.arenaBadge : colors.textSecondary}
          />
          <Text style={[styles.tabLabel, currentTab === 'ARENA' && styles.tabLabelActive]}>
            Arena
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => {
            clearDetailViews();
            setCurrentTab('CREATE');
          }}
          activeOpacity={0.8}
        >
          <View style={styles.createTabBadge}>
            <Icon name="plus" size={20} color="#000000" />
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => {
            clearDetailViews();
            setCurrentTab('ACTIVITY');
          }}
          activeOpacity={0.8}
        >
          <Icon
            name="bell"
            size={20}
            color={currentTab === 'ACTIVITY' ? colors.solanaGreen : colors.textSecondary}
          />
          <Text style={[styles.tabLabel, currentTab === 'ACTIVITY' && styles.tabLabelActive]}>
            Activity
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => {
            clearDetailViews();
            setCurrentTab('PROFILE');
          }}
          activeOpacity={0.8}
        >
          <Icon
            name="user"
            size={20}
            color={currentTab === 'PROFILE' ? colors.solanaGreen : colors.textSecondary}
          />
          <Text style={[styles.tabLabel, currentTab === 'PROFILE' && styles.tabLabelActive]}>
            Profile
          </Text>
        </TouchableOpacity>
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
  tabBar: {
    flexDirection: 'row',
    height: 60,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingBottom: spacing.xs,
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    paddingVertical: spacing.xs,
  },
  tabLabel: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 3,
  },
  tabLabelActive: {
    color: colors.solanaGreen,
    fontWeight: '700',
  },
  createTabBadge: {
    width: 38,
    height: 38,
    borderRadius: borderRadius.full,
    backgroundColor: colors.solanaGreen,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
