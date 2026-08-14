# CHECK 13: phantom columns — build, first triage, and what it caught
**Date:** 2026-08-14 | **Agent:** Claude (Cowork) | **Status:** gate live (warn-only), money paths fixed

## Why a column gate
Cron telemetry's first real catch was yt-pipeline-recovery failing every tick
on a 42703 (`video_transcode_jobs.attempts` didn't exist). CHECK 11 (phantom
TABLES) is blind to this class: the table exists, the COLUMN doesn't, and a
42703 behaves exactly like a 42P01 — swallowed error object, feature that
silently never works.

## The gate
`scripts/ci/check-phantom-columns.mjs` — walks every `.from('t')` chain and
validates select strings (paren-free only), filter-method first-arg columns,
and literal insert/update/upsert keys against the live PostgREST OpenAPI
per-table column definitions (764 tables). Conservative on purpose: embedded
selects, dotted/json paths, spreads and computed keys contribute nothing —
a column gate's false positives get it disabled. Calibration: trips on an
injected fake column; 6/6 sampled findings confirmed absent via
information_schema. Zero false positives observed.

Wired into build-safety-gate.yml as CHECK 13, WARN-ONLY (backlog 187 at
first run). Same doctrine as CHECKs 11/12: flip to blocking at zero.

## Fixed in this phase (187 -> 175)
1. **chip_escrow_holds (poker engine money path)** — ChipBridge + leave-club
   written against a schema that never shipped (player_id/table_id/'locked'
   vs live wallet_id/user_id/related_id/'held'). Escrow had NEVER written a
   row; leave-club's locked-chips guard was a no-op. Fixed to live schema;
   leave-club now fails CLOSED (503) when escrow state is unreadable.
2. **bankroll batch — five features that never worked:**
   - SessionHandReview recent-sessions list (result/date/venue -> 
     net_result/entry_date + location FK embed)
   - SavedReceipts (location_name -> location FK embed) — never loaded
   - Starting-bankroll audit ledger entry (is_adjustment key killed insert)
   - Custom bankroll rules — TWO stacked blockers, see lesson below
   - cashier-info cashout_status: selected `notes` (real: player_note/
     agent_note) so every real cashout 404'd; stage list used 'processing'
     which the status CHECK forbids — replaced with live vocabulary

## Migrations applied (Supabase MCP, with pre/post assertions)
- `20260814_bankroll_rules_custom_rule_fields` — additive label/description/
  unit (the UI reads all three with graceful fallbacks; designed feature)
- `20260814_bankroll_rules_allow_custom_rule_type` — rule_type CHECK was a
  closed enum of the 8 premade types; widened to also accept `custom\_%`

## Lesson recorded
**A phantom column can MASK a second blocker.** After adding the three
columns, the custom-rule insert still failed — on the rule_type CHECK enum.
Static gates prove a query is schema-legal; only a live write round-trip
proves the path works. For any never-worked write path: fix the columns,
then run one synthetic insert (and clean it up) before claiming the feature
is repaired. Both fixes here were verified by round-trip: insert succeeded,
junk rule_type still 23514, synthetic rows deleted.

## Remaining
175-finding backlog, triage by severity. Notable next: clip_usage_log.*
(content-engine horse alerting), agents.agent_tier/player_count,
arena_matches.status/started_at, active_tables.table_state,
club_announcements.pinned, profiles.bankroll_preferences.
