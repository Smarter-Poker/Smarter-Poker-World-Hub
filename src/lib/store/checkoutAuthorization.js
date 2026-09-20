import { getAuthUser, getFreshAccessToken } from '../authUtils';

const CHECKOUT_AUTH_TIMEOUT_MS = 10000;

function authorizationTimeoutError() {
  const error = new Error(
    'Secure Session Verification Timed Out. Review The Purchase And Try Again.'
  );
  error.code = 'CHECKOUT_AUTH_TIMEOUT';
  return error;
}

function authorizationAbortError(signal) {
  if (signal?.reason instanceof Error) return signal.reason;
  const error = new Error('The Secure Session Check Was Canceled.');
  error.name = 'AbortError';
  return error;
}

/**
 * Read a fresh Supabase session and bind its token to the account that owns
 * the visible offer. Cached UI identity alone cannot authorize a payment.
 */
export async function getVerifiedCheckoutAuthorization(
  expectedAccountIdValue,
  { signal, timeoutMs = CHECKOUT_AUTH_TIMEOUT_MS } = {}
) {
  const expectedAccountId =
    typeof expectedAccountIdValue === 'string' ? expectedAccountIdValue.trim() : '';
  if (!expectedAccountId || expectedAccountId.length > 160) return null;
  if (signal?.aborted) throw authorizationAbortError(signal);

  let timer = null;
  let onAbort = null;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(authorizationTimeoutError()), timeoutMs);
    if (signal) {
      onAbort = () => reject(authorizationAbortError(signal));
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });

  try {
    const initialUser = getAuthUser();
    if (initialUser?.id !== expectedAccountId) return null;
    const accessToken = await Promise.race([getFreshAccessToken(), deadline]);
    if (signal?.aborted) throw authorizationAbortError(signal);
    const confirmedUser = getAuthUser();
    if (!accessToken || confirmedUser?.id !== expectedAccountId) return null;
    return Object.freeze({
      accountId: expectedAccountId,
      accessToken,
    });
  } finally {
    if (timer) clearTimeout(timer);
    if (signal && onAbort) signal.removeEventListener('abort', onAbort);
  }
}

export const checkoutAuthorizationLimits = Object.freeze({
  timeoutMs: CHECKOUT_AUTH_TIMEOUT_MS,
});
