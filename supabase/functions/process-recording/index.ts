// The processing pipeline (SPEC.md §7, stages 3-5): transcribe → clean →
// extract. Each stage is idempotent and independently re-runnable — calling
// this function again finishes whatever a previous attempt left undone.
// Cleanup only ever touches spoken material; 'source' blocks never pass
// through here at all (they aren't recordings).
import Anthropic from 'npm:@anthropic-ai/sdk';
import {
  corsHeaders,
  getUserApiKey,
  json,
  requireUser,
  serviceClient,
} from '../_shared/helpers.ts';

// SPEC.md §3 names `gpt-transcribe`; override with the TRANSCRIBE_MODEL
// secret if OpenAI renames or we choose a different tier.
const TRANSCRIBE_MODEL = Deno.env.get('TRANSCRIBE_MODEL') ?? 'gpt-transcribe';
const CLAUDE_MODEL = 'claude-sonnet-5'; // SPEC.md §3
const MAX_AUDIO_BYTES = 24 * 1024 * 1024; // OpenAI cap is 25MB; split-on-silence is a later phase

// SPEC.md §7 cleanup prompt, v1 (neutralized pronouns for multi-tenant use).
const CLEAN_PROMPT_VERSION = 'clean-v1';
const CLEAN_PROMPT = `You are cleaning up a voice transcript for a personal memory journal. The speaker is recording their own thoughts, often while driving or walking, so the speech is unpolished.

Your job is a careful copy edit, not a rewrite. Preserve the speaker's voice completely — their word choices, their rhythm, their way of phrasing things. A family member reading this in thirty years should hear them talking.

Remove: filler words (um, uh, like, you know), false starts, repeated words, and stutters. When the speaker misspeaks and corrects themselves, keep only the correction and drop the error. Fix transcription errors where the intended word is obvious from context, especially names, places, and religious terms.

Keep: their actual vocabulary and sentence structure. Contractions and casual phrasing stay. Tangents stay unless they are purely verbal noise. Emotion, humor, and hesitation that carry meaning stay.

Do not: add words they did not say, smooth their sentences into formal prose, reorder their thoughts, add transitions, summarize, or interpret. If a sentence is a little rough but clearly theirs, leave it.

Add paragraph breaks where they naturally shift topics. Return only the cleaned transcript with no preamble.`;

const EXTRACT_PROMPT_VERSION = 'extract-v1';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const user = await requireUser(req);
  if (!user) return json({ error: 'Not signed in' }, 401);

  const { recording_id } = await req.json().catch(() => ({}));
  if (typeof recording_id !== 'string') return json({ error: 'recording_id required' }, 400);

  const db = serviceClient();
  const { data: recording } = await db
    .from('recordings')
    .select('*')
    .eq('id', recording_id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!recording) return json({ error: 'Recording not found' }, 404);

  const existing = new Map<string, { id: string; content: string }>();
  const { data: derivs } = await db
    .from('derivations')
    .select('id, kind, content')
    .eq('recording_id', recording_id);
  for (const d of derivs ?? []) existing.set(d.kind, d);

  const setStatus = (field: string, value: string) =>
    db.from('recordings').update({ [field]: value }).eq('id', recording_id);

  const saveDerivation = async (
    kind: string,
    content: string,
    modelVersion: string,
    promptVersion: string | null
  ) => {
    await db.from('derivations').upsert(
      {
        id: existing.get(kind)?.id ?? crypto.randomUUID(),
        recording_id,
        user_id: user.id,
        kind,
        content,
        model_version: modelVersion,
        prompt_version: promptVersion,
      },
      { onConflict: 'id' }
    );
  };

  // --- Stage 3: transcribe (verbatim, immutable once written) -------------
  let rawTranscript = existing.get('transcript_raw')?.content ?? null;
  if (!rawTranscript) {
    const openaiKey = await getUserApiKey(db, user.id, 'openai');
    if (!openaiKey)
      return json({ error: 'missing_openai_key', message: 'Add your OpenAI key in Settings first.' }, 422);

    const { data: blob, error: dlError } = await db.storage
      .from('audio')
      .download(recording.audio_path);
    if (dlError || !blob) {
      await setStatus('status_transcribe', 'error');
      return json({ error: 'audio_download_failed', message: dlError?.message }, 500);
    }
    if (blob.size > MAX_AUDIO_BYTES) {
      await setStatus('status_transcribe', 'error');
      return json(
        { error: 'audio_too_large', message: 'Recording is too large to transcribe yet (25MB cap).' },
        413
      );
    }

    const form = new FormData();
    const ext = recording.audio_path.split('.').pop() ?? 'm4a';
    form.append('file', blob, `audio.${ext}`);
    form.append('model', TRANSCRIBE_MODEL);
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}` },
      body: form,
    });
    if (!res.ok) {
      await setStatus('status_transcribe', 'error');
      const detail = await res.text().catch(() => '');
      return json({ error: 'transcription_failed', message: detail.slice(0, 500) }, 502);
    }
    const result = await res.json();
    rawTranscript = (result.text ?? '').trim();
    if (!rawTranscript) {
      await setStatus('status_transcribe', 'error');
      return json({ error: 'empty_transcript', message: 'No speech was detected.' }, 422);
    }
    await saveDerivation('transcript_raw', rawTranscript, TRANSCRIBE_MODEL, null);
    await setStatus('status_transcribe', 'done');
  }

  // --- Stages 4-5 need the user's Anthropic key ---------------------------
  const anthropicKey = await getUserApiKey(db, user.id, 'anthropic');
  if (!anthropicKey) {
    return json({
      ok: true,
      transcribed: true,
      cleaned: false,
      message: 'Transcribed. Add your Anthropic key in Settings to enable cleanup.',
    });
  }
  const anthropic = new Anthropic({ apiKey: anthropicKey });

  // --- Stage 4: clean (spoken material only — this IS a recording) --------
  let cleanTranscript = existing.get('transcript_clean')?.content ?? null;
  if (!cleanTranscript) {
    try {
      const response = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 16000,
        system: CLEAN_PROMPT,
        messages: [{ role: 'user', content: rawTranscript }],
      });
      const text = response.content.find((b: { type: string }) => b.type === 'text');
      cleanTranscript = text && 'text' in text ? (text as { text: string }).text.trim() : null;
      if (!cleanTranscript) throw new Error('empty cleanup response');
      await saveDerivation('transcript_clean', cleanTranscript, response.model, CLEAN_PROMPT_VERSION);
      await setStatus('status_clean', 'done');
    } catch (e) {
      await setStatus('status_clean', 'error');
      return json(
        { ok: true, transcribed: true, cleaned: false, error: 'cleanup_failed', message: String(e).slice(0, 500) },
        200
      );
    }
  }

  // --- Stage 5 (partial): suggested title + one-line gist -----------------
  // Full extraction (people, tags, scriptures, memory date) arrives with the
  // vocabulary tables — see docs/DECISIONS.md.
  if (!existing.get('summary')) {
    try {
      const response = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 1024,
        output_config: {
          format: {
            type: 'json_schema',
            schema: {
              type: 'object',
              properties: {
                title: {
                  type: 'string',
                  description:
                    'A short, evocative title for this journal entry — often a phrase drawn from the entry itself',
                },
                gist: { type: 'string', description: 'One sentence capturing what this entry is about' },
              },
              required: ['title', 'gist'],
              additionalProperties: false,
            },
          },
        },
        messages: [
          {
            role: 'user',
            content: `Here is a cleaned voice-journal entry:\n\n${cleanTranscript}\n\nProvide a title and gist for it.`,
          },
        ],
      });
      const text = response.content.find((b: { type: string }) => b.type === 'text');
      const parsed = JSON.parse(text && 'text' in text ? (text as { text: string }).text : '{}');
      if (parsed.gist) {
        await saveDerivation('summary', parsed.gist, response.model, EXTRACT_PROMPT_VERSION);
      }
      if (parsed.title) {
        // Suggested title never overwrites one the user typed themselves.
        await db
          .from('entries')
          .update({ title: parsed.title })
          .eq('id', recording.entry_id)
          .is('title', null);
      }
      await setStatus('status_extract', 'done');
    } catch {
      await setStatus('status_extract', 'error'); // non-fatal: transcript already saved
    }
  }

  return json({ ok: true, transcribed: true, cleaned: true });
});
