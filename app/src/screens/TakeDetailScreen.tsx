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
import { IdentityHeader } from '../components/IdentityHeader';
import { DuelAttachment } from '../components/DuelAttachment';
import {
  formatUserDisplayName,
  formatUserHandle,
  getAvatarUri,
} from '../utils/identity';

interface TakeDetailScreenProps {
  take: Take;
  onBack: () => void;
  onSelectDuel: (duel: Duel) => void;
  onChallengeTake: (take: Take) => void;
  onOpenAuthorProfile?: (wallet: string | null) => void;
  userWallet?: string | null;
}

export const TakeDetailScreen: React.FC<TakeDetailScreenProps> = ({
  take,
  onBack,
  onSelectDuel,
  onChallengeTake,
  onOpenAuthorProfile,
  userWallet,
}) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [duels, setDuels] = useState<Duel[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Live take header: refetched on every thread load so a profile edit
  // (name/handle/avatar) reflects here without recreating the Take.
  const [liveTake, setLiveTake] = useState<Take>(take);

  const loadThread = async () => {
    try {
      setLoading(true);
      setError(null);
      const res: any = await api.getTake(take.id);
      if (res) {
        const { comments: c, duels: d, ...takeFields } = res;
        if (takeFields && takeFields.id) setLiveTake(takeFields as Take);
        setComments(Array.isArray(c) ? c : []);
        setDuels(Array.isArray(d) ? d : []);
      }
    } catch (err: any) {
      console.warn('Failed to load take thread:', err);
      setError("Couldn't load comments.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLiveTake(take);
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
    display_name: liveTake.author_name,
    handle: liveTake.author_handle,
    wallet: liveTake.author_wallet,
  });
  const authorHandle = formatUserHandle({
    handle: liveTake.author_handle,
    wallet: liveTake.author_wallet,
  });

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
        {/* Conversation head: the opinion first */}
        <IdentityHeader
          displayName={liveTake.author_name}
          handle={liveTake.author_handle}
          wallet={liveTake.author_wallet}
          avatarUrl={liveTake.author_avatar}
          timestamp={liveTake.created_at}
          onPress={onOpenAuthorProfile ? () => onOpenAuthorProfile(liveTake.author_wallet) : undefined}
        />

        <Text style={styles.topicText}>{liveTake.topic}</Text>
        <Text style={styles.contentText}>{liveTake.content}</Text>

        <View style={styles.metaRow}>
          <Text style={styles.timestamp}>
            {new Date(liveTake.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ·{' '}
            {new Date(liveTake.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
          </Text>
          <TouchableOpacity
            onPress={handleShare}
            style={styles.metaShare}
            accessibilityLabel="Share take"
            accessibilityRole="button"
          >
            <Icon name="share-2" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Secondary context action: challenge the opinion, not the money */}
        <TouchableOpacity
          style={styles.challengeRow}
          onPress={() => onChallengeTake(liveTake)}
          activeOpacity={0.8}
          accessibilityLabel="Challenge this take to a 1v1 duel"
          accessibilityRole="button"
        >
          <Icon name="swords" size={16} color={colors.brandPrimary} />
          <Text style={styles.challengeRowText}>Challenge this take</Text>
          <Icon name="chevron-right" size={16} color={colors.textMuted} />
        </TouchableOpacity>

        {/* Compact duel attachments born from this take */}
        {duels.length > 0 && (
          <View style={styles.duelsSection}>
            <Text style={styles.sectionHeader}>Duels from this take</Text>
            {duels.map((d) => (
              <DuelAttachment key={d.id} duel={d} onOpen={onSelectDuel} />
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
            <ActivityIndicator size="small" color={colors.brandPrimary} style={{ marginVertical: spacing.lg }} />
          ) : comments.length === 0 ? (
            <View style={styles.noCommentsBox}>
              <Text style={styles.noCommentsText}>No replies yet. Start the thread below.</Text>
            </View>
          ) : (
            comments.map((comment) => (
              <View key={comment.id} style={styles.commentItem}>
                <View style={styles.railCol}>
                  <Image
                    source={{ uri: getAvatarUri(comment.author_avatar, comment.author_wallet) }}
                    style={styles.commentAvatar}
                  />
                  <View style={styles.rail} />
                </View>
                <View style={styles.commentBody}>
                  <TouchableOpacity
                    onPress={onOpenAuthorProfile ? () => onOpenAuthorProfile(comment.author_wallet) : undefined}
                    activeOpacity={0.8}
                    accessibilityLabel="Open comment author profile"
                  >
                    <View style={styles.commentHeader}>
                      <Text style={styles.commentAuthor}>
                        {formatUserDisplayName({
                          display_name: comment.author_name,
                          handle: comment.author_handle,
                          wallet: comment.author_wallet,
                        })}
                      </Text>
                      <Text style={styles.commentTime}>
                        {new Date(comment.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                  </TouchableOpacity>
                  <Text style={styles.commentText}>{comment.content}</Text>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  timestamp: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  metaShare: {
    minHeight: touchMin,
    minWidth: touchMin,
    justifyContent: 'center',
    alignItems: 'center',
  },
  challengeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: touchMin + 4,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  challengeRowText: {
    ...typography.bodyBold,
    color: colors.brandPrimary,
    flex: 1,
  },
  railCol: {
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  rail: {
    flex: 1,
    width: 2,
    backgroundColor: colors.surfaceLight,
    marginTop: 6,
    minHeight: 12,
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
