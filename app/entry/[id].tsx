import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { store, type Entry } from '@/lib/db';

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

function formatWhen(epochMs: number): string {
  return new Date(epochMs).toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function AudioPlayerView({ entry }: { entry: Entry }) {
  const colorScheme = useColorScheme() ?? 'light';
  const tint = Colors[colorScheme].tint;
  const player = useAudioPlayer(entry.audioPath ? { uri: entry.audioPath } : null);
  const status = useAudioPlayerStatus(player);

  // The recorder leaves the audio session in record mode, which routes sound
  // to the quiet earpiece — switch to normal speaker playback here.
  useEffect(() => {
    setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
  }, []);

  const finished =
    status.duration > 0 && !status.playing && status.currentTime >= status.duration - 0.05;

  const toggle = () => {
    if (status.playing) {
      player.pause();
    } else {
      if (finished) player.seekTo(0);
      player.play();
    }
  };

  const progress =
    status.duration > 0 ? Math.min(status.currentTime / status.duration, 1) : 0;

  return (
    <View style={styles.playerCard}>
      <Pressable
        onPress={toggle}
        accessibilityLabel={status.playing ? 'Pause' : 'Play'}
        style={({ pressed }) => [
          styles.playButton,
          { backgroundColor: tint },
          pressed && styles.pressed,
        ]}>
        <IconSymbol name={status.playing ? 'pause.fill' : 'play.fill'} size={20} color="#fff" />
        <ThemedText style={styles.playText}>{status.playing ? 'Pause' : 'Play'}</ThemedText>
      </Pressable>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: tint }]} />
      </View>
      <ThemedText style={styles.clock}>
        {formatClock(status.currentTime)} / {formatClock(status.duration)}
      </ThemedText>
    </View>
  );
}

export default function EntryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const entry = useMemo(() => (id ? store.getEntry(id) : null), [id]);

  if (!entry) {
    return (
      <ThemedView style={[styles.container, styles.centered]}>
        <ThemedText>This note could not be found on this phone.</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="title">
          {entry.title ?? (entry.kind === 'audio' ? 'Voice memo' : 'Note')}
        </ThemedText>
        <ThemedText style={styles.meta}>{formatWhen(entry.createdAt)}</ThemedText>

        {entry.kind === 'audio' ? (
          <>
            <AudioPlayerView entry={entry} />
            <ThemedText style={styles.transcriptNote}>
              The written transcript of this recording will appear here once transcription is built.
            </ThemedText>
          </>
        ) : (
          <ThemedText style={styles.body}>{entry.content}</ThemedText>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, gap: 12 },
  meta: { opacity: 0.6, fontSize: 14 },
  playerCard: { gap: 12, paddingVertical: 16 },
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 14,
  },
  playText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  pressed: { opacity: 0.8 },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#8883',
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 3 },
  clock: { textAlign: 'center', opacity: 0.6, fontVariant: ['tabular-nums'] },
  body: { fontSize: 17, lineHeight: 26 },
  transcriptNote: { opacity: 0.5, fontStyle: 'italic', marginTop: 8 },
});
