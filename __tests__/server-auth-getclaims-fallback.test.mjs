/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SCOPE OF THIS FILE — READ BEFORE TRUSTING IT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This file was previously named `server-auth-asymmetric.test.mjs`. That name
 * was actively misleading: it read as "asymmetric (ES256) JWT verification is
 * covered", and because it runs on every build and stayed green, it was taken
 * as evidence that the ES256 migration was safe. It was not. During the
 * production auth outage of 2026-09-01 this suite passed on every single run
 * while every real token was being rejected by a hardcoded
 * `header.alg !== 'HS256'` gate in the vendored verifier.
 *
 * WHAT THIS FILE DOES COVER
 * -------------------------
 *   The `getServerUserWithFallback` plumbing in `src/lib/serverAuth.js`:
 *     1. that a present `supabase.auth.getClaims` is preferred over a network
 *        `supabase.auth.getUser` call,
 *     2. that a rejected/invalid claims result fails CLOSED rather than
 *        retrying through GoTrue,
 *     3. that a client too old to expose `getClaims` still reaches the shared
 *        `getServerUserWithFallback` network path.
 *   In other words: control flow and fallback ordering.
 *
 * WHAT THIS FILE DOES **NOT** COVER — none of this is tested here
 * --------------------------------------------------------------
 *   - NO signature verification of any kind happens. `supabase.auth.getClaims`
 *     is a hand-written stub in each test; no cryptography executes.
 *   - The `Authorization` header value is NOT a JWT. It is the literal string
 *     `'signed-token.'.repeat(4)` — it has no header, no payload, no signature,
 *     and would fail any real parser. Nothing here would notice if the token
 *     format changed entirely.
 *   - NOTHING here touches `vendor/commander-shared/src/lib/serverAuth.js`,
 *     which is the module the overwhelming majority of API routes actually
 *     authenticate through. A regression in the vendored verifier — including
 *     the exact `alg !== 'HS256'` regression that caused the outage — cannot
 *     fail this file.
 *   - No JWKS fetching, caching, key rotation, `kid` resolution, `exp`/`nbf`
 *     checking, or issuer/audience validation is exercised.
 *
 * WHERE THE REAL CRYPTOGRAPHIC COVERAGE LIVES
 * -------------------------------------------
 *   `__tests__/jwt-verification-contract.test.mjs` — that suite verifies real
 *   ES256 signatures against the vendored verifier. If you are changing JWT
 *   verification behaviour, that is the file that must fail when you break it.
 *   This file will not.
 *
 * Do not widen the claims of this file's name or description without adding
 * coverage that earns them.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { getServerUserWithFallback } from '../src/lib/serverAuth.js';

// NOTE: not a JWT. See the header above — nothing in this file parses it.
const request = {
  headers: { authorization: `Bearer ${'signed-token.'.repeat(4)}` },
};

test('asymmetric access tokens use cached verified claims without calling the Auth user endpoint', async () => {
  let claimReads = 0;
  let userReads = 0;
  const supabase = {
    auth: {
      async getClaims() {
        claimReads += 1;
        return {
          data: {
            claims: {
              sub: 'user-123',
              email: 'verified@example.com',
              role: 'authenticated',
              aud: 'authenticated',
            },
          },
          error: null,
        };
      },
      async getUser() {
        userReads += 1;
        return { data: { user: null }, error: new Error('must not run') };
      },
    },
  };

  const result = await getServerUserWithFallback(request, supabase);
  assert.deepEqual(result, {
    user: {
      id: 'user-123',
      email: 'verified@example.com',
      role: 'authenticated',
      aud: 'authenticated',
    },
    error: null,
  });
  assert.equal(claimReads, 1);
  assert.equal(userReads, 0);
});

test('an invalid verified-claims result fails closed without retrying through GoTrue', async () => {
  let userReads = 0;
  const result = await getServerUserWithFallback(request, {
    auth: {
      async getClaims() {
        return { data: null, error: new Error('signature rejected') };
      },
      async getUser() {
        userReads += 1;
        return { data: { user: { id: 'must-not-pass' } }, error: null };
      },
    },
  });

  assert.equal(result.user, null);
  assert.equal(result.error, 'signature rejected');
  assert.equal(userReads, 0);
});

test('older Supabase clients retain the shared authenticated fallback', async () => {
  const result = await getServerUserWithFallback(request, {
    auth: {
      async getUser() {
        return {
          data: { user: { id: 'legacy-user', email: null, role: 'authenticated', aud: 'authenticated' } },
          error: null,
        };
      },
    },
  });

  assert.equal(result.user?.id, 'legacy-user');
  assert.equal(result.error, null);
});
