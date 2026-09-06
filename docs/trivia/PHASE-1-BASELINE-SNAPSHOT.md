# Trivia Phase 1 Production Baseline

Target: linked Supabase project `kuklfnapbkmacvwxktbh`  
Query pack: `scripts/trivia/phase1-competitive-baseline.sql`  
Query-pack SHA-256: `0729cfd01085ed76008ce3b824839d49b88abfe60921fd2ff070295717d420c2`  
Safety mode: one PostgreSQL `READ ONLY` transaction

The query pack was executed against the linked production database before the
Phase 1 migration. It returns aggregate/catalog evidence only and no user IDs,
names, emails, question text, answers, or transaction references.

## Pre-deploy capture

Captured at: `2026-09-06 11:45:49.906278 UTC`  
Artifact: `docs/trivia/evidence/phase1-predeploy-20260906-1145utc.txt`  
Artifact SHA-256: `ddd40a1ad14bc50ac1e39fe9995a5b7ce9633a231fcdb366912fbc4f97c762c5`

| Measure | Result |
|---|---:|
| PvP matches | 4 |
| Abandoned PvP matches | 4 |
| Active/settling PvP matches | 0 |
| PvP queue rows | 11 |
| Waiting PvP queue rows | 0 |
| PvP sessions | 3 |
| PvP refund rows | 488 |
| PvP refund net | +14,240 diamonds |
| PvP stake rows | 3 |
| PvP stake net | -120 diamonds |
| Tournaments | 5 |
| Active/upcoming tournaments | 0 |
| Tournament entries | 208 |
| Alias-trigger function MD5 | `76d93b03326225f21c330b38d77e63af` |
| Dedicated session links present | no |
| Player active-seat registry present | no |
| Competitive quarantine present | no |
| Immutable settlement decisions present | no |
| Atomic PvP settlement function present | no |

The same full pack also inspected match/session linkage, queue invariants,
competitive transaction reference coverage, tournament payouts/ranks, RLS, policies,
table and column grants, function ACLs, trigger definitions, constraints, indexes,
columns, and realtime-publication membership. The Supabase Management API emits the
last result set to the CLI, so the final aggregate is deliberately timestamped and
kept last; the migration itself repeats exact security/schema assertions and aborts
atomically if any postcondition is false.

## Post-deploy capture

Captured at: `2026-09-06 12:36:51.181204 UTC`  
Artifact: `docs/trivia/evidence/phase1-postdeploy-20260906-1236utc.txt`  
Artifact SHA-256: `bab66580b0e429cf221c7ce12ccac14cf63ad778054dce76b51f68e6395f5ad9`

| Measure | Result |
|---|---:|
| PvP matches | 4 |
| Abandoned PvP matches | 4 |
| Active/settling PvP matches | 0 |
| PvP queue rows | 11 |
| Waiting PvP queue rows | 0 |
| PvP sessions | 3 |
| PvP refund rows | 488 |
| PvP refund net | +14,240 diamonds |
| PvP stake rows | 3 |
| PvP stake net | -120 diamonds |
| Tournaments | 5 |
| Active/upcoming tournaments | 0 |
| Tournament entries | 208 |
| Alias-trigger function MD5 | `ee5b33e4582a674194055a5e2e516b80` |
| Dedicated session links present | yes |
| Player active-seat registry present | yes |
| Competitive quarantine present | yes |
| Immutable settlement decisions present | yes |
| Atomic PvP settlement function present | yes |

The before/after economic and lifecycle totals are identical. The only intended
differences are the new fail-closed security structures, the replayable score-only
alias trigger, normalized session links/active seats, immutable quarantine and
settlement evidence, tighter grants/RLS, and the atomic settlement authority. The
compact postcondition row reports every required boolean as `true`; the direct
production verifier independently reports `52 passed, 0 failed`, including 70
rollback-only anonymous/authenticated abuse probes.
