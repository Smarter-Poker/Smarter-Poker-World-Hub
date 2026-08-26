/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  WHAT /auth/callback IS ALLOWED TO MAKE THE AUTH PAGES SAY
 *  Added 2026-08-25.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * /auth/callback bounces every failure back to a sign-in page. It used to
 * bounce to a CLEAN one, so the reason was discarded and a failed Facebook
 * sign-in was indistinguishable from a button that did nothing (Dan, 2026-08-25:
 * "the facebook login isn't working").
 *
 * The first fix put the provider's raw text in `?authError=` and rendered it.
 * That is a phishing kit rather than a feature: a red first-party
 * `role="alert"` banner on a gambling domain saying whatever the link author
 * typed - and `/auth/signin` forwards arbitrary query params straight through,
 * so the link need not even look like the login page.
 *
 * So the URL carries a CODE from this table, and the provider's own words -
 * which are the whole diagnostic value - travel in `sessionStorage` under
 * `auth_error_detail`: same origin, same tab, unreachable from a link someone
 * was sent.
 *
 * Shared rather than duplicated because login.js and signup.js both render it
 * and both are reachable from the same callback; two copies of a message table
 * is two copies that drift.
 */

/** Session keys the auth pages hand to each other across a redirect. */
export const AUTH_DETAIL_KEY = 'auth_error_detail';
/** Which page started an OAuth flow, so a failure returns to it. */
export const AUTH_ORIGIN_KEY = 'oauth_origin';
/** One-shot arm for the www -> apex resume; a bare ?provider= is only a hint. */
export const AUTH_BOUNCE_KEY = 'oauth_bounce';

/**
 * The only providers the sign-in pages offer, and therefore the only ones the
 * post-bounce resume will act on. `apple` and `discord` used to be allowlisted
 * with no button anywhere to reach them - a wider allowlist on a redirect that
 * fires at page load is a bigger surface for no benefit.
 */
export const OAUTH_PROVIDERS = ['google', 'facebook'];

/** Pages a callback failure may be returned to. Never trust a raw path. */
export const AUTH_ORIGINS = ['/auth/login', '/auth/signup'];

export const AUTH_ERROR_MESSAGES = {
  provider: 'That sign-in provider did not complete. Please try again, or use email and password.',
  no_email:
    'That provider did not share an email address, so we could not create your account. Try Google, or sign up with email and password.',
  exchange: 'We could not finish signing you in. Please try again.',
  verify: 'That verification link is invalid or has expired. Please request a new one.',
  verify_type: 'That link type is not supported.',
  no_session: 'No active session was found. Please sign in again.',
  generic: 'Something went wrong signing you in. Please try again.',
};

/** Headline for a code, always a string we wrote. */
export function authErrorMessage(code) {
  return AUTH_ERROR_MESSAGES[String(code)] || AUTH_ERROR_MESSAGES.generic;
}

/**
 * Read the out-of-band detail exactly once. Returns null when there is nothing
 * worth showing - including when the stored detail is just the headline the
 * table already renders, which is the common case for the non-provider codes.
 */
export function takeAuthErrorDetail(code) {
  try {
    const detail = sessionStorage.getItem(AUTH_DETAIL_KEY);
    sessionStorage.removeItem(AUTH_DETAIL_KEY);
    if (!detail) return null;
    if (detail === authErrorMessage(code)) return null;
    return detail.slice(0, 300);
  } catch (_e) {
    // Private mode, storage disabled, or a sandboxed frame. The headline still
    // lands; only the detail line is lost.
    return null;
  }
}

/**
 * Fire-and-forget server-side capture. Client Sentry is disabled in production
 * (the OOM workaround), so a `console.warn` in an auth catch block is invisible
 * - which is why auth failures "looked silent" for months. Lifted out of
 * login.js so signup.js stops being the one page with no telemetry at all.
 *
 * `flow` must be a value in ALLOWED_FLOWS in pages/api/auth/log-client-error.js
 * or the report is bucketed as 'unknown' next to malformed payloads.
 */
export function reportAuthError(flow, err) {
  try {
    fetch('/api/auth/log-client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        flow,
        message: err?.message || String(err),
        stack: err?.stack,
        code: err?.code || err?.status,
        url: typeof window !== 'undefined' ? window.location.href : '',
      }),
    }).catch(() => {
      /* telemetry is best-effort */
    });
  } catch (_e) {
    /* never throw from telemetry */
  }
}
