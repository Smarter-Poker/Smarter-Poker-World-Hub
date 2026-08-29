# Regression Prevention Across the Estate (Dan 2026-08-29, binding direction)

Dan, verbatim: "YOU NEED TO ADD PREVENTIVE REGRESSION TO ALL ASPECTS OF
SMARTER.POKER, CLUB ARENA AND CLUB COMMANDER, WE DON'T EVER WANT THINGS
'RANDOMLY REGRESSING' OR REGRESSING BECAUSE OF A 'ROUGE AGENT'."

This document is the transferable core of what Club Arena now has, what each
surface still needs, and — critically — what "randomly regressing" actually
turned out to be when measured.

## 1. The two real regression mechanisms (both measured, neither random)

**a) The silently-shipped size change.** CA PR #950 removed CSS gutter
overrides "per Dan — edge-to-edge"; deleting an override resurrects the base
rule, so the change NARROWED every phone and all checks stayed green for
three days — because every existing check pinned ratios, and ratios cannot
see the whole table scaling. Lesson: **for anything visual, pin absolute
numbers against a committed baseline, and make changing the baseline a
stated, same-commit act.** CA now has this: `geometry-baseline.json` +
`update-geometry-baseline.mjs` + a required-check beat that names the device
and the pixels on any drift.

**b) The time-travelling client.** The CA service worker serves the shell
cache-first and only ever revalidated on navigation; an installed PWA resumed
from the app switcher never navigates. Phones ran replaced bundles for DAYS,
then rotated at arbitrary later launches. From the user's chair: fixes
"don't take", old bugs "come back", and no report correlates with any deploy.
This — not agent behaviour — explains most "it regressed again" reports where
the code had not changed. CA now probes on every return-to-visibility
(SW `reg.update()` + entry-chunk comparison against the live shell),
reloading only at the moments Dan's laws allow. **Any surface with a service
worker or long-lived tabs needs the same resume-path probe.**

## 2. What each surface has / needs

| Layer | Has today | Needs |
| --- | --- | --- |
| Club Arena | main ruleset (PR-only, 6 required checks, no bypass actors), law tests (animations, no-auto-table-switch, action bar, popups), proportion beats, edge-to-edge beat, geometry baseline, staleness-aware client | keep extending the baseline pattern to new visual surfaces (lobby cards, tournament pages) as they stabilise |
| World Hub | build-safety-gate (15 checks), branch-protection-watchdog, publish-watchdog, push-velocity-watchdog, vercel-uniqueness check | (1) a geometry-baseline harness for its own key surfaces (hub tiles, commander dashboards) modeled on CA's `tests/e2e/support/feltHarness.mjs` + baseline JSON; (2) verify branch protection parity with CA's ruleset — CHECK 6c-style allowlists exist, but confirm required checks cannot be skipped-and-satisfied (CA's `changes`-job lesson, ci.yml comments); (3) audit any SW/PWA caching in the hub for the resume-path gap |
| Club Commander | shares WH CI | same baseline pattern for staff/player UIs once WH harness exists; Commander is inside WH so it inherits (2) automatically |

## 3. The rules that make it stick (for every agent, every repo)

1. **A visual approval is a number, not a comment.** When Dan approves how
   something looks, measure it and commit the measurement to a baseline a
   required check reads. A comment claiming "375x619.8" with no pin is how
   #950 shipped its opposite.
2. **Deleting an override is a change.** The cascade resurrects the base
   rule. Any "remove this rule" diff on layout CSS must come with a
   before/after measurement in the PR.
3. **Baseline diffs are law-test pins.** Regenerate in the same commit,
   read the diff, state the change. An unexplained baseline hunk is the
   regression, wearing a green check.
4. **Every spec must be named in a CI job.** CA's hero-card-row spec ran in
   NO job for 39 commits. When adding a spec, add it to the job's command
   line in the same commit (see the css-beats-e2e note in CA's ci.yml).
5. **Clients must know when they are stale.** Any cache-first shell needs a
   resume-path probe; "the SW revalidates on navigation" is false for a PWA
   in the app switcher.
6. **"Rogue agent" protection is the ruleset, not vigilance.** CA's `main
   protection` ruleset has `bypass_actors: []` — nobody, including admins,
   lands unreviewed-by-CI code. WH admins should verify the equivalent holds
   here (branch-protection-watchdog exists; confirm its config matches the
   no-bypass standard).

## 4. Status

- Club Arena: parts 1a and 1b SHIPPED 2026-08-29 (see
  `club-arena/docs/changelog/2026-08-29-*.md`).
- World Hub / Commander: items in the table above are open work. The CA
  harness (`feltHarness.mjs` + baseline script + spec beat) is the reference
  implementation to port.
