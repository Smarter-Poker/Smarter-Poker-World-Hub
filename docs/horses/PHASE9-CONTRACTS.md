# Stable Admin Phase 9 Contracts

Status: implementation contract, 2026-10-05

Phase 9 completes the console architecture described by X1 and X4 in
`STABLE-ADMIN-OVERHAUL-PLAN.md`. It changes composition, loading and responsive
behavior without weakening any server-side authority or changing what an
operator is allowed to do.

## 0. Non-negotiable product laws

1. Horses are players. No Phase 9 copy, code or test calls them bots.
2. The shell never claims that a read or write succeeded unless the owning
   route or RPC confirms it.
3. Server routes and database functions remain the authority. Hiding or
   disabling a button is not authorization.
4. An unknown permission list is `null`, not an empty list. Unknown preserves
   the Phase 2 fail-safe navigation behavior; an explicitly empty list grants
   nothing.
5. URL state owns the selected top-level tab and Club Arena section. Zustand
   must not create a second source of navigation truth.
6. No security or session state is persisted in browser storage.
7. The production visual language remains machined gunmetal, restrained cyan,
   purposeful status color, crisp geometry and real application data. Phase 9
   must not introduce generic dashboard cards, glassmorphism, emoji or stock
   imagery.
8. Mobile starts at 375px. The document may not overflow horizontally, every
   interactive target is at least 44px, keyboard focus is visible, and reduced
   motion is honored.

## 1. Shell boundary

After Phase 9, `pages/horses/index.js` owns only:

- authentication and console admission;
- operator-policy bootstrap and account-change reset;
- URL/tab/section reconciliation and permission relocation;
- the global header, notification region, tab strip and common tabpanel;
- shared error boundaries and lazy-panel loading state;
- console-wide live badges whose values cross panel boundaries.

Every top-level tab body lives in `src/components/horses`. There are no
`activeTab === ...` panel bodies left inline and no `legacy: true` registry
entries. Panel-local rows, filters, pagination, drafts, modals, timers, abort
controllers and mutation guards remain inside their panel.

## 2. Tab inventory and lazy loading

The registry contains 28 real tabs: the existing 25 plus `sql-console`,
`hg-moderation` and `hand-reviews`. All panel components are declared through
explicit top-level `next/dynamic(() => import('./ExactPanel'))` calls in one
component map. Runtime `dynamic(tab.load)` construction is forbidden because
Next cannot reliably associate that form with its preload module.

The plain-data registry remains importable in Node contract tests. It contains
IDs, labels, permissions and compatibility aliases, but no runtime import
thunks. `grinder -> fleet` remains a permanent bookmark alias.

Opening permissions for the folded pages are:

| Tab | Permission |
| --- | --- |
| SQL Console | `sql.execute` |
| HG Moderation | `players.read` |
| Hand Reviews | `fleet.read` |

Write controls inside HG Moderation separately require `moderation.write` and
GDPR erasure requires `gdpr.erase`. SQL execution continues to require
`sql.execute` on the route.

## 3. Shared operator store

`src/stores/stableAdminStore.js` is a non-persisted Zustand store containing
only cross-panel operator context and cross-panel evidence:

- current user and operator ID;
- effective role;
- permissions, policy and alone-rule;
- degraded-permission state;
- account/session generation;
- shared navigation badge values;
- the social-content settings projection needed by the header and Settings,
  Statistics and Pipeline panels.

It exposes atomic apply and reset actions. A sign-out or account ID change
clears the complete store synchronously before the next account is applied.
Selectors are mandatory so unrelated panels do not rerender for every context
update. The store must not contain active tab, Club Arena section, confirmation
callbacks, money/player rows, SQL history, modal drafts, paging or filters.

## 4. Legacy panel extraction

All fourteen legacy panels are extracted with their complete behavior:

- Social Horses, including its avatar modal, mutation guards and live sync;
- Pipeline;
- Settings;
- Statistics;
- Merch Catalog;
- Promo Codes, including its edit dialog;
- Anti-Abuse;
- Club Arena, including all cashout scope/epoch guards and ten sections;
- Bug Reports;
- Geeves KB, including EventBus cleanup;
- Reviews;
- Scrapers, including visibility-aware polling cleanup;
- Audit Log, including export and detail modal;
- any remaining inline legacy body identified by the registry audit.

The obsolete parent-owned Economy and Mint state/loaders are deleted because
their Phase 7 panels already own that behavior. Pipeline remains a truthful
read-only view; Phase 9 must not invent a trigger or revive a removed endpoint.

## 5. Folded subpages and bookmarks

The three standalone pages become reusable panel modules without duplicate
`Head`, authentication gates, full-viewport shells or Back buttons. Existing
bookmarks remain valid through non-permanent server redirects:

- `/horses/sql-console` -> `/horses?tab=sql-console`
- `/horses/hg-moderation` -> `/horses?tab=hg-moderation`
- `/horses/hand-reviews` -> `/horses?tab=hand-reviews`

Redirects preserve unrelated query parameters and replace any stale `tab`
parameter. They must be 307 responses, not blank client redirect pages.

Named-role operators must not be shown a nominally authorized tab whose RPC
still admits only the three legacy profile roles. Phase 9 therefore updates HG
and Hand Review database self-gates to the canonical operator permission
resolver, installs that migration, and proves allowed and refused PostgREST
calls. The legacy roles continue to work. No broad role bypass is permitted.

## 6. Canonical response contracts

Panel extraction consumes canonical paged shapes: `rows`, `total`, `limit`,
`offset` and `hasMore`. Temporary Phase 1 list aliases may be removed only
after every in-repository consumer and pinned test is converted. Eligible
aliases include Mint `entries`, stable-admin audit `entries`, admin-reviews
`reviews/page`, Club Arena ticket and overview list aliases, and Anti-Abuse
list aliases.

Permanent compatibility contracts are not temporary aliases. Keep the fleet
URL alias, historic audit action vocabulary, legacy operator roles and stored
database vocabulary.

## 7. Virtualized data surfaces

Virtualization is rendering optimization, never a replacement for server
paging or authoritative totals. The shared virtual table:

- uses stable row keys;
- preserves named columns and an accessible table or grid relationship;
- maintains keyboard focus across rendered windows;
- falls back to the semantic DataTable for short lists;
- keeps its own horizontal scroller and responsive boundary;
- never virtualizes loading or empty states.

Apply it only to measured long, bounded client collections, initially Social
Horses and the Hand Reviews Show All fleet. Club Arena/Audit/Anti-Abuse may use
it only if the final component holds enough rows to justify the tradeoff.

## 8. Mobile and accessibility acceptance

- One page `h1`; panel headings start at `h2`.
- Top-level and HG inner tabs expose tab/tablist/tabpanel relationships,
  controlled IDs, roving tab index and Arrow/Home/End behavior.
- Selected tab, focus and URL remain synchronized.
- All tables scroll inside their panel; the body has no horizontal overflow at
  375px.
- All controls and filter chips are at least 44px high.
- Control borders meet 3:1 non-text contrast and text meets WCAG AA.
- `prefers-reduced-motion` removes hover translation/transitions and changes
  tab `scrollIntoView` behavior from smooth to auto.
- Busy, empty, denied, degraded and failed states use text, not color alone.

## 9. Verification gate

Phase 9 is not complete until all of the following pass:

1. Architecture contract tests prove 28 real tabs, no legacy registry entries,
   explicit lazy panel mapping, store null/reset semantics, no inline tab body,
   and all three legacy redirects.
2. Focused tests for every extracted panel pass without weakening Phase 1-8
   assertions.
3. Allowed and refused HG/Hand Review permission flows are proven at the route
   and PostgREST/RPC boundaries. A database migration is verified by exact
   ledger version, definition, owner, security mode, grants and indexes where
   applicable.
4. Playwright smoke visits every rendered top-level tab on desktop and Pixel 5,
   asserts tab/URL/panel agreement, no chunk boundary or page error, keyboard
   navigation, no 375px document overflow, reduced motion, HG inner tabs,
   restricted SQL visibility and all three legacy redirects.
5. A production-mode build passes. The `/horses` initial page chunk is measured
   before and after; the final build must demonstrate real lazy separation and
   no regression in initial payload without an explained reason.
6. Focused lint and the complete horses regression suite pass.
7. Protected merge completes, Vercel reports READY, `/api/health` serves the
   exact merge or a proven descendant, and authenticated live proof covers the
   shell, all changed tabs, legacy URLs, mobile behavior and affected writes.

## 10. Baseline and policy receipt

- Base commit: `cdf7f141e7d54aa77e8781503b4ed32b01998c7c`.
- Baseline production build: passed on 2026-10-05 with the repository's expected
  missing-local-environment warnings.
- Baseline source: 7,109-line `pages/horses/index.js`, 14 legacy registry tabs,
  3 external subpages and runtime dynamic-loader construction.
- Baseline standalone chunks: SQL Console 17,633 bytes; HG Moderation 38,424
  bytes; Hand Reviews 64,128 bytes.
- Shared policy read: 2026-10-05T22:03:12.124Z.
- Policy version: 2.9.
- Manifest SHA-256:
  `a659f31c5c1c2b0864889508079a635dd5fe2fc98decfbfc9d3f9c80dd45ec3b`.
