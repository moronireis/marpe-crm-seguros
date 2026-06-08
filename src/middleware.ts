import { defineMiddleware } from 'astro:middleware';
import { createServerClient } from './lib/supabase-server';

// Routes that don't require authentication
const PUBLIC_PREFIXES = [
  '/login',
  '/api/auth/',
  '/api/webhook/',
  '/api/internal/',
];

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  // Skip auth for public routes
  if (PUBLIC_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(prefix))) {
    return next();
  }

  const accessToken = context.cookies.get('sb-access-token')?.value;
  const refreshToken = context.cookies.get('sb-refresh-token')?.value;

  if (!accessToken && !refreshToken) {
    return context.redirect('/login');
  }

  const sb = createServerClient();

  // Validate access token
  if (accessToken) {
    const { data: { user }, error } = await sb.auth.getUser(accessToken);

    if (!error && user) {
      const { data: profile } = await sb
        .from('marpe_profiles')
        .select('id, role, full_name, email')
        .eq('id', user.id)
        .maybeSingle();

      if (profile) {
        context.locals.profile = profile;
        return next();
      }
    }
  }

  // Access token invalid or missing — try refresh
  if (refreshToken) {
    const { data: refreshed, error: refreshErr } = await sb.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (!refreshErr && refreshed.session) {
      // Store new tokens
      context.cookies.set('sb-access-token', refreshed.session.access_token, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: 60 * 60 * 24,
        path: '/',
      });
      context.cookies.set('sb-refresh-token', refreshed.session.refresh_token, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30,
        path: '/',
      });

      const { data: profile } = await sb
        .from('marpe_profiles')
        .select('id, role, full_name, email')
        .eq('id', refreshed.session.user.id)
        .maybeSingle();

      if (profile) {
        context.locals.profile = profile;
        return next();
      }
    }
  }

  // No valid session
  context.cookies.delete('sb-access-token', { path: '/' });
  context.cookies.delete('sb-refresh-token', { path: '/' });
  return context.redirect('/login');
});
