# 2026-11-28 Club Commander player pages: every state keeps the global header

Found while checking #3280 live: signed in, `/hub/commander/player-card` showed a bare spinner with no Smarter.Poker header for about a second before the page appeared. 23 of the 37 player pages return their loading, not-found or error screen before they reach their own `<CommanderPageShell>`, so those screens had no global header, scene or painted "?".

Fix at the root, in one place rather than 23 early returns:
- `pages/_app.js` applies a page's `getLayout` when it declares one (standard Next.js per-page layout). No new import, so the app shell's module graph is unchanged (`__tests__/the-app-shell-stays-light.law.test.mjs`, ceiling 100).
- `CommanderPageShell` exports `commanderPageLayout`, and every `/hub/commander` page sets `Page.getLayout = commanderPageLayout`.
- The shell is idempotent: a context marks the frame, and a page's own `<CommanderPageShell>` inside it renders its children only, so there is never a second header.
- `__tests__/hub-commander-smarterdesign.law.test.mjs` pins the `_app` hook, the export, the nested no-op and the declaration on all 37 pages.
- `docs/business-hub-guide-review.json`: refreshed hash for `pages/hub/commander/index.js` (one layout line added; guide claims unaffected).
