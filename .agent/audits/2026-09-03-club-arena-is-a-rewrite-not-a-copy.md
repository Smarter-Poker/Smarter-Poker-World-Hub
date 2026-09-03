# Club Arena is a rewrite, not a copy

2026-09-03. `smarter.poker/hub/club-arena` is a path on this deployment, and
until today the only way a file reached it was a commit into
`public/hub/club-arena/`. Every Club Arena merge therefore produced a
`chore(club-arena): sync build` commit **here** and a 4-5 minute rebuild of
the entire World Hub - about twenty times a day - before a player saw it.

## What changed here

- **One rewrite** in `next.config.js` (`afterFiles`): `/hub/club-arena` and
  `/hub/club-arena/:path*` proxy to `https://ca-static.smarter.poker`, the
  Club Arena repo's own static origin (Caddy on `estate-ci-1`). The browser
  never sees that hostname - Vercel fetches it server-side - so the player is
  still on `smarter.poker` and the shared Supabase session
  (`smarter-poker-auth`) is untouched.
- **1,381 files deleted**: the vendored bundle and its media. The origin
  serves the same paths, with the same `Cache-Control` values this repo's
  `vercel.json`/`headers()` set, plus an additive asset pool so a player
  holding the previous `index.html` can still fetch the previous hashed
  chunks mid-hand.
- **Retired with the sync**: `sync-club-arena.sh`, `build-club-arena.sh`,
  the three `check-ca-*` gates and `pre-push-club-arena.sh` (they verified a
  bundle that is no longer here), `club-arena-budget.yml`,
  `club-arena-scheduled-deploy.yml` (the daily deploy-hook safety net for a
  sync that no longer exists - so `check-no-vercel-deploy` now allows
  **nothing**), `migrate-ca-assets-to-r2.sh`,
  `arena-theme-assets-exist.test.mjs`, and the `public/hub/club-arena/**`
  path triggers on six workflows.
- **New law**: `tests/club-arena-is-a-rewrite.test.mjs` - the rewrite exists
  and points at the origin, and the copy has not come back. That second half
  matters more than it looks: Next.js serves `public/` **before** `afterFiles`
  rewrites, so a re-vendored directory would silently override the origin and
  production would serve a stale bundle with nothing red anywhere. Both halves
  mutant-verified (restore the copy: red; delete the rewrite: red).
- **Pins moved with the mechanism**: `no-stray-club-arena-build` no longer
  requires `public/hub/club-arena/assets` to exist (its absence is now the
  correct state, asserted by the new law); `vercel-build-queue` pins that a
  production change still builds rather than that a Club Arena sync does;
  `menu-routes-exist` describes the rewrite instead of the fallback.

## Rollback

Revert this PR: the bundle, the fallback rewrite and every retired check come
back together, and the Club Arena publisher's World Hub sync returns with its
own revert. The origin can also be rolled back on its own by re-pointing
`/srv/club-arena/current` at an older release.
