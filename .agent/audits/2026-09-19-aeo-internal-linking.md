# A Sitemap Is An Invitation. A Link Is The Road.

2026-09-19. AEO phase 3, internal linking.

## What Was Measured

Every earlier measurement in this programme read one page at a time and
asked whether it said enough. Titles, descriptions, canonicals, headings,
structured data, word counts: by the end of 2026-09-18 all 1,191 sitemap
routes passed every one of those checks.

None of them asked a different question: can anything find the page?

Crawling from `/` as OAI-SearchBot, no JavaScript, depth 3, and comparing
what was discovered against the sitemap:

```
family                       in sitemap   reachable
/hub/venues/<id>                    478    476  100%
/hub/poker-near-me/in/...           389    389  100%
/hub/series/<id>                    225      0    0%
/hub/tours/<code>                    28      0    0%
/hub/home-games/in/...                4      0    0%
curated /hub routes                  67     50   75%
                                   ----   ----
                                   1191    915   77%
```

276 pages, 23 percent of the site, were listed in the sitemap and linked
from nowhere.

## Why

The cause was the same in every case and it was not subtle. The directory
card navigated through its wrapper's `onClick` with `router.push`, so the
server HTML carried no `href` at all:

```
/hub/poker-tours            39 links,  0 to any /hub/tours/<code>
/hub/poker-series          164 cards,  0 to any /hub/series/<id>
/hub/home-games             33 links,  0 to /hub/home-games/in
```

A reader with a mouse never noticed. A crawler saw a grid of divs.

The venue directory measured 100 percent the whole time, and for exactly
one reason: `PokerNearMeLocationPage.jsx` renders a real `<Link>` per venue.
The pattern was already in the codebase. Two directories beside it had not
adopted it.

## What Changed

Tour cards, series cards and the Poker Near Me calendar chips now render a
real `href` alongside whatever the click does. The live-games venue card
links its venue name. `/hub/poker-tours`, `/hub/poker-series` and
`/hub/training` gained the server rendered summary block the rest of the hub
already had, which is what carries the cross links, so the tours directory,
the series directory, and six training pages stopped being orphans.

Two defects fell out of the measurement rather than being looked for:

**RRPT and ROUGHRIDER.** `/hub/poker-tours` rendered a card for each. Same
tour, same name, same website, two database spellings. The sitemap already
offered only the registry code and `/hub/tours/RRPT` already pointed its
canonical at `ROUGHRIDER`, so the card was the last place still sending
readers and crawlers to the duplicate. Every tour object leaving
`pages/api/poker/tours.js` now carries `detail_path`, resolved by the same
function the sitemap uses. A card cannot invent its own URL.

**Six tours nobody could reach.** `/hub/tours/BORGATA`, `LODGE`, `SEMINOLE`,
`TCH`, `VENETIAN` and `WYNN` are real pages in the sitemap. The tours
directory fetches with `traveling_only=true` and excludes them by design, so
nothing on the site linked to any of them. They now have a section of their
own, `House Series At One Venue`, which is also the honest thing to show a
reader looking for the Wynn schedule.

## The Law, And What It Does Not Claim

`__tests__/a-directory-lists-what-it-contains.law.test.mjs` pins the narrow,
checkable part: the directory that lists each sitemap family renders an
`href` into it. Deleting the link from `TourCard.js` or `poker-series.js`
fails the law; that was verified by deleting them.

It took three attempts to get a law that could fail at all. The first two
followed identifiers through a map built from the whole tree, and
`canonical`, declared in dozens of files, resolved to something that
mentioned `/hub/tours/`. Both versions passed with every link deleted. A
scanner that cannot fail is decoration, and it is worse than nothing because
it reads like proof.

Reachability itself is a property of what the server returns, so it cannot
be decided by reading source. `scripts/aeo/crawl-reachability.mjs` measures
it against the live site and exits non-zero below 95 percent. It is a tool to
re-run after a deploy, not a gate.

## Still Open

The Poker Near Me tab family is the next thing worth fixing, and it is
bigger than it looks. To a non-JavaScript crawler all eleven tabs serve the
same document: `/hub/poker-near-me/tours` and `/hub/poker-near-me/series`
differ in three words out of 351, the title, the `h1`, and one nav label.
Four of them duplicate a standalone page that says far more:
`/hub/poker-near-me/series` is 351 words and is the one the family nav points
at, while `/hub/poker-series` is 11,784 words and was an orphan. That is
backwards, and the fix is either a canonical pointing at the page with the
content or real per-tab server copy, not another link.

## Measured Again, After The Deploy

`node scripts/aeo/crawl-reachability.mjs --depth 4 --max 500`, run against
production once the change was live:

```
family                  in sitemap   reachable
curated routes                  67          59   88%
home game locations              4           4  100%
venue pages                    478         476  100%
location pages                 389         389  100%
tour pages                      28          28  100%
series pages                   225         158   70%
                              ----        ----
                              1191        1114   94%
```

Up from 915 of 1,191, 77 percent. Tours went from nothing to all 28, home
game locations from nothing to all 4, and the series directory now renders
160 links where it rendered none.

The first run of the committed crawler reported 11 percent, which was the
crawler and not the site: its frontier only followed links that were
themselves listed in the sitemap, so a hub page that is not listed was
never walked through. It now follows every internal link, which is what a
crawler does.

### What Is Still Out Of Reach

**67 series.** `/hub/poker-series` renders the series that are running or
start within 60 days, which is the right default for a reader and leaves
the rest linked from nowhere. These need an index that does not filter.

**Three Poker Near Me tabs**, `/daily-tournaments`, `/events-calendar` and
`/more`. Each one now links out; nothing links in. The family nav does not
carry them and no sibling summary points at them.

**Five trivia pages.** `/hub/trivia` itself is reachable but sits deep
enough that its modes fall outside a four-hop crawl. A link from the hub
summary would put the whole family within three.

**Two venues**, 2834 and 2835, which were also out of reach before any of
this. They appear on no location page.
