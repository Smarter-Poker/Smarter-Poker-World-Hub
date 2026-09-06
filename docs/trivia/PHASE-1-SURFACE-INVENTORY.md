# Trivia Phase 1 Surface Inventory

Snapshot: September 6, 2026  
World Hub baseline: `d8109a3a29`  
Contract: `trivia-competitive/1.0.0-containment`

This inventory is the routing map for the twelve-phase program. A row marked
contained remains deliberately unavailable until its owning phase passes.

## User pages and ownership

| Route | Current purpose | Program owner |
|---|---|---|
| `/hub/trivia` | Lobby, Daily header, 13 mode cards, Quick Stakes footer | Phase 1 registry/capability wiring; Phase 4 visual system |
| `/hub/trivia/daily` | Daily run through `[mode]` | Phases 3 and 8 |
| `/hub/trivia/mtt` | MTT strategy mode | Phases 3 and 8 |
| `/hub/trivia/cash` | Cash scenarios | Phases 3 and 8 |
| `/hub/trivia/icm` | ICM/Chip EV | Phases 3 and 8 |
| `/hub/trivia/history` | History through `[mode]` | Phases 3 and 9 |
| `/hub/trivia/pro` | Pro knowledge through `[mode]` | Phases 3 and 9 |
| `/hub/trivia/rules` | Rules quiz through `[mode]` | Phases 3 and 9 |
| `/hub/trivia/gto` | GTO scenarios | Phases 3 and 8 |
| `/hub/trivia/mixed` | Mixed categories | Phases 3 and 9 |
| `/hub/trivia/endless` | Endless challenge | Phases 3 and 9 |
| `/hub/trivia/time-attack` | Timed challenge | Phases 3 and 9 |
| `/hub/trivia/survival-game` | Active survival game | Phases 3 and 9 |
| `/hub/trivia/survival` | Legacy survival entry/compatibility | Phase 9 consolidation |
| `/hub/trivia/arcade` | Quick Stakes through `[mode]` | Phases 2, 3, and 8 |
| `/hub/trivia/pvp` | 1v1 lobby/game | Contained in Phase 1; rebuilt in Phases 5 and 7 |
| `/hub/trivia/tournaments` | Bracket lobby/game | Contained in Phase 1; rebuilt in Phases 6 and 7 |
| `/hub/trivia/leaderboard` | Rankings | Phase 10 |
| `/hub/trivia/stats` | Player performance | Phase 10 |
| `/hub/trivia/achievements` | Achievement progress | Phase 10 |
| `/hub/trivia/settings` | Preferences/accessibility | Phases 4 and 10 |

The canonical 15-card launch catalogue is
`src/config/triviaModeRegistry.mjs`. It preserves the Daily and Quick Stakes art,
owns all destinations, and guarantees thirteen unique middle-card assets. On mobile
each card renders artwork before its body in a one-column stack; desktop keeps a
three-column composition.

## Active Trivia APIs

| Route family | Responsibility | Phase 1 control |
|---|---|---|
| `/api/trivia/session-start` | Server roster + atomic entry/session creation | PvP branch gated; dedicated match/session binding |
| `/api/trivia/session-answer` | First-answer-wins server record | Existing server authority retained |
| `/api/trivia/session-submit` | Server grading + atomic session close/reward | Database expiry CAS required |
| `/api/trivia/submit` | Retired client-reported score path | Permanent `410` tombstone; replacement is session start/answer/submit |
| `/api/trivia/daily` | Daily question delivery | Audited again in Phase 3 |
| `/api/trivia/report-question` | Player report intake | Phase 3 queue upgrade |
| `/api/trivia/prize-wheel-spin` | Prize wheel settlement | Phase 2 ledger migration |
| `/api/trivia/render-gto-panel` | GTO presentation helper | Phase 8 UI migration |
| `/api/trivia/pvp-settle-match` | Authenticated PvP result request | Public gate off; atomic database decision only |
| `/api/trivia/tournament-enter` | Atomic tournament entry | Public gate off |
| `/api/trivia/tournament-round-questions` | Sanitized round roster | Public gate off |
| `/api/trivia/tournament-submit-round` | Server round grading | Public gate off |
| `/api/trivia/tournament-lifecycle` | Manual authenticated lifecycle/recovery | Auth plus public gate off |

## Scheduled and worker surfaces

| Surface | Responsibility | Phase 1 disposition |
|---|---|---|
| `/api/cron/pvp-settle` | Authenticated recovery of valid funded matches | Retained as manual-only, database-atomic recovery; not scheduled |
| `/api/cron/trivia-tournament-tick` | Future tournament lifecycle | Auth plus public gate off; not scheduled |
| `/api/cron/trivia-pvp-cleanup` dispatcher job | Legacy four-hour money cleanup | Schedule and worker preference removed |
| Workers `/cron/trivia-pvp-cleanup` | Legacy cleanup implementation | Authenticated `410` tombstone; zero database/diamond access |
| `/api/cron/trivia-tournaments` and `/api/cron/trivia-tournament-rounds` | Legacy tournament scheduling/round jobs | Sources absent; Vercel/OpenClaw schedules and worker preferences removed |
| Workers `/cron/trivia-tournaments` and `/cron/trivia-tournament-rounds` | Legacy creation, refund, advancement, and payout engines | Authenticated `410` tombstones; zero database/diamond access |
| `/api/cron/trivia-economy-audit` | Economy reconciliation | Retained; expanded in Phases 2 and 11 |
| `/api/cron/trivia-pool-guard` | Question inventory guard | Retained; expanded in Phase 3 |
| `/api/cron/generate-trivia` | Question generation | Retained; audited/rebuilt in Phase 3 |

## Competitive database contract

Primary retained tables: `profiles`, `trivia_questions`, `trivia_sessions`,
`trivia_scores`, `trivia_pvp_queue`, `trivia_pvp_matches`, `trivia_pvp_stats`,
`trivia_tournaments`, `trivia_tournament_entries`,
`trivia_tournament_rounds`, `trivia_tournament_notifications`, and
`diamond_transactions`.

Phase 1 adds normalized `trivia_pvp_session_links`, player-wide
`trivia_pvp_active_seats`, immutable `trivia_pvp_settlement_decisions`, and
`competitive_quarantine`. It codifies the
score-only alias trigger, strict foreign keys/checks/indexes/RLS, atomic session
creation, database-enforced on-time award, and one atomic settlement-decision
authority. Browser roles have no direct competitive writes. Service functions are
explicitly ACL-scoped and every postcondition is asserted inside the migration.

Legacy `challenger_id` and `opponent_id` remain for historical compatibility only;
new entry and settlement code never trusts them. Their removal waits for Phase 12.

## Transaction reference families

| Movement | Stable reference |
|---|---|
| PvP stake | `pvp_stake_<match>_<user>` |
| PvP win | `pvp_match_win_<match>` |
| PvP tie return | `pvp_tie_refund_<match>_<user>` |
| PvP incomplete refund | `pvp_refund_<match>_<user>` |
| Tournament entry | Existing entry RPC-owned reference |
| Tournament cancellation | `trivia_tourn_cancel_<tournament>_<user>` |
| Tournament prize | `trivia_tourn_payout_<tournament>_<user>` |

Phase 2 replaces reference-family inference with an explicit balanced journal while
preserving every current reference and projection.
