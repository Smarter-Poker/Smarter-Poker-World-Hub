import {
  getServerUser as getSharedServerUser,
  getServerUserWithFallback as getSharedServerUserWithFallback,
  verifySupabaseJwt,
} from '@smarter-poker/commander-shared/lib/serverAuth.js';

export { verifySupabaseJwt };

import { playerSessionVerdict } from './horses/playerSessionAccess.mjs';

let sessionDb;
async function checkSession(user, token) {
  if (!sessionDb) {
    const { createClient } = await import('./supabaseServerClient.js');
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) return 'unknown';
    sessionDb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co', key);
  }
  return playerSessionVerdict(sessionDb, user.id, token);
}

async function sessionChecked(user, token, verifySession = checkSession) {
  if (!user) return { user: null, error: 'Invalid Token' };
  let verdict;
  try { verdict = await verifySession(user, token); } catch { verdict = 'unknown'; }
  if (verdict === 'alive') return { user, error: null };
  return { user: null, error: verdict === 'revoked' ? 'SESSION_REVOKED' : 'SESSION_CHECK_UNAVAILABLE',
    status: verdict === 'revoked' ? 401 : 503 };
}

export async function getServerUser(req, options = {}) {
  const user = await getSharedServerUser(req);
  if (!user) return null;
  const result = await sessionChecked(user, bearerToken(req), options.verifySession);
  return result.user;
}

function bearerToken(req) {
  const header = req?.headers?.get
    ? req.headers.get('authorization')
    : req?.headers?.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token.length >= 20 ? token : null;
}

/**
 * Prefer the SDK's cached-JWKS getClaims path before the legacy network
 * fallback, for requests that local verification did not already satisfy.
 *
 * ── 2026-09-01 correction ────────────────────────────────────────────────
 * This comment previously read: "The shared helper only verifies HS256
 * locally, so ES256 tokens otherwise call GoTrue once per API request."
 *
 * That is NO LONGER TRUE and must not be relied on. Since PR #1196 the
 * shared module (vendor/commander-shared/src/lib/serverAuth.js) verifies
 * ES256 locally against the project's JWKS, with an in-memory key cache and
 * a refetch-on-unknown-kid path. `getServerUser()` below therefore succeeds
 * for ordinary asymmetric access tokens without any network call, and
 * neither the getClaims branch nor the GoTrue fallback should normally run.
 *
 * The getClaims branch is kept because it is still the right second step:
 * it is cheaper than `auth.getUser()` and it fails closed. But if you see
 * it (or the GoTrue fallback) carrying real traffic volume, that is the
 * signal that local verification has broken again — the exact condition
 * that produced the 2026-09-01 outage while every dashboard read green.
 * Investigate the vendored verifier rather than widening this fallback.
 */
export async function getServerUserWithFallback(req, supabase, options = {}) {
  const localUser = await getSharedServerUser(req);
  if (localUser) return sessionChecked(localUser, bearerToken(req), options.verifySession);

  const token = bearerToken(req);
  if (!token) return { user: null, error: 'No token' };

  if (typeof supabase?.auth?.getClaims === 'function') {
    try {
      const { data, error } = await supabase.auth.getClaims(token);
      const claims = data?.claims;
      if (error || !claims?.sub || typeof claims.sub !== 'string') {
        return { user: null, error: error?.message || 'Invalid token claims' };
      }
      return sessionChecked({
        id: claims.sub, email: claims.email || null,
        role: claims.role || 'authenticated', aud: claims.aud || null,
      }, token, options.verifySession);
    } catch (error) {
      return { user: null, error: error?.message || 'Token verification failed' };
    }
  }

  const fallback = await getSharedServerUserWithFallback(req, supabase);
  if (!fallback.user || fallback.error) return fallback;
  return sessionChecked(fallback.user, token, options.verifySession);
}
