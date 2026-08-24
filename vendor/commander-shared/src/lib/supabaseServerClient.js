/**
 * SUPABASE SERVER CLIENT PATCH - Phase 4.1d ESM port (2026-04-25)
 *
 * Patches the Supabase client's auth.getUser method to verify the JWT
 * LOCALLY first and only call GoTrue over the network when that is not
 * possible. See the long comment on patchedGetUser below - the ordering is
 * deliberate and must not be reversed.
 *
 * WHY:
 * supabase.auth.getUser(token) makes a network call to GoTrue which
 * intermittently fails on Vercel (timeout/AbortError), causing ALL API
 * routes to return 401 "Invalid token", and costs a round-trip on every
 * request of every route. Local HMAC verification is the same check without
 * the network or database cost, so it is the primary path and GoTrue is the
 * fallback.
 *
 * Phase 4.1d port:
 *   - require/module.exports → ESM import/export
 *   - decodeSupabaseJWT() now async (depends on async verifySupabaseJwt)
 *   - patched getUser still resolves the full call asynchronously, so
 *     no caller signature change.
 */

import { createClient as originalCreateClient } from '@supabase/supabase-js';
import { verifySupabaseJwt } from './serverAuth.js';

/**
 * Decode a Supabase JWT locally without network call.
 * Returns a user-like object or null. Async.
 */
async function decodeSupabaseJWT(token) {
  try {
    if (!token || token.length < 10) return null;

    const secret = process.env.SUPABASE_JWT_SECRET;
    if (!secret) {
      console.warn('[supabase-patch] SUPABASE_JWT_SECRET not configured, refusing to locally verify token.');
      return null;
    }

    const decoded = await verifySupabaseJwt(token, secret);
    if (!decoded) return null;
    if (!decoded.sub) return null;

    return {
      id: decoded.sub,
      email: decoded.email || null,
      role: decoded.role || 'authenticated',
      aud: decoded.aud || null,
      app_metadata: decoded.app_metadata || {},
      user_metadata: decoded.user_metadata || {},
    };
  } catch (e) {
    console.warn('[supabase-patch] decodeSupabaseJWT error:', e?.message || e);
    return null;
  }
}

/**
 * Patched createClient that wraps auth.getUser with local JWT fallback.
 *
 * Sync - returns a SupabaseClient synchronously. The internal
 * patched auth.getUser is async (always was - no behavior change for callers).
 */
export function createClient(url, key, options) {
  const resolvedUrl = url || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
  const resolvedKey = key || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!resolvedKey) {
    console.warn('[FATAL] No Supabase key available - check SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  const client = originalCreateClient(resolvedUrl, resolvedKey || 'missing-key', options);

  // Reference original getUser
  const originalGetUser = client.auth.getUser.bind(client.auth);

  // Replace with resilient version
  client.auth.getUser = async function patchedGetUser(token) {
    // ORDERING IS LOAD-BEARING - LOCAL FIRST, NETWORK SECOND.
    // DO NOT FLIP THIS BACK (2026-08-24, performance).
    //
    // This patch originally called GoTrue over the network FIRST and only
    // decoded locally when that call threw. ~78 API routes call getUser on
    // every single request, so every request paid a full HTTPS round-trip to
    // GoTrue - which in turn loads the same Postgres instance that is already
    // at ~180% CPU. Local HMAC verification is the identical security check
    // (HS256 over SUPABASE_JWT_SECRET: signature + exp + nbf, see
    // serverAuth.js verifySupabaseJwt) done in microseconds with zero network
    // and zero database load.
    //
    // Error semantics are unchanged: a malformed, tampered or expired token
    // fails local verification, then still falls through to GoTrue, and if
    // GoTrue also rejects it the caller gets the same
    // { data: { user: null }, error: { message } } shape it got before.
    // The network path is also still taken whenever local verification is
    // IMPOSSIBLE - no SUPABASE_JWT_SECRET configured, or a secret-rotation
    // window where the deployed secret no longer matches the signing key -
    // so this keeps the operational resilience the patch was written for.
    //
    // Accepted trade-off: a token that is cryptographically valid but whose
    // user was deleted or banned inside GoTrue mid-token-lifetime is now
    // accepted until that token expires. Supabase access tokens are
    // short-lived; the alternative is a network call on every request of
    // every route.

    // 1. Fast path: local HMAC verify + decode. No network, no DB.
    if (token) {
      const localUser = await decodeSupabaseJWT(token);
      if (localUser) {
        return {
          data: { user: localUser },
          error: null,
        };
      }
    }

    // 2. Fallback: the original GoTrue network call. Reached only when local
    //    verification failed or could not run at all.
    try {
      const result = await originalGetUser(token);
      if (result.data?.user) {
        return result;
      }
      // GoTrue answered but rejected the token - preserve its error verbatim.
      if (result?.error) {
        return result;
      }
    } catch (e) {
      console.warn('[supabase-patch] GoTrue getUser failed after local decode failed:', e?.message || e);
    }

    return {
      data: { user: null },
      error: { message: 'Token verification failed (both GoTrue and local decode)' },
    };
  };

  return client;
}

export { decodeSupabaseJWT };

// CommonJS-compatibility wrapper - some legacy callers use require()
// pattern via Next.js bundler (635 files import this module). All of
// them use ESM `import {createClient}` syntax which works fine with
// the export above. Keep no `module.exports` line - it would conflict
// with ESM mode in Next.js 14.
