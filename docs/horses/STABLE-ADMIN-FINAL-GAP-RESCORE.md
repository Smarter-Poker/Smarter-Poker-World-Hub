# Stable Admin Final Gap Re-Score

Scored 2026-10-05 against the original research inventory in
`STABLE-ADMIN-OVERHAUL-PLAN.md`. `Resolved` means the intended capability is
implemented in this programme. `Resolved Elsewhere` means authority deliberately
remains in its named owner and Stable Admin provides oversight/deep-linking.
`Partial` and `Open` are carried forward honestly; Phase 10 documentation does
not turn them into completed software.

## Foundation And Existing-Surface Safety

| ID | Score | Evidence And Remaining Boundary |
| --- | --- | --- |
| F1 | Resolved | `operatorAuth` requires the service role and never falls back to anon. |
| F2 | Resolved | Canonical operator audit shape and route contracts cover reachable writes. |
| F3 | Resolved | Shared route wrapper and durable limits on money/fleet paths. |
| F4 | Resolved | String money parsing, scrubbed errors, paged register and accessible confirmation. |
| F5 | Resolved | Shared auth/client primitives replace duplicated route authentication. |
| F6 | Resolved | Per-panel error boundaries isolate failures. |
| F7 | Resolved | `?tab=` and `?section=` own navigation and browser history. |
| F8 | Resolved | ARIA tablists, focus management, modal traps and textual status. |
| F9 | Resolved | Named surfaces use bounded server paging with totals or explicit truncation. |
| F10 | Resolved | Reviews search is server-side, not current-page filtering. |
| F11 | Resolved | Bulk work is chunked and bounded rather than capped at 600 silently. |
| F12 | Resolved | Shared validation rejects malformed IDs, ranges and money before the handler. |
| F13 | Resolved | Full filtered exports page through authoritative sources and disclose caps. |
| F14 | Resolved | Dead trigger behavior is retired; Pipeline is a truthful read-only surface. |
| F15 | Resolved | Touched console source follows tokens, Title Case, no emoji and no UI em dash. |
| F16 | Resolved | Phase 9 modularization, scoped reads, visibility polling and lazy chunks remove the monolith hot path. |
| F17 | Resolved | Avatar generation uses bounded fetch/type/size checks, hashed style and constant-time secret comparison. |
| F18 | Resolved | Settings read/write target one ordered canonical row. |
| F19 | Resolved | Anti-Abuse does not ship raw email. |
| F20 | Resolved | Focused route, migration, client, architecture and browser suites cover Phases 1-9. |

## Fleet Operations

| ID | Score | Evidence And Remaining Boundary |
| --- | --- | --- |
| H1 | Resolved | Fleet Command has paged stateful roster and current table/stack evidence. |
| H2 | Resolved | Health, heartbeat, state counts and capacity evidence are surfaced. |
| H3 | Resolved | Per-horse 360 joins profile, memberships, money, sessions, hands, reviews, latency and audit evidence. |
| H4 | Resolved | Global/club/union fleet policy owns quota, occupancy, caps, humans, stakes, variants and schedule. |
| H5 | Resolved | Enabled/pause policy is honored at safe engine boundaries. |
| H6 | Resolved | Console bulk funding is retired; funding remains on ledger-owned paths. |
| H7 | Resolved | Duplicate-table launch/shutdown writers return retired behavior; engine owns seeding. |
| H8 | Resolved | P and L and isolation/conservation evidence are shown under money authority. |
| H9 | Resolved | Policy control and material-change approval cover behavior mix and seating policy. |
| H10 | Resolved | Fleet evidence includes latency, session and anomaly context. |
| H11 | Resolved | Durable never-delete GLI-19 register, disclosure and sync procedure exist. |
| H12 | Resolved | Isolation report shows club/union scope and conflicting open seats. |
| H13 | Resolved | Grinder became Fleet Command; Pipeline is explicitly read-only, not a disabled fake control. |

## Player Lifecycle, Protection And Support

| ID | Score | Evidence And Remaining Boundary |
| --- | --- | --- |
| P1 | Resolved | Platform player search is a dedicated Players surface. |
| P2 | Resolved | Player 360 covers identity, KYC, RG, clubs, wallets, sessions, flags, tickets, reports, notes, tags and horse identity. |
| P3 | Partial | Reason-coded restrictions and expiry exist; production enforcement remains policy-controlled and transfer/social convergence guards remain absent. |
| P4 | Resolved | Durable operator notes and tags are included. |
| P5 | Resolved | KYC events are visible in Player 360. |
| P6 | Resolved | RG limits, exclusions and the 24-hour increase hold are implemented. |
| P7 | Resolved | Marker observations and interventions are recorded without claiming enforcement. |
| P8 | Resolved | Tickets support assignment, priority, SLA, notes and player linkage. |
| P9 | Resolved | Reports and appeals are platform queues. |
| P10 | Resolved | Platform restriction list exists; per-club blacklist authority remains in Club Arena. |
| P11 | Resolved | Platform export/erase tooling exists behind `gdpr.erase`. |

## Game Integrity

| ID | Score | Evidence And Remaining Boundary |
| --- | --- | --- |
| I1 | Resolved | Ranked, grouped platform queue and cases consume both collusion sources. |
| I2 | Resolved | Anti-cheat flags are a platform investigation section. |
| I3 | Partial | Available signup/device/IP relationships are exposed; source completeness limits the graph and is disclosed. |
| I4 | Resolved | Chip-flow pairs are ranked above correlated timing volume where material. |
| I5 | Resolved | Human and horse timing evidence is shown side by side with construction disclosure. |
| I6 | Resolved | Case, evidence, assignment, decision, sanction and appeal workflow exists. |
| I7 | Resolved | Investigator hand search and durable replay links exist. |
| I8 | Resolved | Sanctions and shared restrictions are durable; confiscation retains money permission and approval. |

## Floor Operations

| ID | Score | Evidence And Remaining Boundary |
| --- | --- | --- |
| O1 | Partial | Live platform floor and divergence evidence exist; unsupported global engine controls are named Missing rather than simulated. |
| O2 | Partial | Schedule, registration and exposure oversight exist; cancel/refund remains with existing authoritative owners and is not duplicated. |
| O3 | Resolved Elsewhere | Stable Admin provides club health/oversight and links; Club Arena owns local management and supported funding. |
| O4 | Resolved Elsewhere | Union/member/settlement oversight is visible; Club Arena owns union management. |
| O5 | Resolved Elsewhere | Cashout and chip-request oversight is visible; Club Arena retains execution authority and maker-checker. |
| O6 | Resolved | Rake reporting by scope/day, law evidence and export are available. |
| O7 | Partial | Full exports exist with explicit caps/truncation; there is no universal durable asynchronous export-job ledger. |
| O8 | Resolved Elsewhere | Announcement evidence/deep links exist; established club/union delivery authority remains in Club Arena. |

## Economy And Finance

| ID | Score | Evidence And Remaining Boundary |
| --- | --- | --- |
| E1 | Resolved | The Mint retains idempotent issue/retire and a complete issuance register. |
| E2 | Resolved | Conservation, drift and burn-in evidence are embedded with provenance and deep links. |
| E3 | Resolved | Chip supply, velocity and treasury evidence complement diamonds. |
| E4 | Resolved | Rakeback and leaderboard payout oversight are visible without inventing writers. |
| E5 | Resolved | BBJ pool, payout and winner evidence are visible. |
| E6 | Resolved | Promotions, distributions, wagering and abuse evidence are visible. |
| E7 | Partial | Daily/weekly/P and L and regulatory exports are surfaced; some durable digest/export receipt records remain source-dependent and explicitly Unknown when absent. |

## Platform Controls And Observability

| ID | Score | Evidence And Remaining Boundary |
| --- | --- | --- |
| C1 | Resolved | Platform Operations shows engine throughput, tables, seats, latency, break and release evidence. |
| C2 | Partial | Maintenance status and divergence are visible; no safe global control API exists, so no database-only button was invented. |
| C3 | Resolved | Allowlisted feature/policy registry reports source, consumer, scope and write owner. |
| C4 | Partial | Existing exact-scope switches are inventoried; global tournament-registration and positive-issuance switches are correctly marked missing. |
| C5 | Resolved | Cron and alert sources fail independently and missing telemetry is Unknown. |
| C6 | Resolved | Scraper health remains a read-only evidence surface. |
| C7 | Partial | Platform incidents are normalized; acknowledgement remains source-specific where no durable shared schema exists. |

## Access Control And Audit

| ID | Score | Evidence And Remaining Boundary |
| --- | --- | --- |
| A1 | Resolved | One flat role tier was replaced by canonical permissions and named roles while retaining legacy recovery. |
| A2 | Resolved | Owner, operations, finance, compliance, support and read-only roles resolve server-side. |
| A3 | Resolved | Maker-checker gates material money, fleet and confiscation actions. |
| A4 | Resolved | Audit filtering, record trail, session/network evidence and full export exist. |
| A5 | Resolved | Staff directory exposes roles, grants, last sign-in and MFA with audited management. |

## Console Architecture

| ID | Score | Evidence And Remaining Boundary |
| --- | --- | --- |
| X1 | Resolved | The shell is about 370 lines, panels are modules, shared state is selective and 30 explicit lazy chunks are built. |
| X2 | Resolved | Shared fetch, paging, table, modal, KPI, status, confirmation and export primitives exist. |
| X3 | Resolved | Shared operator auth/API/audit/validation primitives own server boundaries. |
| X4 | Resolved | Folded subpages share tokens, shell, mobile and accessibility behavior. |

## Final Score

| Score | Count |
| --- | ---: |
| Resolved | 70 |
| Resolved Elsewhere | 4 |
| Partial | 9 |
| Open | 0 |
| Total | 83 |

The original inventory contains 83 numbered gaps. No item is unaccounted for.
The nine partial items are explicit product/platform limitations, not hidden
stubs: P3, I3, O1, O2, O7, E7, C2, C4 and C7. The contract test computes IDs
from the plan so a prose/count discrepancy fails instead of silently shipping.
