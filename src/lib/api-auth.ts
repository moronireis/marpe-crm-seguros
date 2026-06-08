/**
 * API route auth helpers.
 * Usage:
 *   const profile = requireAuth(locals);
 *   if (profile instanceof Response) return profile;
 */

type Locals = { profile?: { id: string; role: string } };

const UNAUTHORIZED = () =>
  new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

const FORBIDDEN = () =>
  new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });

/** Returns the profile or a 401 Response. */
export function requireAuth(locals: Locals): { id: string; role: string } | Response {
  if (!locals.profile?.id) return UNAUTHORIZED();
  return locals.profile;
}

/** Returns the profile (admin only) or a 401/403 Response. */
export function requireAdmin(locals: Locals): { id: string; role: string } | Response {
  if (!locals.profile?.id) return UNAUTHORIZED();
  if (locals.profile.role !== 'admin') return FORBIDDEN();
  return locals.profile;
}
