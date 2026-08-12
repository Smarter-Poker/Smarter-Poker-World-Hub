# 2026-08-12 — `profile-updated` request storm (FIXED + verified live)

Session goal was the four open items at the end of
`2026-08-12-db-verification-baseline.md`. Chasing the PvP `413` item surfaced a
much larger defect that was hiding behind it.

---

## 1. The storm (the real finding)

### Symptom

Logged in, sitting still on any hub page, the browser hammered
`/api/user/get-header-stats`:

| Page | calls/sec | statuses in 20s |
|---|---|---|
| `/hub` | 5.60 | 112x 200 |
| `/hub/trivia` | 7.30 | 146x 200 |
| `/hub/trivia/pvp` | 8.05 | 122x 200, **39x 429** |
| `/hub/trivia/gto` | 8.50 | 129x 200, **41x 429** |

That route's own header comment documents it as "up to ~8 DB round-trips" per
call. At 8 calls/sec that is up to ~64 queries/sec **per open tab, per user**,
plus a `profiles` select per iteration. The route's rate limiter was the only
thing containing it — the `429`s were an accidental circuit breaker, not a
symptom of abuse.

### Root cause

`src/hooks/useCurrentUser.js` both **dispatched** and **listened for**
`profile-updated`:

- `fetchProfile()` ended with
  `window.dispatchEvent(new CustomEvent('profile-updated', ...))`
- a `useEffect` registered a listener for that same event whose handler set
  `fetchedRef.current = false` and called `fetchProfile()` again

Nothing broke the cycle. One mount locked into
`fetch -> dispatch -> handler -> fetch` at network speed. The `fetchedRef`
guard that exists precisely to prevent refetching was explicitly cleared by the
handler on every pass.

`UniversalHeader` listens to the same event, so every iteration also fired its
`handleProfileUpdate`, which is the `POST /api/user/get-header-stats`.

### How it was pinned (not inferred)

Runtime instrumentation on production, logged in:

- wrapped `window.fetch` and bucketed by stack: **158 of 159** calls to
  `get-header-stats` in an 18s window came from one site — `UniversalHeader`'s
  `profile-updated` handler.
- wrapped `EventTarget.prototype.dispatchEvent` and bucketed by stack:
  **156 of 156** `profile-updated` dispatches in 20s came from one emitter —
  `useCurrentUser.fetchProfile`.

### Fix

Commit `63f5380d`. A module-scope `selfDispatchDepth` counter brackets the
dispatch; the hook's own listener returns early when it is non-zero.

Module scope rather than a per-instance `useRef` on purpose: `dispatchEvent()`
runs listeners **synchronously**, so the bracket covers every handler that runs
as a consequence — including the handlers belonging to *other* mounted
`useCurrentUser` instances. A per-instance ref would still have let instance A's
dispatch drive instance B into the same loop.

Genuine profile-edit saves (`profileHandlers`, `BasicInfoSection`,
`CustomAvatarBuilder`, `PhoneVerifyVIPModal`, ...) dispatch outside the bracket
and still refetch exactly as before.

### Verification — live, on the deployed SHA

Production `/api/health` served `63f5380d` at 17:56:33Z. Same measurement
script, same account, re-run against it:

| Page | before | after |
|---|---|---|
| `/hub` | 5.60/s | **0.10/s** (2 calls) |
| `/hub/trivia` | 7.30/s | **0.10/s** (2 calls) |
| `/hub/trivia/pvp` | 8.05/s + 39x 429 | **0.10/s, zero 429** |
| `/hub/trivia/gto` | 8.50/s + 41x 429 | **0.10/s, zero 429** |

Behaviour preserved, checked on the live deploy:

- profile hydration intact — `sp-social-user.username = kingfish`, avatar
  present, `sp-cached-header-user.diamonds = 495517`, 8 non-default avatar
  images painted in the header
- an externally dispatched `profile-updated` still triggers a refetch
  (2 calls), and the count does **not** climb over the following 6s

### Why nobody noticed

The baseline audit recorded near-zero traffic for ten days. One idle tab was
enough to produce this; there simply were not any tabs. At even modest
concurrency this would have saturated the database.

---

## 2. PvP `413` — closed, not our bug

The 5x `413` from the Antigravity play-test reproduce exactly, and they are
Sentry's ingest endpoint rejecting oversized envelopes:

    POST https://o4510810580779008.ingest.us.sentry.io/api/4510816835600384/envelope/  ->  413

Not a smarter.poker response, nothing to do with PvP, no user impact. The
play-test attributed them to "oversized payloads at Vercel edge"; they never
touched Vercel. Worth trimming Sentry breadcrumb/attachment size eventually so
error reports actually land, but it is a telemetry gap, not a gameplay bug.

An unauthenticated load of `/hub/trivia/pvp` returns **zero** 4xx of any kind.

---

## 3. Trivia hook trap — already closed, audit was stale

The baseline lists `mixed.js`, `pvp.js`, `survival-game.js`, `endless.js` and
`[mode].js` as calling `supabase.auth.getSession()` directly. As of `c5b98e3e`
none of them do — all five import `getAuthUser` from `@/lib/authUtils`, and
`pages/hub/trivia/` contains **zero** files matching either pattern the
pre-commit hook blocks. Simulating `scripts/pre-commit-hook.sh`'s own rule
against all five: all pass. No work needed; item closed.

---

## 4. New finding — Build Safety Gate is permanently red

`build-safety-gate.yml` has failed on **all 10 most recent runs** (5454-5463),
every one at the same step: `CHECK 8: Auth-critical files exist`. This predates
anything in this session — it was already failing on `7e8a53ae`, `e5a7c32a`,
`4f1bcb65`, `45d92230`, `bd2c743e`, `732d31aa` and `c5b98e3e`.

On a full checkout, `node --test` over CHECK 8's file list gives **44 pass /
3 fail**:

- `/api/cron/login-probe` — missing `admin.createUser`, missing `deleteUser`
- `/api/cron/recovery-probe` — missing `deleteUser`
- `/api/cron/signup-probe` — missing `deleteUser`

The probe routes exist and do their core job; they just never clean up after
themselves, which is what the guard asserts.

**Why this matters more than the three assertions:** a gate that is red on every
commit provides no signal. Nothing can be gated on "CI is green" today, and a
genuine regression in any of CHECK 8's other 44 assertions would be
indistinguishable from the standing failure.

**Not fixed here.** Rewriting three auth cron probes to create and delete real
auth users is Tier 3 work touching auth, which CLAUDE.md requires a plan and
approval for. Flagged for Dan.

Blast-radius check via Supabase: `auth.users` holds 8 rows matching
`%probe.smarter.poker%`, oldest 2026-05-10, **newest 2026-05-18**. Nothing new
in ~3 months, so the missing `deleteUser` is not an active leak — the probes
appear not to have created a user since May. 8 orphaned rows out of 1009 total.

---

## Still open after this session

- **Live end-to-end PvP match.** Needs a second real player; only one test
  account is documented (CLAUDE.md section 5). Not attempted rather than
  faked — creating a second account is not something an agent should do
  unasked.
- **`push-velocity-watchdog`.** Still intermittent: runs 821 and 823 succeeded,
  822, 824 and 825 failed. Not the clean recovery the play-test predicted.
- **Build Safety Gate CHECK 8** — see section 4.
- **PvP matchmaking race** — untouched, still needs the pairing RPC described
  in the baseline.
- **Vercel MCP token has no project scope** — `list_teams` works,
  `list_projects` returns `[]`, `get_project` 404s, `list_deployments` 403s.
  Deploy verification via `/api/health` is unaffected; build-log access is not
  available.
