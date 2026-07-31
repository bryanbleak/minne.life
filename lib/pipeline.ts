import { supabase } from './supabase';

// Client for the Phase 2 Edge Functions. All AI calls happen server-side
// (SPEC.md principle 3); the app only ever asks for status and results.

export type Provider = 'openai' | 'anthropic';
export type KeyStatus = Record<Provider, { configured: boolean; last4?: string }>;

export async function getKeyStatus(): Promise<KeyStatus> {
  const { data, error } = await supabase.functions.invoke('api-keys', {
    body: { action: 'status' },
  });
  if (error) throw error;
  return data as KeyStatus;
}

export async function setApiKey(provider: Provider, key: string): Promise<{ last4: string }> {
  const { data, error } = await supabase.functions.invoke('api-keys', {
    body: { action: 'set', provider, key },
  });
  if (error) throw new Error((await extractError(error)) ?? 'Could not save the key');
  return data as { last4: string };
}

export async function deleteApiKey(provider: Provider): Promise<void> {
  const { error } = await supabase.functions.invoke('api-keys', {
    body: { action: 'delete', provider },
  });
  if (error) throw error;
}

export type ProcessResult = {
  ok?: boolean;
  transcribed?: boolean;
  cleaned?: boolean;
  error?: string;
  message?: string;
};

export async function processRecording(recordingId: string): Promise<ProcessResult> {
  const { data, error } = await supabase.functions.invoke('process-recording', {
    body: { recording_id: recordingId },
  });
  if (error) {
    const message = await extractError(error);
    return { ok: false, error: 'request_failed', message: message ?? error.message };
  }
  return data as ProcessResult;
}

export type Transcripts = {
  raw: string | null;
  clean: string | null;
  gist: string | null;
};

export async function fetchTranscripts(recordingId: string): Promise<Transcripts> {
  const { data, error } = await supabase
    .from('derivations')
    .select('kind, content')
    .eq('recording_id', recordingId);
  if (error) throw error;
  const byKind = new Map((data ?? []).map((d) => [d.kind, d.content]));
  return {
    raw: byKind.get('transcript_raw') ?? null,
    clean: byKind.get('transcript_clean') ?? null,
    gist: byKind.get('summary') ?? null,
  };
}

// supabase.functions.invoke wraps non-2xx responses; the useful message is in
// the response body when there is one.
async function extractError(error: unknown): Promise<string | null> {
  const context = (error as { context?: Response }).context;
  if (context && typeof context.json === 'function') {
    try {
      const body = await context.json();
      return body.message ?? body.error ?? null;
    } catch {
      return null;
    }
  }
  return null;
}
