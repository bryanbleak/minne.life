// Shared helpers for Minne Edge Functions (Deno runtime).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Client that acts as the calling user (RLS applies).
export function userClient(req: Request): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
}

// Server client (bypasses RLS) — for the key vault and pipeline writes.
export function serviceClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
}

export async function requireUser(req: Request): Promise<{ id: string } | null> {
  const {
    data: { user },
  } = await userClient(req).auth.getUser();
  return user ? { id: user.id } : null;
}

// --- AES-GCM encryption for stored API keys -------------------------------
// ENCRYPTION_KEY is a base64-encoded 32-byte secret set via
// `supabase secrets set`. Ciphertext format: base64(iv || ciphertext).

async function aesKey(): Promise<CryptoKey> {
  const raw = Uint8Array.from(atob(Deno.env.get('ENCRYPTION_KEY')!), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptSecret(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(), new TextEncoder().encode(plain))
  );
  const combined = new Uint8Array(iv.length + ct.length);
  combined.set(iv);
  combined.set(ct, iv.length);
  return btoa(String.fromCharCode(...combined));
}

export async function decryptSecret(ciphertext: string): Promise<string> {
  const combined = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ct = combined.slice(12);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await aesKey(), ct);
  return new TextDecoder().decode(plain);
}

export async function getUserApiKey(
  db: SupabaseClient,
  userId: string,
  provider: 'openai' | 'anthropic'
): Promise<string | null> {
  const { data } = await db
    .from('user_api_keys')
    .select('key_ciphertext')
    .eq('user_id', userId)
    .eq('provider', provider)
    .maybeSingle();
  return data ? await decryptSecret(data.key_ciphertext) : null;
}
