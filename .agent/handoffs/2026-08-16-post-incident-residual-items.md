# Antigravity handoff — 2026-08-16 post-incident residual items

**Author:** Cowork/Claude session, 2026-08-16 ~16:00 UTC
**Why a handoff:** every item below needs a credential, a console, or a host
this session has no route to. Nothing here is deferred work — it is work that
is physically unavailable from a sandboxed Cowork session.

**Read the whole file before starting.** It is self-contained on purpose; do
not go looking for `.memory/` (gitignored, local-only).

---

## P0-A — Restore the Cowork GitHub bridge credential + fix the autofix PAT

**Status: BRIDGE BROKEN. The ACCOUNT IS FINE — do not mint in a panic.**

### Correction to an earlier draft of this handoff

An earlier version of this file said the 2026-08-16 PAT revocation sweep killed
the bridge token. **That is probably wrong.** Token inventory taken from the
GitHub UI on 2026-08-16 shows plenty of working credentials:

| Token | Type | State |
|---|---|---|
| `WORLD_HUB_SYNC_TOKEN` | fine-grained | **alive**, used within the last week, expires 2027-05-19 |
| `NEW CLAUDE NEW` | classic | **alive**, never used, **no expiration**, full admin scopes |
| `Smarter-Poker-World-Hub-autofix` | fine-grained | **expired** |
| `SmarterPoker ClubArena Rebuild` | fine-grained | expired |
| `newclaude1`, `NEW CLAUDE TOKEN 1`, `claudev5`, `CLAUDEV3`, 3× "WEB BASED TOKEN", others | classic | all expired |

Timeline says it was not a revocation: the MCP call succeeded at ~15:00 UTC and
failed at ~15:55, and in between `GITHUB_TOKEN=ghp_KhImltZ…` was redacted out of
the local `.env`. If the bridge reads its credential from that file, the
redaction is what broke it.

```
mcp__github__get_file_contents  Smarter-Poker/Smarter-Poker-World-Hub  package.json
  -> Authentication Failed: Bad credentials
```

### Do

1. **Find where the Cowork GitHub MCP server reads its token** and put a working
   value there. If it reads `GITHUB_TOKEN` from the repo `.env`, that is a bad
   place for it — move it into the MCP server config so a repo-hygiene pass
   cannot break the bridge again.
2. **`Smarter-Poker-World-Hub-autofix` is expired** and GitHub records it as
   last used four months ago. That is almost certainly the token behind
   `GH_PAT` / `AUTOFIX_GITHUB_TOKEN`, which means `pages/api/deploy-autofix.js`
   has been returning `{action:'skipped', reason:'GH_PAT not configured'}` for
   months and has never fixed a build. Issue a replacement fine-grained token
   and update `GH_PAT` (Vercel) and `AUTOFIX_GITHUB_TOKEN` (Actions secrets).
   This is a second, independent failure in the same subsystem as P1-B.
3. **Delete `NEW CLAUDE NEW`.** Classic PAT with `admin:enterprise`,
   `admin:org`, `delete_repo` and `workflow`, **no expiration date**, never
   used. In a week where a PAT leaked into a public repo, an immortal
   full-admin token is the worst-shaped credential in the account — maximum
   blast radius, and because it has never been used, nothing would look
   different if somebody else started using it. Replace with a fine-grained,
   repo-scoped, expiring token for whatever it was intended for.
4. Also check the agent patch runner (`agent-apply-patch.yml`, Club Arena) for a
   dead PAT.
5. Classic-token list has a page 2 that was not read. Audit it for more
   no-expiry tokens.

### Verify

- Any MCP `get_file_contents` call returns content, not `Bad credentials`.
- `/api/deploy-autofix` with a dummy payload does not answer
  `GH_PAT not configured`.
- `github.com/settings/tokens` shows no remaining token without an expiry date.

---

## P0-B — Rotate the password that was pasted into a chat transcript

**Status: EXPOSED.**

The current DB/account password was pasted in plain text into the Cowork chat
on 2026-08-16. That transcript has been compacted and summarised repeatedly;
each summary is another copy. Treat the string as burned. (Value deliberately
not repeated here.)

Two separate defects:

1. **It is in a transcript.** Rotate it.
2. **The same string was set as BOTH the Supabase DB password AND the
   `daniel@bekavactrading.com` login password.** That coupling is what made the
   original leak expensive — `CLAUDE_AUDIT_LOG.md` documented one string as
   both, so one leaked file compromised database access and account login
   together. Do not recreate it.

### Do

1. Generate two **unrelated** values in a password manager. Neither typed by a
   human, neither pasted into any chat, shell history, or file.
2. Set the Supabase database password (dashboard → Settings → Database).
3. Set the account password separately.
4. Update every consumer of the DB password: Hetzner connection strings,
   `/opt/workers/.env`, local `.env` files.

### Verify

**This is currently unproven and it matters.** As of 2026-08-16 15:36 UTC:

```sql
select max(last_sign_in_at) from auth.users where email = 'daniel@bekavactrading.com';
-- 2026-08-16 00:23:23+00
```

That is *before* the legacy JWT keys were disabled at 00:38. The account has had
no successful sign-in since the rotation, so the current password has never been
proven to work. A failed password write returns success and looks identical from
outside.

**Sign in through the real login form once**, then re-run the query and confirm
`last_sign_in_at` has moved.

---

## P1-A — Rotate `HETZNER_SSH_PRIVATE_KEY` and purge the Actions logs

**Status: KEY IS RECOVERABLE FROM LOGS RIGHT NOW.**

Three workflows base64'd the private key and piped it through `sed 's/./& /g'`
before printing. GitHub redacts secrets from logs by string-matching the secret
value — a space between every character defeats that match completely. With
base64 on top, the value comes out of the log fully reconstructable by anyone
who can read Actions logs or dispatch a run.

PR #610 neutralised the workflow files. **That does not un-print anything an
earlier run already emitted.** The logs still hold the key.

### Do

1. Generate a new Hetzner keypair. Install the public key on `5.161.252.33`;
   remove the old one from `~/.ssh/authorized_keys` **and from the Hetzner
   project-level key store** — the 2026-08-15 incident showed attacker keys
   surviving host cleanup because the project store re-injected them.
2. Update `HETZNER_SSH_PRIVATE_KEY` in both repos' Actions secrets.
3. **Delete the workflow run logs.** Removing a workflow file does not remove
   its run history:
   ```
   gh run list --workflow read_secret.yml --json databaseId -q '.[].databaseId' \
     | xargs -I{} gh api -X DELETE repos/Smarter-Poker/Smarter-Poker-World-Hub/actions/runs/{}
   ```
   Repeat for `read_host.yml` and `read_secrets.yml`, in both repos.
4. Delete the three workflow files outright. They were neutralised in place
   rather than deleted because the agent GitHub bridge can create and update
   files but not remove them.

### Verify

- `gh run list --workflow read_secret.yml` returns nothing, in both repos.
- A deploy still succeeds on the new key.

---

## P1-B — `deploy-error-poll` has a 99.6% failure rate and always has

**Status: BROKEN SINCE CREATION.**

This is the "self-healing deploy monitor" CLAUDE.md §1.6 describes as running
autonomously. Measured against `cron_execution_log` on 2026-08-16:

```
runs since 2026-05-03:  51,330
successes:                 227      (0.4%)
first error:            2026-05-03  — the very first logged run
last success:           2026-08-05 20:48 UTC
current behaviour:      HTTP 500, every run, every 2 minutes
```

It fires every 2 minutes from `scripts/openclaw-cron-dispatcher.py:163` and
writes ~720 failure rows a day. It was blind through the entire 2026-08-15/16
incident, which is why six consecutive `ERROR` deployments in Vercel produced no
reaction.

### Where the code actually lives

Not in World Hub. Commit `154cb4e33f` (2026-04-27) moved it:

> `feat(2B.3-close): flip deploy-error-poll to workers — VERCEL_TOKEN now on /opt/workers/.env`

The handler is in `smarter-poker-workers`, deployed to `/opt/workers` on
Hetzner. `pages/api/cron/deploy-error-poll.js` was deleted from World Hub in
that same commit and must stay deleted.

**Do not "fix" this by recreating the handler under `pages/api/cron/`.** 70 of
the dispatcher's paths have no handler in World Hub and most are healthy —
`hard-stop` is 120-for-120 clean. They all run in workers. Absent handler does
not mean broken.

### Do

1. SSH to `5.161.252.33`; read the worker logs for this job.
2. Prime suspect: `VERCEL_TOKEN` in `/opt/workers/.env`. Seven Vercel tokens
   were deleted during the 2026-08-15 incident response — check whether the one
   in that file was among them. Note the failure *predates* that deletion, so
   this may be a second cause layered on an older one. Find the original too.
3. Fix, redeploy the worker.

### Verify

```sql
select count(*) filter (where status = 'error')  as errors,
       count(*) filter (where status <> 'error') as ok
from cron_execution_log
where job_name = '/cron/deploy-error-poll'
  and started_at > now() - interval '30 minutes';
```

Must show `ok > 0`. Do not close this on "the code looks right".

---

## P1-C — Rotate the `sb_secret_` that was inlined in `supabaseAdmin.js`

**Status: UNKNOWN — TREAT AS LIVE.**

`src/lib/supabaseAdmin.js` carried a literal `sb_secret_…` service-role key as a
fallback. Introduced in `2fb4e70f61`, re-introduced in `f9f80de3` via a stash
restore — both *after* the previous service-role key was rotated for having been
committed to a public repo. Removed from HEAD in PR #611.

52 modules import that client, including `buyin.js`, `approve-cashout.js`,
`clawback-chips.js`, `distribute-chips.js`, `agent-credit.js`. It bypasses RLS.

The value is 24 characters after the prefix against 32 for the project's
publishable key, and the commit message called it a dummy — so it is probably a
placeholder. **Probably is not good enough for an RLS-bypassing credential, and
it is in git history permanently either way.**

### Do

Rotate the service-role key in the Supabase dashboard. One action, cheaper than
proving the old value was inert. Then update every consumer:

| Consumer | Location |
|---|---|
| Hetzner engine | `/opt/club-arena/server/.env` — restart engine after |
| Workers service | `/opt/workers/.env` |
| Vercel `hub-vanguard` | env vars, all three environments — **needs a rebuild, not a promote** |
| Actions secrets | both repos, `SUPABASE_SERVICE_ROLE_KEY` |
| Local | `~/Documents/Smarter-Poker-World-Hub/.env.local` |

### Verify

- Engine keeps dealing across the restart:
  `select count(*) from hand_history where created_at > now() - interval '5 minutes';`
  stays non-zero.
- `/api/health` healthy.
- Crons keep passing (P1-B query, applied to `hard-stop`).

---

## P2-A — Branch protection is unenforceable on the current plan

**Status: NOT A BUG — A BILLING DECISION.**

Neither repo has any branch protection or ruleset. Confirmed in the GitHub UI on
2026-08-16. The rulesets page states plainly:

> "Your rulesets won't be enforced on this private repository until you move to
> GitHub Team organization account."

`Smarter-Poker` is a personal account, not an organisation. On a free personal
plan, private repos cannot enforce branch protection at all.

Consequences today:

- `.github/CODEOWNERS` in both repos is decorative. World Hub's version claims
  in its own comments: *"Combined with branch protection requiring CODEOWNERS
  approval, nothing here ships without explicit auth-team sign-off."* That
  protection does not exist and, on the evidence, never did. The auth-critical
  paths it guards — `/pages/auth/`, `middleware.ts`, the Supabase clients, the
  signup probes — have been unguarded since they were added after the 9-day
  signup outage in May.
- `branch-protection-watchdog.yml` (daily 09:00 UTC, CLAUDE.md §11.4) is either
  failing or has never had anything to correct.
- Every PR in this incident was self-merged by an agent within minutes. Nothing
  blocked any of them.

### Decision for Dan

Either migrate to a GitHub organisation on a paid plan and turn protection on,
**or** delete the CODEOWNERS files and the watchdog workflow and stop asserting
a control that isn't there. The current state is the worst of both: review-request
email noise, documentation claiming a gate, and no gate.

---

## P2-B — Verify the remaining pre-purge credentials individually

**Status: ASSUMED DEAD, NOT PROVEN.**

Two credentials were tested and confirmed revoked (a Vercel team token and one
`ghp_` PAT). The conclusion drawn was that the others from the pre-purge backups
are "safe to assume dead or similarly unusable."

That does not follow. Two revoked credentials establish nothing about the rest —
and this incident already produced one instance of exactly this error, where
host-level cleanup looked complete while attacker keys survived in the Hetzner
**project** key store.

### Do

Enumerate every credential that appeared in the pre-purge backups and test each
against its own API, recording the result. Anything untestable gets rotated
rather than assumed. Write results to
`.agent/audits/2026-08-16-credential-revocation-matrix.md` as a table of
credential → test performed → result → action taken.

---

## Current good state — do not undo any of this

Verified against live production 2026-08-16, 15:00–16:00 UTC:

- Legacy Supabase JWT keys disabled; `sb_publishable__41Lp…` live and accepted.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` correct in all three Vercel environments —
  confirmed by the *absence* of the `[Supabase] … holds a LEGACY JWT key`
  console warning, which fires whenever `resolveAnonKey` has to substitute.
- 19 shipped bundles across World Hub and Club Arena scanned: zero revoked JWTs.
- Engine dealing on `5.161.252.33`; old compromised host `178.156.160.206` fully
  offline on 22/80/443/8080.
- Both repos private; zero live credential material in tracked files. Only
  matches are an `sb_secret_TEST…` unit fixture in
  `src/lib/__tests__/supabaseKeys.test.mjs`, and the literal words
  `BEGIN OPENSSH PRIVATE KEY` as prose in
  `.agent/handoffs/2026-05-01-yt-pipeline-push-and-secrets.md:145` — no key
  body, zero long base64 lines in that file.
- Club Arena `_to_delete`, `server/_to_delete`, `.git/_to_delete` removed.

### One trap to know about

`src/lib/authUtils.ts` and `src/lib/authUtils.js` both exist. **Next resolves
`.ts` first**, so the `.js` is dead code. A fix applied to the `.js` on
2026-08-15 never reached production and the outage recurred the next day because
of it. PR #612 fixed the `.ts`. If you touch anon-key handling, touch the `.ts`
— and consider deleting the `.js` outright.
