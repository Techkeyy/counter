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
import { ProfileScreen } from './src/screens/ProfileScreen';
import { ActivityScreen } from './src/screens/ActivityScreen';
import { colors, spacing } from './src/theme';
import { connectAndAuthenticate, WalletState } from './src/wallet';
import { Take, Duel } from './src/types';

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

  // Handle Deep Linking
  useEffect(() => {
    const handleDeepLink = (event: { url: string }) => {
      const parsed = Linking.parse(event.url);
      console.log('[DEEP LINK PARSED]:', parsed);
      if (parsed.path?.startsWith('duel/')) {
        const duelId = parsed.path.replace('duel/', '');
        setSelectedDuelId(duelId);
      } else if (parsed.path?.startsWith('receipt/')) {
        const receiptId = parsed.path.replace('receipt/', '');
        setSelectedDuelId(receiptId.replace('receipt_', ''));
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={colors.surface} />
      
      {/* Top Header */}
      <Header
        wallet={walletState.publicKey}
        isArenaEligible={walletState.isArenaEligible}
        onConnectWallet={handleConnectWallet}
        onOpenNotifications={() => {
          setSelectedDuelId(null);
          setCurrentTab('ACTIVITY');
        }}
        unreadCount={2}
      />

      {/* Main Content Router */}
      <View style={styles.content}>
        {selectedDuelId ? (
          <DuelDetailScreen
            duelId={selectedDuelId}
            onBack={() => setSelectedDuelId(null)}
            onViewReceipt={(receiptId) => setSelectedDuelId(receiptId.replace('receipt_', ''))}
          />
        ) : (
          <>
            {currentTab === 'FEED' && (
              <FeedScreen
                onSelectTake={(take: Take) => {}}
                onSelectDuel={(duel: Duel) => setSelectedDuelId(duel.id)}
                onCreateTakePress={() => setCurrentTab('CREATE')}
              />
            )}

            {currentTab === 'ARENA' && (
              <ArenaScreen
                isArenaEligible={walletState.isArenaEligible}
                skrStakedAmount={walletState.skrStakedAmount}
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
              />
            )}
          </>
        )}
      </View>

      {/* Bottom Navigation Bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => {
            setSelectedDuelId(null);
            setCurrentTab('FEED');
          }}
          activeOpacity={0.8}
        >
          <Text style={styles.tabIcon}>⚔️</Text>
          <Text style={[styles.tabLabel, currentTab === 'FEED' && styles.tabLabelActive]}>
            Feed
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => {
            setSelectedDuelId(null);
            setCurrentTab('ARENA');
          }}
          activeOpacity={0.8}
        >
          <Text style={styles.tabIcon}>⭐</Text>
          <Text style={[styles.tabLabel, currentTab === 'ARENA' && styles.tabLabelActive]}>
            Arena
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => {
            setSelectedDuelId(null);
            setCurrentTab('CREATE');
          }}
          activeOpacity={0.8}
        >
          <View style={styles.createTabBadge}>
            <Text style={styles.createIcon}>+</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => {
            setSelectedDuelId(null);
            setCurrentTab('ACTIVITY');
          }}
          activeOpacity={0.8}
        >
          <Text style={styles.tabIcon}>🔔</Text>
          <Text style={[styles.tabLabel, currentTab === 'ACTIVITY' && styles.tabLabelActive]}>
            Activity
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => {
            setSelectedDuelId(null);
            setCurrentTab('PROFILE');
          }}
          activeOpacity={0.8}
        >
          <Text style={styles.tabIcon}>👤</Text>
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
    height: 64,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  tabIcon: {
    fontSize: 18,
    marginBottom: 2,
  },
  tabLabel: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '700',
  },
  tabLabelActive: {
    color: colors.solanaGreen,
    fontWeight: '900',
  },
  createTabBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.solanaPurple,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    shadowColor: colors.solanaPurple,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.5,
    shadowRadius: 5,
    elevation: 4,
  },
  createIcon: {
    color: '#FFF',
    fontSize: 24,
    fontWeight: '900',
    marginTop: -2,
  },
});
