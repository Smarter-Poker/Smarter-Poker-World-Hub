# Phase 3 contracts - The Fleet Command Center

Binding for every agent building Phase 3. Phase 1 and Phase 2 contracts still apply in full.

Phase 3 spans TWO repositories:
- World Hub (this repo): the console tab, its API route, and the migration.
- Club Arena (~/Documents/club-arena, worktree ~/Documents/.agent-trees/club-arena/cowork-horses, branch agent/cowork-horses/stable-admin-overhaul): the engine, `server/src/services/HorseFleetManager.ts` and friends. Its commit messages must contain "club-arena".

## 0. The safety rule that outranks everything here

THE FLEET KEEPS RUNNING EXACTLY AS IT DOES TODAY UNTIL A POLICY ROW SAYS OTHERWISE, AND NO CONTROL MAY REACH INSIDE A HAND.

- Every new table and column is additive. With NO policy row, or an unreadable one, the engine behaves byte-for-byte as it does now: the seeded defaults are the values already hardcoded in HorseBehavior/HorseFleetManager, and the engine's policy read fails OPEN to those hardcoded values.
- The kill switch stops NEW seatings. It never removes a seated horse mid-hand and never cancels a hand in progress. A stopped fleet drains through the paths that already exist: the session rotator, the human-waiting release, bust-outs. There is no new eviction mechanism.
- HORSES ARE PLAYERS (CLAUDE.md 10.5). Nothing in this phase may deny a horse anything a human gets. Quotas and targets shape HOW MANY horses take seats, never how a seated horse is treated: same timers, same pauses, same rules, same pay. Any include-horses style parameter defaults to true.
- Money is untouched. This phase adds no chip movement. Fleet funding continues through the paths that exist today; the console never funds a horse.
- Policy changes above the material line go through the Phase 2 approvals queue as kind `fleet_policy` (that kind already exists). Everything else writes directly and is audited.

**Post-build correction, 2026-09-03 (adversarial review H-1 and M-7, fixed in `src/lib/horses/fleetPolicy.js` and mirrored line for line in `fn_ca_fleet_set_policy`).** The material list above named four cases: enabling or disabling the fleet, pausing new seatings, moving a per-club quota by more than 25 percent, and setting or clearing one. Five of the remaining steering fields can stop the whole fleet taking a seat anywhere on the platform and every one of them was below the line, so a single operator could apply any of them with the console saying "This Change Will Be Applied Now": `occupancy_bias` at 0.1 on the global row scales every table's seat target to a tenth, `min_humans_to_seat` at 10 can never be met because ten seats is the widest table, and a `stake_bands`, `variants` or `schedule` restriction narrows eligibility to nothing or to one hour a day. The per-change percentage also had no floor, so thirteen sub-25-percent cuts took a club from 100 horses to 3 with no approval at any step. MATERIAL NOW MEANS, and the console, the route and the database all compute it identically and in this order:

| Reason | When |
| --- | --- |
| `enabled_changed` | the fleet is enabled or disabled for this scope |
| `pause_changed` | new seatings are paused or resumed |
| `max_horses_set_or_cleared`, `max_per_table_set_or_cleared` | a cap appears or goes away (a change from unlimited has no percentage) |
| `max_horses_changed_from_zero`, `max_per_table_changed_from_zero` | a cap of zero moves (zero is not unlimited either) |
| `max_horses_cut_to_a_floor`, `max_per_table_cut_to_a_floor` | a cap is cut to 5 or below, whatever the step size |
| `max_horses_moved_more_than_25_percent`, `max_per_table_moved_more_than_25_percent` | a cap moves by more than a quarter, in either direction |
| `occupancy_bias_cut_below_half` | the bias is cut to 0.5 or lower |
| `occupancy_bias_moved_more_than_25_percent` | the bias moves by more than a quarter |
| `min_humans_to_seat_raised` | the human minimum goes up (lowering it gives seats back) |
| `stake_bands_narrowed`, `variants_narrowed`, `schedule_narrowed` | a restriction appears where there was none, or an existing one gets shorter |

A bankroll or buy-in value stays on the list in principle and cannot arise here: `ca_horse_fleet_policy` carries no such column. The cap floor is a floor and not a window: measuring a RUN of small cuts as one move needs a lookback over `admin_audit_log` inside the RPC and is deliberately left to a later phase, which `MATERIAL_CAP_FLOOR` says in as many words.

## 1. Database (World Hub supabase/migrations, applied to production and registered)

`ca_horse_fleet_policy(scope text, scope_id uuid null, enabled bool default true, pause_new_seatings bool default false, max_horses int null, max_per_table int null, occupancy_bias numeric default 1.0, min_humans_to_seat int default 0, stake_bands text[] null, variants text[] null, schedule jsonb null, notes text, updated_by uuid, updated_at timestamptz default now(), created_at timestamptz default now())` - primary key (scope, coalesce(scope_id, '00000000-0000-0000-0000-000000000000')). `scope` in ('global','club','union'). Seeded with ONE global row carrying today's effective defaults (enabled true, pause false, no caps, bias 1.0, min_humans 0, no band or variant restriction, no schedule) so reading it changes nothing.

`ca_horse_fleet_state(horse_id uuid primary key, state text, club_id uuid null, table_id uuid null, seat_index int null, stack numeric null, last_action_at timestamptz null, last_seen_at timestamptz not null, session_started_at timestamptz null, hands_this_session int default 0, lane text null, stake_band text null, bankroll numeric null, note text, updated_at timestamptz default now())` - `state` in ('idle','seated','playing','sitting_out','busted','suspended','retired','unknown'). Written by the engine once per seeding cycle, upsert.

`ca_horse_fleet_heartbeat(id bigint generated always as identity primary key, beat_at timestamptz default now(), cycle_ms int, horses_total int, horses_seated int, horses_idle int, horses_stuck int, tables_seen int, tables_seeded int, seats_filled int, seats_released int, policy_version timestamptz, degraded bool default false, detail jsonb)` - one row per cycle, the fleet's pulse. The console reads the newest and a 24h window.

`ca_horse_fleet_register(horse_id uuid primary key, disclosed bool default true, owner_entity text, funding_source text, created_at timestamptz, registered_at timestamptz default now(), retired_at timestamptz null, note text)` - the GLI-19 disclosure record: an authoritative list of every simulated account, its owner entity and funding source. Backfilled from profiles where is_horse is true.

RPCs (SECURITY DEFINER, service_role only, in-file REVOKE/GRANT, audited through fn_log_admin_action except pure reads):
- `fn_ca_fleet_policy_effective(p_club_id uuid) returns jsonb` - the global row merged with the club row (club wins field by field where not null), plus `source` naming which row supplied each value. This is what the ENGINE calls.
- `fn_ca_fleet_set_policy(p_scope text, p_scope_id uuid, p_patch jsonb, p_updated_by uuid, p_reason text) returns jsonb` - validates every field, refuses an unknown scope or a negative cap, upserts, audits with before/after.
- `fn_ca_fleet_state_upsert(p_rows jsonb, p_beat jsonb) returns jsonb` - the engine's one write per cycle: replaces the state rows it names and appends the heartbeat. No audit row (machine telemetry, not an operator action).
- `fn_ca_fleet_overview(p_window_minutes int) returns jsonb` - counts by state, stuck count (seated with no action inside N minutes), heartbeat freshness, capacity headroom, per-club allocation actual vs quota.
- `fn_ca_fleet_isolation_report(p_limit int, p_offset int) returns jsonb` - every horse holding open seats in more than one club scope right now, plus its clubs. Dan's DSS ruling: a horse plays inside its own club or union only. Empty is the correct answer.
- `fn_ca_fleet_pnl(p_from date, p_to date, p_club_id uuid) returns jsonb` - fleet chips won and lost by club, by stake, by day, from rows the platform already keeps (horse_daily_nets and the club dailies), separated from rake. READ ONLY.
- `fn_ca_fleet_register_sync() returns jsonb` - inserts a register row for every is_horse profile that lacks one, marks retired_at for profiles that no longer exist. Never deletes.

## 2. Engine (Club Arena repo)

- New `server/src/services/HorseFleetPolicy.ts`: loads `fn_ca_fleet_policy_effective` per club, caches 60 seconds, and EXPOSES THE HARDCODED DEFAULTS AS ITS FALLBACK. Every field the policy can carry has a named default equal to today's behaviour, and the module documents that a read failure returns those defaults.
- `HorseFleetManager` consults it once per cycle and honours, in this order: `enabled` false or `pause_new_seatings` true means seat nobody new this cycle (existing seats untouched); `max_horses` and `max_per_table` cap the seating loop; `occupancy_bias` scales the target `occupancyTargetFor` returns (clamped so a bias can never take a table below one seat); `min_humans_to_seat` withholds seating on a table with fewer humans than that (default 0 keeps today's behaviour); `stake_bands` and `variants` narrow eligibility; `schedule` (an array of UTC hour ranges) narrows when seating happens. Every one of these defaults to no change.
- The manager publishes state and a heartbeat every cycle through `fn_ca_fleet_state_upsert`, including `degraded: true` when the policy read failed.
- A stopped fleet must not thrash: when seating is withheld the cycle still runs, still prunes and still reports, so the console can see why nothing is being seated (`detail.reason`).
- Tests in the engine repo (vitest, alongside the existing Horse*.test.ts): policy absent means current behaviour unchanged (assert the same numbers the existing tests assert); enabled false seats nobody and removes nobody; pause_new_seatings likewise; a cap of N never seats N+1; bias cannot drop a table below one seat; min_humans_to_seat 2 withholds on a table with one human and seats on two; a policy read failure logs and uses defaults; the heartbeat records the cycle even when seating is withheld.

## 3. Console (World Hub)

New route `/api/horses/fleet-admin` (GET sections overview, roster, horse, policy, isolation, pnl, register, heartbeat; POST actions set_policy, sync_register). Permissions: reads `fleet.read`, writes `fleet.write`; a material policy change goes through requireApproval with kind `fleet_policy` exactly as the Mint does, and a 202 says so.

**Post-build correction, 2026-09-03 (adversarial review M-3).** `fleet.read` sits in the read floor that the `support` role holds; `money.read` does not, and it is what gates the Economy, Statistics and Mint tabs. So the two money-bearing sections check `money.read` for themselves, since `spec.permission` is per method and cannot speak per section: `?section=pnl` answers 403 with code `money_read_required`, and `?section=horse` answers normally but withholds `profile.diamonds` and `playRecord.totalProfit`, reporting `moneyVisible: false`. Nothing else on the route is narrowed, and no horse is withheld from any figure a human appears in.

The Grinder tab becomes Fleet (id `fleet`, label "Fleet Command"), keeping the id `grinder` as an alias so an old bookmark still lands. Sections:
- Health: heartbeat freshness (a stale heartbeat is stated loudly), counts by state, stuck seats, capacity headroom vs targets, the last cycle's reason when nothing was seated.
- Roster: server-paged, every horse with state, club, table, stack, last action, lane, stake band, bankroll; filters by state, club and band; CSV export of the whole filtered set.
- Horse: a per-horse 360 (identity and badge, club memberships, state, session, bankroll, recent hands and reviews if present, its register row, its audit trail through the Phase 2 trail RPC).
- Policy: the global row and every club row, edited through the same ConfirmDialog discipline as the Phase 2 policy panel, with the material-change warning naming the approval that will be raised.
- Isolation: the report, with an explicit "No Horse Is In Two Clubs" empty state.
- P and L: fleet chips by club, stake and day, with the rake column separated and a note that it is read from existing rows.
- Register: the GLI-19 list with a Sync action and a line stating the disclosure.

The Pipeline tab's Not Built Yet panel stays until its own phase.

## 4. Verification before Phase 4

Migration applied and registered; a rolled-back production sim proving the effective-policy merge, the caps, the isolation query and the register sync; engine tests green in the club-arena repo and its own PR opened; console tests green; lint, Title Case, silent-write, build, push, all CI checks green in both repos; then an adversarial review pass.
