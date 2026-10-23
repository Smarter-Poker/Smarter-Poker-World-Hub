/** Interpret the duplicate result returned by Auth without a public email lookup. */
export function isExistingSignup(data, error) {
  if (['user_already_exists', 'email_exists', 'identity_already_exists'].includes(error?.code)) return true;
  if (/^(user already registered|user already exists|email already registered|email already exists|identity already exists)[.!]?$/i.test(String(error?.message || '').trim())) return true;
  // With confirmations enabled, Auth may return an obfuscated user instead of an error.
  return !error && !data?.session && Array.isArray(data?.user?.identities) && data.user.identities.length === 0;
}

/**
 * A sign-up request that never reached Auth (2026-10-23). On iOS Safari a
 * stale connection can stall a POST until the client's 10 s auth deadline
 * aborts it: on Oct 23 at 08:05 and 08:06 UTC two submits from one iPhone
 * ended "Authentication request aborted" and Auth logged no /signup at all;
 * the player's third tap at 08:08 went through in about one second.
 */
export function isAbortedAuthRequest(error) {
  if (!error) return false;
  if (error.name === 'AuthRetryableFetchError' || error.name === 'AbortError') return true;
  return /authentication request aborted|failed to fetch|load failed|networkerror|network request failed/i.test(String(error.message || ''));
}

/**
 * signUp, retried once on a fresh request when the first never reached Auth.
 * If the first one did land after all, the retry answers "already registered";
 * the same email and password then sign straight in, so a player whose
 * account was created is never told to start over.
 */
export async function signUpWithRecovery(auth, payload) {
  const first = await auth.signUp(payload);
  if (!isAbortedAuthRequest(first?.error)) return first;
  const second = await auth.signUp(payload);
  if (isExistingSignup(second?.data, second?.error)) {
    const signedIn = await auth.signInWithPassword({ email: payload.email, password: payload.password });
    if (!signedIn?.error && signedIn?.data?.session) return { data: signedIn.data, error: null, recovered: true };
  }
  return second;
}
