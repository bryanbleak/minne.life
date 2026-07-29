import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

// Placeholder for Phase 1. Coming here soon:
// - Account: Supabase sign-in (email magic link), sign-out
// - API keys: per-user OpenAI + Anthropic keys, stored encrypted server-side
//   and used only from Edge Functions (docs/DECISIONS.md #5)
export default function SettingsScreen() {
  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <ThemedText type="subtitle">Account</ThemedText>
          <ThemedText style={styles.muted}>
            Sign-in arrives with sync. Your recordings are saved on this phone either way — nothing
            is lost while this is being built.
          </ThemedText>
        </View>
        <View style={styles.section}>
          <ThemedText type="subtitle">API keys</ThemedText>
          <ThemedText style={styles.muted}>
            Once transcription is live, you&apos;ll add your own OpenAI and Anthropic keys here so
            each family member pays for their own usage. Keys are stored encrypted on the server and
            never inside the app.
          </ThemedText>
        </View>
        <View style={styles.section}>
          <ThemedText type="subtitle">About</ThemedText>
          <ThemedText style={styles.muted}>Minne — a personal capture and retrieval system.</ThemedText>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, gap: 28 },
  section: { gap: 8 },
  muted: { opacity: 0.6 },
});
