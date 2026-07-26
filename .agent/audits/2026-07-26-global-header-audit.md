# Global Header Audit — `src/components/ui/UniversalHeader.js`

**Date:** 2026-07-26
**Scope:** Why the profile avatar reloads on every navigation, plus a full sweep of the global header for bugs, gaps, stubs, regressions and wiring issues.
**Method:** Direct source reading on the live working tree, plus three independent audit passes (consumers, data layer, adversarial verification of the avatar diagnosis). Every finding below carries `file:line` evidence and is marked CONFIRMED unless stated otherwise.

---

## Part 1 — Why the profile icon reloads on every page change

The avatar is not being re-downloaded. The bytes come from the service-worker `CacheFirst` image cache (`next.config.js:141-148`), and no cache-busting query parameter is appended anywhere — `avatar-service.js:38,44` and `AvatarContext.jsx:387-389` both return the URL verbatim. What the user sees is the avatar element being **destroyed, re-created, and repainted with the wrong value first** on every route change. Five causes compound.

### 1. The header is not global — it is re-mounted by every page

`pages/_app.js:680` renders `<Component {...pageProps} />` and nothing else. `UniversalHeader` appears in **116 individual page files**, never in `_app.js`, and there is no `getLayout` persistent-layout pattern anywhere in the repo. Every navigation therefore unmounts the entire header and mounts a fresh one — new state, new effects, new DOM node for the orb.

### 2. `key={router.asPath}` guarantees the remount even when React would otherwise reuse the tree

```jsx
// pages/_app.js:679-681
<PageErrorBoundary key={router.asPath}>
  <Component {...pageProps} />
</PageErrorBoundary>
```

`asPath` includes the query string, so React tears down and rebuilds the whole page subtree on `?tab=x` changes and on same-component dynamic-route navigations too. There is no navigation path that preserves the header.

### 3. `setUser(authUser)` wipes the cached avatar — this is the visible flash

**This is the primary cause and the cheapest fix.**

```js
// UniversalHeader.js:341-342
if (authUser) {
    setUser(authUser);
```

`authUser` is the raw Supabase auth object parsed out of `localStorage['smarter-poker-auth']` at `:319-322`. It carries `id`, `email` and `user_metadata` — it has **no `avatar` key**. Line 342 is a full state *replacement*, not a merge, so it destroys the `avatar` that `_cachedHeader` had just supplied synchronously at `:77-101`.

The consequence, via `:218` and `:221`:

```js
const activeAvatarUrl = isClubMode && clubPage ? (...) : (contextAvatar?.imageUrl || user?.avatar);
const displayAvatar   = isMounted ? (activeAvatarUrl || '/default-avatar.png') : null;
```

With `user.avatar` gone, the orb falls through to `/default-avatar.png` for the **entire duration of the `/api/user/get-header-stats` round-trip** — which under failure can be three retries with 500/1000/2000 ms backoff (`:346`, `:420-427`) plus a direct Supabase REST fallback (`:443`). That is a multi-second swap to the generic avatar, not a sub-frame blip.

It is masked only when `contextAvatar` is already populated — see cause 5 for why that mask is missing on every hard load.

### 4. The `isMounted` gate blanks the avatar for the first render of every mount

`:122` `useState(false)` → `:204-205` `setIsMounted(true)` inside a plain `useEffect` → `:221` `displayAvatar = isMounted ? ... : null`. The header already holds the cached avatar on render 1 (read synchronously at `:77-101`); the gate throws it away anyway. During that render the orb also picks up `profile-orb-shimmer` (`:1078`) and restarts the `pulse-orb` animation, because the `.profile-orb[style*="url("] { animation: none }` override cannot match a gradient background.

Honest caveat: React normally flushes the passive effect and the resulting re-render inside the same macrotask, so this null render may not always reach the screen. The in-file comment at `:212-215` claiming "zero visual flash" is wrong about *why*, but roughly right about the outcome. Treat this as a secondary cleanup, not the headline.

### 5. `AvatarContext` — the one piece of state that survives navigation — starts as `null`

`AvatarProvider` sits at `_app.js:672`, above the `key` boundary, so its state does persist across routes. But `AvatarContext.jsx:27` is `useState(null)` with no synchronous localStorage seed; the avatar is only loaded asynchronously at `:366-373` → `:375-415`. So on every hard load, and until that async load resolves, `contextAvatar` is null and cannot mask cause 3.

### Secondary contributors

| Contributor | Evidence | Effect |
|---|---|---|
| `loadUser()` refires on every mount | `:311` effect, `:549` deps `[]` | A full `get-header-stats` POST (up to ~8 DB round-trips) on every single page change, with no freshness guard or dedupe |
| 7 pages import the header `ssr:false` | `pages/hub/{profile-edit,video-library,diamond-store,news,poker-tours,memory-games,messenger}.js` | Header renders nothing at all on first frame — hard layout shift on top of everything else |
| `.page-transitioning` pauses all animation | `_app.js:392-396` — `animation-play-state: paused !important` on `*` | The orb's animation visibly freezes then jumps on every route change |
| ~350-line `<style>` lives inside the component | `:698` | Torn down and re-inserted on every remount, forcing a style recalc and restarting keyframes from 0% |
| `<link rel="preload" as="image">` inside the unmounting `<Head>` | `:694` | Removed and re-added every navigation, and only renders when `displayAvatar` is *already* truthy — i.e. after the frame that needed it. Contributes nothing |
| Cache buster wipes all Cache Storage | `_app.js:113-127` | After each deploy the SW image cache is deleted, so the avatar genuinely is re-downloaded once |

### Fixes, in order of value

1. **`:342` — merge instead of replace.** `setUser(prev => ({ ...prev, ...authUser }))`. One line, removes the multi-second default-avatar swap.
2. **Seed `AvatarContext.jsx:27` from `localStorage` synchronously**, the same way `_cachedHeader` does at `:77`. Restores the cross-navigation mask on hard loads.
3. **Drop the `isMounted` gate for the avatar** at `:221`, or move the cache read into `useSyncExternalStore` with a `null` server snapshot so React handles the hydration boundary in one commit instead of two.
4. **Hoist `<UniversalHeader />` into `_app.js`, above the `key={router.asPath}` boundary.** This is the structural fix — it kills the remount, the per-navigation API call, the style-block churn and the animation restart in one move. Pages that need a different `pageDepth` can expose it as a static property on the page component, or it can be derived from `router.pathname` depth. This also fixes findings 16, 18 and 20 below by construction.
5. **Guard `loadUser()` with a freshness check** — skip the network entirely when `_cachedHeader._ts` is under ~60 s old.

Also worth correcting while in there: the cache object is written with `userId` (`:392`, `:469`) but read as `user?.id` at `:125` (`useDiamondBalance(user?.id)`), so on the first render of every mount the diamond hook receives `undefined` and its realtime subscription churns. The same mismatch makes the `authUtils.js:80-86` fallback branch dead code.

---

## Part 2 — Deep dive: everything else

### 2.1 Data layer — correctness

**1 · HIGH — the unread-notification predicate counts already-read rows forever.**
`useUnreadCount.jsx:126` and `get-header-stats.js:60` both use:
```js
.or('read.eq.false,read.is.null,is_read.eq.false,is_read.is.null')
```
The comment above it (`useUnreadCount.jsx:117`) states the intent is "neither flag set to true", but `.or()` means *either* flag looks unread. A row with `read=true, is_read=NULL` still matches `is_read.is.null` and is counted. This is not theoretical — `supabase/migrations/20260512_backfill_notification_is_read.sql:2-6` documents the exact bug and patched it with a one-time `UPDATE` rather than a schema default, trigger or query fix. Writers that set only one flag re-create it immediately: `SmarterPokerLayout.jsx:126` (notification click) and `:149` (**Mark all read**), `trivia/tournaments.js:227`, `LeakService.js:187`.
*Impact:* the user hits "Mark all read", the badge clears optimistically, then the 30 s poll (`:224`) or the realtime UPDATE handler (`:190`) restores the full count. The badge is permanently un-clearable.
*Fix:* `.not('read','is',true).not('is_read','is',true)` in both places; route the two write sites through `/api/notifications/mark-read`, which correctly writes both (`mark-read.js:40,49,57`). Better still, add `ALTER TABLE notifications ALTER COLUMN is_read SET DEFAULT false` plus a `BEFORE UPDATE` trigger mirroring the two columns, then delete the dual-column logic.

**2 · HIGH — four writers race on one `notificationCount`; the badge goes stale-zero then resurrects.**
Writers: bell click `setNotificationCount(0)` (`:1134` region) which **does not mark anything read in the DB**; `onNotifCleared` from the iframe postMessage bridge (`:1197`); the 800 ms `setTimeout` refetch in `closeOverlay` (`:244-286`); and the `liveNotificationCount` mirror effect (`:176-181`).
*Concrete failure:* user clicks the bell (badge → 0), reads nothing, closes. `liveNotificationCount` is still N, so the mirror effect never re-runs and the badge stays 0 despite N unread. One new notification arrives → `useUnreadCount.jsx:163` does `prev + 1` → N+1 → the badge jumps from 0 to N+1, resurrecting everything the user just dismissed.
Also: `FullScreenPageOverlay.js:50` claims the postMessage bridge "replaces the 800ms setTimeout in closeOverlay" — the setTimeout was never removed. Both fire on every notification-overlay close: two writes and one redundant API call.
*Fix:* make the bell click a real mutation (POST `/api/notifications/mark-read`) instead of a cosmetic zero; delete `:244-286`; make `liveNotificationCount` the sole owner and drop the local copy.

**3 · HIGH — the header badge silently drops poker/page notifications.**
`get-header-stats.js:142` returns social + page/poker counts combined. `useUnreadCount.refreshNotifications()` (`:121-126`) queries only the `notifications` table — it has no `page_notifications` / `notification_reads` logic at all. The mirror effect at `UniversalHeader.js:177` then overwrites the API's combined count with the hook's social-only count within 30 s. The comment at `:169-174` explicitly acknowledges the API "captures both social + poker counts the bare notifications table query does not include" — and clobbers it anyway.
*Impact:* poker and page-follow notifications show in the badge for a few seconds after load, then vanish.
*Fix:* have `refreshNotifications()` call `/api/user/get-header-stats` so there is one source of truth.

**4 · HIGH — `UnreadProvider` reads the user once and never re-reads.**
```js
// useUnreadCount.jsx:56-62
useEffect(() => { const user = getAuthUser(); if (user) setUserId(user.id); }, []);
```
The provider mounts at app root (`_app.js:671`), i.e. before login, with no `onAuthStateChange` subscription. After an SPA login with no full reload, `userId` stays `null` forever — `refreshUnread` and `refreshNotifications` early-return (`:66`, `:119`), no realtime channel is created, and **both header badges read 0 for the entire session**. Symmetrically, logout never clears `userId`, so the previous user's counts persist.
*Fix:* subscribe to `supabase.auth.onAuthStateChange` in that effect and `setUserId(session?.user?.id ?? null)`.

**5 · MED-HIGH — BroadcastChannel leaked when the header unmounts mid-load.**
`cleanupNotifSync` is declared at `:309` but only assigned at `:519`, inside `loadUser()` — after an await chain of up to three fetch retries plus a REST fallback. The effect cleanup at `:543-548` runs at unmount while `cleanupNotifSync` is still `null`, and there is **no `if (!mounted) return;` guard before `:519`**. The `smarter_poker_notif_sync` channel is therefore created *after* unmount and never closed; its handler keeps calling `fetchUnreadCount()` against the API forever, and it compounds with every navigation.
`ThreePillHeader.js:189,238,274-278` has the identical shape and additionally leaks a **Supabase realtime channel** whose name embeds `Date.now()`, so every leak is a distinct topic that can never be deduped or reclaimed.
*Fix:* guard with `if (!mounted) return;` before `:519` and register cleanups into a `cleanupsRef` array the effect drains.

**6 · MED — `is_admin` is silently dropped in the REST fallback.**
`:444` selects `username,full_name,avatar_url,diamonds,is_vip` — no `is_admin` — but `:459` does `setIsAdmin(!!profile.is_admin)`, which is therefore always `false`. Whenever all three API attempts fail and the fallback succeeds, an admin loses admin-only header UI and the admin-only MLB sync interval at `:196` stops. It also writes `sp-profile-admin` inconsistently against the primary path.
*Fix:* add `is_admin` to the select at `:444`.

**7 · MED — cached diamond balance has no owner check and no TTL.**
`useDiamondBalance.js:43-52` reads `sp-cached-header-user.diamonds` with no `userId` comparison and no `_ts` expiry — unlike `UniversalHeader.js:94-95`, which checks both — and seeds `useState` from it at `:56-59`. Worse, `ThreePillHeader.js:246-254` writes that key **without a `userId` field at all**, which also defeats UniversalHeader's own guard, since `:95` is `if (data?.userId && ...)` and a falsy `userId` skips the check entirely.
*Impact:* log out, log in as a different user on the same device, and the header shows the previous user's diamond balance (and via the second issue their avatar and username) until the API lands.
*Fix:* `getCachedBalance(userId)` with mismatch/TTL rejection; add `userId` to the `ThreePillHeader.js:247` payload; clear both keys on sign-out.

**8 · MED — notification-count query errors are swallowed on both sides.**
Server: `get-header-stats.js:81` never inspects `socialCountResult.error`; `let notificationCount = socialCountResult.count || 0` turns any failure — dropped column, RLS change, `.or()` parse error — into a clean `0` with `success: true`. Only `profileResult.error` is checked (`:73`). Client: `useUnreadCount.jsx:127` gates on `if (!error && typeof count === 'number')`, so a failure leaves the previous value with only a `console.warn`.
*Impact:* a broken notifications query presents as "notifications work, you just have none" — invisible to monitoring.

**9 · MED — mark-all-read fires one full count query per row.**
Every `UPDATE` on `notifications` calls `refreshNotifications()` undebounced (`useUnreadCount.jsx:181-191`). `mark-read.js:57` marks all rows in one statement, but Supabase realtime emits one UPDATE event per row — 40 unread notifications produce 40 concurrent `count exact head` queries.
*Fix:* trailing debounce (~300 ms) at `:190` and `:198`.

**10 · LOW-MED — `FullScreenPageOverlay` is never rendered with `isOpen=false`.**
`:1191-1193` renders it as `{overlayPage && <FullScreenPageOverlay isOpen={true} .../>}`, so the entire `if (!isOpen) { ... iframe.src = 'about:blank' ... }` branch (`FullScreenPageOverlay.js:19-31`) is dead code — the documented "Bug #8" fix never executes. The unmount path is equivalent today, but the guard is misleading and will silently stop working if anyone keeps the overlay mounted. Separately, `onClose` and `onNotifCleared` are inline arrows recreated on every parent render, so the `keydown` and `message` listeners are torn down and re-added on every count or balance tick.
*Fix:* render `isOpen={!!overlayPage}` unconditionally; wrap both callbacks in `useCallback`.

**11 · LOW — `get-header-stats` inefficiencies.** Sequential `await` inside the chunk loop at `:95-106` means 100 follows = five sequential `page_notifications` round-trips plus a sixth for `notification_reads` (`:109`); the `Promise.all` at `:87` only parallelises the whole block against the messages block. `.limit(100)` at `:65` and `:104` both truncate silently, so a heavy follower gets an under-reported badge with no signal. There is no rate limiting at `:23`, unlike sibling routes (`mark-read.js:21` uses `applyRateLimit`), on what is the most-called endpoint in the app.

**12 · LOW — contradictory cache header (SUSPECTED impact).** `get-header-stats.js:30` sets `private, s-maxage=30, stale-while-revalidate=60`. `s-maxage` targets shared caches while `private` forbids them. Vercel honours `private`, so this is inert today, but any intermediary preferring `s-maxage` would serve one user's diamonds/VIP/notification counts to another. The client only ever uses POST, so the GET branch is unused anyway — delete it or drop `s-maxage`.

**13 · LOW — hardcoded Supabase URL and anon JWT literal** at `UniversalHeader.js:432` and `get-header-stats.js:9,16`. The anon key is public by design, but a baked-in literal survives project rotation and will fail silently.

**Not a vulnerability (checked explicitly):** `get-header-stats.js` does **not** trust the client-supplied `userId` in the POST body. `:39-41` derives the user from `getServerUserWithFallback(req, ...)`, which HMAC-verifies the Bearer JWT including `exp`/`nbf`/`alg` with a constant-time compare (`commander-shared/src/lib/serverAuth.js:116-158`). The body `userId` is never read. It should still be removed from the request bodies (`UniversalHeader.js:363`, `useDiamondBalance.js:73`) so it doesn't imply otherwise to the next reader.

**Unread DM counts — by design, with a gap.** `useUnreadCount.jsx:22-30` documents removing the `unread-messages` realtime channel for cost reasons; increments now arrive only via the 30 s poll (`:224`). Decrements are correct on the main messenger — `messenger.js:1658-1686` awaits `/api/messenger/mark-read` before `refreshUnread()`. But `SmarterPokerMessenger.jsx:952` and `ClubArenaMessenger.jsx:940` call `useMessengerService`'s separate `refreshUnreadCount()` and never touch the global provider, so reading DMs on those surfaces leaves the header badge stale for up to 30 s.

**Clean:** `useProfileRealtime.js` is well built — ref-counted single `profiles:${userId}` channel, callbacks held in refs so identity churn doesn't resubscribe, correct `[userId]` deps at `:110`, cleanup releases and removes on last subscriber (`:70-84`). No TODO/FIXME/stub short-circuits exist in any of the audited data files; every `return 0` is a legitimate empty-set or SSR guard.

### 2.2 Structure and wiring across the 116 consumer pages

**14 · HIGH — a duplicate sticky header occludes the entire global header on article pages.**
`pages/hub/article.js:579` renders `UniversalHeader` (`.universal-header` is `position: sticky; top: 0; z-index: 100`), then `:590` renders `<header className="header">` whose scoped style at `:681-692` sets the *identical* `position: sticky; top: 0; z-index: 100` with a near-opaque `rgba(10,10,18,0.95)` background and a backdrop blur. Same offset, same z-index — DOM order wins, so the share/bookmark bar paints over the whole header.
*Impact:* scrolling an article makes the back button, avatar, wallet, messages, notifications and settings all disappear. The user cannot leave the article from the header.
*Fix:* remove `position: sticky; top: 0` from `.header` at `:689-690`, or set `top: 64px; z-index: 99`.

**15 · HIGH — `pageDepth` driven by component state makes "Back" exit the page.**
`pages/hub/social-media/index.js:11537` passes `pageDepth={showClubPages ? 2 : 1}`, where `showClubPages` is local `useState` (`:8505`), not a route. When true the header shows "Back" whose handler is `router.back()`, and no `onBackClick` override is passed — so pressing it leaves `/hub/social-media` entirely instead of returning to the feed.
*Fix:* keep `pageDepth={1}` and pass `onBackClick={showClubPages ? () => setShowClubPages(false) : undefined}`.

**16 · HIGH — twelve nested sub-pages omit `pageDepth`, rendering "HUB" with a full document reload.**
Default is `pageDepth = 1` (`:64`), so these render the HUB icon with `onClick = () => { window.location.href = '/hub' }` — a hard navigation that drops SPA state and re-downloads the bundle:
`training/bluff-catcher.js:140`, `training/final-table-sim.js:123`, `training/hand-lab.js:144`, `training/mixed-strategy-lab.js:95`, `training/study-group.js:142`, `training/tournament-prep.js:106`, `social-pages/create.js:201`, `social-pages/[pageId]/manage.js:325,335,351`, `poker/lobby.js:50`, `home-games/[slug].js:601` (error-fallback branch; the success branch at `:777` correctly passes `2`).
Four of them additionally render an in-page button *also labelled "Hub"* pointing somewhere different — `mixed-strategy-lab.js:99-110`, `final-table-sim.js:127-138`, `tournament-prep.js:110-120`, `study-group.js:148` all `router.push('/hub/training')`. Two adjacent controls, same label, different destinations.
*Fix:* `pageDepth={2}` on all twelve; for the four with their own back button, `<UniversalHeader pageDepth={2} hideLeftIcon />` is exactly what `hideLeftIcon` is documented for (`:70`).

**17 · HIGH — dead hamburger button.**
`pages/hub/notifications.js:606` passes `onMenuClick={() => {}}`. The header renders the hamburger whenever `onMenuClick` is truthy (`:1042-1051`), and an empty arrow is truthy — so during the loading skeleton the button renders and does nothing. The non-loading branch at `:654` correctly passes `onMenuClick={() => setMenuOpen(true)}`.

**18 · MED — 24 direct `/hub` children pass `pageDepth={2}`, showing "Back" where the standard mandates "HUB".**
Icon selection is purely `pageDepth >= 2` (`:1058-1059`), so an `onBackClick` override patches the behaviour but not the wrong glyph or alt text. Affected: `article.js:579`, `avatars.js:121`, `bankroll-manager.js:822`, `daily-tournaments.js:366`†, `events-calendar.js:762`†, `friends.js:1172`, `god-mode-demo.js:95`, `help.js:114`, `home-games.js:774`†, `messenger.js:3411`, `my-clubs.js:802`, `my-venues.js:653`, `notifications.js:606` and `:654`, `pages.js:181`, `poker-series.js:741`†, `poker-tours.js:895`†, `profile-edit.js:355`, `promotions.js:129`, `saved-posts.js:242`, `settings.js:962`, `toke-tracker/index.js:127`, `MLB-ANALYTICS/index.tsx:502`† († = also passes `onBackClick`.)
The 17 without an override run `router.back()`, which on a cold deep-link — shared URL, PWA launch, notification tap — has no history entry to return to.

**19 · MED — `pageDepth={3}` used in six places**, a value outside the documented set: `MLB-ANALYTICS/best-bets.tsx:482`, `home-games/[slug]/dashboard.js:369`, `toke-tracker/{analytics.js:106,shift.js:80,vault.js:130,venues.js:122}`. It works today only because every branch tests `>= 2`. `best-bets.tsx` is internally inconsistent — `:482` uses `3` while `:2058` and `:2102` use `2`.

**20 · MED — roughly 100 real `/hub` pages render no header at all.**
Overwhelmingly `pages/hub/training/*` — 80+ full pages including `equity-calculator.js` (1075 lines), `icm-calculator.js` (1276), `hand-history-upload.js` (1722), `solutions.js` (1733), `play-mode.js` (1789) — plus `session-history.js` (567), `hand-history.js` (517), `lives.js` (1238), `poker-tools.js` (711), `home-games/in/**`, `training/arena/[gameId].js`, `trivia/{cash,gto,icm,mtt}.js`. `club-arena` has no page file under `pages/hub/` at all, so the documented exception covers none of these. (Excluded from the count: 15 redirect stubs and the 36 `commander/*` pages, which use `CommanderPageShell` — itself an undocumented second header system.)
`session-history.js` is the sharpest case: no header, no back button, no `/hub` link — only `<BottomNavBar />` at `:563`.
*Impact:* no diamonds, messages, notifications, avatar or settings across the largest section of the product.

**21 · MED — a second full-width bar stacked under the header on MLB pages.**
`MLB-ANALYTICS/index.tsx:512`, `props.tsx:1114`, `best-bets.tsx:2107` each render a full-width `<header>` immediately after `UniversalHeader` and `MlbSubNav`. Not sticky, so no occlusion — but it is a third stacked bar, ~200 px of chrome before content on mobile, and `props.tsx:1120-1125` adds a second back affordance ("← DASHBOARD") duplicating the header's.

**22 · MED — `ThreePillHeader.js` is dead and has drifted on every axis.**
Its only consumer repo-wide is `pages/hub/header-test.js:8,26` — a self-described blank test page that is a live, unguarded public route. Drift against `UniversalHeader`: 2 props vs 7; text `← Hub` button vs image buttons; pre-v4 `btn-hamburger.png`; `brand-text.png` vs `brand-text-clean.png`; inline SVGs vs the metallic PNG icon set; `diamond-icon.png` vs `header-wallet-v4.png`; no VIP badge; no `useActiveIdentity` club/page identity; no `FullScreenPageOverlay` (hard `router.push` instead); no `useCurrentUser` username refresh. It also carries finding 5's leak shape in a worse form.
*Fix:* delete both files. Nothing 404s today, but it is a maintenance trap someone will copy.

**23 · LOW — `onSettingsClick` has zero consumers.** Declared at `:68`, branched at `:1145`; `grep` returns nothing outside the component. Either wire it up on `settings.js` / `trivia/settings.js` or remove the branch.

**24 · LOW — `/hub` renders a HUB button that hard-reloads the page you are already on.** `pages/hub/index.js:124-127` passes `pageDepth={1}`, giving a button whose handler is `window.location.href = '/hub'`. Consider `hideLeftIcon` on the hub root.

**25 · LOW — `hideLeftIcon={false}` is a no-op** at `poker-near-me/lobby.js:2248`. Worth noting: **no page anywhere passes `hideLeftIcon={true}`**, so nothing is stranded by that prop — the stranding problem is finding 20 instead.

**26 · LOW — latent crash in club mode.** `:1094` calls `activeName.charAt(0)`, where `activeName = clubPage.name` when `isClubMode` (`:219`). `ActiveIdentityContext.jsx:109,261` populates `name` straight from the DB row; if it is ever null the header throws a `TypeError` and the whole page subtree hits the error boundary. Add `|| ''`.

**Clean:** no page passes an unsupported prop — all 142 JSX elements use only `{pageDepth, showSearch, onSearchClick, onMenuClick, onSettingsClick, onBackClick, hideLeftIcon}`, no spreads, and every handler value resolves to a function. No page imports a hamburger menu while failing to pass `onMenuClick`, so there is no orphaned drawer — though 100 of 142 usages omit `onMenuClick` entirely, and `scripts/temp_add_hamburger.js` (a one-off codemod covering 4 files) alongside the 28 route keys in `src/config/hamburgerMenus.js` indicates a rollout that was started and never finished.

### 2.3 Process

**27 · The header standard is stale and unenforced.** `.agent/workflows/header-standard.md` specifies a "💎 Diamonds with buy button", an "XP • LV display", and data sources `profiles.xp_total` via `queryProfiles()` / `queryDiamondBalance()`. The header renders no XP or level anywhere (zero matches for `XP`, `xp_total`, `level`), shows a wallet icon rather than an inline diamond count, and fetches from `/api/user/get-header-stats` plus the `useDiamondBalance` / `useAvatar` / `useUnreadCount` hooks. Its "Enforcement" section describes a pre-merge check that is demonstrably not running — which is the root cause of findings 16, 18 and 20.
*Fix:* rewrite the doc against reality and add a CI lint that asserts every `pages/hub/**` page renders `UniversalHeader` with a `pageDepth` matching its path depth.

---

## Suggested order of work

1. `UniversalHeader.js:342` — merge instead of replace (Part 1, cause 3). One line.
2. `useUnreadCount.jsx:56-62` — subscribe to auth changes (finding 4). Badges are currently dead for the whole session after any SPA login.
3. `useUnreadCount.jsx:126` + `get-header-stats.js:60` — fix the unread predicate (finding 1). Badge is currently un-clearable.
4. `article.js:689-690` — un-stick the duplicate header (finding 14). Users are trapped on article pages.
5. `UniversalHeader.js:519` — add the `if (!mounted) return;` guard (finding 5). Leak compounds per navigation.
6. Seed `AvatarContext.jsx:27` from cache; drop the `isMounted` gate at `:221` (Part 1, causes 4 and 5).
7. Hoist the header into `_app.js` above the `key` boundary (Part 1, cause 1/2) — this is the structural fix, and it retires findings 16, 18 and 20 by construction.
8. Consolidate the notification-count writers (findings 2 and 3).
9. Delete `ThreePillHeader.js` and `pages/hub/header-test.js` (finding 22).
10. Rewrite `header-standard.md` and add the CI check (finding 27).
