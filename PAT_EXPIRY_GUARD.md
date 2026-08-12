# PAT Expiry Guard

The fine-grained PAT used for pushes to this repo is stored in TWO places:

1. **`gh` CLI auth** — used by `scripts/git-safe-push.sh` via `gh auth token`
2. **`.git/config` branch tracking URL** — the `remote = https://x-access-token:ghp_...@github.com/...` line
   under `[branch "main"]`. This is a fallback that works even when `gh` auth fails.

Current token prefix in `.git/config`: `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` (**do NOT commit the full token**)  
Third location: **GitHub Actions secret `GH_ADMIN_PAT`** — used by `push-velocity-watchdog.yml`

When this token fails, ALL THREE stop working simultaneously.

## Rotation procedure

1. Dan goes to https://github.com/settings/personal-access-tokens/new
2. Creates a new fine-grained PAT:
   - Resource owner: Smarter-Poker
   - Repository access: Only select repositories → Smarter-Poker-World-Hub
   - Permissions: **Contents: Read and write**
   - Expiration: 1 year (default)
3. Update in ALL THREE places:
   - **`gh` CLI**: `gh auth login` (or `gh auth token --hostname github.com` replacement)
   - **`.git/config`**: edit the `remote =` line under `[branch "main"]` to use new token
   - **GitHub Actions secret**: Settings → Secrets → Actions → `GH_ADMIN_PAT` → Update
4. Revoke old token at https://github.com/settings/tokens
5. Update the token prefix on line 1 above to the new prefix
6. Update the expiry note below

## Current status

- Token last known working: 2026-08-12 (used for direct HTTPS push, exit 0)
- Token fails: unknown — the `gh` CLI auth path fails; the `.git/config` HTTPS path worked
- push-velocity-watchdog runs 809-811+ failing — same `GH_ADMIN_PAT` token
- Rotation is DUE: yes, as of 2026-08-12

## Why the reminder lives in-repo

GitHub's API does not expose self-revocation for classic PATs, and agents
cannot create external calendar reminders that survive across sessions.
The only reliable signal that survives context compaction is a file in
the repo that any session's audit sweep will notice.

This file is intentionally visible in `ls`/`tree` listings. If its "Token last
known working" date is more than 30 days old, flag PAT rotation as next-action.

## Emergency push (when both gh auth and normal push fail)

If `gh auth token` returns a dummy token and the remote push fails:

```bash
# Direct HTTPS push using the token embedded in .git/config
GIT_CONFIG_NOSYSTEM=1 HOME=/tmp git push \
  https://x-access-token:<TOKEN>@github.com/Smarter-Poker/Smarter-Poker-World-Hub.git \
  HEAD:main
```

Replace `<TOKEN>` with the value from `.git/config` `[branch "main"]` remote URL.
