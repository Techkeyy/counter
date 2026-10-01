import React, { useState } from 'react';
import { Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { Portfolio, PortfolioPosition } from '../types';
import { colors, typography, spacing, borderRadius, touchMin } from '../theme';
import { Icon } from './Icon';

interface PortfolioSummaryProps {
  portfolio: Portfolio;
  onOpenDuel?: (duelId: string) => void;
  onRequestFaucet?: () => void;
  faucetLoading?: boolean;
  faucetNotice?: string | null;
}

type PositionView = 'OPEN' | 'CLAIMABLE' | 'HISTORY';

const money = (value: number | null | undefined) =>
  value === null || value === undefined ? '—' : `$${Number(value).toFixed(2)}`;

function positionLabel(position: PortfolioPosition): string {
  if (position.claim_state === 'CLAIMABLE') return 'Claimable';
  if (position.claim_state === 'CLAIMED') return 'Claimed';
  if (position.claim_state === 'LOST') return 'Settled';
  return 'Open';
}

export const PortfolioSummary: React.FC<PortfolioSummaryProps> = ({
  portfolio,
  onOpenDuel,
  onRequestFaucet,
  faucetLoading,
  faucetNotice,
}) => {
  const [view, setView] = useState<PositionView>('OPEN');
  const { summary } = portfolio;
  const positions = portfolio.positions.filter((position) => {
    if (view === 'OPEN') return position.claim_state === 'OPEN';
    if (view === 'CLAIMABLE') return position.claim_state === 'CLAIMABLE';
    return position.claim_state !== 'OPEN';
  });

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Portfolio</Text>
          <Text style={styles.subtitle}>{portfolio.currency} · Devnet · no cash value</Text>
        </View>
        <Icon name="wallet-cards" size={20} color={colors.brandPrimary} />
      </View>

      <View style={styles.metricsGrid}>
        <Metric label="Available balance" value={money(summary.available_balance)} />
        <Metric label="Active in Duels" value={money(summary.active_in_duels)} />
        <Metric label="Claimable" value={money(summary.claimable)} />
        <Metric label="Realized P&L" value={money(summary.realized_pnl)} />
      </View>

      {!summary.realized_pnl_available && summary.realized_pnl_note ? (
        <Text style={styles.note}>{summary.realized_pnl_note}</Text>
      ) : null}

      <View style={styles.actionRow}>
        {onRequestFaucet ? (
          <TouchableOpacity
            style={styles.secondaryAction}
            onPress={onRequestFaucet}
            disabled={faucetLoading}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Get test funds"
          >
            <Icon name="plus" size={14} color={colors.brandPrimary} />
            <Text style={styles.secondaryActionText}>{faucetLoading ? 'Requesting…' : 'Get test funds'}</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={[styles.secondaryAction, summary.claimable <= 0 && styles.disabledAction]}
          onPress={() => setView('CLAIMABLE')}
          disabled={summary.claimable <= 0}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="View claimable positions"
        >
          <Icon name="check-circle" size={14} color={summary.claimable > 0 ? colors.brandPrimary : colors.textMuted} />
          <Text style={[styles.secondaryActionText, summary.claimable <= 0 && styles.disabledText]}>View claimable</Text>
        </TouchableOpacity>
      </View>

      {faucetNotice ? <Text style={styles.notice}>{faucetNotice}</Text> : null}

      <View style={styles.positionHeader}>
        <Text style={styles.sectionTitle}>Positions</Text>
        <Text style={styles.devnetLabel}>Verified Counter state</Text>
      </View>
      <View style={styles.tabs}>
        {(['OPEN', 'CLAIMABLE', 'HISTORY'] as PositionView[]).map((key) => (
          <TouchableOpacity
            key={key}
            style={[styles.tab, view === key && styles.tabActive]}
            onPress={() => setView(key)}
            activeOpacity={0.8}
            accessibilityRole="tab"
            accessibilityState={{ selected: view === key }}
          >
            <Text style={[styles.tabText, view === key && styles.tabTextActive]}>
              {key === 'OPEN' ? 'Open' : key === 'CLAIMABLE' ? 'Claimable' : 'History'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {positions.length === 0 ? (
        <Text style={styles.emptyText}>
          {view === 'OPEN' ? 'No open positions.' : view === 'CLAIMABLE' ? 'Nothing is ready to claim.' : 'No settled position history yet.'}
        </Text>
      ) : (
        positions.slice(0, 5).map((position) => (
          <TouchableOpacity
            key={`${position.duel_id}-${position.chosen_side}`}
            style={styles.positionRow}
            onPress={() => onOpenDuel?.(position.duel_id)}
            disabled={!onOpenDuel}
            activeOpacity={0.8}
            accessibilityRole={onOpenDuel ? 'button' : undefined}
            accessibilityLabel={`Open position, ${positionLabel(position)}`}
          >
            <View style={styles.positionMain}>
              <Text style={styles.positionProposition} numberOfLines={2}>
                Side {position.chosen_side}: {position.chosen_side === 1 ? position.proposition_a : position.proposition_b}
              </Text>
              <Text style={styles.positionMeta}>
                {positionLabel(position)} · Stake {money(position.stake_amount)}
              </Text>
            </View>
            <Text style={styles.positionAmount}>
              {position.claim_state === 'CLAIMABLE' ? money(position.expected_payout) : position.claim_state === 'CLAIMED' ? money(position.payout_amount) : ''}
            </Text>
          </TouchableOpacity>
        ))
      )}
    </View>
  );
};

const Metric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.metric}>
    <Text style={styles.metricValue}>{value}</Text>
    <Text style={styles.metricLabel}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { ...typography.h3, color: colors.textPrimary },
  subtitle: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.cardBorder },
  metric: { width: '50%', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  metricValue: { ...typography.bodyBold, color: colors.textPrimary, fontSize: 17 },
  metricLabel: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  note: { ...typography.caption, color: colors.textMuted, lineHeight: 17, marginTop: spacing.sm },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  secondaryAction: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: touchMin, paddingHorizontal: spacing.md, borderRadius: borderRadius.full, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.surfaceLight },
  secondaryActionText: { ...typography.captionBold, color: colors.brandPrimary },
  disabledAction: { opacity: 0.55 },
  disabledText: { color: colors.textMuted },
  notice: { ...typography.caption, color: colors.success, marginTop: spacing.sm },
  positionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.lg, marginBottom: spacing.sm },
  sectionTitle: { ...typography.bodyBold, color: colors.textPrimary },
  devnetLabel: { ...typography.caption, color: colors.textMuted },
  tabs: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: 3, marginBottom: spacing.sm },
  tab: { flex: 1, minHeight: 36, justifyContent: 'center', alignItems: 'center', borderRadius: borderRadius.sm },
  tabActive: { backgroundColor: colors.surfaceHighlight },
  tabText: { ...typography.captionBold, color: colors.textMuted },
  tabTextActive: { color: colors.textPrimary },
  positionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.cardBorder },
  positionMain: { flex: 1, paddingRight: spacing.sm },
  positionProposition: { ...typography.bodyBold, color: colors.textPrimary, fontSize: 13, lineHeight: 18 },
  positionMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  positionAmount: { ...typography.bodyBold, color: colors.brandPrimary, fontSize: 13 },
  emptyText: { ...typography.bodyMuted, color: colors.textSecondary, paddingVertical: spacing.md },
});

