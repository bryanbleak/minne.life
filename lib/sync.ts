import { Platform } from 'react-native';

import { store, type Entry } from './db';
import { supabase } from './supabase';

// Upload queue — SPEC.md §7 stages 1-2. Local capture already happened; this
// pushes pending entries to Supabase. Every operation is idempotent (upserts,
// overwrite-safe storage uploads) so a retry after a half-finished attempt is
// always safe. Failures leave the entry 'local' and the next trigger retries.

let running = false;

export async function syncAll(): Promise<boolean> {
  if (running) return false;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return false; // not signed in yet — capture stays local-only

  running = true;
  let changedAnything = false;
  try {
    const pending = store.listEntries().filter((e) => e.syncStatus !== 'synced');
    for (const entry of pending) {
      try {
        store.setSyncStatus(entry.id, 'uploading');
        await syncEntry(entry, session.user.id);
        store.setSyncStatus(entry.id, 'synced');
        changedAnything = true;
      } catch {
        store.setSyncStatus(entry.id, 'local'); // retry on the next trigger
      }
    }
  } finally {
    running = false;
  }
  return changedAnything;
}

async function syncEntry(entry: Entry, userId: string): Promise<void> {
  const createdAt = new Date(entry.createdAt).toISOString();

  const { error: entryError } = await supabase.from('entries').upsert({
    id: entry.id,
    user_id: userId,
    title: entry.title,
    source_type: entry.kind === 'audio' ? 'spoken' : 'typed',
    created_at: createdAt,
  });
  if (entryError) throw entryError;

  // Phase 1 has exactly one block or recording per entry, so we reuse the
  // entry's UUID as that child row's id to keep uploads idempotent without
  // tracking extra ids locally. Append-to-entry (Phase 5) will mint fresh ids.
  if (entry.kind === 'text') {
    const { error } = await supabase.from('blocks').upsert({
      id: entry.id,
      entry_id: entry.id,
      user_id: userId,
      order: 0,
      origin: 'typed',
      content: entry.content,
      created_at: createdAt,
    });
    if (error) throw error;
    return;
  }

  if (!entry.audioPath) throw new Error('audio entry has no file');
  const ext = entry.audioPath.split('.').pop() ?? 'm4a';
  const storagePath = `${userId}/${entry.id}/${entry.id}.${ext}`;

  if (Platform.OS === 'web') throw new Error('web audio upload not implemented yet');
  const FileSystem = require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');
  const { decode } = require('base64-arraybuffer') as typeof import('base64-arraybuffer');
  const base64 = await FileSystem.readAsStringAsync(entry.audioPath, { encoding: 'base64' });

  const { error: uploadError } = await supabase.storage
    .from('audio')
    .upload(storagePath, decode(base64), { contentType: `audio/${ext}`, upsert: true });
  if (uploadError) throw uploadError;

  const { error: recordingError } = await supabase.from('recordings').upsert({
    id: entry.id,
    entry_id: entry.id,
    user_id: userId,
    audio_path: storagePath,
    duration_seconds: entry.durationMs != null ? entry.durationMs / 1000 : null,
    status_upload: 'done',
    created_at: createdAt,
  });
  if (recordingError) throw recordingError;
}
