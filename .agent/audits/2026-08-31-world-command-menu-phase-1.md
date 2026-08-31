# World Command Menu Optimization — Phase 1/6

## Release scope

Phase 1 establishes navigation correctness and resilience for the fourteen World Hub command menus.

- One query-aware active command per world, including a declared default for Bankroll Manager.
- Single-flight protection for rapid primary-command activation; modified clicks remain native.
- A menu-level error boundary with a keyboard-safe six-destination recovery drawer.
- Static destination resolution for all 84 canonical commands and consumer checks for every query deep link.
- Browser activation coverage for all 84 commands in desktop Chrome and Pixel 5 profiles.
- Expanded source and runtime enforcement against horizontal three-line menu marks.
- Removal of three legacy violations in Poker Tools, Video Library, and the Social layout.
- Repair of the Bankroll Manager `view=log-session` deep link.
- Store command normalized from an unused `category=diamonds` query to the canonical Diamond Store route.

## Verification evidence

- Focused Node contracts: 13/13 passed.
- Production `npm run build`: passed (403 static pages generated; existing missing-local-Supabase warnings only).
- Playwright `e2e/020-hamburger.spec.ts`: 28/28 passed across desktop and mobile, exercising 168 browser activations (84 commands × 2 profiles).
- Visual review: Personal Assistant desktop and Social Media mobile drawers settle at full width, show one active command, and retain the approved world/Facebook palettes.
- `git diff --check`: passed.
- ESLint: unavailable because the repository uses ESLint 9 without an `eslint.config.*` file; this is a repository tooling gap, not reported as a pass.

## Remaining phases

2. Premium visual individualization.
3. Accessibility and device hardening.
4. Personalization and permission-aware commands.
5. Offline, live-data, and performance resilience.
6. Operations, governance, and final production matrix.
