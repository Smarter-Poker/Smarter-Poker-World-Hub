# The Last Orphans

2026-09-19. AEO phase 3, internal linking, second pass.

## Where The First Pass Left It

Measured against production after the directory linking change shipped:

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

Seventy seven routes were still reachable from nowhere. Each one had its
own reason, and none of them was the reason the first pass fixed.

## Sixty Seven Series

`/hub/poker-series` renders `SSR_SERIES_PREVIEW_LIMIT` cards, ordered by
what is running or starting soonest. That is the right page for a reader.
It is also a reading decision that had quietly become a crawling one: a
series that finished last spring, or starts next summer, got no card and
therefore no link.

Raising the cap is the wrong answer. A card carries a logo, dates, a venue
and an event preview; two hundred and twenty five of them is a different
page. The page now carries an index below the cards instead: every series,
A to Z, as a name, a place, a date range and a link. A link is about eighty
bytes, so the whole index is under twenty kilobytes.

The law that came out of this pins the distinction rather than the number:
the preview may be capped, the index may not.

## Three Poker Near Me Tabs

`/daily-tournaments`, `/events-calendar` and `/more` each gained copy and
outbound links in the tab change earlier today, and nothing at all pointed
back at them. The family nav does not carry them and no sibling summary
named them. Three links, one from each of the tabs that is reachable.

## Five Trivia Pages

`/hub/trivia` links all of its modes, and is itself linked only from
`/hub/leaderboards`, which put the whole family five hops from the front
page. The hub summary lists the products a reader can open from the World
Hub and trivia was not among them, which was an omission in the copy as
much as in the graph. It is now listed, which puts the modes within three.

## Two Venues That Belong To No State

`/hub/venues/2834` and `/hub/venues/2835`, the Charity Series of Poker and
Poker For Good. Both carry `MULTI` as their state because they run across
several, so `aggregateVenueStates` skips them, which is correct for a state
index, and no city page could list them either. They were out of reach
before any of this work and would have stayed out of reach after it.

They are now listed on the national index under a heading of their own,
`Poker Series That Run In More Than One State`, so the state index stays a
state index.

## What To Expect

If all four hold, reachability should read 1,191 of 1,191. That will be
measured against production with
`node scripts/aeo/crawl-reachability.mjs --depth 4`, not assumed, and the
result recorded here.
