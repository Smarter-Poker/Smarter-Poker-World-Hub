# A Page With Its Content Is Not Also Loading

2026-09-19. AEO phase 3.

## What Was Measured

All 1,191 sitemap routes fetched as OAI-SearchBot with scripts stripped and
searched for a loading state in the server HTML. 259 had one:

```
225  "Loading Series Details..."
 28  "Loading Tour Details..."
  1  "Loading World Hub..."
  1  "Loading Reels..."
  1  "Loading Club Shop..."
  1  "Loading Promotions..."
  1  "Loading Pages..."
  1  "Loading Leaderboard..."
```

The 253 in the first two lines are the ones that matter now, because those
pages carry their content. A series page renders its venue, its dates, its
buy ins and all of its events, and then, underneath, in the present tense:
"Loading Series Details...". The document says two opposite things and the
contradiction is the last thing in it.

A spinner is a promise to someone who is waiting. Nothing waits on the
server: the fetch it describes has not started and cannot start until a
browser runs the page.

## What Changed

`src/hooks/useHasMounted.js`, and both detail pages gate their spinner on
it. The flag starts false, which is exactly what the server renders, and
flips in an effect after hydration, so React never has to reconcile a
difference. A reader who is waiting still sees the spinner.

## The Other Six

One page each, and a different shape. `/hub` is the notable one: its
"Loading World Hub..." is the `loading` component of a `dynamic()` import
with `ssr: false`, not a branch, so the fix there is a change to how the
page is split rather than a guard. Reels, Club Shop, Promotions, Pages and
the Trivia Leaderboard are ordinary loading branches and would take the
same guard.

They are written down here rather than exempted in the law. A law with an
exemption list is a list, and this programme has learned what those are
worth.

## Everything Else The Same Sweep Found

Median words across all 1,191 routes is now 260, up from about 209 this
morning, and the thinnest page on the site serves 77 words.

37 routes serve under 140 words. The thinnest cluster is the home game
locations, which is the smallest family on the site and the only one that
has had no content work at all:

```
77  /hub/home-games/in/il/oak-lawn
80  /hub/home-games/in/il
82  /hub/home-games/in/nv/las-vegas
85  /hub/home-games/in/nv
93  /hub/home-games/near-me
78  /hub/club-shop
105 /hub/reels
112 /hub/preflop-charts
113 /hub/lives
```

Four of those nine are the whole home games location family. It is four
pages, and they are the next thing worth writing.
