# /horses Admin Console — Deep Audit, Repair and Recolour

**Date:** 2026-08-26
**Scope:** every page and subpage under `https://smarter.poker/horses`, plus every
API route those pages call, plus the production database objects they read.
**Requested by:** Dan — "check every page, line by line, for any and all bugs, gaps,
stubs, errors, regressions and wiring issues", "audit and look for anything we may
not have inside here that should be", and "change everything to the proper
smarter.poker color schema, no purples or greens."

---

## 1. Surface map

| Page | Status before | Linked from nav? |
|---|---|---|
| `/horses` (`pages/horses/index.js`, 4,323 lines, 13 tabs) | Live | n/a |
| `/horses/sql-console` | Live | Yes |
| `/horses/hg-moderation` | Live | **No — orphan, URL only** |
| `/horses/hand-reviews` | Live (added 2026-08-26) | **No — orphan, URL only** |

18 API routes back these pages. All 18 exist; none used `.single()`; none imported
`@supabase/supabase-js` raw in an API route. Those two house rules were already clean.

---

## 2. The four things that mattered most

### 2.1 The Club Arena Admin tab was reading nothing, and said so to nobody

The tab queried Supabase **directly from the browser** with the operator's own JWT.
Verified against production for the platform's only `profiles.role='admin'` account:

| Table | Rows in table | Rows that account can SELECT |
|---|---|---|
| `club_members` | 1,501 | **0** |
| `agents` | 113 | **0** |
| `chip_transactions` | 200,978 | **0** |
| `cashout_requests` | 0 | 0 (also blocked) |

There is no admin-role bypass policy on any of them — the policies are scoped to club
staff, agents-of-player and union overseers. The queries **succeeded** and returned
empty arrays, so every club rendered "0 members, 0 agents, no transactions" and looked
like real data.

On top of that, four column names did not exist:

* `cashout_requests.user_id` — the column is `player_id`
* `chip_transactions.user_id` — the columns are `from_user_id` / `to_user_id`
* `tables.max_seats` — the column is `max_players`
* `club_members.id` — the primary key is composite `(club_id, user_id)`; there is no id

Each of those returned PostgREST 42703 and fell into a generic catch.

**Fix:** new service-role route `pages/api/horses/club-arena-admin.js`, gated on
`profiles.role in (admin, superadmin, god)`, with the correct column names and
explicit profile resolution (there is no FK PostgREST can embed from `club_members`
to `profiles`). The panel now calls that route. **Do not move these queries back into
the browser.**

### 2.2 Half the Club Arena feature set was written and unreachable

`caStats`, `caFinance`, `caUnions`, `caPendingCashouts`, `searchCaUsers`,
`loadCaUserDetail`, `toggleClubStatus` and `forceCashoutApprove` were all implemented
and **none of them had a single line of UI**. Platform overview, chip finance, player
lookup, union list, club suspend and force-approve-cashout existed in code and could
not be reached.

**Fix:** the tab now has six sections — Overview, Clubs, Finance, Users, Unions,
Approvals — and every one of those functions is wired to a control.

### 2.3 Mutations reported success they had not achieved

The pattern throughout was: apply an optimistic update, `console.warn` the real
Supabase error, then toast "saved". Persona creation went further and **fabricated a
local row** on failure with the message "Horse created (fallback)" — the horse did not
exist and the next refresh silently lost it. `loadData` fell back to eight hardcoded
`DEMO_PERSONAS` whenever the query failed *or* returned zero rows.

**Fix:** every mutation reverts its optimistic update and surfaces the error. The demo
personas are deleted. A failure now says it failed.

### 2.4 Four admin actions could never have worked

| Action | Why it always failed | Reported |
|---|---|---|
| Review a cheat flag | Frontend sent `verdict: 'dismiss'`; route required `newStatus` in `['reviewed','dismissed','actioned']` → 400 every time | "Flag marked dismiss" |
| Kick a player | Frontend sent `targetUserId`; route destructured `playerId` → 400 every time | "Player kicked" |
| Force approve a cashout | Frontend sent `clubId`; the allowed-fields guard rejects any extra key → 400 every time | "Cashout approved" |
| Approve a union leave request | `list_leave_requests` and `approve_leave` **did not exist** on the route; "Deny" sent a `union_leave_requests` id to a `union_applications` lookup → 404 | "Removed from union" |

None of the four checked `res.ok`. All four are fixed on both sides.

---

## 3. Full findings by file

### `pages/horses/index.js` — rewritten

* **Crash risks:** `scraperHealth.summary.deadCount` was read unguarded **in the nav
  bar**, so a malformed scraper response took down the whole page, not one tab. Same
  pattern on `economyData.stats.*.toLocaleString()`, `economyData.transactions.map`,
  `scraperHealth.daemons.map`, `app.status.toUpperCase()`, `req.status.toUpperCase()`.
* **Stale closure:** the realtime handler read `caLoaded` from the closure created at
  mount, where it is always `false`. Club Arena data never auto-refreshed. Now a ref.
* **Request storm:** `tables` and `table_seats` postgres_changes handlers called a full
  reload on every row event. `tables` has 88,000+ rows and churns continuously; seats
  turn over every hand. Both are now coalesced (2s / 5s) and `table_seats` is dropped.
* **NaN writes:** every settings input called `updateSetting` on `change` with
  `parseInt(e.target.value)`. Clearing a field wrote `NaN` to `content_settings`, and
  dragging the temperature slider fired one upsert per tick. Writes are now debounced
  (700ms) and validated; non-finite values never reach state.
* **Filter injection:** `searchCaUsers` interpolated raw user input into a PostgREST
  `.or()` filter string. A comma or parenthesis rewrote the filter tree. Sanitized
  server-side now, and `player_number.eq.` is only added when the query is numeric
  (it was previously `parseInt(query) || 0`, so every text search also matched
  player 0).
* **`Math.max(...[])` is `-Infinity`:** produced `NaN%` bar widths in two breakdown
  charts whenever the source object was empty. Guarded.
* **`Promise.all` on a non-Response:** `loadGeevesAnalytics` put
  `.catch(() => ({ ok: false }))` on each fetch then called `.json()` on the result — a
  network failure threw `TypeError: missedRes.json is not a function` instead of
  showing an error.
* **Leaked timers:** `showNotification` never cleared its timeout, so consecutive
  toasts cancelled each other and the timer outlived unmount.
* **Dead AbortController:** `new AbortController()` was created in the mount effect and
  its signal never passed to anything; every `signal` parameter was `undefined`.
* **Missing CSS classes:** `styles.filterBar`, `styles.filterBtn`, `styles.tableWrapper`,
  `styles.table`, `styles.statusActive`, `styles.recentRuns`, `styles.rssSources` and
  `styles.stableView` were referenced and **did not exist** in the module, so they
  resolved to `undefined` and those elements shipped completely unstyled. All added.
* **Hardcoded fiction removed:** the RSS source list (five fixed names each with a
  green dot, wired to nothing), the daily shift schedule ("40 Horses / 35 / 25", fixed
  numbers), and the club badges on the grinder roster (every horse showed both Shark
  and JAQK regardless of actual membership).
* **Gaps filled:** no way to *edit* a horse existed (593 of them, create and delete
  only) — there is now an edit modal. The `voice` field is on every card and the create
  form never asked for it — it does now. All 593 cards rendered at once — paginated at
  48. `hg-moderation` and `hand-reviews` had no link from anywhere — both are in the nav.
* Sign-out now clears every cached surface; a non-admin who authenticates is signed
  back out rather than left holding a session on a staff page.

### API routes

| File | Fixed |
|---|---|
| `admin/scraper-health.js` | Auth was an email allowlist of **two addresses that do not exist in `profiles`** — the entire Scrapers tab 403'd for every human. Heartbeats were read from a hardcoded local macOS path that never exists on Vercel, so every daemon scored `unknown` and the counts were permanently 0; now reads the `scraper_metrics` table and is honest about daemons that publish nothing. |
| `promo/admin-promo-codes.js` | **Privilege escalation:** authorization accepted any active `commander_staff` owner/manager at any venue, then applied no scoping to a global, diamond-granting table — any venue manager could list, create, re-price and deactivate every platform promo code. Branch deleted. `reward_value` was unbounded (mintable at 999,999,999) — clamped. Codes were generated with `Math.random()` — now `crypto.randomInt`. |
| `horses/admin-reviews.js` | Both PATCH payloads set `updated_at`, a column `venue_reviews` does not have → PGRST204, so **every flag/unflag 500'd**. Stats were computed over the current 100-row page and presented as table totals. Moderation notifications had never been delivered (wrong auth header and wrong body shape). |
| `horses/economy-stats.js` | The `diamond_reward_catalog!inner(action_key)` embed fails — **there is no FK** — so `totalDiamondsEarned` and `totalRewardClaims` were **always 0**. None of seven `Promise.all` results checked `.error`. |
| `horses/grinder-stats.js` | Returned `mockStats` with fabricated zeros. All three POST actions were no-ops that returned success — `add_to_club` claimed it had added N horses with 10,000 chips each **without inserting a row or moving a chip**. Stats are real now; the three write actions return 501 rather than lie. Per-horse `hands`/`profit` return `null`, not 0, because they cannot be derived from existing columns. |
| `horses/trigger-pipeline.js` | Targeted `/api/cron/horses-stories`, **which does not exist**; the 404 was swallowed and the route returned `{success:true}` regardless, writing a `pipeline_runs` row for a run that never happened. Also self-fetched `req.headers.host` with `Bearer ${CRON_SECRET}` — a spoofed Host header exfiltrates the secret. The self-fetch is removed entirely. |
| `club-arena/anti-cheat.js` | No platform-admin path (club membership only). `verdict`/`targetUserId` mismatches. Flags returned nested profile embeds while the frontend read flat `user_id`/`player_name`/`description` — now flattened. Forwarded the caller's raw JWT to the game server. An un-`unref`'d `setInterval` leaked a handle per lambda. |
| `club-arena/union-application.js` | Added `list_leave_requests`, `approve_leave`, `reject_leave` (+ zod schemas in `src/contracts/orb4_syndicate.ts`). `isPlatformAdmin` was missing the `'god'` role that the real owner accounts use. Module-scope `createClient` threw at import time with no key. `statusFilter` read raw body, bypassing validation. |
| `club-arena/approve-cashout.js` | `clubId` added to the allowed-fields set; platform-admin authorization path added; cashout push notifications fixed (had never been delivered). |
| `club-arena/horse-launch.js` | Authorization was `user.id !== '<one hardcoded UUID>'`, locking out the other god account and the admin account. No rate limit on the heaviest write on the platform — now 1 per 5 minutes. |
| `hg-*.js`, `analytics.js`, `anti-abuse.js` | Raw Postgres error text returned to the client in 8 files (table and constraint names); UUID validation added so a malformed id is a 400, not a 500; read rate limits added to four PII-returning GETs. |

### `pages/horses/hg-moderation.js`

Built its **own** Supabase client with a raw `@supabase/supabase-js` import — a second
GoTrueClient on the same storage key. `useAuthBearer` read the token once on mount, so
if it was not yet in storage the page sat on "Verifying access…" forever with no error.
Both fixed; `alert()` replaced with inline banners; a Back-to-Horses link added.

### `pages/horses/sql-console.js`

Redirected to `/login`, **a route that does not exist**. Results were a raw JSON dump;
tabular results now render as a table with the JSON behind a toggle. Added Cmd/Ctrl+Enter
and a session-local query history.

### `pages/horses/hand-reviews.js`

Same dead `/login` redirect. `horse_user_id.slice(0,8)` unguarded. Errors rendered as
dead text with no retry. All fixed, plus recolour.

---

## 4. Colour schema

Every page now uses the smarter.poker / Club Arena palette, taken from
`~/Documents/club-arena/src/styles/design-tokens.css` and `ClubHomePage.css`:

```
Surfaces  #0a0e17 page · #111827 panel · #1a2234 surface · #1f2937 elevated · #0d1520 inset
Accent    #00d4ff — and cyan is also SUCCESS / ACTIVE / ONLINE / POSITIVE
Semantic  #3b82f6 info · #ffd700 gold warn · #ef4444 danger
Text      #f3f4f6 · #9ca3af · #6b7280
```

`horses.module.css` declares these as custom properties and the file is 100 % `var()`
references — **zero raw hex outside the token block**. `pages/horses/adminTokens.js`
exposes the same tokens to inline styles, so no `.js` file under `pages/horses/`
contains a hex colour at all.

Removed: `#8b5cf6` `#7c3aed` `#a78bfa` `#c4b5fd` `#a855f7` `#cc5de8` `#c084fc` and 37
`rgba(139,92,246,*)`; `#22c55e` `#16a34a` `#10b981` `#059669` `#4ade80` `#31a24c`
`#51cf66` `#6ee7b7`; the Facebook-ish `#2374E1`/`#FF453A`/`#FF9500`/`#1a1a2e`/`#2d2d44`
set in the Club Arena tab; and the zinc scale in the SQL console and hand reviews.

**Note for the next agent:** `:root` cannot be used in a `*.module.css` file here. Next
runs CSS Modules through css-loader in `mode: 'pure'`, which rejects any selector without
a local class — `:root` and `:global(:root)` both fail the build outright. The tokens are
hosted on the module's top-level containers instead; custom properties inherit, so the
coverage is total. Do not "simplify" that back.

Also removed all emoji from these files (house rule 7 — bare emoji break SWC).

---

## 5. What was NOT fixed, and why

* **Per-horse `hands` and `profit`** cannot be derived: `hand_history` stores
  participants in a `players` jsonb array with no per-user column, and no buy-in
  baseline is stored against a seat. They return `null` with the reason stated in the
  response rather than a fabricated 0. Deriving them needs a new aggregate RPC.
* **`grinder-stats` POST actions** are left unimplemented and return 501. Implementing
  them means moving real chips, and section 11.5 forbids exercising money paths
  speculatively.
* **`content_settings` has exactly one row and no singleton constraint.** The panel
  reads it with `.limit(1).maybeSingle()` now, so a second row will no longer error the
  query — but the underlying data model is one INSERT away from ambiguity.
* **`content_authors` and `content_settings` writes from the browser are RLS no-ops.**
  `content_authors` writes are gated on `profiles.is_admin = true`, which is true for
  **zero rows**, while the panel's own gate uses `role = 'admin'` — the two admin
  definitions disagree. `content_settings` writes are service-role only. The panel now
  surfaces the failure instead of claiming success, but **the correct fix is a policy
  or a service-role route, and it is not in this change.** This is the highest-priority
  follow-up.
* **`reject_leave` reason is not persisted** — `union_leave_requests` has no review-note
  column and its `reason` column holds the requester's text. Needs a migration.
* **`orb4_syndicate.ts`:** `UnionApplicationApplySchema` and `…StatusSchema` do not
  declare `unionId`, and `validatePayload` strips unknown keys, so the explicit-target
  `unionId` path added by the 2026-07-21 union audit has never fired. Out of scope here;
  it affects the non-`/horses` apply flow.

---

## 6. Verification performed

* `@babel/parser` with the JSX plugin: PARSE OK on all six changed page files and the
  new API route.
* `npx tsc --noEmit`: no new errors. The 5 remaining errors are pre-existing and in
  unrelated files (`e2e/099-…`, `MemoryCampaignView.tsx`, `contextCollector.ts`).
* PostCSS parse of `horses.module.css`: 248 rules, **all selectors pure** (verified
  against the `mode: 'pure'` requirement above).
* Every `styles.X` reference in `index.js` cross-checked against the selectors defined
  in `horses.module.css`: **122 used, 0 missing.**
* Grep sweeps: zero emoji, zero raw hex, zero `.single(` in the changed page files.
* All database claims in this document were verified with read-only queries against
  production (`kuklfnapbkmacvwxktbh`). No migration was applied and no data was written.

`npx next build` could not be run from the authoring sandbox — its `node_modules` are
installed for darwin-arm64 and `@rollup/rollup-linux-arm64-gnu` is absent, and the npm
registry is blocked there. The build therefore runs for the first time in CI on this
pull request; treat a red check as this change's problem, not a flake.


---

# ROUND TWO — 2026-08-26, later the same day

Dan: "there is a ton of work inside the admin panel that you still need to
audit, enhance, improve and optimize." He was right. Round one fixed what was
broken on the surface. Round two found that the panel could not **write**, and
that the platform's money had no surface at all.

Shipped as PR #788, squash `5652d341`, verified serving on production at
2026-08-26T19:45:18Z.

## 8. The writes never worked

`content_authors` RLS, verified in production:

```sql
"Admins manage authors"  ALL  USING/WITH CHECK
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)

select count(*) from profiles where is_admin is true;  ->  0
```

`profiles.is_admin` is true for **zero rows**. The three accounts that
administer this platform are identified by `profiles.role`
(`daniel@smarter.poker` god, `daniel@bekavactrading.com` god,
`danimal5022@yahoo.com` admin). `content_settings` is worse — its only write
policy is `{service_role}`.

A PostgREST UPDATE or DELETE matching zero rows returns `{ error: null }`. So
creating a horse, renaming one, retiring one, flipping the active toggle, and
**every posts-per-day, delay, model, temperature and grinder setting anyone has
ever changed** reported success and saved nothing. For as long as those
policies have existed.

Fixed with `pages/api/horses/stable-admin.js` — service role behind an admin
gate, payload validated, affected row count returned, `admin_audit_log` written
on every mutation. Deliberately not a policy change: widening
`content_authors` would make 593 rows of content identity writable by anything
holding an admin JWT, with no validation and no audit trail.

## 9. Home Games moderation has never worked

Five of the seven RPCs behind `/horses/hg-moderation` open with:

```sql
IF auth.uid() IS NULL OR auth.uid() <> p_caller_user_id THEN
  RAISE EXCEPTION 'UNAUTHORIZED';
```

Every route called them with the module-level **service-role** client, where
`auth.uid()` is NULL. All five raised UNAUTHORIZED on every request and the
routes turned that into a 500. Reports never listed, appeals never listed,
nothing could ever be resolved, and the GDPR erase path could not run.

The caller's JWT is forwarded now. `fn_get_home_games_onboarding_status_admin`
additionally has no EXECUTE grant for `authenticated`, so it needs the
migration below even with the JWT.

Separately: moderators were approving `delete_content`, `ban_author` and
`strike_author` **without ever seeing the content**. `hg-reports` already had a
detail endpoint returning the reported item; nothing called it. The review
modal renders the content now and will not enable the irreversible actions
until it has loaded.

## 10. execute-sql

- **No rate limit at all** on a route that accepts a 10MB body, opens a direct
  Postgres connection and runs arbitrary SQL.
- The guard whose comment said it "cannot be bypassed" matched `DELETE FROM`
  and `DROP TABLE` but **not `UPDATE` or `INSERT`**. `UPDATE club_members SET
  chip_balance = 999999999` ran, committed, and moved real money. Production
  holds ~121 million chips in that column.
- The "Allow Destructive Operations (DROP, DELETE, TRUNCATE)" checkbox was sent
  as `allowDestructive` and **the server never read it**. The operator ticked
  it, watched it turn red, ran a DELETE, and got a 403.

Now: mutations execute inside `BEGIN ... ROLLBACK` and report the row count
they *would* have affected; a commit requires the caller to echo the statement
back verbatim; every commit writes `admin_audit_log`. The checkbox is gone,
replaced by that flow. The regex is still a regex and the comment now says so.

## 11. Money with no surface

| Table | Rows | What it holds | Surface before |
|---|---|---|---|
| `ledger_reconcile_log` | 20,206 critical | **3.1 billion chips** of wallet drift, filed daily by `reconcile_ledger_nightly` | none |
| `rake_records` | 1,375,288 | 4,028,434 chips all-time, 196,636 in 24h | none |
| `agent_commissions` | 922,861 | 126,934 chips owed, unsettled | none |
| `ca_seat_stack_exits` | 7,919 | non-zero stacks that left the felt | none |

CLAUDE.md section 11.5 describes building that reconciliation machinery
specifically so chip loss would be **loud**. It has been silent because the
only console that could have shown it did not query it. The Club Arena tab now
has Ledger and Revenue sections; the nav badge turns red on critical drift.

The Statistics tab showed four numbers about the blog-post engine. Production
at the time of writing: **137 live tables, 680 players seated, 19,563 hands in
the previous hour, 472,924 in 24 hours** — none of it visible anywhere. It
opens on a platform pulse now, with a "Needs Attention" roll-up that routes to
whichever tab owns each number.

## 12. Fabricated and unreachable

- **Purchase Revenue was pinned at $0.00** by two stacked bugs: the route summed
  `amount_paid || price` and `diamond_purchases` has neither column (it is
  `price_usd`), then the UI divided by 100 — so even a correct figure would have
  rendered 100x too small.
- **`vip_trial`** was one of three promo types the UI offered and is not in the
  route's allowlist at all; picking it always 400'd. The real value is
  `vip_days`. The select is built from the API now.
- **Per-horse hands and profit** were returned as `null` under a comment saying
  they were underivable. `player_stats` has them for all 554 horses that have
  played. (`ca_hand_player_stat` looked like the answer but is a rolling
  1,000-row-per-user window, so summing it would have produced a two-day figure
  labelled lifetime.)
- **The realtime subscription was exactly inverted.** `content_authors`,
  `content_settings` and `pipeline_runs` are not in the `supabase_realtime`
  publication, so those three handlers could never fire. `tables` is — 89,000
  rows, seats turning over every hand — and it was subscribed unconditionally
  from mount, on every tab.
- **`reviewFlag` and `kickSession`** had existed with no caller since the tab
  was written. The anti-cheat route exposes nine actions; the console reached
  two.
- **Cashouts could be approved but never released.** The route has always
  accepted `action: 'cancel'` — the reversible branch — and the console only
  ever sent `'approve'`.
- Seven scraper daemons were scored `unknown` and one permanently `dead`,
  producing a red nav badge that never cleared. Bravo is intentionally off per
  the live-cash-games policy and now says so.

## 13. What the build and CI caught that review did not

Worth recording, because both were mine:

1. **`pages/horses/adminTokens.js` was a route.** Anything under `pages/` must
   default-export a React component. Moved to `src/lib/`.
2. **A temporal dead zone crash.** `resolveCashout` listed `loadBadges` in its
   `useCallback` deps while `loadBadges` was declared 170 lines below it. `const`
   hoists into the TDZ and dep arrays evaluate during render, so it threw
   `Cannot access 'dG' before initialization` at prerender — not at runtime,
   where it would have been someone else's incident. I then wrote a static check
   for the same shape across the file; nothing else matched.
3. **Two ReferenceErrors** caught by the Undefined Identifier Guard on the first
   PR: a `session.access_token` left behind by the auth refactor, which would
   have thrown on every SQL console query, and an `isLeak` that a concurrent PR
   had already removed.

## 14. Still open

- **The two migrations in PR #788 are NOT applied.** Both need review:
  `20260826143000_live_help_tickets_platform_admin_rls.sql` (also grants EXECUTE
  on `fn_is_platform_admin()` to `authenticated`, which **44 other policies
  already call** and currently 42501 on — wider blast radius than the two
  policies it fixes) and `20260826190000_hg_moderation_rpc_grant.sql`.
  Until the first is applied, the Bug Reports tab stays empty for the two `god`
  accounts.
- `admin_audit_log` held **9 rows** for a console with this many destructive
  buttons. Every mutation added in this pass writes one; the older paths still
  do not.
- Only **16 of the 55** avatar-less horses are eligible for generation — the
  route filters on `profile_id IS NOT NULL` and 39 of them have none.
- The site-wide stylesheet (303KB, every page) still carries 4 purple and 12
  green values. None belong to `/horses`; repainting it would change pages
  outside the brief.
