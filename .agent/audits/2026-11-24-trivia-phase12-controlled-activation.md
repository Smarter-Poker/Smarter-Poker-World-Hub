# Trivia Phase 12 Controlled Competitive Activation (2026-11-24)

## Root Cause Found & Fixed

During Phase 12 cutover rehearsal against live production canary evidence, four of five database cutover certificates (`pvp_public`, `tournament_public`, `tournament_horses`, `tournament_scheduler`) passed immediately, while `pvp_horses` failed on the verified October 8 human-horse PvP canary (`91fe9b26-a0ad-40c0-ae8a-c8cece9c3482`).

- **Cause**: Phase 2's authoritative `trivia_ledger_subsidy()` (`20260930043221_trivia_p2_ledger_foundation.sql`) adds a horse stake to both `trivia_settlements.held_total` and `trivia_settlements.subsidy_total` (`gross_pool = 20`, `held_total = 20`, `subsidy_total = 10`). `trivia_competitive_pvp_paid_ready_v1()` checked `s.held_total + s.subsidy_total = s.gross_pool`, double-counting the horse subsidy (`20 + 10 = 30 != 20`).
- **Fix**: Forward migration `20261124041500_trivia_pvp_horse_ready_subsidy_fix.sql` replaces the double-counting sum with the exact Phase 2 invariant (`s.held_total = s.gross_pool` and `s.subsidy_total = CASE WHEN m.match_kind = 'human_horse' THEN m.stake_amount ELSE 0 END`), guarded by exact predecessor MD5 (`34cf6358080e6cea095fd079057281c0`) and full PG17 before/after/rollback regression (`scripts/trivia/p12-cutover-replica-tests/50_pvp_horse_subsidy.sql`).

## Installed Migrations & Verified Readback

Installed atomically outside the `:50-:03 UTC` database break window on `2026-11-24T04:16Z`:

| Version | Name | Source / DB SHA-256 | Post-Apply Readback |
|---|---|---|---|
| `20261124041500` | `trivia_pvp_horse_ready_subsidy_fix` | `48048df893182277fbbc70ce84d22216369bc9359865450e574fe70591fc0620` | Post-image MD5 `317e488af036b2863246239c44572845`; `trivia_competitive_pvp_paid_ready_v1('91fe9b26-...') = true` |
| `20261124041600` | `trivia_p12_enable_competitive_certificates` | `cd7a03645b7d5daa8ace9a0f13d61b8333bcf3f96d3c6d394e8fd46d3c735d50` | All five cutover gates `enabled: true` at version 2 (`pvp_public`, `pvp_horses`, `tournament_public`, `tournament_horses`, `tournament_scheduler`); `ledger_clean: true`; `treasury.available: 25000` |

## Controlled Activation Sequence

1. Database cutover certificates installed and verified via `trivia_competitive_cutover_status_v1()`.
2. Server engine flags (`TRIVIA_TOURNAMENTS_ENABLED=true`, `TRIVIA_TOURNAMENT_HORSES_ENABLED=true`) enabled on the Hetzner workers VM before public UI activation.
3. Public route controls (`TRIVIA_PVP_ENABLED`, `TRIVIA_PVP_HORSES_ENABLED`, `TRIVIA_TOURNAMENTS_ENABLED`, `TRIVIA_TOURNAMENT_HORSES_ENABLED`) enabled on canonical Vercel `hub-vanguard` production.
4. Canonical OpenClaw nightly tournament schedule (`TRIVIA_NIGHTLY_TOURNAMENT_SCHEDULE_ENABLED = True`) merged and deployed via `deploy-openclaw.yml` to create and run the 8:00 PM `America/Chicago` nightly tournaments.
5. World Hub Trivia card visibility (`src/config/ownerOnlyHubCards.js`) stays owner-only per the October 11 owner direction while the seven consecutive real nightly events accumulate.
