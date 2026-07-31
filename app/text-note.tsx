import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { newId, store, type TextOrigin } from '@/lib/db';
import { syncAll } from '@/lib/sync';

export default function TextNoteScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const tint = Colors[colorScheme].tint;
  const textColor = Colors[colorScheme].text;
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [origin, setOrigin] = useState<TextOrigin>('typed');

  const save = useCallback(() => {
    const content = body.trim();
    if (!content) {
      router.back();
      return;
    }
    store.insertEntry({
      id: newId(),
      kind: 'text',
      title: title.trim() || null,
      content,
      audioPath: null,
      durationMs: null,
      createdAt: Date.now(),
      syncStatus: 'local',
      origin,
    });
    syncAll().catch(() => {});
    router.back();
  }, [body, title, origin, router]);

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Title (optional)"
          placeholderTextColor="#8888"
          style={[styles.title, { color: textColor }]}
        />
        <View style={styles.originRow}>
          {(
            [
              ['typed', 'My words'],
              ['source', 'Quoted source'],
            ] as const
          ).map(([value, label]) => (
            <Pressable
              key={value}
              onPress={() => setOrigin(value)}
              accessibilityLabel={label}
              style={[
                styles.originChip,
                origin === value && { backgroundColor: tint, borderColor: tint },
              ]}>
              <ThemedText
                style={[styles.originChipText, origin === value && styles.originChipTextActive]}>
                {label}
              </ThemedText>
            </Pressable>
          ))}
        </View>
        {origin === 'source' && (
          <ThemedText style={styles.originHint}>
            Marked verbatim — AI will never edit or rewrite this text.
          </ThemedText>
        )}
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder={origin === 'source' ? 'Paste the quote or passage…' : 'Write your note…'}
          placeholderTextColor="#8888"
          multiline
          autoFocus
          textAlignVertical="top"
          style={[styles.body, { color: textColor }]}
        />
        <Pressable
          onPress={save}
          accessibilityLabel="Save note"
          style={({ pressed }) => [styles.saveButton, { backgroundColor: tint }, pressed && styles.pressed]}>
          <ThemedText style={styles.saveText}>{body.trim() ? 'Save' : 'Cancel'}</ThemedText>
        </Pressable>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  flex: { flex: 1 },
  title: { fontSize: 20, fontWeight: '600', paddingVertical: 12 },
  originRow: { flexDirection: 'row', gap: 8, paddingBottom: 8 },
  originChip: {
    borderWidth: 1,
    borderColor: '#8886',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  originChipText: { fontSize: 14 },
  originChipTextActive: { color: '#fff', fontWeight: '600' },
  originHint: { fontSize: 13, opacity: 0.6, paddingBottom: 8 },
  body: { flex: 1, fontSize: 17, lineHeight: 24 },
  saveButton: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  saveText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  pressed: { opacity: 0.8 },
});
