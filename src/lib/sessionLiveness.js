/**
 * sessionLiveness - the World Hub notices when its session has been revoked.
 *
 * WHY (2026-09-04). A cron revoked Dan's session every 15 minutes for 22
 * hours. Club Arena's tables spun on "Reconnecting" - fixed there - but the
 * hub itself never noticed either, and never will on its own: PostgREST
 * checks a JWT's signature, not whether the session row still exists, so
 * every /api call and every query kept returning 200 while the session was
 * dead. The access token lives seven days; supabase-js refreshes near
 * expiry; nothing asks GoTrue in between. The hub would have looked signed
 * in for a week.
 *
 * WHAT. Three cheap triggers, one throttled question, one honest answer:
 *   - every LIVENESS_INTERVAL_MS while the tab is visible,
 *   - when the tab becomes visible again (the phone woke up),
 *   - when any same-origin /api/ call answers 401 (something on our side
 *     of the network refused the token).
 * The question is GoTrue's getUser() and then, if that says no, ONE
 * refreshSession(). Only a DEFINITIVE rejection of both (401/403/
 * session_not_found/refresh_token_not_found) is "revoked". A network error,
 * a 5xx, a timeout is "unknown", and unknown never signs anyone out.
 *
 * On "revoked": say so on screen (plain DOM - no dependency on any provider
 * being mounted), clear the local session only (scope 'local': the server
 * has nothing left to revoke, and a global sign-out from here would be the
 * outage in reverse), then go to /auth/login?authError=no_session with a
 * return path. Title Case, no em dashes.
 *
 * Mirrors Club Arena's src/lib/sessionRevoked.ts. Kept in plain JS with the
 * client injected so the law test exercises every branch without a network.
 */

export const LIVENESS_INTERVAL_MS = 10 * 60 * 1000;
export const LIVENESS_MIN_GAP_MS = 60 * 1000;
export const SESSION_ENDED_PROMPT_MS = 4000;
export const SESSION_ENDED_TITLE = 'Your Session Has Ended';
export const SESSION_ENDED_BODY =
  'You Were Signed Out On This Device. Taking You To Sign In Again.';
export const SESSION_ENDED_BUTTON = 'Sign In Now';
export const AUTH_STORAGE_KEY = 'smarter-poker-auth';

const DEFINITIVE = new Set([
  'session_not_found',
  'bad_jwt',
  'user_not_found',
  'refresh_token_not_found',
  'refresh_token_already_used',
  'user_banned',
  'session_expired',
]);

/** Is this GoTrue error a definitive "the session is dead"? Pure. */
export function isDefinitiveAuthRejection(err) {
  if (!err) return false;
  const code = String(err.code || '').toLowerCase();
  if (DEFINITIVE.has(code)) return true;
  const status = typeof err.status === 'number' ? err.status : 0;
  if (status === 401 || status === 403) return true;
  if (status === 400 && /invalid refresh token/i.test(String(err.message || ''))) return true;
  return false;
}

/** 'alive' | 'revoked' | 'unknown'. Injected client; never throws. */
export async function probeSessionAlive(auth) {
  let u;
  try {
    u = await auth.getUser();
  } catch {
    return 'unknown';
  }
  if (!u?.error && u?.data?.user) return 'alive';
  if (!isDefinitiveAuthRejection(u?.error)) return 'unknown';
  let r;
  try {
    r = await auth.refreshSession();
  } catch {
    return 'unknown';
  }
  if (!r?.error && r?.data?.session) return 'alive';
  if (isDefinitiveAuthRejection(r?.error)) return 'revoked';
  return 'unknown';
}

export function loginRedirectUrl(pathname, search) {
  const back = (pathname || '/') + (search || '');
  return `/auth/login?authError=no_session&redirect=${encodeURIComponent(back)}`;
}

/** Plain-DOM prompt; button goes now, timer goes on its own, never twice. */
export function announceSessionEnded(onGo) {
  if (typeof document === 'undefined') return onGo();
  try {
    const id = 'sp-session-ended';
    if (document.getElementById(id)) return;
    const wrap = document.createElement('div');
    wrap.id = id;
    wrap.setAttribute('role', 'alertdialog');
    wrap.setAttribute('aria-live', 'assertive');
    wrap.style.cssText =
      'position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;' +
      'background:rgba(0,0,0,.82);padding:24px;font-family:system-ui,-apple-system,sans-serif;';
    const card = document.createElement('div');
    card.style.cssText =
      'max-width:360px;width:100%;background:#15181d;border:1px solid #d33;border-radius:14px;padding:22px 20px;' +
      'color:#fff;text-align:center;box-shadow:0 12px 40px rgba(0,0,0,.6);';
    const h = document.createElement('div');
    h.textContent = SESSION_ENDED_TITLE;
    h.style.cssText = 'font-size:19px;font-weight:700;margin-bottom:10px;';
    const b = document.createElement('div');
    b.textContent = SESSION_ENDED_BODY;
    b.style.cssText = 'font-size:14px;line-height:1.45;opacity:.9;margin-bottom:18px;';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = SESSION_ENDED_BUTTON;
    btn.style.cssText =
      'width:100%;padding:13px;border:0;border-radius:10px;background:#e0322d;color:#fff;font-size:16px;font-weight:700;';
    let went = false;
    const go = () => {
      if (went) return;
      went = true;
      onGo();
    };
    btn.addEventListener('click', go);
    card.append(h, b, btn);
    wrap.append(card);
    document.body.append(wrap);
    setTimeout(go, SESSION_ENDED_PROMPT_MS);
  } catch {
    onGo();
  }
}

function hasLocalSession() {
  try {
    return !!localStorage.getItem(AUTH_STORAGE_KEY);
  } catch {
    return false;
  }
}

let inFlight = null;
let lastAt = 0;
let leaving = false;

/** Test seam. */
export function _resetForTests() {
  inFlight = null;
  lastAt = 0;
  leaving = false;
}

/**
 * Ask once (throttled), act on 'revoked'. Returns the verdict.
 * `deps` is injectable for tests: { getAuth, now, go }.
 */
export async function checkSessionLiveness(source, deps = {}) {
  if (leaving) return 'revoked';
  if (!hasLocalSession()) return 'alive';
  if (inFlight) return inFlight;
  const now = deps.now ? deps.now() : Date.now();
  if (now - lastAt < LIVENESS_MIN_GAP_MS && !deps.force) return 'unknown';
  lastAt = now;

  inFlight = (async () => {
    let verdict = 'unknown';
    try {
      const auth = deps.getAuth
        ? await deps.getAuth()
        : (await import('./supabase')).supabase.auth;
      verdict = await probeSessionAlive(auth);
      if (verdict === 'revoked') {
        leaving = true;
        try {
          sessionStorage.setItem('sp_session_revoked', JSON.stringify({ at: new Date().toISOString(), source }));
        } catch {
          /* private mode */
        }
        try {
          await auth.signOut({ scope: 'local' });
        } catch {
          try {
            localStorage.removeItem(AUTH_STORAGE_KEY);
          } catch {
            /* nothing more to clear */
          }
        }
        const go =
          deps.go ||
          (() => window.location.assign(loginRedirectUrl(window.location.pathname, window.location.search)));
        announceSessionEnded(go);
      }
    } catch {
      verdict = 'unknown';
    } finally {
      inFlight = null;
    }
    return verdict;
  })();
  return inFlight;
}

let installed = false;

/**
 * Install the three triggers. Idempotent; client only. Call once from _app.
 */
export function installSessionLivenessWatch() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  setInterval(() => {
    if (document.visibilityState === 'visible') void checkSessionLiveness('interval');
  }, LIVENESS_INTERVAL_MS);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkSessionLiveness('visible');
  });

  // Response-only: never alters the request or the response, only looks at
  // the status of same-origin /api/ answers. A 401 from our own API is the
  // engine-side refusal Club Arena sees, in hub form.
  const origFetch = window.fetch;
  if (typeof origFetch === 'function' && !origFetch.__spLiveness) {
    const wrapped = function (input, init) {
      const p = origFetch.call(this, input, init);
      try {
        const url = typeof input === 'string' ? input : input?.url || '';
        if (url.startsWith('/api/') || url.startsWith(`${window.location.origin}/api/`)) {
          p.then((res) => {
            if (res && res.status === 401) void checkSessionLiveness('api:401');
          }).catch(() => {});
        }
      } catch {
        /* never let observation break the call */
      }
      return p;
    };
    wrapped.__spLiveness = true;
    window.fetch = wrapped;
  }
}
