import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api } from '../api';
import { Duel } from '../types';
import { colors, spacing, typography, touchMin, borderRadius } from '../theme';
import { EmptyState, PrimaryButton, Rule, ScreenHeader, StatusPill } from './CounterUI';
import { Icon } from './Icon';
import { formatRelativeTime, formatUserDisplayName } from '../utils/identity';

/**
 * First-class SKR Arena discovery. Eligibility is read-only and comes from
 * the authenticated wallet's active SKR stake on Solana Mainnet. Arena is a
 * curation/access surface only. It also never changes refund or custody behavior.
 * never changes stake, payout, settlement, or claim behavior.
 */
export const SkrArenaEntry: React.FC<{
  connected: boolean;
  eligible: boolean;
  onConnectWallet: () => void;
  onSelectDuel: (duel: Duel) => void;
}> = ({ connected, eligible, onConnectWallet, onSelectDuel }) => {
  const [loading, setLoading] = useState(false);
  const [duels, setDuels] = useState<Duel[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    if (!connected || !eligible) {
      setDuels([]);
      setLoading(false);
      return () => { cancelled = true; };
    }

    setLoading(true);
    api.getDuels({ isArena: true })
      .then((items) => { if (!cancelled) setDuels(items); })
      .catch(() => { if (!cancelled) setError('SKR Arena could not load.'); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [connected, eligible]);

  const statusLabel = !connected ? 'Wallet required' : eligible ? 'SKR verified' : 'Locked';
  const statusTone = !connected ? 'muted' : eligible ? 'success' : 'warning';

  return (
    <View style={styles.screen}>
      <ScreenHeader eyebrow="curated discovery · Solana Mainnet" title="SKR Arena" right={<StatusPill label={statusLabel} tone={statusTone} />} />

      {!connected ? (
        <View style={styles.stateWrap}>
          <View style={styles.stateIcon}><Icon name="sparkles" size={28} color={colors.cobalt} /></View>
          <Text style={styles.stateTitle}>Connect to check SKR access</Text>
          <Text style={styles.stateBody}>Connect your wallet to check SKR access.</Text>
          <PrimaryButton label="Connect wallet" onPress={onConnectWallet} />
          <Text style={styles.networkNote}>SKR eligibility · Solana Mainnet read-only</Text>
        </View>
      ) : !eligible ? (
        <View style={styles.stateWrap}>
          <View style={[styles.stateIcon, styles.lockedIcon]}><Icon name="shield-check" size={28} color={colors.warning} /></View>
          <Text style={styles.stateTitle}>Arena is locked</Text>
          <Text style={styles.stateBody}>Active SKR staking on Solana Mainnet unlocks the Arena.</Text>
          <View style={styles.preview}>
            <View style={styles.previewHeading}><Text style={styles.previewTitle}>What’s inside</Text><StatusPill label="Preview" tone="accent" /></View>
            <Text style={styles.previewBody}>A curated feed of community Takes and Duels for verified SKR participants.</Text>
            <Rule />
            <Text style={styles.networkNote}>No fake balance · read-only eligibility check</Text>
          </View>
        </View>
      ) : (
        <View style={styles.qualified}>
          <View style={styles.qualifiedIntro}>
            <Text style={styles.qualifiedTitle}>Verified SKR participant</Text>
            <Text style={styles.qualifiedBody}>A curated community feed for active SKR stakers.</Text>
          </View>
          {loading ? (
            <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /><Text style={styles.muted}>Loading Arena…</Text></View>
          ) : error ? (
            <EmptyState title={error} body="Your normal Duels remain available." />
          ) : (
            <FlatList
              data={duels}
              keyExtractor={(item) => item.id}
              contentContainerStyle={duels.length ? styles.list : styles.emptyList}
              ListEmptyComponent={<EmptyState title="No SKR Arena Duels yet" body="Qualified community Duels will appear here." />}
              renderItem={({ item }) => (
                <View>
                  <TouchableOpacity style={styles.row} onPress={() => onSelectDuel(item)} accessibilityRole="button">
                    <View style={styles.rowTop}><StatusPill label="Arena" tone="accent" /><Text style={styles.time}>{formatRelativeTime(item.created_at)}</Text></View>
                    <Text style={styles.rowTitle}>{item.proposition_a}</Text>
                    <Text style={styles.rowDetail}>vs {item.proposition_b}</Text>
                    <Text style={styles.rowStatus}>{formatUserDisplayName({ display_name: item.captain_a_name, handle: item.captain_a_handle, wallet: item.captain_a_wallet })} · community Duel</Text>
                  </TouchableOpacity>
                  <Rule />
                </View>
              )}
            />
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  stateWrap: { flex: 1, alignItems: 'center', paddingHorizontal: spacing.xl, paddingTop: spacing.xxl, paddingBottom: 112 },
  stateIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(124,140,255,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg },
  lockedIcon: { backgroundColor: 'rgba(255,200,87,0.12)' },
  stateTitle: { ...typography.h2, textAlign: 'center' },
  stateBody: { ...typography.bodyMuted, textAlign: 'center', maxWidth: 300, marginTop: spacing.sm, marginBottom: spacing.xl },
  networkNote: { ...typography.caption, textAlign: 'center', marginTop: spacing.lg },
  preview: { width: '100%', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: borderRadius.lg, padding: spacing.lg },
  previewHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  previewTitle: { ...typography.bodyBold },
  previewBody: { ...typography.bodyMuted, marginTop: spacing.md },
  qualified: { flex: 1 },
  qualifiedIntro: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  qualifiedTitle: { ...typography.h3 },
  qualifiedBody: { ...typography.bodyMuted, marginTop: spacing.xs },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  muted: { ...typography.bodyMuted },
  list: { paddingBottom: 112 },
  emptyList: { flexGrow: 1, paddingBottom: 112 },
  row: { paddingHorizontal: spacing.lg, paddingVertical: spacing.lg },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  time: { ...typography.caption },
  rowTitle: { ...typography.h2, fontSize: 19, lineHeight: 25 },
  rowDetail: { ...typography.bodyMuted, marginTop: 5 },
  rowStatus: { ...typography.captionBold, color: colors.textSecondary, marginTop: spacing.md },
});
