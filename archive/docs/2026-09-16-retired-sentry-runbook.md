# 06 — Sentry Error Spike

## When to use

- Sentry alert: issue volume > 10× baseline over 5 minutes.
- A new issue jumps straight into the top 5 with > 100 events in an
  hour.
- Release health shows crash-free rate < 99% on any release.
- User reports of "something broke" that don't match a specific runbook.

## Prerequisites

- Sentry login with write access to issues (ability to resolve / ignore
  / assign).
- GitHub write access to whichever repo owns the broken code.
- Vercel deploy access (for rollback).

## Symptoms

Three failure modes, each with a different response.

**A. Single-release regression.** One deploy introduces a new exception
that fires for every user who hits a specific path. Sentry's release
view shows the crash rate spiking only on the new release.

**B. Transient infra spike.** Errors scattered across many fingerprints,
often with `fetch failed` / `network timeout` / `upstream` themes.
Points at a dependency (Supabase, external API, Hetzner engine) rather
than our code.

**C. Bot or attack traffic.** Error volume high but tightly scoped to
routes that normal users don't hit. User-agents look synthetic. This is
not really an outage, it's a security / rate-limiting issue.

## Procedure

### Step 1 — Identify the dominant fingerprint(s)

In Sentry, sort Issues by "Events in last hour" descending. The top 1-3
fingerprints usually account for > 80% of the volume. Note the issue
title, the project, and the release tag.

### Step 2 — Classify A / B / C

**A** if the issue's first-seen timestamp matches a release tag and
that release is current. Cross-check: the issue's "Events by release"
chart shows zero volume before the release.

**B** if fingerprints are scattered, top ones involve external I/O, and
first-seen is older (this is a dormant issue that got amplified, not a
new one).

**C** if affected routes are `/api/*` internal endpoints (not linked
from navigation) and user-agents are unfamiliar.

### Step 3A — Release regression

If runbook 01 steps haven't already been taken:

1. Roll back the bad release by promoting the previous Vercel deploy
   (see runbook 01 step 2).
2. Confirm the Sentry issue stops receiving events. (Events may arrive
   for 5-10 min as user sessions flush; the rate should drop to zero
   within the hour.)
3. Assign the Sentry issue to the author of the bad release and mark it
   "Will fix".
4. Open a ticket to add a regression test that would have caught this
   before merge.

### Step 3B — Infra spike

1. Correlate with runbook 02 (DB), 03 (engine), or external-service
   status pages. The dominant fingerprints tell you which upstream.
2. If the upstream is our own (DB/engine), follow that runbook.
3. If the upstream is external (Stripe, Twilio, upstream content
   providers), check their status page. If they're degraded, post an
   advisory to `#incidents` and throttle the affected code path:
   - Ratelimit our retries.
   - Shorten timeouts so we fail-fast instead of compounding queue depth.
   - If critical, degrade gracefully (e.g. serve cached data on the
     affected endpoint with a stale-while-revalidate header).
4. The Sentry issue itself can be marked "Ignore until it stops" until
   upstream recovers.

### Step 3C — Bot / attack traffic

1. Check middleware rate-limit hits in Grafana (panel "API rate limit
   rejections / minute"). If rejections are spiking in parallel with
   errors, the rate-limiter is already catching it; the Sentry noise is
   legitimate-looking-but-from-bots.
2. Tighten the affected route's rate limit in
   `middleware/rate-limit.ts`. Start with 20% tighter and iterate.
3. If the traffic is from a narrow IP range, block at Vercel's firewall
   (Project → Settings → Firewall → IP rules).
4. In Sentry, add a fingerprint to the project's inbound filters so we
   don't burn quota on adversarial requests (Project settings →
   Inbound Filters).
5. Note that this is also the entry-path to runbook 07 if auth
   endpoints are the target.

### Step 4 — Verify the spike has resolved

Sentry's issue detail view shows "Events / minute" as a sparkline.
Watch for 20 minutes of flat-zero before calling it resolved. Release
health should return to > 99% crash-free.

## Rollback

- Release regression rollback uses runbook 01.
- Rate-limit tightening: easy to loosen again if legitimate traffic
  complains (rare, but keep the "before" values in the PR description).
- Sentry inbound filters: easy to remove — they don't delete historical
  data, only filter new events.

## Escalation

- **Crash-free rate < 95%:** SEV-1. Page the engineering lead; this is
  now a platform-level outage even if no single page is obviously
  broken.
- **Sentry quota burn > 50% of monthly budget in a single day:** slow
  the sampler down (`tracesSampleRate: 0.1`) and page the lead. We've
  had quota exhaustion lock us out of observability during a previous
  incident and that's a cascade we do not want.
- **Attack pattern appears targeted** (specific endpoints, session
  enumeration, credential stuffing): treat as a security incident and
  loop in the security contact. Follow-up with runbook 07 if auth.

## Postmortem

Required for:

- Any release regression that required rollback.
- Any Sentry quota exhaustion event.
- Any error class that went > 1 hour before detection — that's an
  alerting gap.

Include: fingerprint(s), release tag, time-to-detect, time-to-mitigate,
whether pre-merge checks could have caught the regression (unit test?
e2e test? manual?) and which check is being added. Also include Sentry
release-health crash-free-rate numbers before, during, and after.
