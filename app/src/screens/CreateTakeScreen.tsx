import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Category } from '../types';
import { colors, spacing } from '../theme';
import { api } from '../api';

interface CreateTakeScreenProps {
  onSuccess: () => void;
  onCancel: () => void;
}

const CATEGORIES: Category[] = ['CRYPTO', 'SPORTS', 'WEATHER', 'POLITICS', 'CULTURE'];

export const CreateTakeScreen: React.FC<CreateTakeScreenProps> = ({
  onSuccess,
  onCancel,
}) => {
  const [topic, setTopic] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<Category>('CRYPTO');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePublish = async () => {
    if (!topic.trim()) {
      setError('Please provide a short headline/topic for your take');
      return;
    }
    if (!content.trim()) {
      setError('Please write out your controversial take');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await api.createTake(topic.trim(), content.trim(), category);
      setLoading(false);
      onSuccess();
    } catch (err: any) {
      setLoading(false);
      setError(err.message || 'Failed to post take');
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>🔥 POST CONTROVERSIAL TAKE</Text>
        <TouchableOpacity onPress={onCancel} style={styles.cancelBtn}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}

      <Text style={styles.label}>Category</Text>
      <View style={styles.catGrid}>
        {CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat}
            style={[styles.catBtn, category === cat && styles.catBtnActive]}
            onPress={() => setCategory(cat)}
          >
            <Text style={[styles.catText, category === cat && styles.catTextActive]}>
              {cat}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Topic / Headline</Text>
      <TextInput
        style={styles.input}
        value={topic}
        onChangeText={setTopic}
        placeholder="e.g. SOL will flip ETH in 2026"
        placeholderTextColor={colors.textMuted}
      />

      <Text style={styles.label}>Your Take (Others will be able to challenge this 1v1)</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        value={content}
        onChangeText={setContent}
        placeholder="State your conviction with clear conditions. Put your reputation and capital on the line..."
        placeholderTextColor={colors.textMuted}
        multiline
        numberOfLines={5}
        textAlignVertical="top"
      />

      <View style={styles.tipsBox}>
        <Text style={styles.tipTitle}>💡 Pro-tip for Maximum Duel Volume:</Text>
        <Text style={styles.tipBody}>
          Hot takes with objective, verifiable conditions (e.g. price thresholds, match outcomes) get challenged 4x faster.
        </Text>
      </View>

      <TouchableOpacity
        style={styles.publishBtn}
        onPress={handlePublish}
        disabled={loading}
        activeOpacity={0.8}
      >
        {loading ? (
          <ActivityIndicator color="#000" />
        ) : (
          <Text style={styles.publishText}>PUBLISH TO COUNTER FEED</Text>
        )}
      </TouchableOpacity>
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
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  cancelBtn: {
    padding: 6,
  },
  cancelText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  errorText: {
    color: colors.duelCrimson,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 8,
    marginTop: spacing.md,
    textTransform: 'uppercase',
  },
  catGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: spacing.sm,
  },
  catBtn: {
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  catBtnActive: {
    backgroundColor: 'rgba(20, 241, 149, 0.2)',
    borderColor: colors.solanaGreen,
  },
  catText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  catTextActive: {
    color: colors.solanaGreen,
    fontWeight: '900',
  },
  input: {
    backgroundColor: colors.surfaceLight,
    color: colors.textPrimary,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    fontSize: 15,
  },
  textArea: {
    minHeight: 120,
  },
  tipsBox: {
    backgroundColor: 'rgba(153, 69, 255, 0.1)',
    borderRadius: 12,
    padding: spacing.md,
    marginTop: spacing.lg,
    borderLeftWidth: 3,
    borderColor: colors.solanaPurple,
    gap: 4,
  },
  tipTitle: {
    color: colors.solanaPurple,
    fontSize: 12,
    fontWeight: '800',
  },
  tipBody: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  publishBtn: {
    backgroundColor: colors.solanaGreen,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  publishText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
});
