import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { store } from '@/lib/db';
import { syncAll } from '@/lib/sync';

// The optional two-second post-recording prompt (SPEC.md §8): what is this
// about? Defaults to blank — skipping is always one tap.
export default function FinishNoteScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const tint = Colors[colorScheme].tint;
  const primary = Colors[colorScheme].primary;
  const textColor = Colors[colorScheme].text;
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [title, setTitle] = useState('');

  const finish = useCallback(
    (save: boolean) => {
      const trimmed = title.trim();
      if (save && trimmed && id) store.setTitle(id, trimmed);
      syncAll().catch(() => {});
      router.replace('/list');
    },
    [id, title, router]
  );

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="subtitle">Saved. What is this about?</ThemedText>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="e.g. Thoughts on Alma 28 (optional)"
        placeholderTextColor="#8888"
        autoFocus
        returnKeyType="done"
        onSubmitEditing={() => finish(true)}
        style={[styles.input, { color: textColor }]}
      />
      <View style={styles.buttons}>
        <Pressable
          onPress={() => finish(false)}
          style={({ pressed }) => [styles.skipButton, pressed && styles.pressed]}>
          <ThemedText style={{ color: tint, fontWeight: '600' }}>Skip</ThemedText>
        </Pressable>
        <Pressable
          onPress={() => finish(true)}
          style={({ pressed }) => [
            styles.saveButton,
            { backgroundColor: primary },
            pressed && styles.pressed,
          ]}>
          <ThemedText style={styles.saveText}>Save</ThemedText>
        </Pressable>
      </View>
      <ThemedText style={styles.note}>
        Your recording is already safe either way — this just makes it easier to find later.
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, gap: 16 },
  input: {
    borderWidth: 1,
    borderColor: '#8886',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 17,
  },
  buttons: { flexDirection: 'row', gap: 12 },
  skipButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveButton: { flex: 2, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  saveText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  pressed: { opacity: 0.8 },
  note: { opacity: 0.5, fontSize: 13 },
});
