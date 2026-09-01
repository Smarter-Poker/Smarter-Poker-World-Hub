import assert from 'node:assert/strict';
import test from 'node:test';

import { getServerUserWithFallback } from '../src/lib/serverAuth.js';

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
