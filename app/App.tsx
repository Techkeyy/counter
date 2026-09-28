import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import * as Linking from 'expo-linking';
import { Buffer } from 'buffer';
import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
} from '@solana/web3.js';
import { transact } from '@solana-mobile/mobile-wallet-adapter-protocol-web3js';

const APP_IDENTITY = {
  name: 'Counter',
  uri: 'https://counter.app',
  icon: 'favicon.png',
};

const DEVNET_RPC = 'https://api.devnet.solana.com';

export default function App() {
  const [walletPublicKey, setWalletPublicKey] = useState<string | null>(null);
  const [cluster, setCluster] = useState<string>('devnet');
  const [txState, setTxState] = useState<
    'IDLE' | 'REQUESTED' | 'SIGNING' | 'SUBMITTED' | 'CONFIRMED' | 'FAILED'
  >('IDLE');
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [currentDuelId, setCurrentDuelId] = useState<string>('duel_gate_a');
  const [lastDeepLinkUrl, setLastDeepLinkUrl] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('Ready for Gate A Verification');

  // Handle Android Deep Linking (counter://duel/:id or https://counter.app/d/:id)
  useEffect(() => {
    const handleUrl = (event: { url: string }) => {
      const url = event.url;
      setLastDeepLinkUrl(url);
      console.log('[Android Deep Link Received]:', url);

      const parsed = Linking.parse(url);
      if (parsed.scheme === 'counter' && parsed.hostname === 'duel') {
        const duelId = parsed.path?.replace(/^\//, '') || 'duel_gate_a';
        setCurrentDuelId(duelId);
        setStatusMessage(`Deep link route landed on Duel: ${duelId}`);
      } else if (parsed.path && parsed.path.startsWith('d/')) {
        const duelId = parsed.path.replace('d/', '');
        setCurrentDuelId(duelId);
        setStatusMessage(`HTTPS App Link route landed on Duel: ${duelId}`);
      } else {
        setStatusMessage(`Received malformed link: ${url}`);
      }
    };

    Linking.getInitialURL().then((url: string | null) => {
      if (url) handleUrl({ url });
    });

    const subscription = Linking.addEventListener('url', handleUrl);
    return () => subscription.remove();
  }, []);

  // Connect Wallet via Mobile Wallet Adapter (MWA)
  const connectWallet = async () => {
    try {
      setStatusMessage('Requesting wallet authorization via MWA...');
      const authResult = await transact(async (wallet: any) => {
        const authorization = await wallet.authorize({
          cluster: 'devnet',
          identity: APP_IDENTITY,
        });
        return authorization;
      });

      const base58Address = new PublicKey(
        Buffer.from(authResult.accounts[0].address, 'base64')
      ).toBase58();

      setWalletPublicKey(base58Address);
      setStatusMessage(`Wallet Connected: ${base58Address.slice(0, 4)}...${base58Address.slice(-4)}`);
    } catch (err: any) {
      console.error('[MWA Connect Error]:', err);
      setStatusMessage(`MWA Connect Failed: ${err.message || err}`);
    }
  };

  // Send Devnet Proof Transaction via MWA User Signature
  const sendDevnetProofTransaction = async () => {
    if (!walletPublicKey) {
      setStatusMessage('Please connect your wallet first');
      return;
    }

    try {
      setTxState('REQUESTED');
      setStatusMessage('Building devnet proof transaction...');

      const connection = new Connection(DEVNET_RPC, 'confirmed');
      const sender = new PublicKey(walletPublicKey);
      const latestBlockhash = await connection.getLatestBlockhash();

      // Simple 0-lamport devnet memo/transfer proof instruction
      const tx = new Transaction({
        feePayer: sender,
        recentBlockhash: latestBlockhash.blockhash,
      }).add(
        SystemProgram.transfer({
          fromPubkey: sender,
          toPubkey: sender,
          lamports: 0,
        })
      );

      setTxState('SIGNING');
      setStatusMessage('Requesting transaction signature in MWA Wallet...');

      const signedTxs = await transact(async (wallet: any) => {
        await wallet.authorize({
          cluster: 'devnet',
          identity: APP_IDENTITY,
        });

        const signed = await wallet.signAndSendTransactions({
          transactions: [tx],
        });
        return signed;
      });

      const signature = Buffer.from(signedTxs[0], 'base64').toString('hex');
      setTxState('SUBMITTED');
      setTxSignature(signature);
      setStatusMessage(`Tx Submitted: ${signature.slice(0, 8)}... Awaiting confirmation...`);

      await connection.confirmTransaction({
        signature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      });

      setTxState('CONFIRMED');
      setStatusMessage(`Transaction CONFIRMED on Devnet!`);
    } catch (err: any) {
      console.error('[MWA Tx Error]:', err);
      setTxState('FAILED');
      setStatusMessage(`Tx Failed: ${err.message || err}`);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#090A0F" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Counter Gate A</Text>
          <Text style={styles.headerSubtitle}>Solana Mobile Runtime & MWA Shell</Text>
        </View>

        {/* State Display Card */}
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>Connected Public Key:</Text>
            <Text style={styles.value} numberOfLines={1} ellipsizeMode="middle">
              {walletPublicKey || 'Not Connected'}
            </Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Cluster:</Text>
            <Text style={[styles.value, styles.highlight]}>{cluster.toUpperCase()}</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Transaction State:</Text>
            <Text
              style={[
                styles.value,
                txState === 'CONFIRMED'
                  ? styles.stateConfirmed
                  : txState === 'FAILED'
                  ? styles.stateFailed
                  : styles.statePending,
              ]}
            >
              {txState}
            </Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Confirmed Signature:</Text>
            <Text style={styles.value} numberOfLines={1} ellipsizeMode="middle">
              {txSignature || 'None'}
            </Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Current Test Duel ID:</Text>
            <Text style={[styles.value, styles.duelHighlight]}>
              Duel {currentDuelId}
            </Text>
          </View>

          {lastDeepLinkUrl && (
            <View style={styles.row}>
              <Text style={styles.label}>Deep Link URL:</Text>
              <Text style={styles.value} numberOfLines={1} ellipsizeMode="tail">
                {lastDeepLinkUrl}
              </Text>
            </View>
          )}
        </View>

        {/* Status Message */}
        <View style={styles.statusBox}>
          <Text style={styles.statusText}>{statusMessage}</Text>
        </View>

        {/* Action Controls */}
        <View style={styles.controls}>
          <TouchableOpacity style={styles.buttonPrimary} onPress={connectWallet}>
            <Text style={styles.buttonText}>Connect Wallet</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.buttonSecondary, !walletPublicKey && styles.buttonDisabled]}
            onPress={sendDevnetProofTransaction}
            disabled={!walletPublicKey}
          >
            <Text style={styles.buttonText}>Send Devnet Proof Transaction</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.buttonOutline}
            onPress={() => {
              setCurrentDuelId('duel_gate_a');
              setStatusMessage('Viewing Duel: duel_gate_a');
            }}
          >
            <Text style={styles.buttonOutlineText}>Open Test Duel</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090A0F',
  },
  scrollContent: {
    padding: 20,
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    marginVertical: 24,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#F4F5F8',
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#8A8F9E',
    marginTop: 4,
  },
  card: {
    width: '100%',
    backgroundColor: '#12141C',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#1E2230',
    marginBottom: 20,
  },
  row: {
    marginBottom: 14,
  },
  label: {
    fontSize: 12,
    color: '#8A8F9E',
    textTransform: 'uppercase',
    fontWeight: '600',
    marginBottom: 4,
  },
  value: {
    fontSize: 14,
    color: '#E1E4EA',
    fontFamily: 'monospace',
  },
  highlight: {
    color: '#00E5FF',
    fontWeight: '700',
  },
  duelHighlight: {
    color: '#FF6B00',
    fontWeight: '700',
    fontSize: 16,
  },
  stateConfirmed: {
    color: '#00E676',
    fontWeight: '800',
  },
  stateFailed: {
    color: '#FF3D00',
    fontWeight: '800',
  },
  statePending: {
    color: '#FFD600',
    fontWeight: '700',
  },
  statusBox: {
    width: '100%',
    backgroundColor: '#171B26',
    borderRadius: 10,
    padding: 12,
    marginBottom: 24,
    borderLeftWidth: 4,
    borderLeftColor: '#00E5FF',
  },
  statusText: {
    color: '#C3C7D4',
    fontSize: 13,
  },
  controls: {
    width: '100%',
    gap: 12,
  },
  buttonPrimary: {
    backgroundColor: '#00E5FF',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonSecondary: {
    backgroundColor: '#FF6B00',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#2A3042',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    color: '#090A0F',
    fontSize: 15,
    fontWeight: '700',
  },
  buttonOutlineText: {
    color: '#F4F5F8',
    fontSize: 15,
    fontWeight: '600',
  },
});
