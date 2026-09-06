/**
 * WHO A SYNTHETIC PROBE IS ALLOWED TO BE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * One gate, imported by every probe. It lived inside `login-probe.js` until
 * 2026-09-06, when a second probe needed the same rule and the choice was to
 * copy it or to move it. Copying a security gate is how two copies drift, and
 * the drifted one is always the copy nobody remembers exists - the Club Arena
 * realtime programme had just spent a phase fixing that exact shape on its
 * WebSocket servers.
 *
 * WHY THERE IS A GATE AT ALL. On 2026-09-03 at 20:15 UTC someone set
 * PROBE_LOGIN_EMAIL / PROBE_LOGIN_PASSWORD in Vercel to Dan's OWN account
 * instead of the dedicated probe user the login-probe header had named since
 * May. From the next tick the probe signed in as him and called
 * `signOut()` - default scope 'global', "revoke every session this user has,
 * on every device" - ninety-six times a day. Every Club Arena table he opened
 * then sat on "Reconnecting To The Table" for twenty-two hours, because the
 * engine verifies each table socket with `auth.getUser()` and GoTrue kept
 * answering `session_not_found`.
 *
 * Dan, 2026-09-04, mid-incident: "DON'T USE MY ACCOUNT FOR THE CRON, USE THE
 * OTHER 'GOD MODE ADMIN ACCOUNT'. IT HAS THE SAME PASSWORD. KEEP MY ACCOUNT
 * CLEAN."
 *
 * So: a probe may be an address under `probe.smarter.poker`, or the platform's
 * own service identity. It may never be a person. A probe pointed at anything
 * else reports `misconfigured` and does nothing - it does not "try anyway".
 *
 * Pinned by `__tests__/synthetic-probes-never-sign-out-a-person.law.test.mjs`.
 */

/** The domain dedicated probe accounts live under. */
export const PROBE_ACCOUNT_DOMAIN = 'probe.smarter.poker';

/**
 * The platform service identity (`profiles.role = 'god'`, display name
 * "Smarter.Poker Official") - the one non-probe address a probe may be.
 *
 * ADDING A PERSON TO THIS LIST IS THE BUG THIS FILE EXISTS FOR. Dan's own
 * account is not here and must never be.
 */
export const PROBE_ALLOWED_ACCOUNTS = Object.freeze(['daniel@smarter.poker']);

/**
 * May a synthetic probe sign in as this address?
 *
 * Case- and whitespace-insensitive, because an env var typed by hand is where
 * the stray capital and the trailing space live. Everything else is refused,
 * including a lookalike domain (`probe.smarter.poker.evil.com`) and the apex
 * (`probe-login@smarter.poker`), which is a real account namespace.
 */
export function isDedicatedProbeAccount(email) {
  const normalized = String(email || '')
    .trim()
    .toLowerCase();
  const at = normalized.lastIndexOf('@');
  if (at <= 0) return false;
  if (PROBE_ALLOWED_ACCOUNTS.includes(normalized)) return true;
  return normalized.slice(at + 1) === PROBE_ACCOUNT_DOMAIN;
}
