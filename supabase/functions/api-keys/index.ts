// Manages per-user AI provider keys (docs/DECISIONS.md #5). Keys arrive over
// TLS, are encrypted immediately, and are never returned to any client —
// status responses carry only the last 4 characters.
import {
  corsHeaders,
  encryptSecret,
  json,
  requireUser,
  serviceClient,
} from '../_shared/helpers.ts';

type Provider = 'openai' | 'anthropic';
const PROVIDERS: Provider[] = ['openai', 'anthropic'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const user = await requireUser(req);
  if (!user) return json({ error: 'Not signed in' }, 401);

  const db = serviceClient();
  const body = await req.json().catch(() => ({}));
  const action = body.action as string;

  if (action === 'status') {
    const { data } = await db
      .from('user_api_keys')
      .select('provider, key_last4, updated_at')
      .eq('user_id', user.id);
    const status: Record<string, { configured: boolean; last4?: string }> = {};
    for (const p of PROVIDERS) {
      const row = data?.find((r) => r.provider === p);
      status[p] = row ? { configured: true, last4: row.key_last4 } : { configured: false };
    }
    return json(status);
  }

  if (action === 'set') {
    const provider = body.provider as Provider;
    const key = typeof body.key === 'string' ? body.key.trim() : '';
    if (!PROVIDERS.includes(provider)) return json({ error: 'Unknown provider' }, 400);
    if (key.length < 20 || !key.startsWith('sk-'))
      return json({ error: 'That does not look like a valid API key (should start with sk-)' }, 400);

    const { error } = await db.from('user_api_keys').upsert({
      user_id: user.id,
      provider,
      key_ciphertext: await encryptSecret(key),
      key_last4: key.slice(-4),
      updated_at: new Date().toISOString(),
    });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, last4: key.slice(-4) });
  }

  if (action === 'delete') {
    const provider = body.provider as Provider;
    if (!PROVIDERS.includes(provider)) return json({ error: 'Unknown provider' }, 400);
    await db.from('user_api_keys').delete().eq('user_id', user.id).eq('provider', provider);
    return json({ ok: true });
  }

  return json({ error: 'Unknown action' }, 400);
});
