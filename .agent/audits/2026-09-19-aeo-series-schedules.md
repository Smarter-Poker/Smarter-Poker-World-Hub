# The Promise On 225 Pages

2026-09-19. AEO phase 3, series schedules.

## What Was Measured

Ten series pages sampled on production as OAI-SearchBot with scripts
stripped served between 129 and 150 words, median 139. Every one of them
ended with the same three words: "Loading Series Details...".

Above that, in the server rendered summary, the page said:

> The Full Schedule, Buy-Ins, Guarantees And Results For \<series\> Are
> Listed Below.

They were not. The schedule is fetched over SWR after mount, so a crawler
that does not run JavaScript received the promise and nothing else, on all
225 series pages in the sitemap.

These pages passed every earlier check. They carry a title, a description
over sixty characters, an exact canonical, one h1, and an EventSeries node
with a startDate and a location. The word count floor was sixty and they
served a hundred and thirty nine. Nothing in the audit could see that the
page was making a claim it did not keep, because no check read what the
copy said against what the page showed.

## Where The Schedule Was

Not missing. `getServerSideProps` already awaits `/api/poker/series`, which
returns the events, already filtered to servable evidence quality by the
API itself. `toSeoSeries` built the props and dropped them.

Measured across all 225 series:

```
series with a published event list        68
events available in total              1,544
largest series                           182
median series                             12
```

## What Changed

The events travel into the props, the page renders them with their dates,
start times, buy ins, guarantees and game, and the schedule is published in
the graph as `subEvent` nodes under the series, each one inheriting the
series' location because a scraped event row records its time and its buy
in and leaves the venue blank: it is held where the series is held.

The paragraph promises a schedule only when there is one. A series with
nothing published says so.

The breadcrumb also moved. It climbed to `/hub/poker-near-me/series`, the
Poker Near Me tab, which is the near-you view. The parent of a series page
is `/hub/poker-series`, the directory that lists every one of them.

## What This Does Not Fix

**Fifty one series have events and no place.** Their rows carry no venue
and no city, so no Event can be published for them under the rule this
programme has held to since the series schema was written: an Event without
a startDate or a location is worse than no Event. Their schedules are
listed on the page for a reader; they are absent from the graph. This is a
data gap, not a code one.

**Sixty four series carry a city that is not a city.** The scraped value is
the venue name and the city run together: `Venetian Las Vegas Las Vegas`,
`Thunder Valley Casino Lincoln`, `Playground Poker Club Kahnawake`. Where
the venue field is also filled, `cityWithoutVenue` already strips it and
the result is correct. Where the venue field says `Unknown` or is empty,
nothing can strip it, and the wrong string reaches the title, the
description, the visible location and `addressLocality`.

This change does not make that worse: the sub events reuse the location
object the series already publishes, so the same string appears once per
page rather than once per event in a new place. It should be fixed at the
source, and the fix is bounded: the city list in `data/all-venues.json`
covers 658 venues, and every one of the 64 ends with a city from it.
