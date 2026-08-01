import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { newId, store, type Reminder } from '@/lib/db';

// Not timed notifications — a running list of things Bryan wants to remember
// to record ("Grandpa's mission story"). See docs/DECISIONS.md #4.
export default function RemindersScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const tint = Colors[colorScheme].tint;
  const primary = Colors[colorScheme].primary;
  const textColor = Colors[colorScheme].text;
  const [reminders, setReminders] = useState<Reminder[]>(() => store.listReminders());
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const refresh = useCallback(() => setReminders(store.listReminders()), []);

  const add = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    if (editingId) {
      store.setReminderText(editingId, text);
    } else {
      store.insertReminder({ id: newId(), text, done: 0, createdAt: Date.now() });
    }
    setDraft('');
    setEditingId(null);
    refresh();
  }, [draft, editingId, refresh]);

  const startEdit = useCallback((r: Reminder) => {
    setEditingId(r.id);
    setDraft(r.text);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setDraft('');
  }, []);

  const toggle = useCallback(
    (r: Reminder) => {
      store.setReminderDone(r.id, r.done ? 0 : 1);
      refresh();
    },
    [refresh]
  );

  const remove = useCallback(
    (r: Reminder) => {
      store.deleteReminder(r.id);
      refresh();
    },
    [refresh]
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" style={styles.heading}>
          Things to record
        </ThemedText>

        <View style={styles.inputRow}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={add}
            placeholder="e.g. Grandpa's mission story"
            placeholderTextColor="#8888"
            returnKeyType="done"
            style={[styles.input, { color: textColor }]}
          />
          <Pressable
            onPress={add}
            accessibilityLabel={editingId ? 'Save reminder' : 'Add reminder'}
            style={({ pressed }) => [styles.addButton, { backgroundColor: primary }, pressed && styles.pressed]}>
            <ThemedText style={styles.addButtonText}>{editingId ? 'Save' : 'Add'}</ThemedText>
          </Pressable>
        </View>
        {editingId && (
          <Pressable onPress={cancelEdit} hitSlop={8} style={styles.cancelEdit}>
            <ThemedText style={{ color: primary, fontWeight: '600' }}>Cancel editing</ThemedText>
          </Pressable>
        )}

        {reminders.length === 0 ? (
          <View style={styles.empty}>
            <ThemedText style={styles.emptyText}>
              Jot down stories and thoughts you want to capture later — check them off once recorded.
            </ThemedText>
          </View>
        ) : (
          <FlatList
            data={reminders}
            keyExtractor={(r) => r.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <View style={styles.row}>
                <Pressable
                  onPress={() => toggle(item)}
                  hitSlop={8}
                  accessibilityLabel={item.done ? 'Mark not recorded yet' : 'Mark as recorded'}>
                  <IconSymbol
                    name={item.done ? 'checkmark.circle.fill' : 'circle'}
                    size={26}
                    color={item.done ? '#2a9d3f' : tint}
                  />
                </Pressable>
                <Pressable style={styles.rowTextWrap} onPress={() => startEdit(item)}>
                  <ThemedText style={[styles.rowText, item.done === 1 && styles.doneText]}>
                    {item.text}
                  </ThemedText>
                </Pressable>
                <Pressable onPress={() => startEdit(item)} hitSlop={8} accessibilityLabel="Edit reminder">
                  <IconSymbol name="square.and.pencil" size={20} color={primary} />
                </Pressable>
                <Pressable onPress={() => remove(item)} hitSlop={8} accessibilityLabel="Delete reminder">
                  <IconSymbol name="trash" size={20} color="#8a8a8e" />
                </Pressable>
              </View>
            )}
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
  inputRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#8886',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  addButton: { borderRadius: 10, paddingHorizontal: 18, justifyContent: 'center' },
  addButtonText: { color: '#fff', fontWeight: '600' },
  pressed: { opacity: 0.8 },
  listContent: { paddingBottom: 24 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowTextWrap: { flex: 1 },
  rowText: { fontSize: 16 },
  cancelEdit: { marginTop: -8, marginBottom: 12, alignSelf: 'flex-start' },
  doneText: { textDecorationLine: 'line-through', opacity: 0.5 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: '#8884' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyText: { textAlign: 'center', opacity: 0.6 },
});
