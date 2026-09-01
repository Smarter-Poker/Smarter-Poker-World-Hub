import {
  getServerUser,
  getServerUserWithFallback as getSharedServerUserWithFallback,
  verifySupabaseJwt,
} from '@smarter-poker/commander-shared/lib/serverAuth.js';

export { getServerUser, verifySupabaseJwt };

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
export async function getServerUserWithFallback(req, supabase) {
  const localUser = await getServerUser(req);
  if (localUser) return { user: localUser, error: null };

  const token = bearerToken(req);
  if (!token) return { user: null, error: 'No token' };

  if (typeof supabase?.auth?.getClaims === 'function') {
    try {
      const { data, error } = await supabase.auth.getClaims(token);
      const claims = data?.claims;
      if (error || !claims?.sub || typeof claims.sub !== 'string') {
        return { user: null, error: error?.message || 'Invalid token claims' };
      }
      return {
        user: {
          id: claims.sub,
          email: claims.email || null,
          role: claims.role || 'authenticated',
          aud: claims.aud || null,
        },
        error: null,
      };
    } catch (error) {
      return { user: null, error: error?.message || 'Token verification failed' };
    }
  }

  return getSharedServerUserWithFallback(req, supabase);
}
