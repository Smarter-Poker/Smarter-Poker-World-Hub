import assert from 'node:assert/strict';

// Shared configuration has no executable entry point or probe dependency.
export const APP_ORIGIN = 'https://smarter.poker';
export const AUTH_ORIGIN = 'https://kuklfnapbkmacvwxktbh.supabase.co';

export function validateConfiguration(env) {
  for (const name of ['TEST_USER_EMAIL', 'TEST_USER_PASSWORD', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'MESSENGER_EXPECTED_SHA']) {
    assert.ok(env[name]?.trim(), `${name} is required; no account or credential fallback is allowed`);
  }
  assert.equal(env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, ''), AUTH_ORIGIN, 'Unexpected authentication origin');
  assert.match(env.MESSENGER_EXPECTED_SHA, /^[0-9a-f]{40}$/i, 'Expected deployed SHA must be a full commit');
}

