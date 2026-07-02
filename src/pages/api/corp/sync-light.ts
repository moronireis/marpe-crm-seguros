import type { APIRoute } from 'astro';
import { requireAuth } from '../../../lib/api-auth';
import { createServerClient } from '../../../lib/supabase-server';
import { syncNegocios } from '../../../lib/corp/sync';

export const prerender = false;

const THROTTLE_MINUTES = 10;
const SETTINGS_KEY = 'corp_sync_light_last_run';

// POST /api/corp/sync-light
// Lightweight near-real-time sync: pulls the Corp active-negotiations LIST
// (fast, no per-negocio detail calls) and upserts deals. Fired from the CRM
// board on load; self-throttles to once every 10 minutes.
// The nightly cron (corp-sync) still runs the full sync with details.
export const POST: APIRoute = async ({ locals }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  const sb = createServerClient();

  // Throttle check
  const { data: setting } = await sb
    .from('marpe_settings')
    .select('value, updated_at')
    .eq('key', SETTINGS_KEY)
    .maybeSingle();

  if (setting?.updated_at) {
    const elapsedMs = Date.now() - new Date(setting.updated_at).getTime();
    if (elapsedMs < THROTTLE_MINUTES * 60 * 1000) {
      return new Response(JSON.stringify({
        synced: false,
        reason: 'throttled',
        next_in_seconds: Math.round((THROTTLE_MINUTES * 60 * 1000 - elapsedMs) / 1000),
      }), { status: 200 });
    }
  }

  // Mark the run BEFORE syncing so concurrent page loads don't double-fire
  await sb.from('marpe_settings').upsert({
    key: SETTINGS_KEY,
    value: { triggered_by: profile.id },
    updated_at: new Date().toISOString(),
  }, { onConflict: 'key' });

  try {
    const result = await syncNegocios({ withDetail: false });
    return new Response(JSON.stringify({
      synced: true,
      created: result.created,
      updated: result.updated,
      skipped: result.skipped,
      errors: result.errors.slice(0, 3),
    }), { status: 200 });
  } catch (e: any) {
    return new Response(JSON.stringify({ synced: false, error: e.message }), { status: 200 });
  }
};
