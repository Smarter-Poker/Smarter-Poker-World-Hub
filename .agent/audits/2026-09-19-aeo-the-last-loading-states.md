# The Last Loading States

2026-09-19. AEO phase 3.

## What Was Left

The sweep behind the previous change found 259 routes serving a loading
state to a crawler. 253 of them were the series and tour detail families
and were fixed there. Six were one page each:

```
/hub                    "Loading World Hub..."
/hub/news               "Loading Reels..."
/hub/club-shop          "Loading Club Shop..."
/hub/promotions         "Loading Promotions..."
/hub/pages              "Loading Pages..."
/hub/trivia/leaderboard "Loading Leaderboard..."
```

All six are done now. Three were ordinary loading branches and take the
same `hasMounted` guard the detail pages use. Three needed a lighter touch
because the branch itself has to stay:

`/hub` renders its loading state as the `loading` component of a
`dynamic()` import with `ssr: false`, which Next renders on the server by
definition. `/hub/club-shop` renders its first branch on an auth check that
is pending on the server. In both cases the box stays exactly where it was,
so no layout moves and no auth flow changes, and only the sentence waits
for someone who can read it.

## Why The Law Stayed Narrow

The obvious next step was to generalise
`a-page-with-its-content-is-not-loading` from the two detail families to
every page under `pages/hub`. That was written, run, and thrown away.

It flagged 30 loading branches across 37 files. The live measurement found
six that a crawler could ever see. The rest sit behind an auth check, or
behind state that starts false, or on routes the sitemap does not list at
all: `/hub/messenger`, `/hub/settings`, `/hub/profile`,
`/hub/training/arena/[gameId]`, and two dozen more.

Whether a loading branch reaches a crawler depends on the state a component
holds at render time, and source cannot decide that. A law that accuses
thirty things to catch six is a law people learn to ignore, which is worse
than no law, because the next real finding arrives wearing the same
clothes as the noise.

So the law still covers the two detail families, which is 253 of the 1,191
routes and the only place where the contradiction is structural. The rest
is measured by `scripts/aeo/server-html-audit.mjs`, which fetches every
sitemap URL as a non-JavaScript crawler and reports word counts, loading
states and any route not answering 200. It is a tool to re-run, not a gate,
for the same reason the reachability crawler is.

## The Trivia Family, Two Hops Closer

The reachability note left one caveat: at depth 4 the five trivia mode
pages are missed, because `/hub/trivia` is itself four hops from the front
page. The landing page links six hub products and the hub index is not one
of them, so the whole trivia family sat behind a long walk.

`/hub/training` is linked directly from the front page and its summary now
lists Poker Trivia, which puts `/hub/trivia` at two hops and its modes at
three. Trivia is poker knowledge practice and training is practice, so the
link earns its place in the copy as well as in the graph.
