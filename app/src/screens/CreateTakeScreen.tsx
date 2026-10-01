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
import { TOPIC_CATEGORIES } from '../topics';
import { colors, spacing, touchMin } from '../theme';
import { Icon } from '../components/Icon';
import { api } from '../api';

interface CreateTakeScreenProps {
  onSuccess: () => void;
  onCancel: () => void;
}

const CATEGORIES: Category[] = TOPIC_CATEGORIES;

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
        <Text style={styles.title}>Post a take</Text>
        <TouchableOpacity onPress={onCancel} style={styles.cancelBtn} accessibilityLabel="Cancel" accessibilityRole="button">
          <Icon name="x" size={20} color={colors.textPrimary} />
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

      <Text style={styles.label}>Your Take</Text>
      <TextInput
        style={styles.input}
        value={topic}
        onChangeText={setTopic}
        placeholder="Arsenal wins the Premier League"
        placeholderTextColor={colors.textMuted}
        accessibilityLabel="Your Take"
      />

      <Text style={styles.label}>Why? (optional)</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        value={content}
        onChangeText={setContent}
        placeholder="Squad depth and recent form give them the edge."
        placeholderTextColor={colors.textMuted}
        multiline
        numberOfLines={5}
        textAlignVertical="top"
        accessibilityLabel="Why, optional reasoning"
      />

      <View style={styles.tipsBox}>
        <Text style={styles.tipTitle}>How challenges work</Text>
        <Text style={styles.tipBody}>
          Takes with objective, verifiable conditions (price thresholds, match outcomes) can be challenged into 1v1 duels with locked terms.
        </Text>
      </View>

      <TouchableOpacity
        style={styles.publishBtn}
        onPress={handlePublish}
        disabled={loading}
        activeOpacity={0.8}
        accessibilityLabel="Publish take"
        accessibilityRole="button"
      >
        {loading ? (
          <ActivityIndicator color="#000" />
        ) : (
          <Text style={styles.publishText}>Publish take</Text>
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
    fontSize: 20,
    fontWeight: '800',
  },
  cancelBtn: {
    minHeight: touchMin,
    minWidth: touchMin,
    justifyContent: 'center',
    alignItems: 'center',
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
    minHeight: touchMin,
    justifyContent: 'center',
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
    minHeight: touchMin + 4,
    justifyContent: 'center',
    borderRadius: 14,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  publishText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '800',
  },
});
