# Club Arena Deployment Guide

> **REPLACED 2026-09-04. The 294 lines that used to be here described a
> pipeline that no longer exists, and described it as "the ONLY correct
> workflow" under a MANDATORY READING banner.**
>
> It told the reader to build Club Arena on a Vercel project of its own,
> download 200+ chunks from that deployment, and push them into this repo's
> `public/hub/club-arena/` with the GitHub Git Trees API. Every part of that is
> now wrong: the Club Arena Vercel project is disabled
> (`deploymentEnabled: false`), the directory was deleted on 2026-09-02, and
> **Next.js serves `public/` BEFORE a rewrite** - so a file put back there
> would not duplicate the live bundle, it would SHADOW it. Production would
> freeze on the committed copy while the real publisher kept publishing to an
> origin nobody was reading.
>
> A banner on top of the old text was not enough. The body read as present-tense
> law, and a reader who skims lands in the middle of it.

## How a Club Arena change reaches a player

```
push a branch to Smarter-Poker-Club-Arena
  -> agent-open-pr.yml opens the pull request (seconds)
  -> ci.yml runs the six required checks on the estate's runners
  -> agent-autopilot.yml squash-merges when they are green
  -> publish-club-arena.yml builds dist/ and rsyncs it to
     ca-static.smarter.poker  (/srv/club-arena/releases/<sha>/, then an
     atomic swap of the `current` symlink)
  -> THIS repo's single rewrite, /hub/club-arena/:path* -> that origin,
     serves it
```

**Your job ends at "push a branch."** Do not open the pull request, do not
merge, do not watch CI. The browser never sees the origin's hostname - Vercel
proxies the rewrite - so the player is still on `smarter.poker` and the shared
`smarter-poker-auth` session is untouched.

## The only verification that counts

```bash
curl -s https://smarter.poker/hub/club-arena/build-info.json
```

`ca_sha` must equal the squash commit on Club Arena's `main`. Not "the push
succeeded", not "the merge landed", not "Vercel is building". This file, or it
is not deployed.

## The four rules

1. **Never re-create `public/hub/club-arena/`.** It is deleted, it is
   gitignored, and `tests/club-arena-is-a-rewrite.test.mjs` fails CI if it
   returns.
2. **Never write or run a script that copies a Club Arena build into this
   repo.** `scripts/sync-club-arena.sh` and `scripts/build-club-arena.sh` are
   gone and stay gone.
3. **Never `vercel deploy` / `vercel --prod` for Club Arena.**
4. **A Club Arena UI change is a Club Arena commit.** The only Club Arena
   surfaces in this repo are the rewrite in `next.config.js` and the API routes
   under `pages/api/club-arena/`.

## What survives from the old guide, because it is still true

**Old hashed assets must keep resolving.** A player whose tab still holds the
previous `index.html` asks for the previous chunks mid-hand, and a missing
chunk is a `"Failed to fetch dynamically imported module"` that a refresh
cannot fix, because `immutable` cache headers poison the browser cache. The
origin handles this now: `/assets/*` and `/fonts/*` are served from an ADDITIVE
pool the publisher never `--delete`s, pruned by age (30 days) only. **Do not
"clean up" that pool** by removing what is not in the current bundle - that is
precisely the 404 it exists to prevent.

## Where the detail lives

- `~/Documents/club-arena/CLAUDE.md` section 1.1 - the pipeline, step by step
- `~/Documents/club-arena/.agent/architecture/deploy-paths.md` - the tier table
- `.agent/workflows/club-arena-rebuild.md` - the same route, from this repo's side
- `AGENT-PLAYBOOK.md` - byte-identical in all seven repos
