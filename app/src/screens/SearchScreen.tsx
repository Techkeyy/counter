import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '../api';
import { UserSearchResult } from '../types';
import { colors, spacing, touchMin, typography } from '../theme';
import { Avatar, EmptyState, ScreenHeader } from '../components/CounterUI';
import { formatUserDisplayName, formatUserHandle } from '../utils/identity';

export const SearchScreen: React.FC<{
  onBack: () => void;
  onSelectProfile: (wallet: string) => void;
}> = ({ onBack, onSelectProfile }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length < 2) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const timer = setTimeout(() => {
      api.searchUsers(normalized)
        .then((users) => { if (!cancelled) setResults(users); })
        .catch(() => { if (!cancelled) setError('People could not load. Try again.'); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const renderResult = ({ item }: { item: UserSearchResult }) => (
    <TouchableOpacity
      style={styles.result}
      onPress={() => onSelectProfile(item.wallet_address)}
      accessibilityRole="button"
      accessibilityLabel={`Open ${formatUserDisplayName(item)} profile`}
    >
      <Avatar uri={item.avatar_url} wallet={item.wallet_address} size={48} />
      <View style={styles.resultCopy}>
        <Text style={styles.name} numberOfLines={1}>{formatUserDisplayName(item)}</Text>
        <Text style={styles.handle} numberOfLines={1}>{formatUserHandle(item) || item.wallet_address.slice(0, 8)}</Text>
        {item.bio ? <Text style={styles.bio} numberOfLines={1}>{item.bio}</Text> : null}
      </View>
      <Text style={styles.arrow}>›</Text>
    </TouchableOpacity>
  );

  const body = query.trim().length < 2
    ? <EmptyState title="Search people on Counter." body="Find a public profile by handle, name, or wallet." />
    : loading
      ? <View style={styles.loading}><ActivityIndicator color={colors.brandPrimary} /></View>
      : error
        ? <EmptyState title="Search unavailable" body={error} action="Retry" onAction={() => setQuery((value) => `${value} `)} />
        : results.length === 0
          ? <EmptyState title="No people found." body="Try a different handle, name, or wallet prefix." />
          : <FlatList data={results} keyExtractor={(item) => item.wallet_address} renderItem={renderResult} contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled" />;

  return (
    <View style={styles.container}>
      <ScreenHeader title="Search" onBack={onBack} />
      <View style={styles.inputWrap}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search people"
          placeholderTextColor={colors.textMuted}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          style={styles.input}
          accessibilityLabel="Search people"
        />
      </View>
      {body}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  inputWrap: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  input: { minHeight: 52, borderRadius: 16, backgroundColor: colors.surfaceLight, color: colors.textPrimary, paddingHorizontal: spacing.lg, ...typography.body },
  list: { paddingHorizontal: spacing.lg, paddingBottom: 112 },
  result: { flexDirection: 'row', alignItems: 'center', minHeight: 76, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  resultCopy: { flex: 1, marginLeft: spacing.md },
  name: { ...typography.bodyBold },
  handle: { ...typography.caption, color: colors.brandPrimary, marginTop: 2 },
  bio: { ...typography.caption, color: colors.textMuted, marginTop: 3 },
  arrow: { color: colors.brandPrimary, fontSize: 28, paddingLeft: spacing.sm },
  loading: { padding: spacing.xl, alignItems: 'center' },
});

