import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
  Share,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Take, Comment, Duel } from '../types';
import { colors, typography, spacing, borderRadius, touchMin } from '../theme';
import { api } from '../api';
import { Icon } from '../components/Icon';
import {
  formatUserDisplayName,
  formatUserHandle,
  getAvatarUri,
  formatWalletShort,
} from '../utils/identity';

interface TakeDetailScreenProps {
  take: Take;
  onBack: () => void;
  onSelectDuel: (duel: Duel) => void;
  onChallengeTake: (take: Take) => void;
  userWallet?: string | null;
}

export const TakeDetailScreen: React.FC<TakeDetailScreenProps> = ({
  take,
  onBack,
  onSelectDuel,
  onChallengeTake,
  userWallet,
}) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [duels, setDuels] = useState<Duel[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadThread = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getTake(take.id);
      if (res) {
        setComments(Array.isArray(res.comments) ? res.comments : []);
        setDuels(Array.isArray(res.duels) ? res.duels : []);
      }
    } catch (err: any) {
      console.warn('Failed to load take thread:', err);
      setError("Couldn't load comments.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadThread();
  }, [take.id]);

  const handlePostReply = async () => {
    if (!replyText.trim()) return;
    try {
      setPosting(true);
      setError(null);
      const newComment = await api.addComment(take.id, replyText.trim());
      setComments((prev) => [...prev, newComment]);
      setReplyText('');
    } catch (err: any) {
      setError(err?.message || "Couldn't post that reply.");
    } finally {
      setPosting(false);
    }
  };

  const handleShare = async () => {
    try {
      const effectiveAuthor = authorHandle || authorDisplayName;
      await Share.share({
        message: `"${take.content}" by ${effectiveAuthor} on Counter. Check it out or challenge them!`,
      });
    } catch {
      // user cancelled
    }
  };

  const authorDisplayName = formatUserDisplayName({
    display_name: take.author_name,
    handle: take.author_handle,
    wallet: take.author_wallet,
  });
  const authorHandle = formatUserHandle({
    handle: take.author_handle,
    wallet: take.author_wallet,
  });
  const avatarUri = getAvatarUri(take.author_avatar, take.author_wallet);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Top Header */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backButton} onPress={onBack} activeOpacity={0.8}>
          <Icon name="chevron-left" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Take</Text>
        <TouchableOpacity style={styles.shareButton} onPress={handleShare} activeOpacity={0.8}>
          <Icon name="share-2" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Main Take Author Header */}
        <View style={styles.mainAuthorRow}>
          <Image source={{ uri: avatarUri }} style={styles.avatar} />
          <View style={styles.mainAuthorInfo}>
            <Text style={styles.displayName}>{authorDisplayName}</Text>
            {authorHandle ? <Text style={styles.handle}>{authorHandle}</Text> : null}
          </View>
          <View style={styles.categoryPill}>
            <Text style={styles.categoryText}>{take.category}</Text>
          </View>
        </View>

        {/* Take Topic & Content */}
        <Text style={styles.topicText}>{take.topic}</Text>
        <Text style={styles.contentText}>{take.content}</Text>

        {/* Timestamp & Metadata */}
        <View style={styles.metaRow}>
          <Text style={styles.timestamp}>
            {new Date(take.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ·{' '}
            {new Date(take.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
          </Text>
        </View>

        {/* Big Action Bar */}
        <View style={styles.actionBar}>
          <TouchableOpacity
            style={styles.challengeActionBtn}
            onPress={() => onChallengeTake(take)}
            activeOpacity={0.8}
            accessibilityLabel="Challenge this take to a 1v1 duel"
            accessibilityRole="button"
          >
            <Icon name="swords" size={18} color="#000000" />
            <Text style={styles.challengeActionText}>Challenge this take</Text>
          </TouchableOpacity>
        </View>

        {/* Active Duels Born from this Take */}
        {duels.length > 0 && (
          <View style={styles.duelsSection}>
            <Text style={styles.sectionHeader}>Active Duels from this Take</Text>
            {duels.map((d) => (
              <TouchableOpacity
                key={d.id}
                style={styles.duelCard}
                onPress={() => onSelectDuel(d)}
                activeOpacity={0.8}
              >
                <View style={styles.duelCardHeader}>
                  <View style={styles.liveBadge}>
                    <View style={styles.liveDot} />
                    <Text style={styles.liveBadgeText}>LIVE DUEL</Text>
                  </View>
                  <Text style={styles.poolAmount}>
                    ${((Number(d.side_a_total) || 0) + (Number(d.side_b_total) || 0)).toFixed(2)} Pool
                  </Text>
                </View>
                <Text style={styles.duelMatchup}>
                  {d.captain_a_name || formatWalletShort(d.captain_a_wallet)} vs{' '}
                  {d.captain_b_name || formatWalletShort(d.captain_b_wallet)}
                </Text>
                <View style={styles.duelFooter}>
                  <Text style={styles.viewDuelLink}>View Duel & Back</Text>
                  <Icon name="arrow-right" size={14} color={colors.solanaGreen} />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Threaded Replies Section */}
        <View style={styles.repliesSection}>
          <Text style={styles.sectionHeader}>Replies ({comments.length})</Text>

          {error && (
            <View style={styles.inlineError}>
              <Text style={styles.inlineErrorText}>{error}</Text>
              <TouchableOpacity
                onPress={loadThread}
                style={styles.inlineRetry}
                accessibilityLabel="Retry loading replies"
                accessibilityRole="button"
              >
                <Text style={styles.inlineRetryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}

          {loading ? (
            <ActivityIndicator size="small" color={colors.solanaGreen} style={{ marginVertical: spacing.lg }} />
          ) : comments.length === 0 ? (
            <View style={styles.noCommentsBox}>
              <Text style={styles.noCommentsText}>No replies yet. Be the first to weigh in!</Text>
            </View>
          ) : (
            comments.map((comment) => (
              <View key={comment.id} style={styles.commentItem}>
                <Image
                  source={{ uri: getAvatarUri(null, comment.author_wallet) }}
                  style={styles.commentAvatar}
                />
                <View style={styles.commentBody}>
                  <View style={styles.commentHeader}>
                    <Text style={styles.commentAuthor}>
                      {comment.author_name || formatWalletShort(comment.author_wallet)}
                    </Text>
                    <Text style={styles.commentTime}>
                      {new Date(comment.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                  <Text style={styles.commentText}>{comment.content}</Text>

                  {/* Challenge Action on Reply */}
                  <TouchableOpacity
                    style={styles.replyChallengeBtn}
                    onPress={() => onChallengeTake(take)}
                    activeOpacity={0.8}
                  >
                    <Icon name="swords" size={12} color={colors.textSecondary} />
                    <Text style={styles.replyChallengeText}>Challenge</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Sticky Bottom Reply Composer */}
      <View style={styles.composerBar}>
        <TextInput
          style={styles.composerInput}
          placeholder="Post your reply..."
          placeholderTextColor={colors.textMuted}
          value={replyText}
          onChangeText={setReplyText}
          multiline
        />
        <TouchableOpacity
          style={[styles.sendButton, !replyText.trim() && styles.sendButtonDisabled]}
          onPress={handlePostReply}
          disabled={!replyText.trim() || posting}
          activeOpacity={0.8}
        >
          {posting ? (
            <ActivityIndicator size="small" color="#000000" />
          ) : (
            <Icon name="arrow-right" size={16} color={replyText.trim() ? '#000000' : colors.textMuted} />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceLight,
  },
  backButton: {
    minHeight: touchMin,
    minWidth: touchMin,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBarTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  shareButton: {
    minHeight: touchMin,
    minWidth: touchMin,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
  },
  mainAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceLight,
  },
  mainAuthorInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  displayName: {
    ...typography.bodyBold,
    color: colors.textPrimary,
  },
  handle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  categoryPill: {
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  categoryText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  topicText: {
    ...typography.h2,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  contentText: {
    ...typography.body,
    fontSize: 16,
    lineHeight: 24,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  metaRow: {
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  timestamp: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  actionBar: {
    marginVertical: spacing.md,
  },
  challengeActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandPrimary,
    minHeight: touchMin + 4,
    borderRadius: borderRadius.full,
    gap: spacing.xs,
  },
  challengeActionText: {
    ...typography.bodyBold,
    color: '#000000',
  },
  duelsSection: {
    marginBottom: spacing.xl,
  },
  sectionHeader: {
    ...typography.captionBold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.md,
  },
  duelCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: spacing.sm,
  },
  duelCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.duelCrimson,
  },
  liveBadgeText: {
    ...typography.captionBold,
    color: colors.duelCrimson,
  },
  poolAmount: {
    ...typography.captionBold,
    color: colors.solanaGreen,
  },
  duelMatchup: {
    ...typography.bodyBold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  duelFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.xs,
  },
  viewDuelLink: {
    ...typography.captionBold,
    color: colors.solanaGreen,
  },
  repliesSection: {
    marginBottom: spacing.xxl,
  },
  noCommentsBox: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  noCommentsText: {
    ...typography.bodyMuted,
    color: colors.textSecondary,
  },
  inlineError: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 71, 87, 0.1)',
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  inlineErrorText: {
    flex: 1,
    color: colors.error,
    fontSize: 13,
    lineHeight: 18,
  },
  inlineRetry: {
    minHeight: touchMin,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  inlineRetryText: {
    color: colors.brandPrimary,
    fontWeight: '700',
    fontSize: 13,
  },
  commentItem: {
    flexDirection: 'row',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceLight,
  },
  commentAvatar: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceLight,
  },
  commentBody: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  commentAuthor: {
    ...typography.bodyBold,
    fontSize: 13,
    color: colors.textPrimary,
  },
  commentTime: {
    ...typography.caption,
    color: colors.textMuted,
  },
  commentText: {
    ...typography.body,
    fontSize: 14,
    color: colors.textPrimary,
    lineHeight: 19,
    marginBottom: spacing.xs,
  },
  replyChallengeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    paddingVertical: 2,
  },
  replyChallengeText: {
    ...typography.captionBold,
    color: colors.textSecondary,
    fontSize: 11,
  },
  composerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    gap: spacing.sm,
  },
  composerInput: {
    flex: 1,
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.textPrimary,
    maxHeight: 100,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    backgroundColor: colors.solanaGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: colors.surfaceLight,
  },
});

export default TakeDetailScreen;
