# Preflop Charts Fonts Are Checked Live After Every Deploy (2026-11-28)

The #SmarterDesign pass on Preflop Charts (#3216, #3240, #3264) removed the old Orbitron console face and found the shared FAQ rendering in Times New Roman. Both were caught by hand, in a browser, after a deploy. The Live SEO Contract workflow, which runs on every successful Production deployment, now has a second job, **Preflop Charts Keeps Its Fonts Live**. It waits for `/api/health` to report the deployed commit, renders `/hub/preflop-charts` and its Stats, Awards, Ranks and Guide pages at phone width (393px) in Chromium, and fails if any visible text computes to Orbitron or a serif face.

`scripts/ci/check-live-preflop-fonts.mjs` holds the check. It installs only Playwright, at the lockfile's version, rather than the whole dependency tree, and it is its own job so an SEO contract failure never hides it. `__tests__/the-live-seo-contract-reads-the-site.law.test.mjs` pins the trigger, the pages and the font rule.

## Follow-up: one Playwright copy

The job's first run (run 46136680354) failed before rendering anything: `npm install playwright` inside the checkout reinstalled the whole project tree, and `npx playwright install` then downloaded the browser for a different Playwright copy than the one the script loaded. Playwright now installs into its own folder under the runner's temp directory, its own binary downloads the browser, and the script loads that copy through `PLAYWRIGHT_DIR`.
