import { Platform } from 'react-native';

// Local-first storage: every entry lands here before any network is involved
// (SPEC.md guiding principle 1). Sync to Supabase reads from this table later.

export type EntryKind = 'audio' | 'text';
export type SyncStatus = 'local' | 'uploading' | 'synced';

export type Entry = {
  id: string;
  kind: EntryKind;
  title: string | null;
  content: string | null; // text-note body; null for audio entries
  audioPath: string | null; // file path on device; null for text entries
  durationMs: number | null;
  createdAt: number; // epoch ms
  syncStatus: SyncStatus;
};

export type Reminder = {
  id: string;
  text: string;
  done: 0 | 1;
  createdAt: number;
};

// UUIDs so locally-created rows can upload to Postgres unchanged.
export function newId(): string {
  const Crypto = require('expo-crypto') as typeof import('expo-crypto');
  return Crypto.randomUUID();
}

// expo-sqlite's web support is alpha, so the web build (used for capability
// parity later) gets an in-memory store for now. Real persistence on web
// arrives with the Supabase sync layer.
const isWeb = Platform.OS === 'web';

type Store = {
  insertEntry(e: Entry): void;
  listEntries(): Entry[];
  deleteEntry(id: string): void;
  setSyncStatus(id: string, status: SyncStatus): void;
  insertReminder(r: Reminder): void;
  listReminders(): Reminder[];
  setReminderDone(id: string, done: 0 | 1): void;
  deleteReminder(id: string): void;
};

function makeMemoryStore(): Store {
  const entries: Entry[] = [];
  const reminders: Reminder[] = [];
  return {
    insertEntry: (e) => void entries.unshift(e),
    listEntries: () => [...entries],
    deleteEntry: (id) => {
      const i = entries.findIndex((e) => e.id === id);
      if (i >= 0) entries.splice(i, 1);
    },
    setSyncStatus: (id, status) => {
      const e = entries.find((x) => x.id === id);
      if (e) e.syncStatus = status;
    },
    insertReminder: (r) => void reminders.unshift(r),
    listReminders: () => [...reminders],
    setReminderDone: (id, done) => {
      const r = reminders.find((x) => x.id === id);
      if (r) r.done = done;
    },
    deleteReminder: (id) => {
      const i = reminders.findIndex((r) => r.id === id);
      if (i >= 0) reminders.splice(i, 1);
    },
  };
}

function makeSqliteStore(): Store {
  // Required lazily so the web bundle never evaluates the native module.
  const SQLite = require('expo-sqlite') as typeof import('expo-sqlite');
  const db = SQLite.openDatabaseSync('minne.db');
  db.execSync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      title TEXT,
      content TEXT,
      audio_path TEXT,
      duration_ms INTEGER,
      created_at INTEGER NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'local'
    );
    CREATE TABLE IF NOT EXISTS reminders (
      id TEXT PRIMARY KEY,
      text TEXT NOT NULL,
      done INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
  `);

  type EntryRow = {
    id: string;
    kind: EntryKind;
    title: string | null;
    content: string | null;
    audio_path: string | null;
    duration_ms: number | null;
    created_at: number;
    sync_status: SyncStatus;
  };

  const toEntry = (r: EntryRow): Entry => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    content: r.content,
    audioPath: r.audio_path,
    durationMs: r.duration_ms,
    createdAt: r.created_at,
    syncStatus: r.sync_status,
  });

  return {
    insertEntry: (e) =>
      db.runSync(
        'INSERT INTO entries (id, kind, title, content, audio_path, duration_ms, created_at, sync_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [e.id, e.kind, e.title, e.content, e.audioPath, e.durationMs, e.createdAt, e.syncStatus]
      ),
    listEntries: () =>
      db.getAllSync<EntryRow>('SELECT * FROM entries ORDER BY created_at DESC').map(toEntry),
    deleteEntry: (id) => db.runSync('DELETE FROM entries WHERE id = ?', [id]),
    setSyncStatus: (id, status) =>
      db.runSync('UPDATE entries SET sync_status = ? WHERE id = ?', [status, id]),
    insertReminder: (r) =>
      db.runSync('INSERT INTO reminders (id, text, done, created_at) VALUES (?, ?, ?, ?)', [
        r.id,
        r.text,
        r.done,
        r.createdAt,
      ]),
    listReminders: () =>
      db.getAllSync<Reminder & { created_at: number }>(
        'SELECT id, text, done, created_at AS createdAt FROM reminders ORDER BY done ASC, created_at DESC'
      ),
    setReminderDone: (id, done) => db.runSync('UPDATE reminders SET done = ? WHERE id = ?', [done, id]),
    deleteReminder: (id) => db.runSync('DELETE FROM reminders WHERE id = ?', [id]),
  };
}

export const store: Store = isWeb ? makeMemoryStore() : makeSqliteStore();
