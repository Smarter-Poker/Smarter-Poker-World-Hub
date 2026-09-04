---
description: How Club Arena reaches production (it does not go through this repo any more)
---

# Club Arena: how a change reaches a player

> **REWRITTEN 2026-09-04. Everything this file used to say is gone, and it was
> dangerous.** It described an "atomic build script" as "THE ONLY WAY TO
> DEPLOY", under a heading reading HARD LAW, in the present tense:
> `bash scripts/build-club-arena.sh`. That script was deleted from `main` on
> 2026-09-02, along with `scripts/sync-club-arena.sh` and the 1,792 vendored
> files under `public/hub/club-arena/`. Rule 3 of the old list -
> "NEVER gitignore `public/hub/club-arena/`" - was the exact inverse of what
> `.gitignore` says today.
>
> Following the old instructions would not have been a no-op. **Next.js serves
> `public/` BEFORE a rewrite**, so re-vendoring a bundle there does not
> duplicate the origin, it SHADOWS it: production keeps serving whatever was
> last committed here while the real publisher rsyncs into the void, and
> nothing anywhere reports a problem.

## The route, as it actually is

Club Arena is a Vite + React SPA in its own repo (`~/Documents/club-arena`).
It publishes to its own static origin. This repo carries ONE rewrite and no
build output at all.

```
push a branch to Smarter-Poker-Club-Arena
  -> agent-open-pr.yml opens the pull request (seconds)
  -> ci.yml runs the six required checks on the estate's runners
  -> agent-autopilot.yml squash-merges when they are green
  -> publish-club-arena.yml builds and rsyncs dist/ to
     ca-static.smarter.poker  (/srv/club-arena/releases/<sha>/, then an
     atomic swap of the `current` symlink)
  -> this repo's rewrite  /hub/club-arena/:path*  ->
     https://ca-static.smarter.poker/:path*   serves it
```

The browser never sees the origin's hostname: Vercel proxies the rewrite, so
the player is still on `smarter.poker` and the shared `smarter-poker-auth`
session is untouched.

**Your job ends at "push a branch."** Do not open the pull request, do not
merge it, and do not sit watching CI. A publish takes seconds once the merge
lands; rollback is re-pointing the symlink, and ten releases are kept.

## What to do in THIS repo

Almost certainly nothing. A Club Arena UI change is a Club Arena commit.

The only Club Arena surfaces that live here are the rewrite in `next.config.js`
and the API routes under `pages/api/club-arena/`. If you are editing anything
else in this repo "for Club Arena", stop and check which repo you want.

## Rules - and these are the real ones

1. **Never re-create `public/hub/club-arena/`.** It is deleted, it is
   gitignored, and `tests/club-arena-is-a-rewrite.test.mjs` fails CI if it
   comes back. See the note at the top for why it is worse than useless.
2. **Never write a script that copies a Club Arena build into this repo.**
   `scripts/sync-club-arena.sh` and `scripts/build-club-arena.sh` are gone and
   stay gone.
3. **Never `vercel deploy` / `vercel --prod` for Club Arena.** Club Arena's own
   `vercel.json` has `deploymentEnabled: false` on purpose.
4. **Verify by reading, never by assuming.**
   `curl -s https://smarter.poker/hub/club-arena/build-info.json` - `ca_sha`
   must equal the squash commit on Club Arena's `main`. Nothing else counts as
   deployed.

## Local preview

```bash
cd ~/Documents/club-arena && npm run dev
```

The Vite dev server is the preview. This repo's dev server proxies the rewrite
to the live origin, so there is nothing to sync for a local look.

## Where the detail lives

- `~/Documents/club-arena/CLAUDE.md` section 1.1 - the pipeline, step by step.
- `~/Documents/club-arena/.agent/architecture/deploy-paths.md` - the tier table.
- `AGENT-PLAYBOOK.md` (byte-identical in all seven repos) - how to ship
  anywhere in the estate without losing work.
