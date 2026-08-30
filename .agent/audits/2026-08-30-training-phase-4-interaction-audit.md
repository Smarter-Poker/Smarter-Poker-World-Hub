# Training Phase 4 — Interaction And Evidence Audit

Date: 2026-08-30  
Scope: Training Hub, all fixed secondary Training routes, catalog entry/setup flow, universal Club Arena gameplay, desktop and mobile.  
Global header: frozen and unchanged.

## Outcome

Phase 4 repaired two live Hub wiring defects, removed one page-scoped design leak, strengthened the browser audit, and completed a clean 192-surface responsive verification pass.

The production Phase 3 release was first confirmed on `main`. All Phase 4 implementation then occurred in an isolated worktree based on `8678e0c98f`.

## Defects Confirmed And Repaired

### Alternate Drill CTA Was A No-Op

`Pick A Different Drill` only set the category to `ALL`. Because `ALL` is the default state, the control frequently made no visible or navigational change.

Repair:

- clear the category and search filters;
- move the viewport to the 107-game Training Library;
- move keyboard focus to the library heading;
- respect `prefers-reduced-motion`.

Browser proof at 375px:

- active element after activation: `#lib-h`;
- active label: `Browse The Training Library`;
- library top: `0px` in the viewport;
- active category: `All 107`.

### Persisted Leak Panel Was Permanently Unreachable

The Hub called `leakAnalyzer.getBiggest?.()`, but `LeakSignalAnalyzer` has no `getBiggest` method. Optional chaining concealed the wiring defect and the panel always received `null`.

Repair:

- read the authenticated leak lifecycle through `LeakService.getActiveLeaks`;
- reject resolved/inactive rows;
- rank only evidence-backed rows;
- surface only persisted name, situation, explanation, sample, and error rate;
- resolve a recommended drill against the canonical 107-game catalog;
- fall back to the real Weakness Scanner when no canonical drill exists;
- remove fabricated BB/100, grade, position, and hands-to-target claims.

### Page Tokens Could Reach The Global Header

The Hub injected its design tokens into `:root`. Those page-owned variables were global by definition and could alter descendants outside Training.

Repair:

- remove the Hub `:root` token block;
- scope the tokens in `training.css` to `.sp-main`, the setup dialog, and the arena shell;
- leave `UniversalHeader` and every approved header selector untouched.

Browser proof:

- document root `--sp-primary`: empty;
- approved header `--sp-primary`: empty;
- Training main `--sp-primary`: `#00d4ff`.

### Ambiguous Grade Glyph

Orbitron made a standalone `D` resemble `0` in the hero sentence. The copy now says `Grade D`, retaining the real grade while removing ambiguity.

## Browser Audit Hardening

The route audit now:

- reports exact Axe failing selectors, not only violation counts;
- supports `TRAINING_AUDIT_ROUTE_PATTERN` for focused reruns;
- ignores the local-only HMR reconnect banner;
- does not attribute the accessibility of an expected `/auth/login` redirect to the Training route that initiated it;
- continues to enforce HTTP health, titles, DOM size, horizontal overflow, exactly one approved global header, image integrity, control names, image alt text, WCAG A/AA, console errors, and page errors.

## Responsive Route Evidence

Clean environment result:

- routes: 96;
- viewports: desktop 1440×1000 and mobile 390×844;
- total checks: 192;
- failures: 0;
- horizontal overflow: 0 failures;
- broken visible images: 0 failures;
- unnamed controls: 0 failures;
- missing alt attributes: 0 failures;
- serious/critical accessibility violations: 0 failures;
- approved global header count failures: 0;
- console/page errors: 0 failures.

## Gameplay Evidence

The universal Training table was inspected at 375×812.

- Four meaningful actions were present: `Fold`, `Call`, `Raise To 6 BB`, `Raise All-In`.
- The table used the Club Arena Carbon Ion stadium, shared card assets, seat avatars, hero card fan, nameplates, timer, pot, HUD, and four-color action dock.
- Selecting `Fold` produced an explicit `Incorrect` verdict.
- The verdict displayed `Your Answer`, `Correct Answer`, and coaching rationale.
- Disabled actions prevented double-submission.
- `Next Question →` was present and the feedback remained open until that manual action.

Visual artifacts:

- `phase4/local-gameplay-375.png`
- `phase4/local-feedback-375.png`
- `phase4/live-card-setup-desktop.png`
- `phase4/live-card-setup-mobile.png`

## Automated Contracts

Phase 4 adds adversarial coverage for:

- library focus/scroll behavior and reduced motion;
- persisted leak wiring and canonical drill resolution;
- removal of the nonexistent analyzer path and fabricated leak claims;
- unambiguous grade copy;
- Training-only token scoping;
- exact browser-audit target reporting and harness isolation.

The Phase 4 contract is part of the mandatory `npm run build` test gate.

## Live Catalog And Solver Evidence

The read-only live catalog audit completed against the configured production data source:

- canonical games: 107;
- levels per game: 12;
- runtime cells: 1,284;
- cache-backed cells: 1,030;
- engine-backed fallback cells: 254;
- cached questions validated: 25,958;
- generated fallback questions validated: 1,016;
- incompatible legacy rows safely rejected: 1,179;
- failures: 0.

Every accepted question passed the same deterministic question contract used by the runtime.

## Release Gate

- mandatory `npm run build`: passed;
- optimized Next.js production compilation: passed;
- static pages generated: 403 of 403;
- Phase 4 adversarial contract: included in the mandatory build command;
- diff whitespace validation: passed;
- generated-file and global-header drift: none.
