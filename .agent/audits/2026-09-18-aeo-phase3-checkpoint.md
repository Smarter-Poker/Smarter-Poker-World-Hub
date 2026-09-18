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
| #1892 | open | 290 of 478 venue titles were cut in a result, losing the city and state; titles now step down until they fit |

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

## Live verification already done

#1886 and #1887 were re-measured on production after deploying. All nine
renamed pages serve their title with `noindex`; `/hub/trivia/survival-game`
serves 170 words, a 47 character title and its schema; the deprecated
`/hub/trivia/survival` is `noindex`; `/hub/training/hand-history-upload`
serves 171 words and schema; both new routes are in the live sitemap.

## Next action

Re-run the 577 route OAI-SearchBot sweep once #1890 and #1892 have deployed,
and record the closing numbers against the opening ones in the programme
document.
