import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { store, type Entry, type SyncStatus } from '@/lib/db';
import { syncAll } from '@/lib/sync';

function formatWhen(epochMs: number): string {
  const d = new Date(epochMs);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return sameDay ? time : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
}

function formatDuration(ms: number | null): string {
  if (ms == null) return '';
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return ` · ${m}:${s.toString().padStart(2, '0')}`;
}

// "Trust is the feature" (SPEC.md §8) — every entry shows where it lives.
const SYNC_LABEL: Record<SyncStatus, { label: string; color: string }> = {
  local: { label: 'On phone', color: '#8a8a8e' },
  uploading: { label: 'Uploading…', color: '#c90' },
  synced: { label: 'Synced', color: '#2a9d3f' },
};

export default function ListScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const tint = Colors[colorScheme].tint;
  const router = useRouter();
  const [entries, setEntries] = useState<Entry[]>([]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setEntries(store.listEntries());
      // Opening the list is also a sync trigger; refresh badges when it finishes.
      syncAll()
        .then((changed) => {
          if (active && changed) setEntries(store.listEntries());
        })
        .catch(() => {});
      return () => {
        active = false;
      };
    }, [])
  );

  const renderItem = ({ item }: { item: Entry }) => {
    const sync = SYNC_LABEL[item.syncStatus];
    const title =
      item.title ?? (item.kind === 'audio' ? 'Voice memo' : (item.content ?? '').slice(0, 60) || 'Note');
    return (
      <Pressable
        onPress={() => router.push(`/entry/${item.id}`)}
        accessibilityLabel={`Open ${title}`}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
        <IconSymbol
          name={item.kind === 'audio' ? 'waveform' : 'square.and.pencil'}
          size={24}
          color={tint}
        />
        <View style={styles.rowBody}>
          <ThemedText type="defaultSemiBold" numberOfLines={1}>
            {title}
          </ThemedText>
          <ThemedText style={styles.meta}>
            {formatWhen(item.createdAt)}
            {formatDuration(item.durationMs)}
          </ThemedText>
        </View>
        <View style={[styles.badge, { borderColor: sync.color }]}>
          <ThemedText style={[styles.badgeText, { color: sync.color }]}>{sync.label}</ThemedText>
        </View>
        <IconSymbol name="chevron.right" size={18} color="#8a8a8e" />
      </Pressable>
    );
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" style={styles.heading}>
          Notes
        </ThemedText>
        {entries.length === 0 ? (
          <View style={styles.empty}>
            <ThemedText style={styles.emptyText}>
              Nothing here yet. Record a voice memo or write a note from the Add Note tab.
            </ThemedText>
          </View>
        ) : (
          <FlatList
            data={entries}
            keyExtractor={(e) => e.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: 20 },
  heading: { paddingTop: 8, paddingBottom: 12 },
  listContent: { paddingBottom: 24 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowPressed: { opacity: 0.6 },
  rowBody: { flex: 1, gap: 2 },
  meta: { fontSize: 13, opacity: 0.6 },
  badge: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: { fontSize: 12, fontWeight: '600' },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: '#8884' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyText: { textAlign: 'center', opacity: 0.6 },
});
