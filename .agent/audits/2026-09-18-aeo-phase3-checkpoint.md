# AEO Phase 3 — Checkpoint (2026-09-18)

Agent: claude-aeo. Continues `.agent/audits/2026-09-17-aeo-phase1-closeout.md`.
This is the one checkpoint for the phase; it is an evidence record, not a gate.

## Authorization and scope

Owner instruction, this session: finish all outstanding AEO work, decide open
questions directly rather than returning them, and go through the surface line
by line for bugs, stubs, gaps, regressions and wiring issues.

Scope: what a non-JavaScript crawler is served by smarter.poker. Out of scope,
and left alone by explicit standing instruction: retired local pipelines, the
retired third party error provider, release watchdogs, repair loops, watchers
and schedulers. That provider is named nowhere here on purpose:
`__tests__/retired-error-provider.test.mjs` forbids it in tracked source or
guidance, and it failed this checkpoint's first push for exactly that reason,
which is the law working.

## Policy reading receipt (operating law §2)

| | |
|---|---|
| Read at | 2026-09-18T07:19:29Z |
| Reader | `node docs/agent-policy/agent-policy.mjs read` (exit 0, 39,000 bytes, read in full) |
| Policy version | 2.9 |
| Manifest sha256 | `7663cc909626f7e9966931d27166ad8774addc801f7ad1898a2d7564bc13c378` |
| Drift check | `agent-policy.mjs check --canonical /Users/smarter.poker/Documents` — no mismatch reported |
| Paths | `docs/agent-policy/{OWNER-POLICY,OPERATING-LAW,HARDENING,REFERENCE-INDEX}.md`, `agent-policy.mjs`, `agent-policy.test.mjs`, all under this worktree |
| Git revision | `df8dd57a6ee0a13c04abc74cd19b241046033741` |
| Also read | root `AGENTS.md`, `CLAUDE.md`, `PUBLISHING.md`, `.agent/get-shit-done/references/checkpoints.md`, the phase 1 closeout above |

The receipt proves which bytes were emitted. It is not proof of comprehension
or compliance.

## Checkout, branch, operation identity

- Worktrees: `.agent-trees/Smarter-Poker-World-Hub/claude-aeo` and `claude-aeo-1863`, both owned by this task.
- Delivery route: protected PR into `main`, squash merge, per `PUBLISHING.md`.

## Delivered this phase

| PR | State | What |
|---|---|---|
| #1886 | merged | Survival trivia indexed like the other six modes; the deprecated path stays a noindex shim |
| #1887 | merged | Ten pages that served a nameless 200 now name themselves and ask not to be indexed; `/hub/training/hand-history-upload` fully wired |
| #1890 | merged | `/hub/tours/[code]` and ten more pages render their head on the server; the sitemap stops advertising two release-gated features |
| #1892 | merged | 290 of 478 venue titles were cut in a result, losing the city and state; titles now step down until they fit |
| #1893 | merged | this checkpoint |
| #1894 | merged | six Poker Near Me tab titles over budget, and the two blind spots that hid them from the title law |
| #1895 | merged | five home game titles over budget; one shared module now decides whether a title fits |
| #1896 | merged | all 246 series pages gain structured data; 162 cut titles and 12 saying "At Unknown" fixed |
| #1897 | merged | 23 series were listed twice under two ids; one URL per series_uid |
| #1898 | merged | two pages shipped the same title after #1894; a law now forbids it |

Earlier phase 3 PRs (#1863 through #1885) are recorded in their own PR bodies.

## Tested inputs, commands, results

- `node --test __tests__/*.law.test.mjs` — 507 pass, 0 fail
- `npx eslint pages src --ext .js,.jsx` — 0 errors
- `node node_modules/next/dist/bin/next build --webpack` — compiles and prerenders clean
- `node node_modules/next/dist/bin/next start` plus request-level checks against the built server, for the tour pages and every page whose head moved
- Live production sweep of all 577 static sitemap routes as OAI-SearchBot, with script, style, noscript, template and svg stripped before counting words
- Full suite diffed against `origin/main` for #1887: zero new failures, one fixed

## Real blockers and limitations

- `next build` with Turbopack cannot run in a worktree: its symlinked `node_modules` points outside the filesystem root. The repository's own build script passes `--webpack`, which works, so this blocks nothing.
- 102 pre-existing suite failures on `main` are Stripe and PostgreSQL integration tests needing live services. Untouched, and none are in the Build Safety Gate.
- The Build Safety Gate does not run every test file. `poker-near-me-phase-3.test.mjs` had been failing unnoticed since #1868 for that reason; it is fixed and registered.

## Requires the owner, not the agent

1. Google Search Console and Bing Webmaster property verification (carried from phase 1; both need an authenticated session).
2. Off-site entity records: Wikidata, Crunchbase, LinkedIn.
3. The 1828 Lodge Poker Club street address in `poker_venues`.
4. The in-app "Club Arena" to "Poker Arena" rename across 48 files: a product naming decision, not an SEO one.
5. Whether `TRIVIA_PVP_ENABLED` and `TRIVIA_TOURNAMENTS_ENABLED` should be opened. The sitemap and the summaries now follow those flags automatically; nothing further is needed here if they are.

## Closing state

All 1,193 sitemap routes, measured as OAI-SearchBot with script, style,
noscript, template and svg stripped before counting words.

|                                  | start | now |
|----------------------------------|------:|----:|
| routes in the sitemap            |    73 | 1,193 |
| routes with no title             |     9 |   0 |
| titles cut off in a result       |     9 |   0 |
| routes with no description       |     9 |   0 |
| routes with no canonical         |     4 |   0 |
| routes with no h1                |    20 |   0 |
| routes with no structured data   |    30 |   0 |
| routes telling crawlers noindex  |     0 |   0 |
| routes under 60 words            |     9 |   0 |
| fewest words on any route        |     0 |  77 |
| median words per route           |   ~40 | 209 |
| longest title                    |   111 |  60 |

The start column for the whole-sitemap measures is the 73 route sweep this
programme opened with; the wider families were measured as they came into
scope and their own before and after figures are in the PR bodies.

Live verification was run after each deploy, not inferred: the ten renamed
pages, the 29 tour routes, the 246 series routes, the venue, home game and
tab titles were each re-measured on production.

## Needs the owner, not the agent

1. Google Search Console and Bing Webmaster property verification, carried
   from phase 1. Both need an authenticated session.
2. Off-site entity records: Wikidata, Crunchbase, LinkedIn.
3. The 1828 Lodge Poker Club street address in `poker_venues`.
4. The in-app "Club Arena" to "Poker Arena" rename across 48 files. A
   product naming decision, not an SEO one.
5. `TRIVIA_PVP_ENABLED` and `TRIVIA_TOURNAMENTS_ENABLED`. The sitemap and
   the summaries follow those flags now, so nothing else is needed here if
   they are opened.
6. **Five pairs of duplicate records.** Each pair is one real thing held
   twice, and a title change would hide it rather than fix it:

   | pages | what |
   |---|---|
   | `/hub/tours/ROUGHRIDER`, `/hub/tours/RRPT` | one tour, two codes |
   | `/hub/series/479`, `/hub/series/5001069` | one series, no shared series_uid to match on |
   | `/hub/series/593`, `/hub/series/5001068` | same |
   | `/hub/series/5001035`, `/hub/series/5001036` | both in poker_series, so #1897's cross-table rule does not apply |
   | `/hub/series/5001037`, `/hub/series/5001039` | same |

7. **Which series record is authoritative.** #1897 stopped the sitemap
   offering two URLs per series, but did not canonicalise one to the other,
   because the two records disagree on real values. For series 470,
   `tournament_series` reports `main_event_guaranteed: 400000` and
   `poker_series` reports `17240000`; for a $3,500 regional series the
   first is the plausible one. Canonicalising to the wrong record would
   consolidate onto the page with the worse data, so the decision is left
   with the owner.

## Next action

None outstanding for the agent. The programme's own laws now guard every
class of defect it found, and the Build Safety Gate runs all of them.
