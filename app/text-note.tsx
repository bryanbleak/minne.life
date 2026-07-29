import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { newId, store } from '@/lib/db';

export default function TextNoteScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const tint = Colors[colorScheme].tint;
  const textColor = Colors[colorScheme].text;
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

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
    });
    router.back();
  }, [body, title, router]);

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
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder="Write your note…"
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
