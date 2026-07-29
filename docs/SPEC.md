# Minne — Project Specification

**Domain:** minne.life
**Owner:** Bryan (product manager, not a professional developer — explain what you're doing, don't assume terminal or git fluency)

---

## 1. What this is

A personal capture and retrieval system for thoughts, memories, scripture study, and quoted source material.

Three surfaces, one database:

| Surface | Purpose |
|---|---|
| **iOS app** | Capture in the moment. Voice recording, one tap from cold open. Quick typed notes. |
| **Web app (minne.life)** | Sit-down work. Search, filter, read, paste long passages, write commentary. |
| **Notion (existing)** | Optional mirror/view of entries. Not the source of truth. |

The product thesis is **capture friction**. Memories and insights arrive while driving, on the river, mid-conversation, at 11pm. Whatever is in your pocket and one tap away wins. Everything downstream — transcription, cleanup, tagging, search — is supporting infrastructure.

But roughly half the existing corpus is *typed and pasted* material, not speech, and a lot of retrieval work happens at a desk. So the web app is a first-class surface, not an afterthought.

---

## 2. Guiding principles

1. **The recording exists before the network is involved.** Save to device disk and local SQLite first. Upload second. Never lose a memory to a dead zone or a failed API call.
2. **Never overwrite the raw.** Original audio and verbatim transcripts are immutable. Cleaned text and summaries are derived artifacts, stamped with model + prompt version, regenerable later.
3. **Keys never ship in the app.** All OpenAI and Anthropic calls run server-side in Supabase Edge Functions.
4. **Own the data.** Supabase is the source of truth. Notion is a push target.
5. **Multi-tenant from day one.** Every row scoped by `user_id` with RLS enabled from the first migration.

---

## 3. Architecture

### Stack

| Layer | Choice |
|---|---|
| iOS app | React Native via Expo (Expo Router, expo-av, expo-file-system, expo-sqlite). EAS Build → TestFlight. |
| Web app | Next.js on Vercel, deployed at minne.life (DNS already configured — Vercel nameservers) |
| Backend | Supabase: Postgres, Storage (audio), Edge Functions (processing), pgvector (semantic search) |
| Auth | Supabase Auth or Clerk — single user per account, no sharing model |
| Transcription | OpenAI `gpt-transcribe` via `/v1/audio/transcriptions` — $0.0045/min |
| Cleanup + extraction | Claude API — start with `claude-sonnet-5`, test `claude-haiku-4-5-20251001` as a cheaper substitute |
| Mirror | Notion API push (optional, replaceable) |

### Why Supabase and not Notion as the database

- Notion API limits: ~3 req/sec, ~2000 chars per rich-text block, 100 blocks per request. Every long transcript becomes a chunking exercise on write.
- Notion search is keyword-only. Natural-language retrieval requires vector embeddings.
- Reprocessing every entry with a better model later is a script against your own DB; against Notion it's a migration.
- Portability: if Notion stops mattering, nothing is lost.

---

## 4. Multi-tenancy and auth

Each person has their own private Minne. Bryan, his wife, his siblings — separate accounts, nobody reads anyone else's entries. **Not** a shared family archive.

Required from the first migration:

- `user_id` on every table, RLS policies enabled and tested
- Storage paths scoped by user: `{user_id}/{entry_id}/{recording_id}.m4a`, with matching bucket policy
- Per-user config tables for alias list, tag vocabulary, and proper-noun glossary — even while only one row exists in each
- A `tier` column on the user record defaulting to `'personal'`. Never read, never enforced. Makes billing additive later rather than structural.

**Explicitly out of scope:** teams, roles, invites, sharing, admin views, usage metering, billing. None get harder by waiting.

---

## 5. The three input modes

This is the most important design constraint. Entries are not all the same kind of thing.

| Mode | Example | Processing |
|---|---|---|
| **Spoken** | Talking while driving, unpolished, backtracking | Transcribe → clean → extract |
| **Typed** | A note typed directly, already coherent | Extract only. No cleanup. |
| **Pasted source material** | A Gerald Lund quote, an Alma 28 passage, a conference talk excerpt | **Verbatim. Never edited.** Extract metadata only. |

**Critical:** running the cleanup prompt over quoted material would silently edit someone else's words. Source material must be marked as verbatim at the block level and exempted from all text-modifying steps.

Implementation: block-level provenance. Each block in an entry carries an origin (`spoken`, `typed`, `source`) and the pipeline only touches `spoken` blocks. No parsing or inference required.

### Recording appends to an existing entry

An entry has **many** recordings, not one. You might paste Alma 28 at your desk on Monday, then talk about it for two minutes on Thursday while driving.

- Data model must be one-to-many (`entries` → `recordings`) from day one. This is a one-line decision now and a painful migration later.
- Each appended recording becomes its own dated section within the entry.
- UI: a record button inside an open note, in addition to the record-new-entry flow.

---

## 6. Data model (sketch)

```
users
  id, email, tier ('personal'), created_at

entries
  id, user_id, title, memory_date, created_at, updated_at
  source_type, notion_page_id

blocks
  id, entry_id, user_id, order, origin ('spoken'|'typed'|'source')
  content, created_at
  -- 'source' blocks are never modified by any pipeline step

recordings
  id, entry_id, user_id, audio_path, duration_seconds
  status_upload, status_transcribe, status_clean, status_extract
  created_at

derivations
  id, recording_id, user_id, kind ('transcript_raw'|'transcript_clean'|'summary')
  content, model_version, prompt_version, created_at
  -- raw transcript is immutable; cleaned versions are regenerable

chunks
  id, entry_id, user_id, content, embedding vector(...)
  -- chunk before embedding: a 20-min recording contains several unrelated thoughts

people        id, user_id, canonical_name, aliases[]
places        id, user_id, name
scriptures    id, user_id, reference
tags          id, user_id, name
glossary      id, user_id, term        -- feeds transcription keyword hints

entry_people, entry_tags, entry_scriptures  -- join tables
```

Retrieval strategy: filter structurally first (person, tag, date range, scripture), then feed a small candidate set into context. Never stuff the corpus into a prompt.

---

## 7. Processing pipeline

Each stage has its own status field, is idempotent, and can be re-run independently. One API hiccup must never orphan an entry.

| Stage | Behavior |
|---|---|
| 1. Capture | Audio to device disk immediately. Row in local SQLite. Survives app close, phone call interruption, no signal. |
| 2. Upload | Background upload to Supabase Storage. Per-entry sync status visible in UI. |
| 3. Transcribe | `gpt-transcribe`. 25 MB file cap — split on silence, transcribe in parallel, stitch. Pass the user's glossary as keyword hints. Store verbatim, immutable. |
| 4. Clean | Claude pass. **Only on `spoken` blocks.** See prompt below. |
| 5. Extract | Single Claude call → people, tags, scripture references, place, memory date, one-line gist, suggested title. |
| 6. Embed | Chunk then embed into pgvector. |
| 7. Publish | Optional formatted push to Notion. |

### Cleanup prompt (v1 — expect iteration)

> You are cleaning up a voice transcript for a personal memory journal. The speaker is recording their own thoughts, often while driving or walking, so the speech is unpolished.
>
> Your job is a careful copy edit, not a rewrite. Preserve the speaker's voice completely — their word choices, their rhythm, their way of phrasing things. A family member reading this in thirty years should hear him talking.
>
> Remove: filler words (um, uh, like, you know), false starts, repeated words, and stutters. When the speaker misspeaks and corrects himself, keep only the correction and drop the error. Fix transcription errors where the intended word is obvious from context, especially names, places, and religious terms.
>
> Keep: his actual vocabulary and sentence structure. Contractions and casual phrasing stay. Tangents stay unless they are purely verbal noise. Emotion, humor, and hesitation that carry meaning stay.
>
> Do not: add words he did not say, smooth his sentences into formal prose, reorder his thoughts, add transitions, summarize, or interpret. If a sentence is a little rough but clearly his, leave it.
>
> Add paragraph breaks where he naturally shifts topics. Return only the cleaned transcript with no preamble.

### Proper-noun glossary

A per-user list of terms transcription will otherwise mangle: family names, ward members, church leaders, and LDS vocabulary (Melchizedek, sacrament meeting, stake conference, seminary, Moroni, Nephi, Liahona, Anti-Nephi-Lehies). Passed as keyword hints to `gpt-transcribe` **and** included in the cleanup prompt. This is the single biggest quality lever in the pipeline.

---

## 8. iOS app requirements

### Must have (Phase 1)

- **One-tap record from cold open.** App opens to a record button. No login screen, no navigation.
- **Local-first storage.** File on disk and row in SQLite before any network call.
- **Offline capture with a sync queue.** Non-negotiable.
- **Visible per-entry sync status.** Trust is the feature.
- **Resumable recording** after an interrupting phone call.

### Soon after

- Optional two-second post-recording prompt: what is this about, and when did it happen. Defaults to blank.
- Control Center / Action Button shortcut — cheap to build, disproportionately valuable.
- Entry list and search, so recordings can be appended to existing entries.
- Quick typed note.

### Later

- Speaker diarization for recording family members telling stories (requires `gpt-4o-transcribe-diarize`, a separate model)
- Photo attachment
- Lock screen widget / Live Activity

---

## 9. Web app requirements (minne.life)

This is where the desk work happens. Bryan spends a lot of time at a computer, and the existing corpus is heavily typed and pasted.

- **Search** — both keyword and natural-language semantic search across all entries
- **Filter** — by tag, person, scripture reference, date range, memory date
- **Read** — cleaned text visible by default, raw transcript in a collapsed toggle, audio player at the bottom
- **Write and paste** — full editor for typed notes and pasted source material, with a way to mark a block as verbatim source
- **Copy out** — easy selection and copying of passages
- **Edit metadata** — correct tags, people, and scripture references by hand
- **Manage vocabularies** — add, edit, merge, and delete tags, people, aliases, and glossary terms

Deploy on Vercel. DNS is already pointed at Vercel nameservers; the domain resolves and awaits a production deployment.

---

## 10. Notion integration (optional mirror)

An existing Notion database ("📔 Notes," 150 entries) is the current system. Its schema is a good guide to what matters:

- **Name** (title) — evocative, often a quote fragment: "I cannot say the smallest part which I feel," "Power of Mothers — Someone I must not disappoint." Use real examples as few-shot prompts for title generation.
- **Tags** (multi-select, 31 options) — Actively Working Entry, Daily, Special Event, Work, Personal, Planning, Spiritual, Church Meeting, Star, Jennie, God's Hand, Gratitude, Young Men's, Revelation, Faith, Question, Christ, Book of Mormon Chapter, Temple, Gifts of the Spirit, Pride, Teaching, Peace, Book of Mormon, Continuous Revelation, Scriptures, Prayer, Mercy, Jennie Study, Forgiveness, New Testament
- **Person(s)** (multi-select) — needs alias resolution: "Pres. Hinckley" and "Gordon B. Hinckley" must map to one canonical person
- **Scripture** (multi-select) — format: "Alma 28", "Matthew 5:48", "D&C 88:67"
- **Memory Date** (date) — when the memory *happened*, distinct from when it was recorded

Treat the existing tag vocabulary as authoritative. New tags should be proposed for review rather than added silently.

---

## 11. Apple developer account

- TestFlight requires the paid Apple Developer Program, $99/year.
- Start **Individual** — instant, no D-U-N-S wait. Convert to Organization later via Apple Developer Support if needed; apps, builds, and testers carry over.
- Build in Expo Go (free) until the first blocker, which will be background recording. Purchase then.
- A privacy policy at a public URL is required for App Store submission — put it on minne.life.

---

## 12. Cost model

| Item | Rate |
|---|---|
| `gpt-transcribe` | $0.0045 / minute |
| `claude-sonnet-5` | $2 in / $10 out per 1M tokens (introductory, through Aug 31 2026; then $3/$15) |
| `claude-haiku-4-5-20251001` | $1 in / $5 out per 1M tokens |

At ~300 minutes of recording per month: roughly **$3/month total**. Ten users at similar volume lands near $30/month.

Cost is not a constraint at this scale. Optimize for quality. Do not use `gpt-live-transcribe` ($0.017/min, streaming only) or the realtime audio models — wrong tool, 4–7× the price.

Levers if volume grows: prompt caching (cached input at 10% of standard) for the glossary and instructions, and the Batch API (50% off) for bulk reprocessing.

---

## 13. Build sequence

**Phase 1 — Capture loop only.** Expo app that records, stores locally, uploads to Supabase Storage, shows sync status. Auth and RLS in place. No AI at all. *This is the current milestone.*

**Phase 2 — Processing chain.** Edge Functions: transcribe, clean, extract. Validate output quality against real recordings before building UI around it. If the cleaned text isn't worth reading, no interface will save it.

**Phase 3 — Web app.** Read, search, filter, paste, edit metadata at minne.life.

**Phase 4 — Semantic search.** Chunking, embeddings, natural-language retrieval.

**Phase 5 — Polish.** Notion push, append-to-existing-entry, Action Button, widget, photos, diarization.

---

## 14. Open questions

- **Summary format.** Whether entries need a generated summary at all, or whether a good title plus a hidden one-line gist is enough.
- **Notion structure.** One database with properties, or nested by year or person? Or drop Notion once the web app exists?
- **Encryption and backup.** These recordings are unusually personal, and other people's data will eventually be in the system. Encryption at rest, backup strategy, and export path all need decisions before anyone else has an account.
- **Estate access.** If the point is that these outlive you, someone eventually needs a way in.
- **Title/content drift.** At least one existing entry has a title unrelated to its content. Worth checking whether that's a pattern before migrating.

---

## 15. Notes for whoever builds this

- Explain decisions in plain language. The owner is a PM with real product judgment and limited terminal experience.
- Stop and ask when a credential or a product decision is needed rather than guessing.
- If asked to put an OpenAI or Anthropic key anywhere the app can read it, push back — it belongs in Supabase Edge Function secrets.
- The repo lives under a different GitHub account than the owner's other projects. Set git identity per-repo, not globally.
