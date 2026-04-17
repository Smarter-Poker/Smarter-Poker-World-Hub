# PAT Expiry Guard

The fine-grained PAT Claude uses for pushes to this repo expires **July 13, 2026**.

- Token prefix: `github_pat_11B4UMBYA0yr99…` (do NOT commit full token)
- Scope: single repo, contents:write on `Smarter-Poker/Smarter-Poker-World-Hub`
- When expired, Claude's `push_phaseN.py` scripts will 401 on the `/git/blobs` POST and Dan will see the failure in the session

## Rotation procedure

1. Dan goes to https://github.com/settings/personal-access-tokens/new
2. Creates a new fine-grained PAT:
   - Resource owner: Smarter-Poker
   - Repository access: Only select repositories → Smarter-Poker-World-Hub
   - Permissions: **Contents: Read and write**
   - Expiration: 1 year (default)
3. Passes the new token to Claude at the start of the next session
4. Claude updates its internal journal (`/mnt/transcripts/journal.txt`) with the new token prefix + new expiry
5. Dan revokes the old token at https://github.com/settings/tokens (one click)

## Why the reminder lives in-repo

GitHub's API does not expose self-revocation for classic PATs, and Claude
cannot create external calendar reminders that survive across sessions.
The only reliable signal that survives context compaction is a file in
the repo that any session's audit sweep will notice.

This file is intentionally visible in `ls`/`tree` listings. If its date
line above is within 30 days of today, Claude should flag PAT rotation
as a next-action item at the start of the session.
