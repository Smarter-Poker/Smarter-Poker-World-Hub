---
description: Safe daily commit and push to origin/main (prevents rejected pushes)
---

# Safe Deploy Workflow

This workflow prevents the "rejected push" error that occurs when the remote has commits you don't have locally (e.g., from other agents or concurrent sessions).

## Steps

// turbo-all

1. Pull latest changes from remote with rebase:
```bash
cd ~/Documents/Smarter-Poker-World-Hub && git pull --rebase origin main
```

2. Stage all changes:
```bash
cd ~/Documents/Smarter-Poker-World-Hub && git add .
```

3. Commit with a descriptive message:
```bash
cd ~/Documents/Smarter-Poker-World-Hub && git commit -m "Daily update"
```

4. Push to remote:
```bash
cd ~/Documents/Smarter-Poker-World-Hub && git push origin main
```

## Shortcut

You can also use the configured git alias:
```bash
cd ~/Documents/Smarter-Poker-World-Hub && git add . && git commit -m "Daily update" && git sync
```

## If Conflicts Occur

1. Check conflicted files: `git status`
2. Resolve each conflict by editing the files to remove `<<<<<<<`, `=======`, `>>>>>>>` markers
3. Stage resolved files: `git add <file>`
4. Continue the rebase: `git rebase --continue`
5. Push: `git push origin main`
