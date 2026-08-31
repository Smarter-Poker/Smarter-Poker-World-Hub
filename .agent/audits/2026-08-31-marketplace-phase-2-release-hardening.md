# Marketplace Phase 2 Of 8: Release Hardening

Date: 2026-08-31

## Outcome

Phase 2 purchase assurance was re-audited from source through the optimized
production artifact before Phase 3. The audit closed a repository enforcement
gap, hardened the anonymous VIP boundary, made product inspection focus
deterministic, and expanded the browser matrix across every Marketplace page
family and account subpage.

## Defects Found And Closed

- The Title Case gate claimed to cover every forward-facing page but skipped
  Pages Router `.js` files. Most World Hub and Marketplace pages use that file
  type. The AST gate now covers `.js`, `.jsx`, and `.tsx`.
- The original case fixer could corrupt numeric suffixes such as `1.5x`, `7d`,
  `24h`, and `GPT-4o`. Numeric suffixes are now preserved and protected by a
  regression contract.
- Anonymous VIP membership reads constructed the database client before
  rejecting a missing bearer token. That could turn a correct 401 into a 500
  in recovery or local environments. Anonymous requests now terminate at the
  authorization boundary first.
- The in-page merchandise image inspector relied only on React `autoFocus`.
  It now establishes focus after the dialog commit and cancels the scheduled
  focus on cleanup.
- Protected cart and copy browser tests inherited external authentication
  state. They now seed isolated deterministic sessions and audit the intended
  pages rather than an authentication redirect.

## Repository-Wide Copy Contract

- 289 modified files were proven case-only by comparing the prior and current
  file bodies after normalizing letter case.
- Exactly five files contain non-case changes: the title gate, Marketplace
  browser contract, Phase 22 regression contract, VIP status route, and shared
  Marketplace detail experience.
- The AST gate reports that every scanned JSX text word begins with a capital.
- The UI text gate scanned 3,110 files and found no banned em or en bar.
- Numeric unit suffixes, authored acronyms, HTML entities, routes, class names,
  identifiers, and expression fragments remain untouched.

## Marketplace Verification Before Publication

- 212 of 212 Marketplace contract tests passed.
- The exact `npm run build` release command passed the repository prebuild
  suite, 212 Marketplace contracts, optimized Next.js webpack compilation,
  and 403 of 403 static pages.
- The complete compiled-production browser suite passed 62 of 62 checks with
  four workers across desktop Chromium and the mobile Chrome profile.
- Two contention-sensitive catalog assertions were also repeated twice in
  both viewports, passing 8 of 8 isolated repetitions.
- Fourteen Marketplace pages and subpages were checked in the browser for the
  inherited Title Case policy, absence of banned bars, and absence of
  `target="_blank"` links.
- `git diff --check`, the title gate, the UI text gate, the Marketplace unit
  suite, accessibility checks, responsive overflow checks, keyboard focus,
  same-surface navigation, card checkout, and Diamond checkout contracts all
  passed.

## Preserved Boundaries

No price, Stripe charge, Diamond grant, Diamond burn, inventory mutation,
entitlement rule, database schema, or Club commission changed. Club sales
remain fully platform-owned. Automatic Printful connection remains deferred.

