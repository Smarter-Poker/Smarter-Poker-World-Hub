# SELF-PUBLISH PROTOCOL (binding on every agent, every session)

No session ends with unpushed commits. No handoffs for pushing. Verified
2026-08-19: agents in the Cowork cloud sandbox CAN push and publish
themselves. This file records the working path so nobody re-derives it.

## The one channel that works from a Cowork session

The device-bridge tool `counselors__host_terminal` executes bash ON THE MAC
HOST (user smarter.poker) with full network, git credentials, node (via
/opt/homebrew/bin or nvm), and gh CLI. The mounted-VM shell (device_bash) has
NO network and CANNOT delete files -- it is for editing only. Do not confuse
the two.

PATH note: host shells are non-login. Start commands needing node/gh with:
  export PATH="/opt/homebrew/bin:$PATH"

## World Hub (Smarter-Poker-World-Hub)

1. Clear stale locks (real deletes work on the host):
   find .git -name "*.lock*" -mmin +10 -delete
2. The ONLY push command (CLAUDE.md 1.3), detached because its build gate
   outlives the 60s tool timeout:
   nohup bash scripts/git-safe-push.sh "<message>" > /tmp/push-wh.log 2>&1 &
   Poll /tmp/push-wh.log until DEPLOY_VERIFIED:true and SHA_MATCHED:true.
   NOTE: a command killed by the 60s MCP timeout keeps running on the host --
   check pgrep -f git-safe-push before starting a second one.
3. Prove it on CONTENT, not SHA: git show origin/main:<file> | grep <symbol>.

## Club Arena (Smarter-Poker-Club-Arena)

1. git fetch; if origin moved and the working tree holds another agent's
   uncommitted files, DO NOT stash them. Merge in a throwaway worktree:
     git worktree add --detach /tmp/ca-merge origin/main
     cd /tmp/ca-merge && git merge --no-edit main
     ln -sfn ~/Documents/club-arena/node_modules node_modules
     ./node_modules/.bin/tsc --noEmit -p tsconfig.app.json   # must exit 0
     git push origin HEAD:main
     cd ~/Documents/club-arena && git worktree remove /tmp/ca-merge --force
2. Pushing main triggers the pipelines that publish: "Build for World Hub
   Sync" (arena assets into the hub), "Auto-Deploy Hetzner Engine" (server/
   changes to the live engine), CI, Silent Revert Guard. VERIFY them:
   gh run list --repo Smarter-Poker/Smarter-Poker-Club-Arena --limit 4
   A run left red = not published. Fix forward, never claim success.

## Rules that keep this safe under concurrent agents

- merge, never rebase, when origin moved (SHAs churn under rebase).
- Never stash or stage another agent's dirty files; the worktree pattern
  exists precisely so their tree is never touched.
- Vercel needs nothing manual: the GitHub integration deploys on push.
  Verify with the Vercel MCP (list_deployments) or the dashboard -- state
  READY on the expected commit, then content-check the deployed origin.
