# Decisions log

Amendments and decisions made after [SPEC.md](SPEC.md) was written. Newest last.

## 2026-07-29 — Pre-build decisions (Bryan + Claude)

1. **Auth: Supabase Auth** (not Clerk). One fewer vendor; native RLS integration. Revisit only if a real need appears.
2. **Sign-in: email magic link.** One-time sign-in at setup; session persists; app cold-opens to record. Recording works even before sign-in (local-first), syncs once signed in.
3. **iOS tab layout: three tabs** — Add Note (record button + typed note), List (all entries with per-entry sync status), Reminders.
4. **Reminders tab is new scope** beyond SPEC.md. Defined (2026-07-29): a simple list of things Bryan wants to remember to record ("Grandpa's mission story"), check-off style. No dates/timed notifications for now — may come later (timed notifications would require a dev build, not Expo Go).
5. **Bring-your-own API keys.** Each user enters their own OpenAI/Anthropic keys in a Settings page. Keys are stored encrypted server-side (per-user) and used only from Edge Functions — SPEC.md principle 3 ("keys never ship in the app") still holds. Adds a `user_api_keys` table/concept to the data model. Accepted UX cost: family members must create their own OpenAI/Anthropic accounts.
6. **Web/iOS capability parity is a standing requirement** (destination, not build order — phases in SPEC.md §13 unchanged). Web will also capture audio. Platform-inherent exceptions: Action Button/lock-screen (iOS only), long-form paste ergonomics (better on web).
7. **Expo SDK 54, not latest** — pinned to what App Store Expo Go supports (SDK 57 Expo Go awaiting Apple approval as of July 2026). Use `expo-audio` (not the deprecated `expo-av` named in SPEC.md §3).
8. **Anticipated early blocker:** recording with screen locked (driving use case) needs background audio → dev build → $99 Apple Developer Program. May hit during Phase 1 testing, sooner than SPEC.md §11 implies.
9. **Model pricing verified 2026-07-29:** claude-sonnet-5 $3/$15 per MTok (intro $2/$10 ends 2026-08-31), claude-haiku-4-5 $1/$5. Cost model in SPEC.md §12 holds.

## 2026-07-31 — Phase 2 scope (Bryan: "Build Phase 2")

10. **Pipeline architecture:** two Edge Functions. `api-keys` stores per-user OpenAI/Anthropic keys AES-GCM-encrypted (server-held ENCRYPTION_KEY secret); RLS denies all client access to the table; status responses expose only the last 4 chars. `process-recording` runs transcribe → clean → extract, idempotent per stage, triggered by the app after each audio upload (and manually from the entry screen).
11. **Extraction is partial for now:** title + one-line gist only (title never overwrites a user-typed one). Full extraction (people, tags, scriptures, memory date) waits for the vocabulary tables. Glossary keyword hints (SPEC.md §7) also deferred — needs the glossary table.
12. **Transcription model** defaults to `gpt-transcribe` per SPEC.md §3, overridable via the TRANSCRIBE_MODEL function secret if the name needs adjusting.
13. **25MB audio cap** for transcription (OpenAI limit); split-on-silence for long recordings is deferred.
14. **Cleanup prompt** is SPEC.md §7 v1 verbatim (pronouns neutralized for multi-tenancy), tracked as prompt_version `clean-v1`.
