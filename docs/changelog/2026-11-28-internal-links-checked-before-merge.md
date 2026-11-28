# Internal Links Are Checked Before Merge (2026-11-28)

The Live SEO Contract finds broken internal links only after a deploy, on the ~40 pages it samples; it found three on 2026-11-28 by luck. `scripts/ci/check-internal-links.mjs` now runs as **CHECK 30** of the required Pre-Deploy Safety Checks and reads every internal link the source builds: `href` values in `src/config` JSON, quoted paths and markdown targets in `src/config` and `src/content`, and literal `href` and redirect `destination` values in `pages` and `src/components` (3,198 links, about one second, no node_modules). A link passes when it is a `public/` file, a physical route (API routes included), a content-backed slug that exists in its module (glossary, compare, learn, learn category, rules, odds matchups, Smarter Rewards, the `/hub/[orbId]` worlds), or an unconditional `redirects()`/`rewrites()` source. `headers()` rules and `has`/`missing` conditional rewrites do not count; they serve no page or only some requests.

## Broken links found on the first run, fixed at the source

- Learn roadmaps linked `/tools/tournament-chop-calculator` (twice), `/tools/out-to-equity-calculator` and `/tools/variance-simulator`; the tools are `/tools/chop-calculator`, `/tools/outs-calculator` and `/tools/variance-calculator`.
- The Auth Health and Signup Health admin footers linked `/docs/SIGNUP_RUNBOOK.md`, a repo file the site does not serve; they link the file on GitHub.
- The home-games state index linked "Free While In Beta" to `/commander`, which is not a page here; it links the Commander home-game registration, as the page's other host buttons already do.
- Messenger drew its unread badge on `/favicon.ico` and reset the tab icon to it. This site has no `/favicon.ico` (the icon is `/icons/smarter-king-192.png`), so the badge always fell back to a blank square and clearing it pointed the tab at a 404. It uses the real icon now.

## The menu route audit stays frozen

`.agent/audits/2026-08-31-world-hub-menu-route-inventory.json` is a deliberate historical record: `world-command-menu-law` and `world-copy-policy` pin it at 14 worlds and 203 routes. `scripts/generate-world-menu-audit.mjs` used to overwrite it from today's tree (210 routes, 13 worlds), which broke those tests. The generator now prints current counts by default, writes only to a path given with `--out`, and refuses the frozen file; `world-command-menu-law` pins that.

## Guard

`__tests__/every-internal-link-reaches-a-page-before-merge.law.test.mjs` requires the check to pass on the repo, to still catch each class of broken link, to ignore header rules and conditional rewrites, to give every exception a written reason, and to stay inside the required job.
