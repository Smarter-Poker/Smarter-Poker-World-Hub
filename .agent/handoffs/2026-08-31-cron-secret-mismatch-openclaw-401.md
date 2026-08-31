# HANDOFF — CRON_SECRET mismatch: the whole Open Claw fleet is 401ing

**Raised:** 2026-08-31 ~09:05 UTC
**Severity:** HIGH — 85 scheduled jobs are failing authentication against production.
**Human action required:** yes, and ONLY because the current production
`CRON_SECRET` value is a credential no agent here has an authorized path to
read (see "Why this is not self-serviceable"). Everything else is diagnosed.

---

## What is broken

Every Open Claw job POSTs `https://smarter.poker/api/cron/<name>` with
`Authorization: Bearer $CRON_SECRET`. Production is rejecting that secret.

```
Aug 31 09:03:00  /api/cron/push-dispatch    -> vercel 401 {"error":"Unauthorized"}
Aug 31 09:03:00  /api/cron/transcode-videos -> vercel 401 {"error":"Unauthorized"}
Aug 31 09:03:00  /api/cron/waitlist-sweep   -> vercel 401 {"error":"Unauthorized"}
```

Reproduced deterministically from the VM itself, using the VM's own env, 6/6:

```bash
ssh root@178.104.160.250 'set -a; . /etc/openclaw.env; set +a;
  curl -s -o /dev/null -w "%{http_code}\n" \
    -H "Authorization: Bearer $CRON_SECRET" \
    https://smarter.poker/api/cron/waitlist-sweep'
# 401 401 401 401 401 401
```

## Blast radius

85 registered jobs. The ones that matter most, all currently dead:

| Job | What stops |
|---|---|
| `push-dispatch` | **All push notifications to players.** |
| `anti-cheat-bot-timing`, `anti-cheat-chip-dump`, `anti-cheat-multi-account`, `collusion-scan` | **Every automated integrity check.** |
| `chip-supply-snapshot` | Chip supply/economy accounting snapshots. |
| `waitlist-sweep` | Waitlist queue advancement (see the 2026-08-31 seat-hold work). |
| `spin-sweep`, `tournament-bounty-detect`, `bbj-detect` | Spin pool health, bounties, bad-beat jackpot detection. |
| `live-reminders`, `venue-game-alerts`, `license-reminders` | Player-facing reminders. |

## Root cause (diagnosed, high confidence)

The production `CRON_SECRET` was changed and the Hetzner VM was never updated.

Evidence chain, each step checked rather than assumed:

1. **Production HAS a secret configured.** `src/utils/cron-auth.js` THROWS when
   `CRON_SECRET` is unset, which surfaces as a 500. We get a 401, which is the
   handler's own "you presented the wrong secret" branch. So the variable is
   set in Vercel and simply does not match.
2. **The auth code did not change.** No recent commits to
   `src/utils/cron-auth.js`; the logic is the correct fail-closed version.
3. **It is not Vercel Deployment Protection.** That returns an HTML challenge,
   not our handler's `{"error":"Unauthorized"}` JSON body. We get the JSON.
4. **The VM sends the value from `/etc/openclaw.env`.** systemd loads
   `EnvironmentFile=-/etc/openclaw.env`, and `dispatcher.py` reads
   `os.environ['CRON_SECRET']` first. Fingerprint of what it actually sends
   (SHA-256, first 12 hex — the value itself is never printed): `5eb74390bc5b`.
5. **Timing matches a deploy.** 200s until 08:59:01, then 401s from 09:00:00.
   The handful of 200s still appearing are warm lambdas from the previous
   deployment holding the OLD secret; they are cycling out, which is why this
   goes from "mostly broken" to "entirely broken" on its own.

### Second, smaller defect found on the way

`/opt/openclaw/.env` on the VM contains a **different** `CRON_SECRET`
(fingerprint `dcce68dd475f`) from `/etc/openclaw.env` (`5eb74390bc5b`). It is
currently inert — `dispatcher.py` prefers the real environment variable — but
it is a live trap: anyone who runs the dispatcher by hand from `/opt/openclaw`
without systemd picks up the wrong one and gets exactly this 401 with a
different explanation. Delete it or reconcile it while you are in there.

## The fix

Make the VM present the secret production actually expects.

```bash
# 1. Read the CURRENT production value (Vercel dashboard, or an authenticated
#    CLI:  vercel env pull --environment=production)
#    Project: hub-vanguard (prj_op66GkZyZcygXQKm76iyycfVFAQx)

# 2. Put it on the VM (root@178.104.160.250, key ~/.ssh/hetzner_deploy):
#    edit /etc/openclaw.env  ->  CRON_SECRET=<the production value>

# 3. Reconcile or remove the stale second copy:
#    /opt/openclaw/.env      ->  same value, or delete its CRON_SECRET line

# 4. Restart:
systemctl restart openclaw.service && systemctl is-active openclaw.service
```

### Verify — do not skip, and do not accept "it restarted" as proof

```bash
# A. The VM's secret is now accepted by production (expect 200, not 401):
ssh root@178.104.160.250 'set -a; . /etc/openclaw.env; set +a;
  curl -s -o /dev/null -w "%{http_code}\n" \
    -H "Authorization: Bearer $CRON_SECRET" \
    https://smarter.poker/api/cron/waitlist-sweep'

# B. Real scheduled traffic is green for a few minutes (expect no 401s):
ssh root@178.104.160.250 \
  "journalctl -u openclaw.service --since '5 min ago' --no-pager \
   | grep -oE '-> vercel [0-9]{3}' | sort | uniq -c"
```

Both must pass. A restart alone proves nothing — the service reported `active`
and was 100% failing throughout this incident.

## Why this is not self-serviceable

Agents are expected to ship their own work (RULE 0), and everything in this
document that could be done without the credential has been done: the fault is
isolated, reproduced, attributed, and the remedy is written out. The one
remaining step needs the **current production `CRON_SECRET` value**, and:

- the local `VERCEL_TOKEN` is rejected (`vercel whoami` -> "token is not
  valid"), so `vercel env pull` cannot run — plausibly the same rotation that
  caused this;
- the Vercel MCP server exposes no environment-variable read tool;
- the repo does not hold the value, correctly.

That is precisely the "credentials the agent has no path to obtain" exception
in RULE 0. The invalid `VERCEL_TOKEN` is worth fixing in the same pass — it is
a second system left behind by the same rotation.

## Suggested follow-up (prevents the silent version of this)

`scripts/ci/check-cron-liveness.mjs` exists, and whatever it currently
measures, it did not catch an entire fleet returning 401. Worth a look: the
failure mode here was invisible to everything except the VM's own journal, and
a cron whose failures nobody sees is indistinguishable from a cron that was
never scheduled.
