# The Content Families Ship, And Get A Road In

2026-09-22. AEO phase 3, programme sections 3.3, 3.4 and 3.7.

## What Shipped

| PR | What | Measured live |
|---|---|---|
| #1952 | /hub/reels and /hub/lives render their public feeds on the server | 105 → 135 words, 113 → 178 words |
| #1953 | /glossary, 74 terms, one page each | 75 URLs, index 2,096 words |
| #1955 | /compare, 11 comparisons plus an index, every competitor fact sourced and dated | 12 URLs |
| #1956 | /learn, 40 lessons, charts generated from the corpus, every number computed | 41 URLs |
| #1957 | solverRanges.js comments state its data; llms.txt and a lesson stop saying the Bankroll Manager tracks play credits | |
| #1958 | the three indexes linked from the front page | 1,318 of 1,318 reachable |

## Reachability, Measured Twice

The day the three families went live, crawled from / at depth 4:

```
family                  in sitemap   reachable
glossary pages                  75         75  100%
comparisons                     12          0    0%
lessons                         41          0    0%
TOTAL                         1318       1265   96%
```

53 pages in the sitemap and linked by nothing: the same defect the tour and
series directories had a week earlier. After #1958:

```
TOTAL                         1318       1318  100%   (depth 4)
```

## Server HTML, Every Route

`node scripts/aeo/server-html-audit.mjs` against production, 1,318 URLs:

```
words     min 75   median 258   max 6,826
routes still saying they are loading      0
routes not answering 200                  0
routes that could not be read            24
```

The 24 were all series pages, a contiguous block near the end of the series
range. Every one answered 200 when fetched again straight afterwards, and two
deliberate bursts (60 sequential, then 120 at twenty in parallel, all cache
busted) returned 200 every time. The failure did not reproduce and the audit
did not record the status it saw, so the cause is unknown; the script now
prints each unreadable route with its reason. Since #1918 a series lookup that
fails answers 503 with no-store and Retry-After rather than a cached 404, so a
transient failure costs a crawler a retry, not the page.

The thinnest routes are term pages at 105 to 120 words, which is the spec (a
40 to 80 word definition, answer first), the four home game location pages at
77 to 85 words (there are two home games in the directory), and /hub/club-shop
at 75, which belongs to the marketplace programme.

## Outside Findings, Recorded Not Fixed

**Logged-out visitors may see no streams on /hub/lives.** The browser queries
embed `profiles!broadcaster_id(username, avatar_url, full_name)`. The anon role
has SELECT on two columns of `profiles` and not those three; as anon,
`select username, avatar_url, full_name from profiles` fails with 42501. A
PostgREST embed of columns the role cannot read fails the whole request, so
the page's own live and recorded stream lists would come back empty for a
guest. Reproduced at the SQL level, not in a browser. Fixing it is either a
column grant (widening what anon can read, a privacy decision) or a guest query
without the embed; it is a product change, not an AEO one.

**The corpus defends far tighter than its comments said.** Recorded in #1957:
the big blind defends 9.5% against an under the gun open by frequency, where
the old comment said about 32%. The comments now say what the data holds; the
data is unchanged, because the size of a defending range is a content decision.

**"Tick" is not in the glossary.** The spec listed it; nothing in either repo
defines what it means in club poker, so no definition was published.

## Still Needs Dan

- Google Search Console and Bing verification: no traffic measurement exists
  until this does.
- A named author for 2.5: every new page is published under the organisation
  only, because no real person has been chosen.
- The compliance reviewed sweepstakes page from 3.3, deliberately not built.
- Off-site entity records, the Club Arena / Poker Arena naming decision, the
  two trivia release gates, four Trailblazer venue rows and the 1828 Lodge
  street address, all unchanged from the last checkpoint.

## Working Storage

`/Volumes/SmarterWork` had 1.9 GiB free when this started, too little for a
private dependency install and a build. Worktrees went to a task owned
directory under `/Volumes/SmarterArchives/agent-evidence/claude-aeo-20260922`,
where other agents' worktrees already live; nothing belonging to another task
was moved or removed.
