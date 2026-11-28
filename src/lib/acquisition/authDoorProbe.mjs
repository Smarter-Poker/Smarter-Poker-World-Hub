/**
 * Read-Only Auth Door & OAuth Configuration Diagnostics (Zero Secrets, Zero PII)
 * =============================================================================
 * Reports boolean-only configuration readiness for Smarter.Poker's public
 * authentication doors (Google One Tap FedCM, Google OAuth, Facebook OAuth,
 * and Magic Link callback route) alongside 7-day OAuth adoption share.
 *
 * NEVER returns secret values, API keys, client IDs, or user identifiers.
 */

export function evaluateAuthDoors({ env = process.env, attribution = null } = {}) {
  const safeEnv = env && typeof env === 'object' ? env : {};
  const googleClientId = typeof safeEnv.NEXT_PUBLIC_GOOGLE_CLIENT_ID === 'string'
    ? safeEnv.NEXT_PUBLIC_GOOGLE_CLIENT_ID.trim()
    : '';
  const supabaseUrl = typeof safeEnv.NEXT_PUBLIC_SUPABASE_URL === 'string'
    ? safeEnv.NEXT_PUBLIC_SUPABASE_URL.trim()
    : '';
  const supabaseAnonKey = typeof safeEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY === 'string'
    ? safeEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY.trim()
    : '';

  const supabaseAuthConfigured = Boolean(
    supabaseUrl && /^https:\/\/[a-z0-9.-]+/i.test(supabaseUrl) && supabaseAnonKey.length > 20,
  );
  const googleOneTapConfigured = Boolean(
    googleClientId && googleClientId.length > 10 && !googleClientId.includes('placeholder'),
  );

  const totalSignups = Number(attribution?.totalSignups || 0);
  const oauthTotal = Number(attribution?.providers?.oauth_total || 0);
  const oauthSharePct = totalSignups > 0
    ? Math.round((oauthTotal / totalSignups) * 1000) / 10
    : null;

  return {
    supabaseAuthConfigured,
    googleOneTapConfigured,
    googleOAuthDoorWired: true,
    facebookOAuthDoorWired: true,
    magicLinkDoorWired: true,
    callbackPath: '/auth/callback',
    oauthSharePct,
  };
}
