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
| routes in the sitemap            |    73 | 1,191 |
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
6. **Two series pages share a title because their venue column is empty.**
   `/hub/series/5001035` and `/hub/series/5001036` are *not* duplicates:
   different `series_uid`, different venues (Texas Card House Dallas and TCH
   Social Las Colinas). Same for `/hub/series/5001037` and `5001039`. The
   venue is present in the uid slug and absent from the `venue` column, so
   the title falls back to the name alone and the two read alike. Filling
   the venue on those four rows fixes it. Parsing a venue out of a slug was
   deliberately not done.

7. **The four true duplicates are resolved** (#1905, #1906), and the
   question this checkpoint previously put to the owner is answered: the
   repository already decides it. `reconcileTournamentSeriesEvidence` in
   `seriesRouteIdentity.mjs` states that `tournament_series` owns the public
   route identity and `poker_series` may replace metadata only when it is a
   newer observation of the same source URL with a real hash. That also
   governs the `main_event_guaranteed` disagreement that made the decision
   look risky. Nothing is outstanding.

8. **A support ticket and conversation view for staff does not exist.**
   `/admin/support-tickets/<id>` and `/admin/live-help/<id>` were linked
   from every support notification and neither page was ever built; the dead
   links were removed in #1900 and the identifiers kept as text. Live Help
   has an API and a Geeves panel, and the API is user-scoped: it returns a
   person's own conversations. An admin view means new admin-scoped
   endpoints over other people's support conversations, which is a new
   privacy surface rather than a repair, so it was not built unasked.

## Closing measurement, re-taken

All 1,191 sitemap routes, after #1900 through #1906:

  no title 0 · title cut in a result 0 · no description 0 · no canonical 0 ·
  no h1 0 · no structured data 0 · noindex but listed 0 · under 60 words 0 ·
  fewest words on any route 77 · median words 209 · duplicate titles 2

The two remaining duplicate titles are the Trailblazer pairs above, which
are two real series each and are left alone on purpose.

Also verified rather than assumed, across every route: the structured data
parses and carries no null, empty or untyped node, no graph repeats an
`@id`, every breadcrumb is ordered, and every Event has the startDate and
location schema.org requires. Every canonical is correct, not merely
present. No `X-Robots-Tag` header contradicts a page's meta robots. Every
share image loads at a usable size.

## Next action

None outstanding for the agent. The programme's own laws now guard every
class of defect it found, and the Build Safety Gate runs all of them.
