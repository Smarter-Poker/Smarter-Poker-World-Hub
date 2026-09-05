# 2026-09-04: the hub notices a revoked session

Fourth piece of the 2026-09-03 outage. Club Arena's tables were the loud
symptom; the hub was the quiet one. It never noticed the session was dead
and never would have: PostgREST checks a JWT's **signature**, not whether
the session row exists, so every `/api` call and every query kept answering
200 to a token whose session had been deleted behind it. The access token
lives seven days and supabase-js refreshes near expiry, so nothing asked
GoTrue in between. The hub would have looked signed in for a week.

## What changed

`src/lib/sessionLiveness.js`, installed once from `_app.js`:

- Three triggers: every 10 minutes while the tab is visible; when the tab
  becomes visible again; and when any same-origin `/api/` call answers 401
  (a response-only observer on `fetch` - never alters a request or a
  response).
- One throttled question (at most once a minute, single-flight): GoTrue
  `getUser()`, and if that says no, one `refreshSession()`.
- One honest answer. **Revoked** = both rejected definitively
  (401/403/`session_not_found`/`refresh_token_not_found`): a plain-DOM
  prompt says "Your Session Has Ended. You Were Signed Out On This Device.
  Taking You To Sign In Again." with **Sign In Now**; the local session is
  cleared with `scope: 'local'` only; then `/auth/login?authError=no_session`
  with a return path (the login page already renders that code). **Unknown**
  = network error, 5xx, 429, timeout: nothing happens. Unknown never signs
  anyone out. A dead access token with a live refresh token is **alive**.
- No local session at all: nothing to ask, nobody bounced.

Mirrors Club Arena's `sessionRevoked.ts`. The law
(`__tests__/the-hub-notices-a-revoked-session.law.test.mjs`, CHECK 8 via
`_test-guards-exist`) drives every branch with a fake client: the verdict
table, local-only sign-out, the throttle, single-flight, the install in
`_app`, and the popup copy rule.

## Cost

One `getUser()` per open, visible tab per 10 minutes. Against ~1,300 users
of whom a handful are online at once, that is nothing.
