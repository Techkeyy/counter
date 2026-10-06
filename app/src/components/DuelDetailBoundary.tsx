import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { DuelDetailV1Screen } from '../screens/DuelDetailV1Screen';
import { colors, borderRadius, spacing, touchMin, typography } from '../theme';
import { acceptTransitionStage } from '../diagnostics';

type DuelDetailBoundaryProps = {
  duelId: string;
  userWallet: string | null;
  challengeId?: string;
  attemptId?: string;
  onBack: () => void;
  onRetry: () => void;
  onViewReceipt: (receiptId: string) => void;
};

type DuelDetailBoundaryState = {
  error: Error | null;
};

export class DuelDetailBoundary extends React.Component<DuelDetailBoundaryProps, DuelDetailBoundaryState> {
  state: DuelDetailBoundaryState = { error: null };

  private transitionContext() {
    return {
      challengeId: this.props.challengeId || 'direct-open',
      duelId: this.props.duelId,
      attemptId: this.props.attemptId || 'direct-open',
    };
  }

  private errorContext(error: unknown) {
    const value = error as any;
    const errorClass = String(value?.name || (error instanceof Error ? 'Error' : 'Unknown'))
      .replace(/[^A-Za-z0-9_.:-]/g, '')
      .slice(0, 80) || 'Unknown';
    const rawCode = String(value?.code || '').replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 80);
    const message = String(value?.message || '').toLowerCase();
    const errorCode = rawCode || (
      /not found|404/.test(message)
        ? 'DUEL_NOT_FOUND'
        : /network|request_failed|unreachable|fetch|timeout/.test(message)
          ? 'DUEL_REQUEST_FAILED'
          : 'DUEL_DETAIL_ERROR'
    );
    return {
      errorClass,
      errorCode,
    };
  }

  componentDidCatch(error: Error) {
    acceptTransitionStage('DUEL_DETAIL_BOUNDARY_RENDER_THROW', {
      ...this.transitionContext(),
      ...this.errorContext(error),
    });
    acceptTransitionStage('DUEL_DETAIL_RENDER_FAILED', {
      ...this.transitionContext(),
      ...this.errorContext(error),
    });
    this.setState({ error });
  }

  private handleDataError = (error: unknown) => {
    acceptTransitionStage('DUEL_DETAIL_BOUNDARY_DATA_ERROR', {
      ...this.transitionContext(),
      ...this.errorContext(error),
    });
    acceptTransitionStage('DUEL_DETAIL_DATA_ERROR', {
      ...this.transitionContext(),
      ...this.errorContext(error),
    });
    this.setState({ error: error instanceof Error ? error : new Error('Duel data could not be loaded.') });
  };

  private handleRetry = () => {
    this.setState({ error: null });
    this.props.onRetry();
  };

  private renderFailure() {
    const detail = String(this.state.error?.message || '').toLowerCase();
    const copy = /not found|404/.test(detail)
      ? 'Counter could not find this Duel in its readable history. No Duel state was changed.'
      : /network|request_failed|unreachable|fetch/.test(detail)
        ? 'Counter could not reach the Duel record. Nothing was accepted or submitted again.'
        : 'Counter could not render this Duel record. Nothing was accepted or submitted again.';
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Couldn't open this Duel</Text>
        <Text style={styles.copy}>{copy}</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={this.handleRetry} accessibilityRole="button" accessibilityLabel="Try again">
          <Text style={styles.primaryText}>Try again</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={this.props.onBack} accessibilityRole="button" accessibilityLabel="Back to Duels">
          <Text style={styles.secondaryText}>Back to Duels</Text>
        </TouchableOpacity>
      </View>
    );
  }

  render() {
    if (this.state.error) return this.renderFailure();
    return (
      <DuelDetailV1Screen
        duelId={this.props.duelId}
        userWallet={this.props.userWallet}
        challengeId={this.props.challengeId}
        transitionAttemptId={this.props.attemptId}
        onBack={this.props.onBack}
        onViewReceipt={this.props.onViewReceipt}
        onDataError={this.handleDataError}
      />
    );
  }
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  title: { ...typography.h2, color: colors.textPrimary, textAlign: 'center', marginBottom: spacing.sm },
  copy: { ...typography.bodyMuted, color: colors.textSecondary, textAlign: 'center', lineHeight: 21, marginBottom: spacing.lg },
  primaryButton: { minHeight: 52, minWidth: 180, borderRadius: borderRadius.full, backgroundColor: colors.brandPrimary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  primaryText: { color: '#000000', fontSize: 14, fontWeight: '900' },
  secondaryButton: { minHeight: touchMin, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  secondaryText: { color: colors.textPrimary, fontSize: 14, fontWeight: '800' },
});
