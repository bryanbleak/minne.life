import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { Link, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { newId, store } from '@/lib/db';

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Recording files land in the OS cache; move them somewhere permanent so a
// cache purge can never eat a memory (SPEC.md principle 1).
async function persistRecording(cacheUri: string, id: string): Promise<string> {
  if (Platform.OS === 'web') return cacheUri;
  const FileSystem = require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');
  const dir = `${FileSystem.documentDirectory}recordings/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
  const ext = cacheUri.split('.').pop() ?? 'm4a';
  const dest = `${dir}${id}.${ext}`;
  await FileSystem.moveAsync({ from: cacheUri, to: dest });
  return dest;
}

export default function AddNoteScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const tint = Colors[colorScheme].tint;
  const router = useRouter();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const [busy, setBusy] = useState(false);

  const startRecording = useCallback(async () => {
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Microphone needed',
        'Minne needs microphone access to record. Enable it in Settings > Minne.'
      );
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
  }, [recorder]);

  const stopRecording = useCallback(async () => {
    setBusy(true);
    try {
      const durationMs = recorderState.durationMillis ?? 0;
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) {
        Alert.alert('Recording failed', 'No audio was captured. Please try again.');
        return;
      }
      const id = newId();
      const audioPath = await persistRecording(uri, id);
      store.insertEntry({
        id,
        kind: 'audio',
        title: null,
        content: null,
        audioPath,
        durationMs,
        createdAt: Date.now(),
        syncStatus: 'local',
        origin: null,
      });
      router.push({ pathname: '/finish-note', params: { id } });
    } finally {
      setBusy(false);
    }
  }, [recorder, recorderState.durationMillis, router]);

  const isRecording = recorderState.isRecording;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <ThemedText type="title">Minne</ThemedText>
          <Link href="/settings" asChild>
            <Pressable hitSlop={12} accessibilityLabel="Settings">
              <IconSymbol name="gearshape.fill" size={26} color={tint} />
            </Pressable>
          </Link>
        </View>

        <View style={styles.center}>
          <Pressable
            onPress={isRecording ? stopRecording : startRecording}
            disabled={busy}
            accessibilityLabel={isRecording ? 'Stop recording' : 'Start recording'}
            style={({ pressed }) => [
              styles.recordButton,
              isRecording ? styles.recordButtonActive : { backgroundColor: tint },
              pressed && styles.pressed,
            ]}>
            <IconSymbol name={isRecording ? 'stop.fill' : 'mic.fill'} size={56} color="#fff" />
          </Pressable>
          <ThemedText type="subtitle" style={styles.hint}>
            {isRecording
              ? `Recording ${formatDuration(recorderState.durationMillis ?? 0)}`
              : 'Tap to record'}
          </ThemedText>
          {isRecording && (
            <ThemedText style={styles.recordingNote}>Tap the square to stop and save</ThemedText>
          )}
        </View>

        <View style={styles.footer}>
          <Link href="/text-note" asChild>
            <Pressable
              style={({ pressed }) => [styles.textNoteButton, pressed && styles.pressed]}
              accessibilityLabel="Write a text note">
              <IconSymbol name="square.and.pencil" size={22} color={tint} />
              <ThemedText type="defaultSemiBold" style={{ color: tint }}>
                Write a note
              </ThemedText>
            </Pressable>
          </Link>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: 24 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 },
  recordButton: {
    width: 140,
    height: 140,
    borderRadius: 70,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  recordButtonActive: { backgroundColor: '#d33' },
  pressed: { opacity: 0.8 },
  hint: { textAlign: 'center' },
  recordingNote: { opacity: 0.6 },
  footer: { alignItems: 'center', paddingBottom: 24 },
  textNoteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
});
