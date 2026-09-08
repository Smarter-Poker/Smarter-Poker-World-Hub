# /hub/my-clubs audit (2026-09-08)

**Question asked by Dan:** do we need this page, is it overkill, does it already
exist elsewhere, should it be archived or enhanced?

**Answer: archive.** Every entity it displayed is already served, correctly, by
Social Pages. Two of its three sections were also broken. Shipped in this
session: the 1,127-line body is gone, the route survives as a signpost. The
route deletion itself is a footer-world restructure and is deferred, with the
reason recorded in section 6.

Every production claim below was verified live against `smarter.poker` and
against Supabase project `kuklfnapbkmacvwxktbh`, not read from source alone.

---

## 1. What the page was

`pages/hub/my-clubs.js`, 1,127 lines, 53 commits since 2026-02-18. Only two of
those commits are feature work (the 2026-02-18 origin and the 2026-04-24 home
games integration). The other 51 are estate-wide sweeps: empty-catch
remediation, the em-dash gate, footer geometry, a back-button pass. The page was
maintained but never developed.

Two tabs. "My Clubs" showed followed venues, then Club Arena clubs, then home
game groups. "Discover" was a venue search that duplicates `/hub/poker-near-me`,
`/hub/home-games` and `/hub/venues`.

Live render for the `kingfish` account on the day of the audit: 4 Club Arena
clubs, 1 home game, and 0 venues, despite that account following a venue.

---

## 2. Section one, followed venues: never worked in production

### 2.1 A typo excluded every poker club on the platform

```js
// pages/hub/my-clubs.js:530-532
const ALLOWED_TYPES = ['home_game', 'club', 'charity'];
setFollowedVenues(venues.filter(v => ALLOWED_TYPES.includes(v.venue_type)));
```

Production `poker_venues.venue_type` values: `casino` 277, `poker_club` 208,
`series` 77, `charity` 27, `tour` 13, `poker_room` 1.

`'club'` is not a value this platform produces. The API emits `poker_club`
(`pages/api/poker/venues.js:1678`). `'home_game'` is synthesised by the API
(`:492`, `:898`) but no such row exists in `poker_venues`. So the filter admitted
`charity` and nothing else, and all 208 poker clubs were dropped.

Verified live:

```
GET /api/poker/venues?id=1996
  -> { id: 1996, name: "Club JAQK", venue_type: "poker_club" }
ALLOWED_TYPES.includes("poker_club") -> false
```

### 2.2 One user, four rows, zero renders

`page_followers` where `page_type='venue'`: 4 rows, 1 distinct user, platform
wide. Resolved one id at a time against production:

| page_id | resolves | venue_type | rendered |
|---|---|---|---|
| `1996` | yes | `poker_club` | no, filtered out |
| `sp-005cddc8-...` | no (404) | none | no |
| `76` | no (404) | none | no |
| `133` | no (404) | none | no |

Three of the four are social-page ids stored under `page_type='venue'`. Zero of
four rendered. This half of the page has a 0% success rate on 100% of the real
data that exists for it.

### 2.3 `/hub/pages` already does this correctly

`pages/hub/pages.js` has a Following filter (`showFollowing` :66,
`followed_only=true` :88) reading the same `page_followers` rows through
`/api/poker/pages`. Verified live with the caller's token:

```
GET /api/poker/pages?followed_only=true  ->  3 rows
  WSOP Circuit                       (tour)   /hub/tours/WSOPC
  Ladies International Poker Series  (tour)   /hub/tours/LIPS
  Club JAQK                          (venue)  /hub/venues/1996
```

It returns the venue My Clubs dropped, plus tours My Clubs could not show at
all, and it pages follows properly (`pages/api/poker/pages.js:295-315` carries a
comment recording the `.limit(100)` truncation bug it already fixed).

### 2.4 The refresh path replaced your clubs with the whole directory

```js
// pages/hub/my-clubs.js:638   note: ids, plural
fetch(`/api/poker/venues?ids=${vIds.join(',')}`)
  .then(r2 => r2.json())
  .then(vjson => { if (vjson.success) setFollowedVenues(vjson.data || []); });
```

`/api/poker/venues` destructures `id`, singular, and has no `ids` handler
(`:749-765`). The unknown parameter was ignored and the request degraded to an
unfiltered directory listing. Verified live:

```
GET /api/poker/venues?ids=1996,76  ->  success: true, 482 rows
```

Those 482 rows were assigned straight to `followedVenues`, bypassing
`ALLOWED_TYPES` as well. Any `DATA_MUTATED` event on topic `social-pages` or
`friends` turned "My Clubs" into every venue on the platform. Nobody noticed
because the list was empty to begin with.

### 2.5 Request fan-out

Per followed venue, capped at 30, the initial load issued a `?id=` detail call,
`/api/poker/live-games`, `/api/commander/waitlist/venue/`, and
`/api/social/pages?linked_venue_id=`. Up to 120 HTTP requests to produce what
the single `/api/poker/pages` call above returns.

---

## 3. Section two, Club Arena clubs: a strict subset of the Arena lobby

Side by side, same account, same moment:

| | `/hub/my-clubs` | `/hub/club-arena` lobby |
|---|---|---|
| Club JAQK | name, Owner, code 77777 | plus 584 members, level 29, 436 active |
| SHARK CLUB | name, Owner, code 25450 | plus 595 members, level 29, 439 active |
| Deep Stack Society | name, Owner, code 11192 | plus 418 members, level 26, 195 active |
| Midway Union | name, Owner, code 55555 | plus 1,179 members, level 33, 875 active |
| Join a club | no | yes |
| Create a club | no | yes |

The lobby is a superset and it is where the player was heading anyway. My Clubs'
own card action read "Open Lobby".

The navigation already admitted this. `src/config/hamburgerMenus.js` carries two
entries with the identical label pointing at different pages:

```
:581   createMenuItem.navigation('My Clubs', '/hub/my-clubs', MenuIcons.club)
:1279  createMenuItem.navigation('My Clubs', '/hub/club-arena', MenuIcons.grid, ...)
```

A third, read-only copy lives at `pages/hub/settings.js:708` and `:2238-2255`,
under a "Club Memberships" heading.

Scale: `club_members` active is 445 rows, of which 432 are horses and 13 are
human rows across 6 humans.

---

## 4. Section three, home game groups, and the reasoning error worth keeping

My first verdict was **keep the route and shrink the page**, on the grounds that
home game memberships had no other working home. Dan pushed back: *"home games
already exists inside of social media, and inside poker near me, so what's the
point?"* He was right.

I had searched `pages/` for code that *queries* `home_game_members` and found
only my-clubs, so I called it unique. That is the wrong test. The right test is
whether the user can **see their groups** by another route, and this platform
does not store a home game as only a `home_game_members` row. It mirrors it as a
social page.

```
social_pages where page_type='home_game':  3 rows
home_game_groups:                          3 rows
```

One to one, all three linked by `linked_entity_type='home_group'` plus
`linked_entity_id`, all three with slugs. The same holds for Club Arena clubs
(`page_type='club'`, `linked_entity_type='club'`) and for Club JAQK the venue
(`linked_venue_id: 1996`). Every entity My Clubs displayed already exists as a
social page.

### 4.1 Social Pages Managed already renders the identical list

`pages/api/social/pages/index.js:244-268`. The `owner_id` branch does not just
match owned pages. Line 259:

```js
query = query.or(`owner_id.eq.${owner_id},and(linked_entity_type.eq.club,linked_entity_id.in.(${joinedClubIds.join(',')}))`);
```

It unions pages you own with clubs you are a member of, which is the exact
`club_members` join my-clubs reimplemented by hand. Verified live, the request
the Managed tab actually sends:

```
GET /api/social/pages?limit=24&offset=0&user_id=<me>&owner_id=<me>
->  5 rows
    SHARK CLUB
    The Midway Club      <- the home game
    Deep Stack Society
    Club JAQK
    Midway Union
```

`/hub/my-clubs` for the same account rendered 4 Arena clubs plus The Midway Club.
The same five entities. One is 1,127 lines; the other is a tab that already
ships, with search, type filters, infinite scroll and a real detail page behind
every row. Narrowing works too: adding `&page_type=home_game` returns exactly
"The Midway Club".

### 4.2 Poker Near Me carries home games as a first-class tab

```js
// src/components/poker-near-me/PokerNearMeFamilyNav.jsx:14-15
{ label: 'Home games', href: '/hub/home-games', matches: ['/hub/home-games'] },
{ label: 'Saved',      href: '/hub/poker-near-me/saved' },
```

Note a separate favourites system alongside it: the `poker_near_me_favorites`
table plus an `sp-favorites` localStorage key
(`src/services/pokerNearMeFavorites.js`), which is **not** `page_followers`. The
platform now has three unrelated "save this" mechanisms: `page_followers`,
`poker_near_me_favorites` and `social_page_followers`. My Clubs read only the
first, which is part of why it looked empty even for users who had saved things.
Worth consolidating one day; out of scope here.

### 4.3 Six working routes to The Midway Club without /hub/my-clubs

| Route | Works |
|---|---|
| `/hub/social-pages` Managed tab | yes, verified live |
| `/hub/social-pages` Managed plus Groups filter | yes, verified live |
| `/hub/home-games` discovery | yes |
| Poker Near Me "Home games" tab | yes |
| `/hub/home-games/the-midway-club/dashboard` | yes, host |
| `/u/kingfish` public profile | yes, hosted groups |

My Clubs was the seventh and the only broken one.

Two near misses that are worth knowing about:
`pages/hub/commander/home-games/index.js:134-154` has a "My Games" tab that calls
`/api/commander/home-games/groups?my_groups=true`. That route does not exist,
the string `my_groups` appears in zero API files, and nothing rewrites
`/api/commander/*`, so the tab 404s and renders empty. And
`pages/u/[username].js:66-71` lists only groups you *host*, not ones you are
merely a member of.

---

## 5. Also found

- **Emoji in source, RULE 7.** Six in `pages/hub/my-clubs.js`: lines 936 and 975
  (house), 1019 (magnifier), 1050 (multiply), 1076 (magnifier tilted), 1112
  (globe). The spade characters at 122, 220, 345 and 902 are fine, since the
  rule permits Unicode symbols. All removed with the body.
- **An empty-state bug that hid the one section that worked.** At `:861` the
  condition was `followedVenues.length === 0 && arenaClubs.length === 0`, with
  `homeGroups.length` missing, while the tab label at `:834` counted home groups.
  A user in a home game but no club saw the tab read "My Clubs (2)" directly
  above a body saying they had no clubs. Production has 10 active home game
  memberships and only 1 of those users is also in a club, so 9 of 10 hit it.
- **`/hub/my-venues` is unrelated** despite the name. It is a venue employee
  portal: schedule, downs, time clock.

---

## 6. Why the route was retired rather than deleted or redirected

This is the part I got wrong twice, so it is worth stating precisely.

On `main` the `my-clubs` footer world owns exactly **two** routes:
`['/hub/my-clubs', '/hub/my-venues']`. `/hub/home-games` belongs to the
**poker-near-me** world. (An earlier draft of this audit said otherwise; it was
reading a stale local branch, which is also a lesson: read `origin/main`, not
the working tree, before reasoning about config.)

So redirecting or deleting `/hub/my-clubs` leaves:

| Test | What breaks |
|---|---|
| `e2e/global-footer-visual.spec.ts:32` | `WORLD_ROUTES` entry; three tests assert a `my-clubs` world footer on that route |
| `e2e/020-hamburger.spec.ts:118-129` | navigates to the path, asserts the tile carries `aria-current="page"` |
| `__tests__/world-command-destinations.test.mjs:38-47,72` | every href must resolve to a real file; `commands.length === 84` is pinned |
| `__tests__/bottom-nav-clearance.test.mjs:30,47,124` | `EXPECTED_WORLDS`, artwork map, `routeExists` on every item |
| `__tests__/world-command-menu-law.test.mjs:31,67,152-165` | `routeCount === 203` pinned against the audit inventory |

Plus `src/config/world-footer-navigation.json`, `src/config/bottom-nav-routes.json:28`,
`src/orbs/manifest/registry.ts:117`, `src/config/hamburgerMenus.js:581`,
`pages/hub/home-games/[slug]/dashboard.js:452` and `scripts/verify-scroll.js:89`.

Deleting the route is therefore a **footer-world restructure**, not a file
deletion. Retiring the body now removes 100% of the broken code with none of
that risk: no config change, no test change.

---

## 7. Two corrections to my own findings

Kept in the record rather than edited out, because both make the work smaller
and a future agent could easily repeat them.

- **The Social Pages "home game category returns zero" is deliberate, not a
  bug.** `pages/api/social/pages/index.js:230-232` excludes home games from the
  public directory for anyone who is not their owner, and the comment at
  `:236-240` says so outright: *"page_type='home_game' will produce zero rows,
  that's intentional. Home-game consumers use /api/public/home-games/discover
  instead."* Home games are people's houses; keeping them out of a public
  directory is correct. The real defect is cosmetic: the UI still offers a "Home
  Games" option in its category filter (`pages/hub/social-pages/index.js:38`)
  that can never return a row for a non-owner. Delete the option, do not "fix"
  the filter.
- **"Your Pages" is behaving correctly.** It reads `social_page_followers`, so it
  lists pages you follow. Membership is a different relation and the Managed tab
  serves it. My first framing, that the tab under-reports, was wrong: the two
  tabs answer two different questions and each answers its own correctly.

---

## 8. What shipped, and what is left

**Shipped** on branch `fix/retire-my-clubs-duplicate-route`: the body of
`pages/hub/my-clubs.js` reduced from 1,127 lines to a signpost pointing at
Social Pages Managed, the Club Arena lobby, `/hub/pages` and Home Games. No
config change, no test change, no migration.

**Deferred, and why.** The following all need files above the GitHub MCP
transcription ceiling that this session was limited to, so they need a session
with a working `git push` rather than a careful retype:

1. Restructure the `my-clubs` footer world so the route can be deleted outright.
   Touches `src/config/hamburgerMenus.js` (78 KB) and both e2e specs (26 KB and
   30 KB).
2. Remove the dead "Home Games" category option from
   `pages/hub/social-pages/index.js:38` (39 KB file).
3. Rename `hamburgerMenus.js:1279` "My Clubs" to "Club Arena Lobby", so the
   duplicate label dies with the page.
4. Clean the junk in `social_pages`: 21 of 31 `page_type='club'` rows are test
   residue with null slugs (`Crest Cert ...`, `Preset Crest Cert ...`,
   `probe-own`). They pollute Discover for every user. This one is data, not
   code, so it wants a migration rather than a push.

---

## 9. Lesson for the next agent

*"Is this the only code that queries X"* is not the same question as *"is this
the only way a user sees X"*. On a platform that mirrors every entity into
`social_pages`, the second question is the one that decides whether a page earns
its route. Ask it first, and ask it of `origin/main`, not of your working tree.

---

*Audited by Claude (Cowork), 2026-09-08, and corrected the same day after Dan
challenged the conclusion. All production claims verified live via
`/api/poker/venues`, `/api/poker/pages`, `/api/social/pages`, the Club Arena
lobby, and direct Supabase queries against `kuklfnapbkmacvwxktbh`.*
