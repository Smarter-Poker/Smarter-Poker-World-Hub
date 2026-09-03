# 2026-09-03: Mobile Phase 0a, shared foundation

Part of the ten-phase rollout in `docs/mobile-standard/ROLLOUT-PLAN.md`.
This phase builds the primitives every later phase adopts, so that no page
copies the Social Media shell by hand again.

## New files

| File | What |
| --- | --- |
| `src/components/ui/HubPageShell.jsx` | The standard page shell as a component. 100dvh, 100vw clamp, header with `isInIframe` guard, `{prefix}-page-container / -feed-layout / -feed-column / -contacts-sidebar`, mandatory 900/768 CSS block as a plain `<style>`. NO bottom padding. Exports `HUB_BREAKPOINTS`. |
| `src/hooks/useLoadFailsafe.js` | `useLoadFailsafe(loading, setLoading, ms = 8000)` and `useInitialLoadRef()`, from the 2026 social feed (commit 5af49bf4cb). |
| `src/hooks/useOnlineStatus.js` | SSR-safe online flag (defaults true, subscribes in an effect). |
| `src/components/ui/OfflineBar.jsx` | Fixed top pill, `role="status"`, "You Are Offline" plus a 44px "Retry". Renders null when online. |
| `src/hooks/useModalHistory.js` | Back gesture closes the modal: pushState on open, popstate calls onClose, programmatic close pops once without re-firing. |
| `src/hooks/useHaptics.js` | `haptic('light' / 'medium' / 'success')` over `navigator.vibrate`, try/catch, SSR no-op. |
| `src/components/ui/ResponsiveTable.jsx` | Real table above 768px, labelled cards at or below, CSS-only switch. |
| `__tests__/mobile-foundation.test.mjs` | Pins all of the above. |

## Changed files

- `pages/_app.js`: imports and mounts `<OfflineBar />` once, inside a
  `HubErrorBoundary`, beside the other global chrome.
- `src/index.css` (768 block): `touch-action: manipulation` and transparent
  tap highlight on `button, a, [role="button"]`; the 12px floor on `small,
  .caption, [data-caption]`. New `@media (hover: none)` block with press
  feedback (`button:not(.sp-no-press):active`) and the opt-in
  `.sp-hover-only` utility. The `.sp-icon-btn` and avatar exclusions are
  untouched.
- `src/config/bottom-nav-routes.json`: adds `"/hub/social-media": {}`.
- `pages/hub/social-media/index.js`: both shells drop `paddingBottom: 70`
  (the app shell's `BottomNavSpacer` is the clearance); the scroll-to-top FAB
  moves from `bottom: 80` to `calc(56px + 16px + env(safe-area-inset-bottom,
  0px))`.
- `pages/hub/social-pages/[pageId].js`, `pages/hub/social-pages/[pageId]/manage.js`:
  the loading shells had two `maxWidth` keys in one style literal (the 700
  silently overwrote the 100vw clamp) and `paddingBottom: 70`. The shell keeps
  the 100vw clamp, an inner column takes `maxWidth: 700`, the page-owned
  bottom pad is gone, and `100vh` became `100dvh`.

## Already true on this branch (no change needed)

The page-local auto-hiding bottom nav in `pages/hub/social-media/index.js`
(`bottomNavVisible`, `lastScrollY`) had already been removed by PR #992, and
`__tests__/bottom-nav-clearance.test.mjs` no longer carries a route-count
assertion to bump; it validates every manifest route against the pages tree
instead, which the new entry passes.

## Verification

- `node --test __tests__/mobile-foundation.test.mjs __tests__/bottom-nav-clearance.test.mjs __tests__/fixed-elements-stay-fixed.test.mjs __tests__/global-header-approved.test.mjs`: 25 pass, 0 fail.
- `@babel/parser` (plugins `['jsx']`) parses every touched page and every new file.
- No em dashes (U+2014) and no emoji in any new file.

## Not done in this phase

- No page has been migrated onto `HubPageShell` yet; that is Phase 1 onward.
- `useModalHistory` is not yet wired into any overlay (another agent owns
  the overlay, modal, sheet, Reels and Stories files).
- Pixels were not looked at on a device for this phase: it adds primitives
  and removes padding; the first page to adopt the shell gets the 375/390
  screenshot pass.
