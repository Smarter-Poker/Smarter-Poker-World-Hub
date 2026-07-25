# Handoff: Sync Hetzner pipeline host with today's engine commits + verify nightly

**Date:** 2026-07-05
**From:** Cowork session (no SSH path to Hetzner from the sandbox — publickey/password denied)
**Needs:** An agent with SSH access to `root@5.161.252.33`

## Context

The MLB engine repo (`Smarter-Poker/mlb-analytics-engine`) received commits today that the
Hetzner pipeline host must pull. Code lives at `/opt/mlb-analytics-engine`, systemd timers
run the stages. Latest engine commit to deploy: `4073374aa5` (plus `.dp_decoded_tmp.py`
deletion right after it).

What shipped in `4073374aa5`:
1. `engine/extractors/weather.py` — fixed NameError (`gid`) that crashed the whole
   enrich.weather stage on any per-game hiccup (prod error 2026-07-05 10:44 UTC).
2. `engine/pipeline/run_intraday.py` — reprice/intraday runs now write WHICH sub-step
   failed into `pipeline_runs.error_msg` (today's 20:33 UTC reprice error logged
   status=error with an empty message; undiagnosable).
3. `engine/pipeline/clv_report.py` — per-book weekly CLV rows now persist to `clv_weekly`
   under `book:<name>` market keys (already ran once from the session; nightly keeps it fresh).
4. `supabase/migrations/20260705220000_model_meta_gate_config_mirror.sql` — already
   APPLIED to prod (project `nscdmxldtyszyvcxxwgr`) and seeded; auto_gate's existing
   best-effort `model_meta` upsert now lands nightly. Nothing to run, listed for audit.

## Steps

1. `ssh root@5.161.252.33`
2. `cd /opt/mlb-analytics-engine && git pull` — confirm HEAD is at or past `4073374aa5`.
3. No service restart needed for pipeline stages (timers exec fresh processes), but if
   `openclaw.service` embeds engine code paths, leave it alone — this change doesn't touch
   the dispatcher.
4. Verify the last nightly: `journalctl -u <nightly unit> --since today | tail -50` —
   confirm it ends `[daily] DONE`.
5. Root-cause two open errors visible only in host logs:
   - 2026-07-05 12:16 UTC `predict` failed with httpx "Request URL is missing an
     'http://' or 'https://' protocol" — suspect an env var (SUPABASE_URL?) missing in
     whatever unit ran at noon. Check that unit's `EnvironmentFile=` points at
     `deploy/mlb.env`.
   - 2026-07-05 20:33 UTC `reprice` status=error, empty error_msg. After the pull, the
     next 15-min reprice will self-report the failing sub-step in
     `pipeline_runs.error_msg` — read it and fix or file the follow-up.
6. Confirm the next reprice cycle writes rows with fresh `price_ts` and that
   `pipeline_runs` shows `ok`.

## Verification queries (from any host with deploy/mlb.env)

```
# error_msg now populated on any reprice error:
curl -s "$SUPABASE_URL/rest/v1/pipeline_runs?select=step,run_ts,status,error_msg&order=run_ts.desc&limit=5" \
  -H "apikey: $SUPABASE_SERVICE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_KEY"
# per-book CLV rows:
curl -s "$SUPABASE_URL/rest/v1/clv_weekly?market=like.book:*&limit=3" \
  -H "apikey: $SUPABASE_SERVICE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_KEY"
```

Done means: HEAD >= 4073374aa5 on the host, nightly ends `[daily] DONE`, next reprice
cycle status ok (or error WITH a populated error_msg), and the two root-causes above are
either fixed or written up in `.agent/audits/`.
