# 08 — Cost Anomaly

## When to use

- Vercel bandwidth alert: daily burn > 2× 7-day trailing average.
- Supabase egress or compute usage > 90% of monthly budget with > 5
  days remaining in the cycle.
- PostHog quota at > 75% monthly consumption before day 25.
- Sudden spike in Hetzner traffic on the engine or cron-01 boxes.
- Unexpected invoice line-item from any vendor during the month.

Cost anomalies are usually SEV-3 — no user impact — but they can
become SEV-2 if left alone long enough to saturate a provider's hard
limit (PostHog refuses events over quota, Supabase pauses projects).

## Prerequisites

- Admin access to Vercel, Supabase, PostHog, Hetzner billing pages.
- Grafana access for traffic-shape panels.
- GitHub write access to WH + CA for hotfix config changes.

## Symptoms

Recent cost patterns we've investigated:

**A. Scraper gone wild.** A scraper's target site returned a huge
payload (infinite pagination, a 50MB JSON response) and the scraper
dutifully stored it. Sudden Supabase storage or egress spike.

**B. Un-cached static asset.** A config regression turned off the
`Cache-Control: public, max-age=...` on `/hub/club-arena/assets/*`.
Every pageview re-downloads the 2MB bundle. Vercel bandwidth doubles
overnight.

**C. Runaway realtime.** A Supabase realtime subscription on a busy
table with no filter. Each new event fans out to every subscribed
client. We caught this in Phase 1 when trimming the publication from
76 → 43 tables.

**D. PostHog autocapture flood.** A new page triggers a click event
storm (rage-clicks on a disabled button, for example). We already
allowlist `click/change/submit` (Phase 5.1.2b), but a new high-traffic
surface can still hit the quota.

## Procedure

### Step 1 — Confirm which vendor and which line item

Open the billing dashboards for each vendor. The anomaly is usually on
one specific metric (not "everything expensive"). Identify:

- Vendor (Vercel / Supabase / PostHog / Hetzner).
- Metric (bandwidth / egress / compute hours / events / storage).
- Delta (current vs. previous cycle).

### Step 2 — Identify the source

**Vercel bandwidth.** In Vercel → Usage → Bandwidth, drill into
per-project and per-route. The project + top route tells you which
page is the culprit. If it's a static asset path, jump to 3B.

**Supabase egress.** Supabase dashboard → Reports → API. Look at top
endpoints by bytes returned. A single endpoint with > 40% of egress
usually has a missing `.limit()` or `.select('*')` when it shouldn't.

**Supabase storage.** Dashboard → Database → Tables, sort by size. A
table that's 10× what it was last month has a write bug.

**PostHog events.** PostHog → Data Management → Events. Top events by
volume. If autocapture events dominate, the issue is rage-clicks on
some page.

**Hetzner traffic.** Hetzner Cloud Console → Servers → Graphs. Usually
a WebSocket flood or an external scraper hitting us.

### Step 3A — Scraper gone wild

1. Identify the scraper from the insert pattern (Supabase → Reports →
   Logs, filter by the bloated table).
2. Pause the cron in `vercel.json`.
3. Bulk-delete the bloat (if safe — never delete ledger rows; scraper
   data is usually reproducible):
   ```sql
   DELETE FROM <table> WHERE source = '<scraper>' AND size_hint > 1000000;
   ```
   Always `SELECT COUNT(*)` first. Always do deletions in batched
   transactions.
4. Fix the scraper to cap its page size and row size.
5. Re-enable.

### Step 3B — Un-cached static asset

1. Check `vercel.json` → `headers` section for the asset prefix. The
   expected config:
   ```json
   {
     "source": "/hub/club-arena/assets/(.*)",
     "headers": [
       { "key": "Cache-Control",
         "value": "public, max-age=31536000, immutable" }
     ]
   }
   ```
2. If it's missing or wrong, restore it. If it's correct but Vercel
   isn't honoring it, verify with:
   ```bash
   curl -sI https://smarter.poker/hub/club-arena/assets/<bundle>.js | \
     grep -i cache-control
   ```
3. Redeploy. Verify the header lands on a subsequent curl. Bandwidth
   drops inside 6 hours as CDN pops re-cache.

### Step 3C — Runaway realtime

1. Supabase dashboard → Database → Replication → Publications. Confirm
   the `supabase_realtime` publication contains only the intended
   tables. If a new table got added without review, remove it:
   ```sql
   ALTER PUBLICATION supabase_realtime DROP TABLE <bad_table>;
   ```
2. On the client side, audit subscriptions for unfiltered listeners.
   Every realtime subscription must have a `.filter(col='...', value)`
   or equivalent server-side filter. Unfiltered subscriptions fan out
   all rows to all subscribers — this is what burned us before.
3. Push the client fix.

### Step 3D — PostHog autocapture flood

1. Identify the flooding page from PostHog's event volume-by-URL view.
2. In the PostHog SDK init (see
   `Smarter-Poker-World-Hub/src/lib/analytics.js` and its Club Arena
   sibling), narrow the `css_selector_allowlist` for that page, OR add
   the page to an `autocapture_denylist`.
3. Confirm events/min for that page drops after the next deploy.
4. If quota is already exhausted, contact PostHog support to request a
   temporary cap lift. This gives observability back while you fix the
   code.

### Step 4 — Projected-budget check

After mitigation, estimate whether we'll still overrun the cycle:

```
remaining_budget = total_budget - burned_so_far
remaining_days   = days_left_in_cycle
projected_burn   = remaining_days * current_daily_burn_post_mitigation
```

If `projected_burn > remaining_budget`, the mitigation isn't strong
enough — go back to Step 2 and find the next biggest contributor.

### Step 5 — Document the delta

Post to `#cost-anomalies` (or the equivalent channel) with:

```
Vendor: <Vercel/Supabase/PostHog/Hetzner>
Metric: <bandwidth/egress/events/compute>
Cause: <one-line>
Mitigation: <what you did>
Estimated savings: $<amount> / month
Tracking ticket: <link>
```

## Rollback

- `vercel.json` config reverts use standard git revert.
- Publication drops (`ALTER PUBLICATION ... DROP TABLE`) can be re-added
  with `ALTER PUBLICATION ... ADD TABLE`.
- PostHog denylist config is a JSON file; revert the PR.

## Escalation

- **If a vendor will suspend the project** in under 24 hours without
  intervention, page the lead. This is a SEV-2 cost incident.
- **If the cost anomaly correlates with a suspected security incident**
  (e.g. unusual egress to an unknown IP on Hetzner), escalate to the
  security contact — this may be data exfiltration, not just waste.

## Postmortem

Required for:

- Any cost anomaly projected to exceed the monthly budget by > 20%.
- Any cost change > $500 one-time or $250/month.
- Any incident where a vendor automatically throttled or paused us.

Include: the root cause, the monitoring gap (why wasn't this caught
sooner — is there a missing alert?), the actual $ impact, and the
tracking ticket for the longer-term guardrail.
