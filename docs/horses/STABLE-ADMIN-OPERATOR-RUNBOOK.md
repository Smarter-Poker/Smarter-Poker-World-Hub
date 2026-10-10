# Stable Admin Operator Runbook

Effective 2026-10-06. Route: `https://smarter.poker/horses`.

This is the operating guide for the platform back office. It is not a club,
union or agent manual. Open the console through an authorized staff account,
confirm the operator badge and permission state, and keep the URL when handing
off work because `?tab=` and the Club Arena `?section=` value are durable.

## 1. Rules Before Any Action

1. Horses are players. Never exclude them from a player report, rule, payout,
   limit, integrity result or total. `Horse` is an identification badge only.
2. A disabled or hidden button is not an authorization boundary. A successful
   route or database response is the authority.
3. Never use production chips, seats, tournaments or player accounts to test a
   control. Use the read side, approved simulation or rollback proof.
4. Money and material fleet-policy actions may return `Pending Approval`.
   Record the approval ID and do not repeat the request with a new operation ID.
5. A failed read is `Unknown` or `Unavailable`, never zero. Do not interpret an
   empty degraded card as a healthy platform.
6. Preserve audit evidence. Do not edit history to make a result appear clean.

## 2. Opening And Navigation

- Sign in at `smarter.poker`, then open `/horses`.
- The top-level navigation is a keyboard tablist. Use Left/Right, Home and End.
- The URL is authoritative. Refresh and browser Back must restore the same tab.
- A permission refresh may relocate an operator from a tab they can no longer
  open. Treat that as a policy change, not a navigation defect.
- A degraded permission bootstrap is shown in text. Do not perform writes until
  the permission response recovers.
- At 375px, scroll inside wide evidence tables. The document itself must not
  scroll horizontally.

## 3. Tab Runbooks

| Tab ID | Operator Purpose | Opening Permission | Primary Safe Workflow | Escalate When |
| --- | --- | --- | --- | --- |
| `stable` | Manage social-horse profiles and content identity. | `fleet.read` | Search, inspect the avatar and profile record, then edit only with `content.write`. | A profile has no durable ID, a save has no confirmation, or live sync disagrees with the saved row. |
| `fleet` | Observe fleet health, allocation, policy, per-horse evidence, P and L, isolation and the disclosure register. | `fleet.read` | Start at Health, inspect degraded/stale text, drill into a horse or club, and treat policy changes as maker-checker candidates. | Heartbeat is missing, isolation violations are nonzero, a horse is seated in two scopes, register coverage is incomplete, or P and L is unavailable to a money reader. |
| `pipeline` | Read the social-content pipeline state. | `fleet.read` | Review stage counts and last activity. This panel is intentionally read-only. | Copy promises a trigger, a removed endpoint appears, or a stage reports success without a source record. |
| `settings` | Edit social-content settings that real consumers read. | `settings.write` | Change one setting, save, then reload and confirm the persisted value. | A poker-play or language-model control appears; horse poker play is deterministic and belongs in Fleet Command. |
| `stats` | Review social-content and platform statistics. | `money.read` | Confirm time range and source labels before comparing totals. | A failed source renders as zero or two cards claim the same metric from different authorities. |
| `merch` | Manage the merchandise catalog. | `console.read` | Read the catalog; add/edit/delete only with `catalog.write`; verify the returned item and audit entry. | A mutation succeeds without an item ID or audit record. |
| `promo` | Review and manage promo codes. | `console.read` | Filter first; write only with `promo.write`; confirm the exact code, limits and dates in the response. | An empty form can create a code, a code changes without an audit entry, or usage exceeds its configured limit. |
| `economy` | Read chip supply, treasury, conservation, rake, payouts, jackpots, promotions and financial close evidence. | `money.read` | Start with conservation and burn-in state. In Close And Jobs, inspect the journal-bound daily close, weekly digest recipients, scoped P and L snapshot, and prepared-export receipt before following each named source. Signing needs `money.write`; retain the operation ID and approval ID when maker-checker returns Pending Approval. | A residue or gate failure is hidden, a close lacks maker-checker or its journal manifest hash, a prepared receipt is called delivery, or a source timestamp is absent. |
| `mint` | Inspect issuance and retirement and prepare authorized chip operations. | `money.read` | Filter the issuance register; for writes use a unique operation ID, exact two-decimal amount and reason; obey pending approval. | Supply changes without a ledger row, operation replay differs, or a database error is shown to the browser. |
| `antiabuse` | Review privacy-safe signup and abuse signals. | `players.read` | Filter by the available signal fields; use masked identity evidence only. | Raw email appears, an unbounded query loads, or a moderation action bypasses `moderation.write`. |
| `clubarena` | Platform oversight of clubs, users, unions, money and operations. | `clubs.read` | Choose the named inner section and keep `?section=` in handoffs. Use Club Arena links for club/union-owned actions. | An operator action duplicates club-owner authority, a cashout guard loses scope, or exported figures omit truncation disclosure. |
| `bugreports` | Triage player support reports. | `players.read` | Filter, page, assign/resolve through the owning endpoint, and retain player and request IDs. | A status changes without assignment/audit evidence or a private field is exposed. |
| `geeves` | Review and moderate the Geeves knowledge base. | `console.read` | Inspect content; mutate only with `moderation.write`; verify event subscription cleanup after navigation. | Duplicate live events appear or a write is available to a read-only operator. |
| `reviews` | Search, page and moderate reviews. | `console.read` | Search server-side, inspect the durable review ID, and write only with `moderation.write`. | Search covers only the loaded page or malformed IDs become a server error. |
| `scrapers` | Observe scraper state. | `console.read` | Check the named source, last success, freshness and error. Polling pauses when the document is hidden. | Freshness is inferred from polling, a hidden tab continues aggressive polling, or a missing run is green. |
| `audit` | Search the operator audit trail and export evidence. | `audit.read` | Filter by actor/action/target, inspect the record trail, IP, user agent and request ID, then export the complete filtered set. | A mutation has no before/after record, an export is only the visible page, or actor identity is absent. |
| `staff` | View operators, roles, grants, MFA and policy. | `console.read` | Inspect the live permission matrix; grant/revoke or edit policy only with `admin.manage` and a reason. | Enforcement would remove the final `admin.manage` holder or a named role is inferred only from `profiles.role`. |
| `approvals` | Review maker-checker requests. | `console.read` | Match kind, target, amount/payload fingerprint and requester; decide only with the underlying permission; never self-approve outside the alone rule. | An approved request executes twice, a payload changes under one approval ID, or an expired/rejected request can execute. |
| `players` | Platform-wide player 360, restrictions, protection, tickets, reports and erasure. | `players.read` | Search by durable identity, inspect all related sections, and use scoped actions with the displayed permission. | Horses are omitted, enforcement state is unclear, a 24-hour RG increase hold is bypassed, or erasure lacks `gdpr.erase`. |
| `integrity` | Rank findings, investigate cases, attach evidence and record sanctions. | `players.read` | Work ranked groups, not raw row volume; disclose horse-vs-horse correlation; use Identity Links to compare the four recorded sources without exposing raw identifiers, then open a case before deciding evidence. | Timing rows bury material chip-flow pairs, a horse filter appears, Identity Links is treated as a verdict, source coverage is hidden, evidence lacks source IDs, or confiscation bypasses money authority. |
| `floor` | Read platform floor, club and union operational state and safe deep links. | `clubs.read` | Compare database and engine figures and read divergence text before following an owning link. | The two sources disagree without disclosure or a control is presented when the engine has no supported endpoint. |
| `tournaments` | Read tournament schedule, registrations, exposure and payout evidence. | `clubs.read` | Filter by state and scope, inspect guarantee/overlay and follow the owning surface for supported operations. | A cancel/refund control lacks an existing authoritative RPC or payout evidence is missing. |
| `cashier` | Read cashout and chip-request queues with age and scope. | `money.read` | Filter, inspect amount/state/age and use the owning approval path only when `cashier.write` is present. | A queue silently caps, a forced approval is reported paid before execution, or retry could pay twice. |
| `rake` | Review rake by club/union/stake/day and the applied law. | `money.read` | Compare recorded method/rate/cap to the governing configuration and export with provenance. | A derived record is presented as historical fact or an over-spec condition is hidden. |
| `platform` | Read engine, maintenance, releases, flags, kill switches, cron, alerts and incidents. | `console.read` | Treat each source independently, inspect state and timestamp, and follow the named owning control surface. For incident ownership, acknowledge or release only with `incidents.ack`, retain the operation ID, and verify the append-only event without changing source status. | Missing controls render Off, HTTP failure renders zero, acknowledgement is called resolution, source status changes with an ownership event, or runtime and database maintenance states diverge silently. |
| `sql-console` | Execute the restricted operator SQL surface. | `sql.execute` | Use only approved statements, review the result and preserve the audit trail. | The tab appears without `sql.execute`, arbitrary credentials are requested, or execution bypasses the route. |
| `hg-moderation` | Moderate Home Games reports and appeals and perform authorized erasure. | `players.read` | Work the inner keyboard tabs; mutate only with `moderation.write`; erase only with `gdpr.erase`. | A named operator passes UI admission but the RPC refuses the same permission, or a destructive action lacks confirmation. |
| `hand-reviews` | Review horse and human hand evidence. | `fleet.read` | Use the paged/virtualized list, keep horses included, and open a durable hand/review ID. | Show All drops rows, focus is lost across a virtual window, or the RPC admits only legacy roles. |

## 4. Club Arena Inner Sections

| Section | Use | Write Boundary |
| --- | --- | --- |
| `overview` | Platform pulse, club/user/union totals and drill-down entry. | Read-only overview. |
| `clubs` | Club list, state and detailed platform oversight. | `clubs.write` for supported operator actions; club-owned operations stay in Club Arena. |
| `revenue` | Revenue aggregates and exported evidence. | Read-only unless an explicitly named finance route says otherwise. |
| `ledger` | Platform ledger rows and filters. | No direct row editing. Corrections use the owning idempotent money path. |
| `finance` | Cashout queue. | `cashier.write`, maker-checker policy and operation identity all apply. |
| `users` | Thin platform user search and drill-down. | Player mutations belong in Players and require their own permission. |
| `unions` | Union oversight and member-club evidence. | Union-owned management remains in Club Arena. |
| `approvals` | Union applications and leave requests. | `clubs.write`; this is not the maker-checker Approvals tab. |
| `operations` | Platform operational evidence and deep links. | Follow the named owning surface; do not infer a control from a status card. |
| `announcements` | Existing club/union announcement evidence and supported publication path. | `clubs.write`; audience and source must be explicit. |

## 5. Standard Incident Response

1. Freeze interpretation, not the platform: record the tab, URL, request ID,
   source timestamp and exact visible state.
2. Confirm whether the fault is display, API, database, engine or publication.
3. For money, do not repeat an unknown operation. Read the durable ledger and
   approval state first.
4. For integrity, preserve evidence and case IDs. Never delete findings to
   reduce queue volume.
5. For a stale production bundle, compare `/api/health` and the Vercel selected
   revision; do not deploy an older build over a newer protected descendant.
6. After repair, verify the same affected path and record the durable result.

## 6. Shift Handoff Minimum

Record: operator role, affected tab/section, URL, filters, request/case/approval
or operation IDs, source timestamps, what was read, what was written, audit
record, unresolved risk, and the exact person or system that owns the next
action. Never hand off only a screenshot.


## Launch qualification boundaries

The 28-tab desktop/mobile catalogue and nested navigation checks establish
rendering, reachability and settled source-shaped responses. They do not prove
every write against production. Production certification is strictly read-only
and binds its eight named surfaces to one serving revision/deployment.
Financial, moderation, staff and SQL operations retain their tested permission,
validation, audit, idempotency and maker-checker boundaries; destructive probes
must not be run against active production players merely to claim coverage.
Hand Reviews' 12 installed read RPCs are STABLE, admin-gated, anonymous execute
is denied, and fn_is_horse_admin resolves fleet.read through the current
operator permission function. Club Arena legacy read POSTs are semantic reads;
HTTP method alone is not evidence that those reads mutate records.

P3 restrictions disclose enforcement off/unknown and do not guarantee complete
transfer/social/logout/paid-tournament convergence. O1/O2 preserve floor and
tournament write authority in Club Arena/engine. O7 proves export preparation,
not delivered or saved files. C2 has no global maintenance command API. C4
lacks global registration, positive issuance and a dedicated cashout kill;
scheduled maintenance is not a dedicated cashout kill. These boundaries prevent
a claim of a complete universal control plane and must remain visible to staff.

## 7. Verified Launch Boundary

Runtime publication and genuine authenticated read certification passed on
2026-10-10 UTC (October 9 Central). The 28-tab catalogue and 47 nested sections
have fixture navigation/rendering evidence; genuine production certification
covers the eight named read surfaces at desktop and 375px, with no writes.
This qualifies oversight and existing permission-bound workflows. It does not
add the six Partial capabilities or certify every possible operator mutation.
Dedicated cashout, global tournament-registration and positive-issuance kill
controls remain missing; scheduled maintenance is not a dedicated cashout kill.
Final documentation protected integration is recorded separately.
