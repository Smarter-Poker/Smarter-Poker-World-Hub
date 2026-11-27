# wh-main-red-mobile-budget-prefetch

- Symptom: once draft #3134 cleared the unit-test layer, `Chromium and WebKit footer contract` (Global Footer E2E) still failed on World Hub main 7a0605ba in `e2e/mobile-budget.spec.ts` (job 140386473176): `/hub/poker-tools ships 1045KB of JS (budget 900KB)` and `/hub/personal-assistant ships 865KB of JS (budget 850KB)`, all three retries. Every World Hub PR inherits it. The last green Global Footer E2E run was 45889003224 (2026-11-26 20:09Z).
- Cause: in production a Next.js `<Link>` prefetches the linked page's whole bundle when it enters the viewport, and the spec counts every script loaded.
  - #3080 (50759bbe) added the Calculator Shortcuts `<Link>`s on `/hub/poker-tools` to `/hub/training/equity-calculator` and `/hub/training/icm-calculator`. They pull chunks 39507 (121KB), 58474bfb (98KB), 1126 (24KB), 55254 (15KB), 92008 (11KB) and the two page chunks.
  - On `/hub/personal-assistant`, the section tabs and the training-plan link prefetch `/hub/personal-assistant/leaks` (64KB page chunk plus dependencies, grown in a383384d) and `/hub/training` (23KB).
- Fix: `prefetch={false}` on exactly those five links. Navigation is unchanged, and Next.js still prefetches them on hover. No budget is raised.
- Measured locally with the Global Footer E2E build environment (`PWA_ENABLED=1`, placeholder Supabase env, `next build --webpack`, `next start`, iPhone 13 profile, service workers blocked, script transfer bytes up to `load` + 1.5 s):

| route | main 7a0605ba | fixed | budget |
| --- | --- | --- | --- |
| /hub/poker-tools | 1051KB | 753KB | 900KB |
| /hub/personal-assistant | 865KB | 735KB | 850KB |

  See `prefix-main-7a0605ba-scripts.txt` and `fixed-scripts.txt`. The fixed numbers were the same on two consecutive runs.
- Regression test: `__tests__/a-shortcut-link-does-not-preload-its-page.law.test.mjs` fails 5/5 on main's two pages and passes 5/5 with the fix. It runs in `prebuild`, so in every `npm run build`, including the Global Footer E2E build on every PR.
- Not in scope: `/hub/training` LCP 2697ms (budget 2500ms) failed once and passed on retry in the same job, so it is not a deterministic failure.
