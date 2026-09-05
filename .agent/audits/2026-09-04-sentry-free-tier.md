# 2026-09-04 - Sentry free-tier cut (World Hub)

**Spec:** `docs/SENTRY-FREE-TIER-POLICY.md` (binding, both repos).
**Branch:** `fix/sentry-free-tier`. **Migration applied:** `20260904220519_sentry_event_budget`.

Dan cancelled the Sentry Team plan. From 2026-09-16 the org is on the free
Developer plan: **5,000 errors a month shared by three projects** (Hub server,
Arena client, engine). Today the org is hard-capped and every event is
dropped, so nothing in this PR changes what Sentry sees this fortnight; it
changes what happens after.

## The budgets (section 4 of the policy, now code)

| Runtime | Budget | Enforced where |
|---|---|---|
| Hub **server** (`pages/api`, SSR, cron) | **60 / day**, **3 / fingerprint / day** | `sentry.server.config.js` `beforeSend` -> `src/lib/sentryBudget.js` -> `fn_sentry_budget_take()` in Postgres |
| Hub **client** (browser) | **0 - removed** | no config, no init, no `window.Sentry`, no SDK import in the client tree |
| Hub **edge** (`middleware.ts`) | **0 - removed**; reports via Node | `reportEdgeError()` POSTs to `/api/internal/edge-error` (allowlisted, budgeted) |

`tracesSampleRate`, `profilesSampleRate`, `replaysSessionSampleRate`,
`replaysOnErrorSampleRate` are all `0`. No Replay or BrowserTracing
integration is loaded anywhere in this repo.

### Why the bucket is in Postgres

Vercel functions do not share memory. An in-process token bucket is one bucket
per lambda, which enforces nothing. `public.sentry_event_budget (day PK, sent)`
and `public.sentry_event_fingerprints (day, fingerprint PK, sent)` are taken
atomically by `fn_sentry_budget_take(fingerprint, 60, 3)`:

1. per-fingerprint `UPDATE ... SET sent = sent + 1 WHERE ... AND sent < 3 RETURNING sent`
   (a duplicate never consumes global budget);
2. global `UPDATE ... SET sent = sent + 1 WHERE day = today AND sent < 60 RETURNING sent`;
3. 0 rows affected -> `{allowed:false}` -> `beforeSend` returns `null`.

**Fail closed.** No service key, RPC error, RPC throw, or `allowed !== true`
all drop the event and `console.warn('[sentry-budget] dropped event: ...')`.
`droppedCount()` exposes the per-lambda drop count. Nothing is filtered by
error class. Rows older than 14 days are pruned inside the function (no cron;
CLAUDE.md section 11 forbids a new one for housekeeping this small).

Probe before apply (temp tables + `pg_temp` function, rolled back): with
limits 5/3 the sequence a,a,a,a,b,c,d,e returned ok, ok, ok,
`fingerprint_cap`, ok, ok, `daily_budget`, `daily_budget` with `sent` pinned
at 5. The migration then applied once, in one transaction, with pre-flight and
post-apply assertions; `anon`/`authenticated` have no privilege on either
table or the function (asserted in SQL).

## The allowlist (section 3), enforced in the wrapper

`reportApiError()` (`vendor/commander-shared/src/lib/sentryWrap.js`,
re-exported by `src/lib/sentryWrap.js`) stays at all ~541 call sites and is
now the gate:

| route path | why it may send |
|---|---|
| `/api/cron/rakeback-period-settle`, `/api/cron/vip-stipend`, `/api/cron/vip-lapse` | move chips on a schedule |
| `/api/live/gift`, `/api/live/gifts` | move chips on demand |
| `/api/club-arena/settle-period`, `/api/cron/pvp-settle`, `/api/trivia/pvp-settle-match`, `/api/trivia/tournament-lifecycle`, `/api/poker/engine/tournament` | settlement / payout |
| `/api/auth/*` | a sign-in failure is a locked-out player |
| `/api/internal/edge-error` | middleware.ts geo-block / admin-guard / JWT gate throwing |

Everything else: `console.error` (Vercel captures it) and, when the failure is
money-shaped (`{ money: true }`, a context key matching
amount/chips/wallet/balance/payout/ledger/diamonds/credit/rake/stipend, or a
path matching `/cron\/rakeback|vip|settle|payout|gift|ledger/`), a
`financial_alerts` row (`severity: 'warning'`, `source: 'api.<route>'`). There
was no existing helper for that table in the Hub; the insert mirrors the shape
`LobbyManager.js` already uses. It is an alert row, never a wallet write.

`reportApiError` now returns `Promise<{sent, alerted}>`; `flushSentry()` is
exported. The six routes below `await` both so the lambda is not frozen
mid-send. Adding a route to the list is a PR that names the daily cost.

## Routes given `reportApiError` + `flushSentry()`

`cron/rakeback-period-settle` (partial settlement + unhandled),
`cron/vip-stipend` (unhandled), `cron/vip-lapse` (RPC failure + unhandled),
`live/gift` (refund-after-credit-failure, refund network error, unhandled),
`live/gifts` (unhandled), `auth/commander-sso` (token insert failure +
unhandled). The other 22 cron handlers that never imported it were left alone,
as instructed.

## middleware.ts

Gates 2-4 extracted into `geoGate` / `adminGate` / `jwtGate` (behaviour
unchanged, verified by re-reading the diff) and each wrapped in try/catch.
Geo fails **open** on a throw (its documented no-geo behaviour); admin and JWT
fail **closed** (503) because an exception inside an auth guard must never be a
bypass. `reportEdgeError` console.errors, then POSTs
`{stage, message, stack, path, method}` to `/api/internal/edge-error` with
`x-edge-error-secret: ADMIN_ROUTE_SECRET`, handed to `event.waitUntil`, every
failure swallowed. The Node route refuses without the secret (so the public
cannot spend the budget), rate-limits, calls `reportApiError` and
`flushSentry`, and always answers 200 after auth. Unused
`createMiddlewareClient` import removed.

## Deleted, with proofs (zero importers unless stated)

Grep: `grep -rn -F "<needle>" pages src scripts __tests__ vendor tests test_clawbot.js next.config.js package.json` (excluding node_modules), run before deletion.

| deleted | importers found | what happened to them |
|---|---|---|
| `sentry.client.config.js` | `src/instrumentation-client.js` (deleted), `__tests__/sentry-coverage.test.mjs` (rewritten), 2 comments | comments updated |
| `sentry.edge.config.js` | `src/instrumentation.js` (edge branch removed), the test | - |
| `src/instrumentation-client.js` | 0 | `onRouterTransitionStart` was only a tracing hook; tracing is off, so it went with the file |
| `src/lib/sentry.js` | 9 files, 10 refs | `withSentry` x5 -> `withSentryRoute` (series, events-calendar, daily-tournaments, game-threshold-cron, late-reg-cron); `captureError`/`addBreadcrumb` in `poker/venues.js` and `public/venue/[id].js` -> local adapter over `reportApiError`/`addBreadcrumb` from sentryWrap; `getSentryStatus` in `admin/health.js` -> inline object; two dynamic imports in `social/pages/index.js` -> the console.warn already beside them |
| `utils/logger.ts` | 0 | - |
| `src/lib/commander/errorMonitoring.js` (re-export) | 0 | - |
| `initErrorMonitoring` + Sentry branches in `vendor/.../commander/errorMonitoring.js` | `initErrorMonitoring` had 0 callers, so `Sentry` was always null | `captureException` kept for `CommanderErrorBoundary` (console + `record_health_metric`); `setUserContext`/`clearUserContext` are no-ops; `addBreadcrumb` is a dev console.debug |
| `archive/cron/rls-monitor.js` | 0 | - |
| `archive/legacy-club-tournaments/*` (11 files) | 0 code importers; 2 comments in `src/lib/poker-engine/{index,GameController}.js` | comments updated |
| `pages/api/clawbot/sentry-triage.js` | `test_clawbot.js`, `src/lib/clawbot.js` (`TASK_IDS.SENTRY_TRIAGE`, `sentryFetch`), `pages/api/clawbot/status.js`, `pages/api/admin/cron-health.js`, `__tests__/api-routes-exist.test.mjs` (comment) | all five fixed; `sentryFetch` deleted with its only caller |
| `withSentryConfig` import + `sentryWebpackPluginOptions` / `sentryOptions` in `next.config.js` | never referenced (`withSentryConfig` was bypassed since the OOM fix) | comment rewritten |
| `reportToSentry` in `useYouTubeErrorManager.js` | `Reels.jsx`, `ReelsFeedCarousel.jsx`, `pages/hub/reels.js` | import + call removed in all three; `reportFailureToServer` stays |
| `window.Sentry` in `GlobalErrorCatcher.jsx`, `pages/_app.js` `reportWebVitals` | - | removed; toast/console behaviour kept; web vitals still logged in dev and still go to the PNM analytics path |
| static `@sentry/nextjs` import in `PageErrorBoundary.jsx`, `HubErrorBoundary.jsx`, `EnhancedPostCreator.jsx`, `pages/_error.js` | - | boundaries keep `/api/client-crash` (the durable record); post creator logs to console; `_error.js` reports server-side only via a guarded dynamic import |
| `NEXT_PUBLIC_SENTRY_DSN` in `.env.example` | - | now a comment saying client Sentry is removed |

Scripts named `resolve-sentry-issues.js` / `sentry-resolve*`: **none exist** in
this repo (the only mention is in `.agent/audits/2026-09-04-sentry-repair-pass.md`).
Nothing to delete.

Stale comments corrected: `PageErrorBoundary.jsx` (two), `HubErrorBoundary.jsx`,
`pages/api/client-crash.js` header, `next.config.js` OOM comment,
`src/instrumentation.js` header.

## Kept, deliberately

- `vendor/commander-shared/` - it defines `reportApiError` for ~500 routes.
- `CommanderErrorBoundary` and the `captureException` it requires.
- `pages/api/auth/log-client-error.js`, `pages/api/cron/sentry-signup-bridge.js`
  - server-side, auth flow (allowlisted category), subject to the budget.
- `src/lib/poker-engine/LobbyManager.js` direct captures (BBJ / insurance /
  promo ledger failures) - server-side money paths, subject to the budget.
- `src/lib/auth/sdk.js` - requires `@sentry/nextjs` in a try block. It has
  **zero importers** in `pages/` and `src/` (only `__tests__/build-2-deliverables`
  reads it as text). Out of scope for this PR; flagged here as dead code.
- CSP `connect-src` entries for `*.ingest.sentry.io` in `next.config.js` -
  harmless now that nothing in the browser sends; left for a separate CSP pass.
- `SENTRY_DSN` in `src/lib/envGuard.js` required list - the server still uses it.

## Tests

- `__tests__/sentry-coverage.test.mjs` rewritten: no client/edge config, no
  `window.Sentry` / `NEXT_PUBLIC_SENTRY_DSN` / static SDK import in the
  browser tree, server rates all 0, async `beforeSend` takes a budget, budget
  module fail-closed (RPC error, RPC throw, `allowed:false`) and asks with
  60/3, fingerprint stability, migration shape + revokes, middleware wiring,
  allowlist header, the six routes flush, surviving auth bridges. 11 tests.
- `__tests__/sentry-wrap-allowlist.test.mjs` (new, added to the CI gate list
  and `_test-guards-exist`): allowlisted route sends with tags; non-Error
  value -> captureMessage; non-allowlisted does not send; non-allowlisted
  money route files `financial_alerts`; money-path with no context files;
  insert failure never throws; `withSentryRoute` 500s and honours the gate.
  9 tests.
- Before: `sentry-coverage` asserted the three configs exist (would now fail).
  After: CI gate list (20 files) `1217 pass, 0 fail`; `npx tsc --noEmit
  --incremental false` exit 0.

## Declined / not done, and why

- Did not bulk-add `reportApiError` to the 22 cron handlers that never had it
  (instructed not to; the wrapper gate makes it pointless anyway).
- Did not remove `src/lib/auth/sdk.js` or the CSP Sentry hosts (out of scope).
- Did not touch the Arena repo or the engine (separate PRs per the policy).
- Alertmanager's receiver (`SLACK_ALERT_URL` / `PAGERDUTY_SERVICE_KEY`) is
  still Dan's decision (policy section 7); this PR does not change it.


## Addendum: what the pre-push hook caught

The agent that wrote this was cut off by a rate limit before its own push
checks ran. The hook found three defects and refused the branch:

- `pages/api/poker/venues.js` and `pages/api/public/venue/[id].js` each carried
  a duplicate `import { reportApiError }` — the migration away from
  `src/lib/sentry.js` added a second import beside one that already existed.
  Babel refused both; `node -c` would have missed it. Duplicates removed.
- `test_clawbot.js` requires `./pages/api/clawbot/orchestrator`, which exists
  on no branch — a root-level script that has been dead since the orchestrator
  was removed, surfaced only because this pass touched the file. Deleted;
  nothing references it.

Recorded here because a hook that refuses a push is doing exactly the job the
rest of this document is about.
