# The messenger died in production and left no evidence — plus a revert nobody noticed

Date: 2026-08-19 (UTC)

Dan reported five things on the Club Arena club surface. Two were real bugs I
could reproduce from code, one was already fixed and I nearly "fixed" it again
from a stale clone, and one could not be reproduced at all — which turned out
to be the most important finding.

---

## 1. The dashboard "kept resetting over and over" — three causes, one symptom

`src/pages/club/ClubDashboard.tsx`, on a club with 578 members.

| cause | effect |
|---|---|
| 15 separate `subscribeDebounced()` subscriptions, each calling `loadDashboardData()` | `subscribeDebounced` debounces each event **name** independently. One hand completing emits `HAND_COMPLETED`, `BALANCE_UPDATED` and `SETTLEMENT_CYCLE_COMPLETED` — three reloads no debounce could relate. |
| every reload called `setLoading(true)` | the rendered dashboard was torn down to a skeleton and rebuilt. This is the visible "reset". The data was fine; the shell was being unmounted. |
| the leaderboard stagger animation keyed on the `topPlayers` array identity | every fetch produced a new array, so rows re-staggered from zero even when the standings had not changed. |

Fixed with a silent-refresh path, one coalescing 2s subscriber across all
fifteen event names (with a `clubId` guard), and a stagger keyed on a content
signature of the player ids.

## 2. Disputes / Alerts / Financials were dead links

Plain `<a href="/clubs/...">` inside a router mounted at
`basename="/hub/club-arena"`. Six of them, now `navigate()` calls.
`ClubFinancialDashboard` had no `useNavigate` import at all.

## 3. The messenger crash — and why nobody could have found it

Dan's screenshot read **"Messenger Temporarily Unavailable / This section
encountered an issue and was isolated to protect the rest of the app"**. That
string is `HubErrorBoundary` with `name="Messenger"`, i.e. World Hub's
`pages/hub/messenger.js` threw during render inside the iframe that Club Arena's
`MessagesPage` embeds. Club Arena's own boundary would have said "Messages".

I could not reproduce it and I could not look it up, because **every reporting
path in the app is a black hole**:

| path | state |
|---|---|
| `Sentry.captureException()` in both error boundaries | inert. `sentry.client.config.js` only calls `Sentry.init()` when `NEXT_PUBLIC_SENTRY_DSN` is set. I downloaded `pages/_app` and `main` from production and grepped: **zero** occurrences of `ingest.sentry.io`. The comment atop `pages/api/auth/log-client-error.js` says the same — auto-instrumentation is off as an OOM workaround. |
| `public.sentry_error_log` | **0 rows.** The snapshot mirror has never run. |
| `PageErrorBoundary`'s sessionStorage log | dies with the tab, readable only by the person holding the phone. |
| Vercel runtime errors | server-side only. Four groups in the last 3 days, none from the messenger. |

So the boundaries were doing their job — containing the crash — and then
throwing away the only thing that would let anyone fix it.

### What was built instead of a guess

- `public.client_crash_log`. Service-role only: RLS on, no policies, grants
  revoked from `anon` and `authenticated`, with post-apply assertions that fail
  the migration if any of those three drift.
- `/api/client-crash`. Rate-limited, every field truncated, user id shape
  validated, and **200 on every path including its own failures** — a crash
  reporter that throws inside an error boundary turns one dead section into a
  dead page.
- `src/lib/reportClientCrash.js`. console + sessionStorage mirror + keepalive
  POST, each independently wrapped, capped at 5 reports per page load. Records
  whether the page was inside an iframe, which is exactly the case that was
  unreproducible.
- `HubErrorBoundary` now keeps the component stack and shows it under "Show
  error details", so the child that threw is named on screen.

Verified end to end against production, not asserted:

```
POST /api/client-crash            -> {"ok":true}
select ... from client_crash_log  -> id 1, section __selftest__,
                                     build_sha 0bbf8b453e68...
```

### The most likely cause, now that it can be confirmed

`pages/hub/messenger.js` has **fourteen** `dynamic()` imports, all inside the
`Messenger` boundary. After a deploy, the previous build's chunks 404.
`ChunkLoadRecovery` exists for exactly that and reloads the page — but it
listens on window `error` and `unhandledrejection`, and **React does not
re-dispatch an error a boundary caught**. The one case where the user is
staring at a dead screen was precisely the case the recovery could not see.

Both boundaries now detect a chunk error in `componentDidCatch` and reload,
sharing `ChunkLoadRecovery`'s reload budget (2 per 60s) via the extracted
`src/lib/chunkRecovery.js` so the three call sites cannot loop against each
other. Detection widened to the Vite/ESM phrasings the Club Arena bundle emits.

I am not claiming this *was* the crash. It is the leading candidate, it is a
real defect either way, and the next occurrence now names itself in
`client_crash_log`.

## 4. A commit about icon sizes reverted the entire club-identity fix

`3fec6aa3` (15 Aug 02:51) made club identity activate in the messenger.
`902d8b2b` (15 Aug 10:33) — subject: *"match icon sizes to profile orb, show
hamburger menu on all pages"* — reverted **every line of it**, across three
source files, and deleted the migration. Nothing in that commit had anything to
do with icons except the Club Arena bundle rebuild it actually intended; the
rest came along because the agent committed from a tree checked out before
`3fec6aa3` landed.

Measured, for the club Dan reported:

```
SHARK CLUB's social page
  social_pages.id                eba7d82a-94dd-43b8-840d-1d547961174a
  social_pages.linked_entity_id  a41434bb-8d0c-400a-8f0d-e8b3d65afed4   <- the club id
```

Club Arena links with `clubId=<club id>`, which equals `linked_entity_id`. The
reverted code matched only `p.id === forceId`, so the lookup could never hit and
the identity switch silently did nothing on every club messenger load.

Restored, along with the per-participant context columns in
`start-conversation` and the 4-arg `fn_get_or_create_conversation` migration
file. The function was still live in the database (both overloads exist), so
this was pure repo/DB drift: production had a function with no migration behind
it.

## 5. The one I almost got wrong

My Club Arena clone was four days stale. Reading it, I found `ClubSettingsPage`,
`ClubDetailPage` and `TableCreationPage` all selecting `clubs.time_bank_seconds`
and `tables.time_bank_seconds`, and confirmed against production that **neither
column exists** — 42703 through both SQL and PostgREST. Three broken surfaces
and an engine landmine, apparently.

It was none of those. Migration `20260818201108 drop_dead_time_bank_seconds_columns`
dropped them yesterday as a deliberate owner decision, and the same change
removed every read in the same pass. `origin/main` was already clean; I was
reading a four-day-old checkout. The deployed
`ClubSettingsPage-CJHYdYr0-v6.js` confirmed it — the select in production has no
`time_bank_seconds` in it.

That is the same failure mode as §4, one step from the same outcome. All
subsequent Club Arena work in this session was done against a fresh
`git archive` of `origin/main`, not the clone.

## 6. GitHub Actions stopped running mid-session

From 02:36 UTC, every workflow on both repos fails in about three seconds with
no runner assigned, no steps and no log blob, while githubstatus.com reports all
systems operational. No workflow file changed — runs on identical YAML succeeded
minutes earlier. That signature is an account-level Actions quota or spending
limit.

Consequence: `Build for World Hub Sync` cannot run, so Club Arena source fixes
have no path to production. I performed that workflow by hand for this session's
work (`npm ci`, `npm run build` with the workflow's exact env, `rsync -a
--delete` into `public/hub/club-arena/`), verifying each target chunk carried
the fix before syncing. **This is not sustainable — it needs Dan to clear the
Actions billing state.**

---

## Also fixed on the two pages Dan asked for a pass

**Club Settings** — three background refresh paths (tab focus, a realtime
`clubs` UPDATE subscription, four bus events) all called `loadClubSettings()`,
which unconditionally `setSettings()` and `setLoading(true)`. Typing a new rake,
switching tabs and coming back gave you a skeleton and then your old values,
while the page rendered an "N unsaved changes" banner the entire time. Now
silent, edit-preserving, with a "these changed elsewhere" bar and a
`beforeunload` guard. Buy-in limits had no validation at all — the `min`/`max`
attributes on a number input are only enforced by form validation and this page
never submits a form, so "min 5000, max 10" saved fine.

**Cashier** — `exportCSV` quoted the description field and nothing else, and
descriptions are partly attacker-controlled (they carry usernames and free-text
transfer notes). A description starting with `=`, `+`, `-`, `@` or a tab
executes as a formula the moment a club owner opens the audit trail in Excel.
Every cell now goes through `csvCell()`. Plus CRLF per RFC 4180 and a UTF-8 BOM,
and nineteen emoji removed from user-facing strings per RULE 7.

---

## The pattern, again

Yesterday's audit closed with *"measure the thing directly before acting on the
description of it."* Today the same rule caught §5 and produced §3: the reason
the messenger bug survived is that nothing measured it. Two independent
reporting systems existed — Sentry and `sentry_error_log` — and both were
switched off in ways nobody noticed, because a reporting system that reports
nothing looks exactly like a system with nothing to report.
