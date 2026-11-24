# Trivia Phase 12 Legacy Retirement Inventory

**Status:** Audited Pre-Deletion Inventory (Gated on 7/7 Nightly Burn-In Certification)  
**Certification Gate:** `node scripts/trivia/verify-nightly-burnin.mjs` must report `7/7` (`certified: true`, `ledger_clean: true`, zero failed nights) across `2026-11-24` through `2026-11-30` America/Chicago BEFORE any deletion PR is opened.  
**Owner Policy:** Zero destructive drops or deletions before burn-in completion AND zero-traffic SQL proof below.

---

## 1. Pre-Deletion Traffic-Check SQL Queries (Read-Only)

Run all five read-only queries against production via `supabase db query --linked` immediately after the 7th consecutive green nightly burn-in (`2026-11-30` settled):

### 1.1 Legacy Solo Sessions (`engine_version IS NULL`) in Last 7 Days
```sql
SELECT mode,
       count(*) AS legacy_sessions_7d,
       max(created_at) AS last_legacy_at
  FROM public.trivia_sessions
 WHERE engine_version IS NULL
   AND created_at >= now() - interval '7 days'
 GROUP BY mode
 ORDER BY legacy_sessions_7d DESC;
```
**Pass Criterion:** `0` rows returned (100% of solo starts ran through V3 `trivia_start_solo_session_v3`).

### 1.2 Legacy PvP Matches (`engine_version IS NULL`) in Last 7 Days
```sql
SELECT status,
       count(*) AS legacy_pvp_matches_7d,
       max(created_at) AS last_legacy_pvp_at
  FROM public.trivia_pvp_matches
 WHERE engine_version IS NULL
   AND created_at >= now() - interval '7 days'
 GROUP BY status;
```
**Pass Criterion:** `0` rows returned (100% of PvP matches ran through Phase 5 `trivia_pvp_*_v2`).

### 1.3 Legacy Tournaments (`engine_version IS NULL`) in Last 7 Days
```sql
SELECT status,
       count(*) AS legacy_tournaments_7d,
       max(created_at) AS last_legacy_tournament_at
  FROM public.trivia_tournaments
 WHERE engine_version IS NULL
   AND created_at >= now() - interval '7 days'
 GROUP BY status;
```
**Pass Criterion:** `0` rows returned (100% of tournaments ran through Phase 6 `trivia_tournament_*` engine).

### 1.4 Legacy RPC Execution Counts (`pg_stat_user_functions`)
```sql
SELECT schemaname,
       funcname,
       calls,
       total_time
  FROM pg_stat_user_functions
 WHERE schemaname = 'public'
   AND funcname IN (
       'trivia_legacy_session_answer_v1',
       'trivia_legacy_session_answer_before_phase9_v1',
       'trivia_solo_spend_before_phase9_v1',
       'trivia_paid_skip_adopt_legacy_v1',
       'trivia_operator_execute_before_payout_control_v1',
       'trivia_tournament_field_v1',
       'trivia_tournament_bracket_v1',
       'trivia_tournament_match_v1',
       'trivia_tournament_results_v1',
       'create_trivia_pvp_session_v2',
       'enter_trivia_tournament_v2'
   )
 ORDER BY calls DESC, funcname ASC;
```
**Pass Criterion:** Record baseline call counts on Day 1 of burn-in and verify `delta_calls = 0` over the final 72 hours of burn-in (note `trivia_operator_execute_before_payout_control_v1` remains active until folded cleanly into `trivia_operator_execute_v1`).

### 1.5 Unjournaled / Legacy Solo Switch-Off Rows & Ledger Cleanliness
```sql
SELECT public.trivia_ledger_health_v1() AS ledger_health,
       (SELECT jsonb_build_object('key', key, 'enabled', enabled, 'updated_at', updated_at)
          FROM public.trivia_ledger_switches
         WHERE key = 'solo_journal') AS solo_journal_switch;
```
**Pass Criterion:** `ledger_health.healthy = true`, `ledger_health.exception_count = 0`, `ledger_health.metrics.legacy_rows_pending_backfill = 0`, and `solo_journal_switch.enabled = true`.

---

## 2. Legacy API Routes & Crons Catalog

| Path | Replacement / Authoritative Path | Retirement Action | Verification Prerequisite |
| :--- | :--- | :--- | :--- |
| `pages/api/trivia/submit.js` | `pages/api/trivia/session-submit.js` (V3 server-graded) | Delete route & update any remaining test pins | Query 1.1 = 0 legacy runs; verify zero 200 responses in Vercel logs (7d) |
| `pages/api/trivia/pvp-settle-match.js` | `pages/api/trivia/pvp/[action].js` + `trivia_pvp_settle_v2` + fenced recovery | Delete legacy V1 settlement route once V1 open matches = 0 | Query 1.2 = 0 AND `SELECT count(*) FROM trivia_pvp_matches WHERE engine_version IS NULL AND status NOT IN ('settled','cancelled','expired')` = 0 |
| `pages/api/trivia/tournament-lifecycle.js` | `pages/api/trivia/nightly/[action].js` + workers `/cron/trivia-nightly-tournament` | Extract shared `serviceClient`/`deterministicOptionOrder` helpers to `src/lib/trivia/`, then retire legacy HTTP lifecycle handler | Query 1.3 = 0; confirm no callers import handler endpoint |
| `pages/api/trivia/tournament-round-questions.js` | `pages/api/trivia/nightly/[action].js` (`action=play`) | Delete after confirming zero legacy active tournaments | Query 1.3 = 0 |
| `pages/api/trivia/tournament-submit-round.js` | `pages/api/trivia/nightly/[action].js` (`action=play`) | Delete after confirming zero legacy active tournaments | Query 1.3 = 0 |
| `pages/api/trivia/tournament-enter.js` | `pages/api/trivia/nightly/[action].js` (`action=enter`) | Keep thin compatibility alias or retire after client telemetry confirms zero hits | Verify zero requests in Vercel logs (14d) |
| `pages/api/cron/trivia-tournament-tick.js` | Hetzner workers `/cron/trivia-nightly-tournament` via OpenClaw | Retire legacy Vercel tick route & remove from `vercel.json` if still listed | Confirm `cron_execution_log` shows zero Vercel executions and 100% OpenClaw owner ticks for 7 nights |

---

## 3. Legacy Solo & Competitive Code Paths Inside Retained Files

| File | Legacy Code Block | Replacement | Retirement Action |
| :--- | :--- | :--- | :--- |
| `pages/api/trivia/session-start.js` | Legacy non-V3 solo draw (`serveExistingSoloSession`, `create_trivia_session_v2` direct call, `FREE_FALLBACK_SOURCE`, `trivia_shadow_compare_v1`) and legacy V1 PvP (`startPvpSession` non-`engine_version` branch) | `startOrResumeSoloV3` + `serveV2PvpSeat` | Remove legacy solo/PvP branches once Query 1.1 & 1.2 = 0 and `TRIVIA_P3_SOLO_ENGINE_V3=true` is permanent default |
| `pages/api/trivia/daily.js` | Legacy `daily_date` + `buildRosterFromPool` fallback branch | `resolveV3DailyRoster` (`trivia_build_roster_v1`) | Keep minimal degraded static fallback or fail-closed after V3 daily roster stability verified 7/7 days |
| `pages/api/trivia/session-answer.js` | Legacy non-V3 answer branch (`trivia_legacy_session_answer_v1`) | `trivia_session_answer_v4` | Remove once zero open legacy sessions exist (`SELECT count(*) FROM trivia_sessions WHERE engine_version IS NULL AND status = 'open'` = 0) |
| `pages/api/trivia/session-submit.js` | Legacy non-V3 grading branch (`trivia_session_settle_solo_v5` legacy path) | `trivia_session_submit_v3` | Remove once zero open legacy sessions exist |
| `src/lib/triviaQuestionLoader.js` | Client-side pool loader (`fetchRandomQuestionPool`, `filterAndShuffle`, `loadQuestionsForUser`) | Server-side V3 `trivia_build_roster_v1` | Retain only `recordQuestionsSeen` / `getRecentlySeenIds` if still needed, delete legacy client question-fetch helpers |

---

## 4. Legacy UI Pages & Components Review

| Path | Current Role | Post-Burn-In Disposition |
| :--- | :--- | :--- |
| `pages/hub/trivia/survival.js` | Redirect-before-charge shim to `/hub/trivia/survival-game` | Retain permanent HTTP/client redirect (bookmarked URL); never charge on this route |
| `pages/hub/trivia/mtt.js`, `cash.js`, `icm.js`, `gto.js` | Strategy mode entry pages | Retain (active V3 modes); remove any remaining client-side fallback question loader imports once V3 is permanent |
| `src/components/trivia/TriviaGame.jsx` | Shared solo game engine component | Remove legacy non-server-graded fallback prop paths once `serverGraded` is unconditional |
| `src/lib/trivia/phase3Engine.mjs` | `isFreeLegacyFallbackEnabled`, `isShadowSelectorEnabled` flags | Sunset `TRIVIA_FREE_LEGACY_FALLBACK_ENABLED` and `TRIVIA_P3_SHADOW_SELECTOR` after V3 is permanent |

---

## 5. Legacy Database RPCs & Views Catalog (Post-Burn-In Deprecation)

**Rule:** Never `DROP TABLE` historical audit/quarantine/ledger tables (`competitive_quarantine`, `trivia_ledger_journals`, `trivia_ledger_lines`, `trivia_operator_events_v1`). Only revoke/retire superseded RPCs in a dedicated Tier-3 additive migration after Query 1.4 proves zero calls:

| Database Function / Object | Superseded By | Action After 7/7 Certification |
| :--- | :--- | :--- |
| `public.trivia_legacy_session_answer_v1` | `public.trivia_session_answer_v4` | Revoke `service_role` EXECUTE first; drop in follow-up migration after 7d zero calls |
| `public.trivia_legacy_session_answer_before_phase9_v1` | `public.trivia_session_answer_v4` | Drop after Phase 9 migration rollback window closes |
| `public.trivia_solo_spend_before_phase9_v1` | `public.trivia_paid_skip_v1` + ledger entry | Drop after Phase 9 rollback window closes |
| `public.trivia_paid_skip_adopt_legacy_v1` | V3 native paid-skip state | Drop once zero open legacy sessions remain |
| `public.create_trivia_pvp_session_v2` | `public.trivia_pvp_join_v2` (atomic seat binding) | Revoke `service_role` EXECUTE; drop after V1 PvP route removal |
| `public.enter_trivia_tournament_v2` | `public.trivia_tournament_enter_v2` | Already retired (`tournament_entry_retired`); drop stub after burn-in |
| `public.trivia_tournament_field_v1` | `public.trivia_tournament_field_v2` | Already revoked from `service_role`; drop after burn-in |
| `public.trivia_tournament_bracket_v1` | `public.trivia_tournament_bracket_v2` | Already revoked from `service_role`; drop after burn-in |
| `public.trivia_tournament_match_v1` | `public.trivia_tournament_match_v2` | Already revoked from `service_role`; drop after burn-in |
| `public.trivia_tournament_results_v1` | `public.trivia_tournament_results_v2` | Already revoked from `service_role`; drop after burn-in |
| `public.trivia_shadow_compare_v1` | V3 direct serving (`trivia_start_solo_session_v3`) | Retire once `TRIVIA_P3_SHADOW_SELECTOR` is retired |

---

## 6. Post-Burn-In Retirement Sequence

1. Run `node scripts/trivia/verify-nightly-burnin.mjs` and archive the `7/7` certified JSON receipt on SSD2 archives.
2. Run all 5 SQL queries in Section 1 and confirm every pass criterion is met.
3. PR A (Application): remove legacy API routes/branches (Sections 2 & 3), update contract tests, deploy, and verify live routes.
4. PR B (Database, 72h after PR A): revoke `EXECUTE` on superseded RPCs (Section 5), verify zero errors in Supabase logs for 48h.
5. PR C (Database cleanup): drop revoked legacy RPCs outside `:50-:03 UTC` with full pre-flight MD5 checks and forward rollback notes.
