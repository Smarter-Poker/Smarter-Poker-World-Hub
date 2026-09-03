# /horses Operator Console - Industry-Standard Overhaul Plan

Written 2026-09-02 by the Cowork horses session. Repo: Smarter-Poker-World-Hub (console) with engine-side work in Smarter-Poker-Club-Arena where a phase says so.

Inputs (all in this session's research folder, summarised here so the plan stands alone):

- Research A: regulated iGaming / online-poker back-office standard (GLI-19, UKGC RTS, MGA, GGPoker ecology policy, Playtech IMS, SoftSwiss, EveryMatrix, EvenBet, Cubeia). 339 line items.
- Research B: club-app admin standard (PokerBros, PPPoker, ClubGG, Upoker, X-Poker, Pokerrrr 2, Suprema, WePoker, plus PA Tools / Rakebooks / PPH.Poker). 274 line items.
- Audit C: line-by-line audit of the current /horses console (16 tabs, 3 sub-pages, 16 API routes, 5 shared libs). 40 ranked defects.
- Inventory D: what already exists elsewhere (Club Arena has the club-owner / union / agent surfaces: members, cashier, blacklist, anti-cheat, disputes, financials, settlement, promo vault, union ops, drift incidents, financial admin hub, engine dashboard). Production DB has 976 public tables including collusion_tracking, ca_collusion_signals, anti_cheat_flags, responsible_gaming_limits, kyc_events, user_reports, live_help_tickets, ca_drift_incidents, engine_maintenance_break, ca_break_scorecards, club_entry_feature_flags, admin_audit_log (with before/after state), ca_cert_accounts.

## 0. What /horses is, and what it is not

/horses is the PLATFORM OPERATOR back office (the "god panel" in club-app terms). It is not the club owner's panel and not the union manager's panel; those live in Club Arena at /clubs/:id/* and /unions/:id/* and stay there. The operator console's job is everything the operator owes the whole platform:

1. The fleet of simulated players (horses) - the one thing no vendor sells a console for.
2. Platform-wide player lifecycle, integrity, protection and support.
3. Money supply, conservation and finance reporting across every club and union.
4. Operations of the floor: tables, tournaments, unions, clubs, cashier queues, at platform scope.
5. Release, maintenance, observability, incidents.
6. Access control and audit over all of the above.

Binding rules carried into every phase: horses are players (identified, never excluded, never called bots); no money path bypasses fn_ca_mint / fn_ca_burn / fn_ca_fund_club and the chip ledger; Title Case copy, no em dashes, no emoji, no raw hex in pages/horses; every write audited through one shape; every route service-role-required and rate limited; nothing merges without Dan (draft PRs are the brake); every phase reported only with evidence.

## 1. Gap analysis - the complete list

Legend: [HAVE] exists and works, [PARTIAL] exists but incomplete or broken, [MISSING] does not exist, [ELSEWHERE] exists in Club Arena and should be linked or embedded rather than rebuilt.

### 1.1 Foundation and safety of what exists (Audit C)

F1 [PARTIAL] Service-role key silently falls back to the anon key on 9 of 16 routes; reproduces RLS blindness while reporting success.
F2 [PARTIAL] Three different admin_audit_log write shapes; some reachable routes write none (approve-cashout, anti-cheat, union-application, promo).
F3 [PARTIAL] Rate limiting is in-memory per lambda; durable limiter exists and is unused on the money and fleet routes.
F4 [PARTIAL] Mint route: float-precision rejection of valid 2dp amounts; Postgres error text leaks to browser; ledger has no pager; confirm modal is not a dialog.
F5 [PARTIAL] Auth helper duplicated 12 times; four hg-* routes do a GoTrue network call per request; analytics.js builds a client per request.
F6 [MISSING] React error boundary; one throw white-screens 16 tabs.
F7 [MISSING] URL state (?tab=, ?section=): no bookmarks, refresh loses place, Back does nothing.
F8 [PARTIAL] Accessibility: nav is not a tablist; Horse and Promo modals lack focus traps; colour-only statuses.
F9 [PARTIAL] Pagination missing on 10 surfaces (bug reports unbounded and under operator RLS; cashouts 100; clubs 200; unions 100; members 300; agents 200; hg reports/appeals 100; anti-abuse 100; fleet summary 40 silent).
F10 [PARTIAL] Reviews search filters only the loaded page.
F11 [PARTIAL] MAX_BULK 600 vs 1,000+ fleet; Select All then fails.
F12 [PARTIAL] Validation gaps: review_id / rating / days unvalidated; malformed ids become 500s.
F13 [PARTIAL] CSV exports export the current page only and drop the JSON columns.
F14 [PARTIAL] Dead code: handleGrinderAction, triggerPipeline (all callers hard-disabled), horsePresence.js; two 501 stub routes.
F15 [PARTIAL] House-rule violations: emoji in two libs, 96 raw hex literals in the three sub-pages, em dashes in comments.
F16 [PARTIAL] Performance: whole content_authors roster select('*') on mount and on every 2s sync tick; player_stats materialised per grinder call; audit actor list rescans 5,000 rows per page; realtime on the whole tables table; scraper polling ignores document.hidden; no memoisation in a 6,000-line component.
F17 [PARTIAL] generate-avatars: NaN style index on UUID ids, unbounded remote image fetch, module-scope client, non-constant-time secret compare.
F18 [PARTIAL] Settings reader and writer can address different content_settings rows.
F19 [PARTIAL] Anti-abuse ships raw_email after PII was removed elsewhere.
F20 [PARTIAL] Tests: only a contract test for the merch route; nothing for auth, validation, audit shape, or the money route.

### 1.2 Fleet operations (Research A section 16, Audit C 2.11, memory of the HorseFleetManager work)

H1 [PARTIAL] Fleet roster: content_authors-based, paginated client-side, no state (idle / seated / playing / busted / suspended / retired), no current table, stack or last action.
H2 [MISSING] Fleet health summary: counts by state, stuck seats, no heartbeat, capacity headroom vs seat-fill targets.
H3 [MISSING] Per-horse 360: profile, poker profile, club memberships, bankroll by club, sessions, hands, P&L, reviews, bug reports, decision latency, audit trail.
H4 [MISSING] Per-club allocation quota, seat-fill target per table type, max horses per table, minimum-humans policy, time-of-day schedule, stake-band and variant eligibility per horse - all currently hardcoded in the engine (DEFAULT_TABLES, HorseBehavior) with no operator control.
H5 [MISSING] Global, per-club and per-cohort kill switch and pause-new-seatings mode, honoured by the engine at the next hand boundary.
H6 [PARTIAL] Funding: horse-launch.js calls mass_fund_horses(500000) outside the ledger; engine already funds through fn_horse_fund_from_treasury. The console must never fund outside the ledger.
H7 [BROKEN] horse-launch.js launch_all creates 117 duplicate tables per press, 700-1,500 sequential round trips, caps at 350 horses, UTC schedule drift; the engine's HorseFleetManager already owns seeding. Retire it.
H8 [MISSING] Fleet P&L and chip-conservation report per club / stake / day, separated from rake; unaccounted-exit alarm surfaced for horses.
H9 [MISSING] Behaviour-profile mix view and control (lanes, stake bands, styles) with the same maker-checker as any money-affecting setting.
H10 [MISSING] Fleet anomaly detection surface: win rate, seating rate, action-timing distribution vs historical band (data exists: horse_daily_nets, horse_decision_latency, horse_session_stats).
H11 [MISSING] Fleet register and disclosure record (GLI-19): authoritative list, owner entity, funding source, creation date, attestation.
H12 [MISSING] Isolation report: which club each horse plays in and proof that no horse has open seats in two scopes (Dan's DSS-only ruling).
H13 [PARTIAL] Grinder tab club-management buttons are permanently disabled placeholders; Pipeline tab is a stub.

### 1.3 Player lifecycle, protection and support (Research A sections 1, 2, 5, 15; Research B sections 3, 12, 13)

P1 [PARTIAL] Platform-wide player search exists only inside the Club Arena tab (users section) with a thin detail view.
P2 [MISSING] Player 360: identity, KYC state, RG state, clubs and roles, wallets per club, recent sessions and hands, transfers, flags, tickets, reports, notes, tags, audit trail, horse badge.
P3 [MISSING] Account state machine with reason-coded actions: suspend, restrict (no cash, no tournaments, no transfers), force-logout / kick, unsuspend, with expiry and note; every action audited with before/after.
P4 [MISSING] Operator notes and tags on a player.
P5 [MISSING] KYC queue and event viewer (kyc_events exists; no surface).
P6 [MISSING] Responsible gaming console: view and set limits, self-exclusion, cooling-off, reality-check interval (responsible_gaming_limits exists; decreases immediate, increases held 24h).
P7 [MISSING] Markers-of-harm queue (loss chasing, session length, late-night play) with recorded interventions.
P8 [PARTIAL] Support: live_help_tickets shown as Bug Reports only (resolve / reopen); no assignment, priority, SLA, internal notes, or link to the player 360.
P9 [MISSING] User reports queue (user_reports exists) and platform-wide appeals.
P10 [ELSEWHERE] Blacklist per club exists in Club Arena; a platform-wide restriction list is missing.
P11 [MISSING] Data-subject tooling at platform scope (export, erase) - only the Home Games GDPR scrub exists.

### 1.4 Game integrity (Research A section 6; Research B section 12)

I1 [PARTIAL] Collusion: collusion_tracking (169K rows) and ca_collusion_signals exist with pairwise net flow; Club Arena AntiCheatPage calls detect_collusion_pairs per club; no platform-wide review queue with case state.
I2 [PARTIAL] anti_cheat_flags exist with review columns; the console only shows flags inside a club drill-down.
I3 [MISSING] Multi-accounting link graph over IP / device / signup abuse data (signup_abuse_log exists).
I4 [MISSING] Chip-dumping detection wired to both integrity and money views (pairwise transfer matrix, UKGC RTS 11A).
I5 [MISSING] Bot / RTA indicators for humans: action-timing distribution, solver deviation; horses' own timing is already recorded (horse_decision_latency) and must be shown next to humans, not instead of them.
I6 [MISSING] Case management: open case, attach evidence (hands, pairs, flags), assign, decide, sanction ladder (warning, restriction, suspension, confiscation with victim redistribution), appeal.
I7 [PARTIAL] Hand history search and replay links exist (Club Arena /hand-history, /share/hand/:id); the operator console has no investigator search.
I8 [MISSING] Sanction ledger and shared restriction list across clubs.

### 1.5 Floor operations: tables, tournaments, unions, clubs, cashier (Research A 7-9; Research B 1-9)

O1 [PARTIAL] Live floor: platform pulse KPIs exist; no live table list with seats, stake, hands/hour, horses vs humans per table, and controls (pause, close at hand boundary, park).
O2 [MISSING] Tournament oversight: running / upcoming / late-reg schedule across every club and union, registrations, overlay and guarantee exposure, cancel / refund, payout audit (tournaments, tournament_players, tournament_payouts exist).
O3 [PARTIAL] Club oversight: list capped at 200, drill-down exists; missing club health (treasury, member chips, stop-loss vs deposit, settlement status), suspend with reason, funding via fn_ca_fund_club with maker-checker.
O4 [PARTIAL] Union oversight: read-only cards; missing member clubs, rake share, settlement rounds, presettlements, applications and leave requests are in a separate section.
O5 [PARTIAL] Cashier queues: pending cashouts (100 cap) approve / cancel; chip_requests queue missing; no pagination, filters, bulk, SLA ageing, or maker-checker above a threshold.
O6 [MISSING] Rake reports by club / union / stake / day with export; rake method and cap audit (rake_rate_audit exists).
O7 [MISSING] Download centre: every list exportable as a full CSV (not the loaded page), with a job record.
O8 [MISSING] Announcements / broadcast from the operator to all players, a union, or a club (club_announcements, union_announcements, notifications exist).

### 1.6 Economy, promotions and finance reporting (Research A 4, 10, 11; Research B 9-11)

E1 [HAVE] The Mint (issue / retire with idempotent op ids and a ledger) - keep, fix F4.
E2 [PARTIAL] Supply and conservation: drift incidents, burn-in gate, supply snapshots live in Club Arena (/financial-incidents, fn_ca_incident_dashboard); the operator console should embed the summary and deep-link.
E3 [PARTIAL] Economy tab is diamonds-only and read-only; chip economy (supply by store, velocity, mint / burn, treasury by club) is missing.
E4 [MISSING] Rakeback and leaderboard payout oversight (rakeback_periods, rakeback_period_payouts, leaderboard_payout_batches / failures exist).
E5 [MISSING] BBJ pool oversight (bbj_pools, bbj_payouts, bbj_winners exist; Club Arena has per-club jackpot page).
E6 [PARTIAL] Promo codes exist; promotions (promotions, promo_distributions, promo_wagering_ledger) and bonus abuse view are missing.
E7 [MISSING] Finance reports: daily close, weekly revenue digest, per-club P&L, regulatory-style exports (key events, exclusions, configuration changes).

### 1.7 Platform controls and observability (Research A 13, 14)

C1 [PARTIAL] Engine dashboard exists in Club Arena (259 lines, profile-gated); the operator console has no engine view: hands/sec, active tables, seated players, action latency, break scorecards (ca_break_scorecards), deploy dispatch log, freeze marks.
C2 [PARTIAL] Maintenance break: engine_maintenance_break table with phase / reason / enforce_freeze; no console control or status.
C3 [PARTIAL] Feature flags: club_entry_feature_flags (key, enabled, rollout_percent) exists for one domain; no general flag registry or UI.
C4 [MISSING] Kill switches per risky path (fleet, tournaments registration, cashouts, mint) with audit.
C5 [PARTIAL] Cron health (cron_execution_log, fn_ca_cron_failure_watch) and alerts (engine_alerts, deploy_alerts, financial_alerts) have no single operator view.
C6 [HAVE] Scraper health (read-only).
C7 [MISSING] Incident list at platform scope (ca_drift_incidents plus engine and deploy alerts) with acknowledge.

### 1.8 Access control and audit (Research A 12)

A1 [PARTIAL] One flat role tier ['admin','superadmin','god'] in 12 files; ticket triage and minting share one grant.
A2 [MISSING] Named permissions and roles (owner, operations, finance, compliance, support, read-only) resolved server-side; UI reflects capability.
A3 [MISSING] Maker-checker (four-eyes) on money moves above a threshold: mint / burn, club funding, cashout approval, fleet bankroll policy, sanctions with confiscation.
A4 [PARTIAL] Audit log viewer exists; missing target_id filter, per-record trail, session and IP columns, full export, and the missing writers (F2).
A5 [MISSING] Staff directory: who has which role, last login, MFA state, grant / revoke with audit.

### 1.9 Console architecture (Audit C section 3)

X1 [PARTIAL] One 5,972-line component, ~120 useState, no store, no memoisation, no code splitting; new tabs must not be added to it.
X2 [MISSING] Shared client primitives: authFetch hook, paged-table hook with server totals, Modal, DataTable, KPI tile, StatusPill, ConfirmDialog, CSV job.
X3 [MISSING] Shared server primitives: requireOperator(permission), audited(action) wrapper, paged(query) helper, validated ids.
X4 [PARTIAL] Mobile and accessibility are good in the main CSS and reimplemented ad hoc in the three sub-pages.

## 2. Build order and phases

Ten phases. Order is chosen so that every later phase is built on hardened primitives, the money paths are protected before new writers exist, and the fleet (the item with no vendor template) comes as soon as its safety rails are in place.

### Phase 1 of 10 - Foundation and hardening (this session)

Scope: F1-F20, X2 (first primitives), X3, plus the scaffolding every later tab uses.

Deliverables:
1. src/lib/horses/operatorAuth.js - one requireOperator(req, { permission }) helper: local JWT verification, memoised service-role client that THROWS without SUPABASE_SERVICE_ROLE_KEY, role lookup, permission check (Phase 1 ships the permission vocabulary with god / superadmin / admin mapped to all permissions so behaviour is unchanged until Phase 2 adds roles).
2. src/lib/horses/operatorAudit.js - one audit(req, actor, { action, targetType, targetId, before, after, details }) that always writes actor_role, request_id, user_agent, ip, before / after. Every route in the console uses it; the three reachable routes outside the console that write nothing (approve-cashout, anti-cheat, union-application) are wired to it.
3. src/lib/horses/operatorApi.js - withOperatorRoute(handler, { methods, permission, limit, durable }) wrapper: method check, auth, rate limit (durable on money and fleet routes), error scrubbing (no Postgres text to the browser), reportApiError, uniform { ok, error, requestId } envelope.
4. src/lib/horses/validate.js - isUuid, int(range), enumOf, money2dp (string-parsed, no float compare), paging(limit, offset, max) with total.
5. All 16 routes migrated to the wrappers; anon fallback removed everywhere; all validation gaps closed; pagination with total on every list section (cashouts, clubs, unions, members, agents, bug reports, hg reports and appeals, anti-abuse log, mint ledger, fleet summary); reviews search server-side; MAX_BULK chunked; settings row ordering fixed; raw_email masked; grinder GET rate limited; audit actor list from a cached distinct query; generate-avatars hardened (hash style, timeout, size and type checks, constant-time compare, no module-scope client).
6. horse-launch.js: launch_all and shutdown are RETIRED (410 Gone with a message that the engine's HorseFleetManager owns seeding); status stays; mass_fund_horses is never called from the console again.
7. Client: React error boundary per tab; ?tab= and ?section= mirrored to the URL; ARIA tablist / tab / tabpanel with arrow keys; one shared Modal (focus trap, Escape, restore) used by Mint confirm, Horse edit, Promo edit; Mint ledger pager; Bug Reports moved to a paged service-role section; dead code removed; disabled placeholders replaced with honest "Not Built Yet" states; scraper polling respects document.hidden; roster read selects only rendered columns and only when the Stable tab is active; hex literals in the three sub-pages replaced with tokens; emoji and em dashes removed from source.
8. Tab registry made lazy (next/dynamic) so new tabs from Phase 2 onward are separate modules; the shared client primitives (useOperatorFetch, usePagedList, DataTable, KpiTile, StatusPill, ConfirmDialog, exportAllCsv) live in src/components/horses/.
9. Tests (node --test): unit tests for validate.js, operatorAuth permission mapping, operatorAudit shape, operatorApi envelope and error scrubbing, money2dp; contract tests asserting every pages/api/horses route imports the wrapper and none contains the anon fallback string, none calls mass_fund_horses, every mutating route calls audit(); lint and next build green.

### Phase 2 of 10 - Access control, maker-checker and audit
A1-A5, F2 remainder. Tables: operator_roles, operator_role_grants, operator_permissions (seeded), operator_approvals (maker-checker queue with threshold policy), staff directory tab, approvals tab, audit tab upgrades (target filter, per-record trail, full export). Mint, club funding and cashout approval above threshold go through approvals.

### Phase 3 of 10 - Fleet Command Center (console + engine)
H1-H13. Tables: ca_horse_fleet_policy (global and per-club: enabled, pause_new_seatings, quota, occupancy targets, max per table, min humans, stake bands, variants, schedule), ca_horse_fleet_heartbeat / state view. Engine: HorseFleetManager reads policy each cycle, honours kill switch at hand boundary, publishes heartbeat and per-horse state. Console: Fleet tab replaces Grinder (roster with server paging and state, health, per-club allocation, policy editor behind maker-checker, per-horse 360, isolation report, fleet P&L, register and attestation). Pipeline stub removed or implemented.

### Phase 4 of 10 - Player 360, account controls, protection and support
P1-P11. Tables: operator_player_notes, operator_player_tags, account_restrictions (state machine with reason codes and expiry). Player tab: search, 360, actions, KYC events, RG limits and exclusions with the 24h increase hold, tickets with assignment and SLA, user reports, appeals, platform restriction list, data-subject export / erase.

### Phase 5 of 10 - Game integrity and case management
I1-I8. Tables: integrity_cases, integrity_case_items, sanctions. Integrity tab: collusion queue (ca_collusion_signals and collusion_tracking), flags queue (anti_cheat_flags), link graph (signup_abuse_log, device and IP), chip-dumping pairwise matrix, timing distributions for humans and horses side by side, investigator hand search, case workflow and sanction ladder with victim redistribution through the ledger.

### Phase 6 of 10 - Floor operations
O1-O8. Live floor with table controls (hand-boundary close / park through engine RPCs), tournament oversight (schedule, overlay exposure, cancel / refund through existing RPCs), club and union health and oversight, cashier queues (cashouts and chip_requests) with filters, ageing, bulk and thresholds, rake reports, announcements / broadcast, download centre with full-export jobs.

### Phase 7 of 10 - Economy and finance reporting
E1-E7. Chip economy dashboard (supply by store, mint / burn, velocity, treasury by club), drift and burn-in summary embedded from fn_ca_incident_dashboard with deep links, rakeback and leaderboard payout oversight, BBJ pools, promotions and bonus abuse, daily close and weekly digest, regulatory-style exports.

### Phase 8 of 10 - Platform controls and observability
C1-C7. Engine view (hands/sec, tables, seats, latency, break scorecards, deploy dispatch, freeze marks), maintenance-break status and controls, general feature-flag registry with rollout percent, kill switches per risky path, cron and alert health, incident list with acknowledge.

### Phase 9 of 10 - Console architecture completion
X1, X4. Extract the remaining legacy tabs out of index.js into modules on the Phase 1 primitives, zustand store for shared operator state, virtualised tables, code-split bundles, sub-pages folded into tabs with the shared design tokens, mobile and accessibility pass, Playwright smoke run over every tab.

### Phase 10 of 10 - Verification, documentation and handoff
End-to-end verification against production data (read-only), operator runbook per tab, permission matrix document, GLI-19 disclosure and fleet register document, final gap re-score against Research A and B, and the handoff document.
