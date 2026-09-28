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
import { Duel, Position } from '../types';
import { BackModal } from '../components/BackModal';
import { colors, spacing } from '../theme';
import { api } from '../api';

interface DuelDetailScreenProps {
  duelId: string;
  onBack: () => void;
  onViewReceipt: (receiptId: string) => void;
}

export const DuelDetailScreen: React.FC<DuelDetailScreenProps> = ({
  duelId,
  onBack,
  onViewReceipt,
}) => {
  const [duel, setDuel] = useState<Duel | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [myPosition, setMyPosition] = useState<Position | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Backer Modal
  const [backModalVisible, setBackModalVisible] = useState(false);
  const [backSide, setBackSide] = useState<1 | 2>(1);

  const loadDuelData = async () => {
    try {
      const data = await api.getDuel(duelId);
      setDuel(data);
      setPositions(data.positions || []);
      setMyPosition(data.myPosition || null);
    } catch (err) {
      console.warn('Failed to load duel:', err);
    } finally {
      setLoading(false);
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
    const deepLink = `counter://duel/${duelId}`;
    try {
      await Share.share({
        message: `⚔️ Back my side in this 1v1 Duel on Counter:\n"${duel?.proposition_a}" vs "${duel?.proposition_b}"\n🔗 Join Backer Pool: ${deepLink}`,
        url: deepLink,
      });
    } catch (e) {}
  };

  if (loading || !duel) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.solanaPurple} />
        <Text style={styles.loadingText}>Loading Duel Escrow & State...</Text>
      </View>
    );
  }

  const poolA = Number(duel.side_a_total) || 0;
  const poolB = Number(duel.side_b_total) || 0;
  const totalPool = poolA + poolB;
  const oddsA = poolA > 0 ? (totalPool / poolA).toFixed(2) : '2.00';
  const oddsB = poolB > 0 ? (totalPool / poolB).toFixed(2) : '2.00';
  const isResolved = duel.status.startsWith('RESOLVED');

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.categoryTag}>{duel.category}</Text>
        <TouchableOpacity onPress={handleShare} style={styles.shareBtn}>
          <Text style={styles.shareText}>📤 Share</Text>
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

      {/* On-Chain Escrow & Oracle Proof Details */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🔒 ON-CHAIN ESCROW ARCHITECTURE</Text>
        <View style={styles.infoCard}>
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
      </View>

      {message && (
        <View style={styles.messageBox}>
          <Text style={styles.messageText}>{message}</Text>
        </View>
      )}

      {/* Settlement Trigger */}
      {!isResolved && (
        <TouchableOpacity
          style={styles.resolveBtn}
          onPress={handleResolve}
          disabled={resolving}
          activeOpacity={0.8}
        >
          {resolving ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.resolveBtnText}>⚡ RUN DETERMINISTIC RESOLVER</Text>
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
          <Text style={styles.receiptBtnText}>📜 VIEW OFFICIAL SETTLEMENT RECEIPT</Text>
        </TouchableOpacity>
      )}

      {/* Outside Backers List */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>👥 BACKER POSITIONS ({positions.length})</Text>
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
    padding: 6,
  },
  backText: {
    color: colors.solanaPurple,
    fontSize: 14,
    fontWeight: '700',
  },
  categoryTag: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '800',
  },
  shareBtn: {
    padding: 6,
  },
  shareText: {
    color: colors.textPrimary,
    fontSize: 13,
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
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  ctaBtnText: {
    color: '#000',
    fontSize: 13,
    fontWeight: '900',
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
  resolveBtn: {
    backgroundColor: colors.solanaPurple,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  resolveBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  receiptBtn: {
    backgroundColor: colors.solanaGreen,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  receiptBtnText: {
    color: '#000',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
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
