# 283044: push-health reported a read failure as "[object Object]"

Rows: `operational_alert_events` 283044 (2026-10-27T13:01Z) and its 2026-10-28T13:00Z
sibling, both `worldhub.push-health` / `PushHealthCheckFailed`, check `PushDeliveryFailing`,
summary `push-health could not observe PushDeliveryFailing: [object Object]`.

## Root cause

`pages/api/cron/push-health.js` reads its delivery counts with
`.select('id', { count: 'exact', head: true })`. When a HEAD request fails, the response
has no body, and `@supabase/postgrest-js` 2.112.4 (`processResponse`, non-ok branch:
`JSON.parse('')` throws, so `error = { message: body }`) returns `{ message: '' }`.
`errorText` in `src/lib/push/pushHealthOperationalAlerts.mjs` was
`String(error?.message || error || 'unknown error')`. The empty message fell through to
`String(object)`, which is `[object Object]`, so the store row and the admins' line lost
every detail of the failure. The failed observation itself was correctly recorded as
unknown, not healthy. What was lost was what failed.

## Fix

- `errorText` (exported) describes an object by its message, code, details, hint, status
  and statusText. An object that carries none of these says it was an error with no
  message (an empty error body), and never `[object Object]`.
- `push-health.js` renders every caught error through `errorText` instead of
  `e?.message || e`.

## Hardening

1. Regression test: `__tests__/push-health-error-text.test.mjs`. On pre-fix main
   (`1fff1bf0`) it fails 6/6. With the fix it passes 6/6.
2. Invariant: the single exported `errorText` in the owning module. The test also refuses
   `e?.message || e` in the route.
3. Detection: unchanged. `PushHealthCheckFailed` already records into
   `operational_alert_events` with `target_task_id`. A recurrence now arrives with the
   real error text.
4. CI gate: the test is added to build-safety-gate "Accounting Push Receipt And Ownership
   Contracts", next to the other push-health suites.

## Local run (cloud container, no node_modules)

`node --test` of the cooldown, evidence, positive-evidence, owner-episodes and error-text
suites: 93/93 pass. `push-health-snapshot.test.mjs` needs `react` and cannot load here. CI
runs it.
