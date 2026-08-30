# Global footer shell and WebKit production monitor

## Finding

World Hub had one shared footer component but 76 independent page modules still
imported and rendered it. Only a small batch used the safe-area clearance token.
That architecture allowed route omissions, duplicate mounts, hardcoded bottom
padding, and page-specific theme drift.

## Correction

- `pages/_app.js` now owns the only World Hub footer mount.
- `src/config/bottom-nav-routes.json` preserves the exact 76-route visibility
  contract and its dark/iframe overrides.
- The app shell renders one safe-area-aware clearance spacer beside the fixed
  footer. Route modules no longer import, render, or size shared footer chrome.
- Club Arena remains outside the World Hub route policy and keeps its own root
  shell; its card lobby is verified footerless.

## Browser and delivery guard

- Chromium and WebKit measure all six controls at seven viewport widths.
- The route test covers the public World Hub install page, the footerless Club
  Arena lobby, and Club Arena's data-free footer probe route.
- The existing post-push production watchdog runs the same WebKit contract
  against `https://smarter.poker`, opens an issue on failure, and closes the
  alarm automatically after recovery.

## Verification

- The full World Hub prebuild gate passes: 473 tests.
- The route-policy and fixed-element laws pass.
- The production Next.js build and live post-deploy probe are release gates for
  this change.
