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
 * Verify current asymmetric Supabase access tokens through the SDK's cached
 * JWKS path before considering the legacy network fallback. The shared helper
 * only verifies HS256 locally, so ES256 tokens otherwise call GoTrue once per
 * API request and can turn a healthy multi-step workflow into false 401s when
 * the Auth user endpoint reaches its request ceiling.
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
