---
description: How to rebuild and deploy the Club Arena SPA after source changes
---

# Club Arena Rebuild Workflow

The Club Arena is a **Vite + React SPA** in a separate repo. Changes to the Club Arena UI
require rebuilding and copying the output to the World Hub.

// turbo-all

## Source Repo Location

```
~/Documents/club-arena/
```

## THE ONLY WAY TO DEPLOY

**Use the atomic build script. No exceptions.**

```bash
bash ~/Documents/Smarter-Poker-World-Hub/scripts/build-club-arena.sh "feat(club-arena): description of changes"
```

This script handles the ENTIRE pipeline in one command:
1. Builds Club Arena from source with Vite
2. Wipes ALL old Vite-hashed assets (prevents phantom pending changes)
3. Copies fresh build output to `public/hub/club-arena/`
4. Stages ALL file changes (additions + deletions)
5. Commits with your message
6. Pushes to origin/main
7. Verifies clean working tree

## Pre-Flight: Make Your Changes

Edit files in the Club Arena source repo:
- Pages: `src/pages/`
- Components: `src/components/`
- Styles: `src/styles/` or component-level CSS

Then run the build script above. That's it.

## Rules — HARD LAW

1. **NEVER edit files directly in `public/hub/club-arena/`** — they get overwritten on rebuild
2. **NEVER manually `git add` club-arena assets** — the build script handles staging
3. **NEVER gitignore `public/hub/club-arena/`** — Vercel deploys from git and needs these files
4. **ALWAYS use `build-club-arena.sh`** — it's the only authorized deploy path
5. The pre-push hook (CHECK 6) will BLOCK pushes if orphaned arena assets are detected

## Why This Matters

Every Vite build generates NEW content-hashed filenames (e.g., `Page-Abc123.js`).
Without the atomic script:
- Old files accumulate as "phantom pending changes"
- Agents commit partial sets of files
- The Source Control badge shows 200+ changes
- Stuck rebases and merge conflicts follow

The build script eliminates this by wiping old assets BEFORE copying new ones,
then staging everything (including deletions) in one commit.

## Architecture

- The World Hub's `next.config.js` fallback rewrite serves `index.html` for all SPA routes
- Auth is shared via same-origin localStorage (`smarter-poker-auth` key)
- Static assets are served directly from `public/hub/club-arena/`
