# smarter.poker On-Call Runbooks

This directory is the on-call playbook for the smarter.poker platform. Every
runbook here maps a production alert or failure mode to a step-by-step
response. If you're paged, find the matching runbook and work it top-to-bottom.

If no runbook matches the alert, start with `00-incident-response.md` and add
a new runbook after the incident is resolved.

## Index

| # | Runbook | Alerts / Triggers |
|---|---------|-------------------|
| 00 | [Incident Response Protocol](./00-incident-response.md) | Any unclassified page |
| 01 | [Deploy Failure](./01-deploy-failure.md) | Vercel deploy ERROR, `/api/health` regression, build-safety-gate red |
| 02 | [Database Degraded](./02-database-degraded.md) | Supabase pooler red, query p99 > 2s, RLS errors in Sentry |
| 03 | [Engine Down](./03-engine-down.md) | `engine.smarter.poker` health red, pm2 process crash, WebSocket flood |
| 04 | [Cron Failure](./04-cron-failure.md) | `/api/admin/cron-health` degraded, supabaseKey errors, scraper alert |
| 05 | [Ledger Drift](./05-ledger-drift.md) | Nightly reconciliation variance > threshold, wallet/chip_pool trigger fires |
| 06 | [Sentry Error Spike](./06-sentry-spike.md) | Issue volume > 10× baseline, new high-severity issue, spam from one release |
| 07 | [Auth Outage](./07-auth-outage.md) | Login failure rate > 5%, MFA 5xx, Supabase auth degraded |
| 08 | [Cost Anomaly](./08-cost-anomaly.md) | Vercel bandwidth alert, Supabase egress spike, PostHog quota |

## On-Call Rotation

Primary is expected to acknowledge within **5 minutes** during business hours
and **15 minutes** overnight. Secondary rolls in if primary hasn't ack'd within
the SLA. Escalation to engineering lead happens after 30 minutes without
mitigation.

The current rotation is tracked in `/etc/smarter-poker/oncall-roster.md` on
cron-01.smarter.poker (symlink into Grafana's `$oncall` variable for
dashboard annotations). Update the roster via PR so changes are auditable.

## Severity Definitions

**SEV-1 — Full outage.** Public site down, ledger corruption confirmed, data
breach indicators, or engine refusing new seats for all users. All hands on
deck. Status page update required within 10 minutes.

**SEV-2 — Degraded critical feature.** Club Arena SPA returning errors,
sign-up broken, a class of crons failing, or payments blocked. On-call handles
solo but loops in lead within 30 minutes if not resolved.

**SEV-3 — Minor degradation.** Non-critical cron failing, single page broken,
elevated error rate without user impact, or cost anomaly without immediate
service effect. On-call triages during the next business hour.

**SEV-4 — Warning only.** Threshold breach with no user impact, deploy
warnings, deprecation notices. Captured as a ticket, not paged.

## Access Prerequisites

Before taking your first on-call shift, confirm you have:

1. GitHub write access to `Smarter-Poker/*` (for hotfix PRs and revert).
2. Vercel deploy access on the `smarter-poker` team (redeploy + rollback).
3. Supabase admin access on `smarter-poker` project (SQL console + logs).
4. SSH to `cron-01.smarter.poker` and `engine.smarter.poker` (Hetzner).
5. PostHog, Sentry, and Grafana logins (SSO).
6. Twilio admin (for silencing the SMS escalation chain if a runbook calls
   for it during a deploy-failure loop — see runbook 01).

If anything is missing, flag it to the engineering lead before the shift
starts. Don't go on-call with partial access.

## Writing a New Runbook

Every runbook follows this template:

```markdown
# NN — Runbook Title

## When to use
What alerts or symptoms trigger this. Be specific — link to the Grafana panel
or Sentry query if there is one.

## Prerequisites
Access and tools needed. If the operator doesn't have these, they can't run
this playbook.

## Symptoms
What the operator is actually seeing. Screenshots or log snippets if helpful.

## Procedure
Numbered steps. Each step must be a concrete action with a verifiable
outcome. Include the exact commands to copy-paste.

## Rollback
How to undo the procedure if it makes things worse. Every mutation step
should have a rollback.

## Escalation
Who to call if the procedure doesn't resolve the incident, and under what
conditions.

## Postmortem
Criteria for writing a postmortem. Default: any SEV-1 or SEV-2. Link to the
postmortem template.
```

Keep runbooks updated — a stale runbook at 3am is worse than no runbook,
because it wastes the operator's trust. When the underlying system changes,
update the runbook in the same PR.
