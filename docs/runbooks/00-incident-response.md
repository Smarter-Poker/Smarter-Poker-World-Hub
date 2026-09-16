# 00 — Incident Response Protocol

## When to use

You've been paged and no other runbook obviously applies. Start here to
classify the incident, stabilize, and route to the correct specialist
runbook.

## Prerequisites

- Slack access to `#incidents`
- GitHub write access
- Vercel + Supabase + Grafana logins
- A notebook (digital or paper) — you'll be taking the timeline by hand

## Step 1 — Acknowledge and open an incident channel (≤ 2 min)

1. Ack the page in PagerDuty / Twilio so the secondary doesn't also wake up.
2. Post in `#incidents` using this template:

   ```
   :rotating_light: Incident: <one-line summary>
   Severity: SEV-? (will classify after triage)
   IC: <your name>
   Started: <UTC timestamp>
   Detection: <alert source / URL>
   Status: Investigating
   ```

3. You are now the Incident Commander (IC). Your job is not to fix the bug,
   it is to coordinate. If you need to be the fixer as well, appoint a
   co-IC explicitly in the channel.

## Step 2 — Classify severity (≤ 5 min)

Match the symptoms against the severity table in `README.md`. Update the
Slack message with the severity. If it's SEV-1:

- Open a Zoom bridge and post the link to `#incidents`.
- Page the engineering lead.
- Post a holding message to status.smarter.poker: "We are investigating an
  issue affecting <area>. Next update in 15 minutes."

## Step 3 — Fast-path triage (≤ 10 min)

Hit these in order. Each takes under a minute and narrows the blast radius
quickly.

1. **Check `/api/health`:**
   ```bash
   curl -s https://smarter.poker/api/health | jq
   ```
   Note the `version` field — that's the short commit SHA of the current
   prod deploy. Compare against `main` HEAD to see if the issue correlates
   with a specific deploy.

2. **Check the last 5 Vercel deploys:** https://vercel.com/smarter-poker/hub-vanguard/deployments
   If the most recent READY deploy looks suspicious, jump to runbook 01.

3. **Check Supabase status:** https://status.supabase.com — and the
   project's own health at
   `https://app.supabase.com/project/<ref>/reports/api-overview`.
   If the DB is degraded, jump to runbook 02.

4. **Check `engine.smarter.poker` health:**
   ```bash
   curl -s https://engine.smarter.poker/health
   ```
   If red, jump to runbook 03.

5. **Check Sentry's "Recent Issues" view** scoped to the last 30 minutes.
   A spike of one fingerprint across many users points to a recent deploy
   regression; a scatter of unrelated errors points to infra.

6. **Check Grafana's "Platform Overview" dashboard** on
   https://grafana.smarter.poker. The golden-signal panels (RPS, error
   rate, p99, saturation) usually tell you which subsystem is failing.

## Step 4 — Stop the bleeding

Once you know what's broken, the default action is almost always to
**revert, not to fix forward.** A bad deploy is 99% of platform incidents.

For a Vercel revert:

```bash
# Find the last known-good deployment ID
vercel ls --scope smarter-poker hub-vanguard | head -20

# Promote it back to production
vercel promote <deployment-id> --scope smarter-poker
```

For a git revert (when the bad change is already live and you want it out
of main as well):

```bash
cd ~/Documents/Smarter-Poker-World-Hub
git revert --no-edit <bad-sha>
git push origin main
```

Vercel will auto-deploy the revert. Watch the deploy land before declaring
stable — a revert push that itself fails to build is still an outage.

If the issue is data-plane (ledger drift, runaway cron, bad migration),
do not revert the repo — go to the specialist runbook (05 for ledger, 04
for cron, 02 for migrations).

## Step 5 — Mitigate, then communicate

Every 15 minutes during a SEV-1, post an update to `#incidents` and status
page:

```
Update: <what you've learned>
Current mitigation: <what you're doing>
Next step: <what you'll try next>
Next update: <time>
```

Silence is worse than bad news. If nothing has changed, post that nothing
has changed and give a revised ETA.

## Step 6 — Resolve and hand off

When you believe the incident is resolved:

1. Verify by running the same checks from Step 3. Don't trust a single
   green response — watch for 5 minutes of stability.
2. Post a resolution message:

   ```
   :white_check_mark: Incident resolved.
   Duration: <start> → <end> (<minutes>m)
   Root cause (preliminary): <one line>
   Mitigation: <what actually stopped the bleeding>
   Followups: <link to tickets you opened>
   ```

3. For SEV-1 and SEV-2, schedule a postmortem within 48 hours. Use
   `docs/postmortems/TEMPLATE.md`.

## Rollback

This runbook is read-only triage — nothing to roll back. Mitigations from
specialist runbooks have their own rollback sections.

## Escalation

- **After 15 min without ack of severity:** page secondary on-call.
- **After 30 min without mitigation on SEV-1:** page engineering lead.
- **After 60 min without mitigation on SEV-1:** page CTO, open vendor
  support tickets (Vercel, Supabase, Hetzner) in parallel.

## Postmortem

Required for every SEV-1 and SEV-2. Optional for SEV-3 if it recurred or
if the response itself went poorly. Blameless format — focus on what the
system did, not who did what.
