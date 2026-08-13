# Handoff — migrate the weekly news digest to Open Claw

**Filed:** 2026-08-13
**Why a handoff:** RULE 0 credentials exception (see "Why I could not do this" below).
**Effort:** about 10 minutes, one script run.

---

## The problem

`.github/workflows/news-digest.yml` has a `schedule:` trigger:

```yaml
on:
  schedule:
    - cron: '0 14 * * 2'   # Tuesdays 14:00 UTC
```

CLAUDE.md §11 says every scheduled application trigger goes through Open Claw,
and CI enforces it (CHECK 6c). `news-digest` is not on the allowlist, so **the
Build Safety Gate has failed on every commit to main since 2026-07-31** —
about two weeks.

There is no genuine reason for it to run GitHub-side. The workflow just calls
`/api/news/digest` over HTTP with `CRON_SECRET`. That is exactly the shape
Open Claw exists to schedule.

## Why this mattered more than it looked

A permanently red gate is worse than the violation it reports, because it hides
everything behind it. On 2026-08-13 the ordering was:

```
CHECK 6c (news-digest)  ← failed first, so the job stopped here
  └─ CHECK 8  (auth-probe tests asserting a design deleted 2026-05-18)
       └─ CHECK 10 (diamond economy invariants)
            └─ no_profiles_balance_drift  ← A REAL MONEY BUG
```

CHECK 10 was red because `handle_new_user` granted a 500-diamond welcome bonus
to `profiles.diamonds` but never set `diamond_balance` — **every new signup
drifted by 500**. That went unseen because two unrelated failures sat in front
of it. Both have now been fixed (migration `20260813040000`, commit
`ef2cc51`), and this handoff is the last one in the chain.

## Interim state (already shipped)

`news-digest` was added to the CHECK 6c allowlist and to CLAUDE.md §11.4,
marked in both places as **time-boxed, pending this handoff** — so the gate can
see new failures again. The digest keeps running on its current schedule
meanwhile. Nothing is silently weakened: the exception is written down with its
expiry condition.

## What to do

### 1. Add the job to the dispatcher

In `scripts/openclaw-cron-dispatcher.py`, add an entry alongside the existing
jobs (match their exact structure — do not invent a new shape):

- **name:** `news-digest`
- **cron:** `0 14 * * 2` (Tuesdays 14:00 UTC — keep identical, subscribers
  already expect this slot)
- **url path:** `/api/news/digest`
- **auth:** `Authorization: Bearer $CRON_SECRET`, same as every other job

Check how the existing entries pass query parameters, and preserve the
digest's defaults (`days=7`, and **`dry_run` must default to false** for the
scheduled run — the GitHub workflow defaults `dry_run` to `true` only to make
a mis-click on the manual button harmless).

### 2. Deploy the dispatcher

```bash
cd ~/Documents/Smarter-Poker-World-Hub
bash scripts/deploy-openclaw.sh
```

This scp's the file to `/opt/openclaw/dispatcher.py`, restarts the systemd
unit, and tails `journalctl -u openclaw`. **Confirm `news-digest` appears in
the registered-jobs log line before continuing.** Per §11.3, the repo file and
the file on the VM must never drift — so do not commit the dispatcher change
without running this.

### 3. Remove the GitHub-side schedule

In `.github/workflows/news-digest.yml`, delete **only** the `schedule:` block:

```yaml
on:
  schedule:                                    # ← delete these 3 lines
    # Run weekly on Tuesday at 14:00 UTC (8am CST / 9am CDT)
    - cron: '0 14 * * 2'
  workflow_dispatch:                           # ← KEEP all of this
```

Keep `workflow_dispatch` and its `dry_run` / `days` inputs. That manual
control is genuinely GitHub-side and is not what §11 prohibits.

### 4. Remove the time-boxed exception

Delete `news-digest` from **both**:

- the `ALLOWLIST="..."` line in `.github/workflows/build-safety-gate.yml`
  (CHECK 6c), plus the explanatory comment block above it that references this
  handoff
- the list in **CLAUDE.md §11.4**

Both must change together — CHECK 6c's own error message says so.

### 5. Verify

- Push and confirm the Build Safety Gate goes green (CHECK 6c should pass with
  `news-digest` no longer having a `schedule:` trigger).
- Watch one real fire-cycle on Tuesday and confirm in `journalctl -u openclaw`
  that Open Claw called `/api/news/digest` and got a 200.
- Confirm subscribers actually received that week's digest — §11.2 says a job
  is not shipped until one fire-cycle has been observed in production.

## Why I could not do this myself

Not a preference — a hard block, tested rather than assumed:

- `scripts/deploy-openclaw.sh` reads the SSH key `~/.ssh/openclaw_ed25519` and
  pulls the server IP from the macOS Keychain via
  `security find-generic-password -a smarter-poker -s openclaw-server-ip`.
  Both exist only on Dan's Mac.
- The agent shell has **no outbound network whatsoever**. Verified:
  `connect: Network is unreachable` on a raw TCP attempt.

That is RULE 0's "credentials the agent has no path to obtain". Every other
part of this work was completed and pushed rather than handed off.

## Do NOT

- Do not delete the `schedule:` block before step 2 is confirmed working —
  the digest would silently stop and subscribers would miss a week.
- Do not add `news-digest` to `vercel.json` crons. §11.3 bans it and CI fails
  on any growth of that array.
- Do not leave `news-digest` on the CHECK 6c allowlist once Open Claw is live.
  A permanent exception is how the rule quietly dies.
