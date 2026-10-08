import React, { useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api } from '../api';
import { Duel } from '../types';
import { colors, spacing, typography, touchMin } from '../theme';
import { EmptyState, Rule, ScreenHeader, StatusPill } from './CounterUI';
import { formatRelativeTime, formatUserDisplayName } from '../utils/identity';

/**
 * The smallest real SKR capability: a read-only curated Duel feed. Eligibility
 * comes from the authenticated session's live Mainnet stake check; this surface
 * never changes stake, payout, settlement, or claim behavior.
 */
export const SkrArenaEntry: React.FC<{
  eligible: boolean;
  onSelectDuel: (duel: Duel) => void;
}> = ({ eligible, onSelectDuel }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [duels, setDuels] = useState<Duel[]>([]);
  const [error, setError] = useState<string | null>(null);

  const openArena = async () => {
    if (!eligible) return;
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      setDuels(await api.getDuels({ isArena: true }));
    } catch {
      setError('SKR Arena could not load.');
    } finally {
      setLoading(false);
    }
  };

  return <>
    <TouchableOpacity
      style={styles.entry}
      onPress={() => void openArena()}
      disabled={!eligible}
      accessibilityRole="button"
      accessibilityLabel={eligible ? 'Open SKR Arena' : 'SKR Arena locked'}
    >
      <View style={styles.entryCopy}>
        <View style={styles.entryTop}><Text style={styles.entryTitle}>SKR Arena</Text><StatusPill label={eligible ? 'Verified' : 'Locked'} tone={eligible ? 'success' : 'muted'} /></View>
        <Text style={styles.entryBody}>{eligible ? 'Curated community Duels for active SKR stakers.' : 'Active SKR staking on Solana Mainnet unlocks Arena discovery.'}</Text>
      </View>
      {eligible ? <Text style={styles.chevron}>›</Text> : null}
    </TouchableOpacity>
    {open ? <View style={styles.overlay}>
      <View style={styles.arenaHeader}><ScreenHeader eyebrow="curated discovery" title="SKR Arena" onBack={() => setOpen(false)} right={<StatusPill label="SKR verified" tone="success" />} /></View>
      {loading ? <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /><Text style={styles.muted}>Loading qualified Duels…</Text></View> : error ? <EmptyState title={error} body="Your normal Duels remain available." action="Retry" onAction={() => void openArena()} /> : <FlatList data={duels} keyExtractor={(item) => item.id} contentContainerStyle={duels.length ? styles.list : styles.emptyList} ListEmptyComponent={<EmptyState title="No SKR Arena Duels yet" body="Qualified community Duels will appear here." />} renderItem={({ item }) => <View><TouchableOpacity style={styles.row} onPress={() => { setOpen(false); onSelectDuel(item); }}><View style={styles.rowTop}><StatusPill label="Arena" tone="accent" /><Text style={styles.time}>{formatRelativeTime(item.created_at)}</Text></View><Text style={styles.rowTitle}>{item.proposition_a}</Text><Text style={styles.rowDetail}>vs {item.proposition_b}</Text><Text style={styles.rowStatus}>{formatUserDisplayName({ display_name: item.captain_a_name, handle: item.captain_a_handle, wallet: item.captain_a_wallet })} · community Duel</Text></TouchableOpacity><Rule /></View>} />}
    </View> : null}
  </>;
};

const styles = StyleSheet.create({
  entry: { minHeight: 66, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  entryCopy: { flex: 1 },
  entryTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  entryTitle: { ...typography.bodyBold },
  entryBody: { ...typography.caption, marginTop: 3 },
  chevron: { color: colors.brandPrimary, fontSize: 26, paddingLeft: spacing.sm },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.background, zIndex: 10 },
  arenaHeader: { paddingTop: spacing.sm, paddingHorizontal: spacing.lg },
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
