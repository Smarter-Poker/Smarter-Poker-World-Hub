---
description: How to rebuild and deploy the Club Arena SPA after source changes
---

# Club Arena Rebuild Workflow

The Club Arena is a **Vite + React SPA** in a separate repo. Changes to the Club Arena UI
require rebuilding and copying the output to the World Hub.

// turbo-all

## Source Repo Location

```
~/Documents/Smarter-Poker-Club-Arena/
```

## Step 1: Make Your Changes

Edit files in the Club Arena source repo:
- Pages: `src/pages/`
- Components: `src/components/`
- Styles: `src/styles/` or component-level CSS

## Step 2: Build

```bash
cd ~/Documents/Smarter-Poker-Club-Arena && npm run build
```

This outputs to `dist/`.

## Step 3: Copy to World Hub

```bash
rsync -av --delete --exclude='*.map' ~/Documents/Smarter-Poker-Club-Arena/dist/ ~/Documents/Smarter-Poker-World-Hub/public/hub/club-arena/
```

This copies all built files (JS, CSS, HTML, images) and removes stale files.
The `--exclude='*.map'` skips source maps to keep the deployment lean.

## Step 4: Deploy

```bash
bash ~/Documents/Smarter-Poker-World-Hub/scripts/git-safe-push.sh "fix: [your description]"
```

## Rules

- NEVER edit files directly in `public/hub/club-arena/` — they get overwritten on rebuild
- ALWAYS build from the source repo
- The World Hub's `next.config.js` fallback rewrite serves `index.html` for all SPA routes
- Auth is shared via same-origin localStorage (`smarter-poker-auth` key)
