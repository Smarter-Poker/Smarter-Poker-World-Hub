# Audit: MLB Analytics `/status` Page — Deep Sweep v2 (Secondary Audit)

**Date:** 2026-06-21 (secondary audit — session continuation)
**Scope:**
- `pages/hub/MLB-ANALYTICS/status.tsx` (shadow page)
- `pages/api/mlb/status.ts` (API proxy)
- `utils/supabase/mlb.ts` (MLB Supabase client)
- `mlb-analytics-engine/web/src/app/status/page.tsx` (engine page — real production render)
- SQL: `get_status_dashboard()` RPC (MLB Supabase project)

**Method:** 4-agent swarm audit — engine frontend auditor, shadow/API auditor,
live HTTP auditor × 2, DB schema auditor. All findings aggregated in main thread.
Live HTTP confirmed 200 OK, full real data, zero null/undefined leakage.

---

## Production Status at Audit Time

| Check | Result |
|-------|--------|
| HTTP status | ✅ **200 OK** |
| Page HTML size | ✅ 47,988–140,294 bytes (both ISR+streaming confirmed) |
| null/undefined in HTML | ✅ **Zero** |
| `get_status_dashboard()` RPC in live DB | ✅ **Confirmed** |
| API JSON real data | ✅ 100% real (not mocked/stubbed) |
| Pipeline stages | ✅ 7–12 stages, all success |
| Data sources | ✅ 9/9 sources OK |
| Brier ML | ✅ 0.179–0.238 (beating 0.25 baseline) |
| Shadow page missing sections vs engine | ⚠️ Non-critical (proxy serves engine in prod) |

---

## Bugs Found and Fixed (Secondary Audit)

### 1. `mlb.ts` — Critical Security Hardening ✅ FIXED
**Was:** Module-scope env-var resolution (risks Next.js bundler capturing at import
time). `NEXT_PUBLIC_MLB_SUPABASE_URL` used in a server-side file (comment explicitly
forbade this). `SUPABASE_SERVICE_ROLE_KEY` (wrong project's key) as fallback.
`console.warn` (invisible in prod) on missing key.
**Fix:** Moved env-var resolution inside `getMlbSupabase()` body. Removed
`NEXT_PUBLIC_MLB_SUPABASE_URL` fallback. Removed `SUPABASE_SERVICE_KEY` /
`SUPABASE_SERVICE_ROLE_KEY` fallbacks (wrong project). Upgraded to `console.error`.

### 2. `status.ts` — CORS Wildcard Restricted ✅ FIXED
**Was:** `Access-Control-Allow-Origin: *` — exposed pipeline ops data to any origin.
**Fix:** Restricts to `https://smarter.poker` in production, `*` in dev/preview.
Uses `VERCEL_ENV` to detect environment.

### 3. `status.ts` — x-forwarded-proto Comma-List Crash ✅ FIXED
**Was:** `req.headers['x-forwarded-proto'] || 'http'` — CDN can return `'https, http'`
(comma-list); `new Request('https, http://host/path', ...)` throws, causing 500.
**Fix:** `.split(',')[0].trim()` extracts first value safely.

### 4. `status.ts` — okCount Misses Valid Success Statuses ✅ FIXED
**Was:** Only `status === 'success'` counted as OK. Pipeline stages returning
`'ok'` or `'done'` were silently ignored, causing undercount.
**Fix:** Accepts `'success' | 'ok' | 'done'` as OK, `'error' | 'failed'` as error.

### 5. `status.tsx` — `fmt()` Shows `"0"` Instead of `"—"` for Nulls ✅ FIXED
**Was:** `Number(n ?? 0).toLocaleString()` — null/undefined rendered as `"0"`.
**Fix:** `(n == null) ? '—' : Number(n).toLocaleString()` — null renders as em-dash.

### 6. `status.tsx` — Source Keys Showed Raw IDs ✅ FIXED
**Was:** `{src?.source}` rendered raw keys like `daily_predict`, `odds_api`, etc.
**Fix:** Added `SOURCE_LABEL_MAP` constant mapping to human labels (matches engine).

### 7. `status.tsx` — Data Source Status Check Too Strict ✅ FIXED
**Was:** `status === 'ok'` only. Pipeline can also return `'success'`/`'done'`/`'partial'`.
**Fix:** Checks `['ok', 'success', 'done', 'partial'].includes(...)`.

### 8. `status.tsx` — "Data as of JUST NOW" Misleading ✅ FIXED
**Was:** `timeAgo(data.serverNow)` — serverNow is API call time, always "JUST NOW".
**Fix:** `timeAgo(data.health?.last_refresh || data.serverNow)` — shows true model
refresh age. Also added subtle `"· updating…"` pulse during background SWR revalidation.

### 9. `status.tsx` — SWR Interval vs Cache TTL Mismatch ✅ FIXED
**Was:** `refreshInterval: 60000` (60s) vs API `s-maxage=30` (30s) — could show
data up to 90s stale while believing it refreshed at 60s.
**Fix:** `refreshInterval: 30000` to match the CDN TTL.

### 10. `status.tsx` — Missing `onError` in SWR Config ✅ FIXED
**Was:** Background SWR failures were silent (no logging).
**Fix:** Added `onError: (err) => logError('SWR MLB Status', err)`.

### 11. `status.tsx` — `games_in_slate` Field Not Rendered ✅ FIXED
**Was:** `health.games_in_slate` returned by API but never shown in health grid.
**Fix:** Added "GAMES IN SLATE" card between "GAMES IN RUN" and "LIVE RECS".

### 12. Engine `page.tsx` — `games_in_slate` Not Rendered ✅ FIXED
**Was:** Same field missing from engine health grid, and not typed in `Health` type.
**Fix:** Added `games_in_slate?: number | null` to `Health` type, computed
`gamesInSlate` constant, and conditional `<HealthCard>` in the grid.

### 13. `get_status_dashboard` SQL Not Tracked in World-Hub Migrations ✅ FIXED
**Was:** The RPC was applied out-of-band to the MLB Supabase DB. The function
definition only existed in the engine repo. If DB resets, World-Hub API breaks.
**Fix:** Created `supabase/migrations/20260621004109_mlb_get_status_dashboard_rpc.sql`
in the World-Hub repo mirroring the engine's canonical SQL. Now tracked in both repos.

---

## Remaining Items (Low Priority — No Code Impact in Production)

| # | Item | Why Not Fixed This Session |
|---|------|---------------------------|
| A | `logError` in `utils/logger.ts` is a `console.error` stub | Sentry integration is a separate project-wide task |
| B | `STAGE_ORDER` in `status.ts` has ghost stages (`heal`, `ingest`, etc.) not used by current pipeline | Cosmetic; unknown stages sort to end gracefully |
| C | `alerts[].created_at` all null in live DB | DB schema issue; `fired_at` is rendered, not `created_at` |
| D | Type safety: all status page data typed `any` | Full type system would require a separate `MLBStatusPayload` interface PR |
| E | Pipeline run timestamps ~3h old while model refreshed 12m ago | Architecture explained: pipeline runs on schedule, model refreshes on demand |

---

## SQL Migrations Written

| File | Repo | Status | DB Target |
|------|------|--------|-----------|
| `supabase/migrations/20260621004109_mlb_get_status_dashboard_rpc.sql` | World-Hub | ✅ Committed (mirror — already live) | MLB Supabase |
| `supabase/migrations/20260621150001_status_page_indexes.sql` | Engine | ✅ Applied to live DB 2026-06-21 | MLB Supabase |
| `supabase/migrations/20260621150002_v_model_health_view.sql` | Engine | ✅ Applied to live DB 2026-06-21 | MLB Supabase |

Applied via `supabase db query --linked -f <file>` (Management API — no DB password needed).
Post-apply: `games_in_slate=15, games_in_run=15` confirmed flowing through RPC + status page.

---

## 8 Immutable Rules Check

- ✅ No `.single()` calls
- ✅ All hook/icon imports used
- ✅ No module-scope `createClient` (fixed this session)
- ✅ API uses `getMlbSupabase()` not raw client in route
- ✅ No `req.query.userId` trust
- ✅ No `.limit()` on arrays
- ✅ No emoji (only `—`/`·`/`•` punctuation)
- ✅ CORS restricted to smarter.poker in production

---

## Verification

4-agent swarm HTTP audit confirmed:
- `GET /hub/MLB-ANALYTICS/status` → 200 OK, ~48–140KB HTML
- `GET /api/mlb/status` → 200 OK, full JSON payload, all real data
- Zero `null`/`undefined`/`NaN`/`"Loading"` rendered in production HTML
- All 9 data sources green, all 7–12 pipeline stages success
- `get_status_dashboard()` RPC executes live in MLB Supabase DB
- Final post-fix API spot-check: `ok: true, isSystemFresh: true, pipeline: 7/7 OK`
- Accuracy: Brier ML=0.179, Props=0.137, 394 games evaluated
- Tier distribution: ELITE(1) STRONG(1) LEAN(2) THIN(1) PASS(1)
