# Handoff: autonomous Open Claw cron for weekly credit-invoice generation

Date: 2026-07-21
Author: Claude (fable-5)
Why a handoff (RULE 0): the final wiring needs (a) SSH deploy of the Open Claw
dispatcher to the Hetzner `openclaw-dispatcher` VM via `scripts/deploy-openclaw.sh`,
and (b) a CHECK 6 baseline bump for a net-new `pages/api/cron/` file — neither of
which the cloud Cowork session can perform. Everything else is already shipped.

## What is already live (do NOT redo)

- `fn_generate_all_credit_invoices(p_period_end timestamptz DEFAULT date_trunc('week', now()))`
  is applied to prod (migration `20260721_fn_generate_all_credit_invoices.sql`). It loops
  non-prepaid agents with positive debt and calls `fn_generate_credit_invoice` for each.
  IDEMPOTENT per (agent, week) — safe to call at any cadence. Verified live: generated 26
  invoices, second run added 0.
- Client trigger: `FinancialCronService.runSuspensionCheck` now calls the RPC at the start
  of its 6h cadence, so invoices generate whenever an admin has the app open.
- Agent UI: `AgentInvoicesPanel` (view + pay via `CreditService.processPayment`) is mounted
  in `AgentPortalPage`.

This handoff ONLY adds a server-side, admin-session-independent trigger.

## Steps

1. Add a cron handler `pages/api/cron/generate-credit-invoices.js` following the existing
   `pages/api/cron/*` pattern:
   - Check `Authorization: Bearer ${process.env.CRON_SECRET}`.
   - Use `src/lib/supabaseServerClient.js` (service role).
   - Body: `const { data, error } = await supabase.rpc('fn_generate_all_credit_invoices');`
     return `{ ok: !error, data, error }`.
   - No new dependencies; ~20 lines.

2. CHECK 6 (cron governance) blocks net-new files in `pages/api/cron/`. In the SAME PR,
   bump the baseline count in `.github/workflows/build-safety-gate.yml` (the
   `pages/api/cron/` file-count check) by 1, with a one-line comment referencing this
   handoff. (This is the sanctioned path per WH CLAUDE.md section 11.5.)

3. Add the schedule to `scripts/openclaw-cron-dispatcher.py`: a weekly entry (e.g. Monday
   00:10 UTC) hitting `/api/cron/generate-credit-invoices`. Because the RPC is idempotent
   per week, a daily entry is equally safe if preferred.

4. Deploy the dispatcher to Hetzner: `bash scripts/deploy-openclaw.sh` (scp + systemd
   restart + `journalctl -u openclaw` verify the new job registered).

5. Watch one fire-cycle in production; confirm `credit_invoices` rows for the current week.

## Notes

- Do NOT add this to `vercel.json` crons (CHECK 6 fails).
- The client `FinancialCronService` trigger can stay — the RPC's idempotency means the
  client and Open Claw triggers cannot double-generate.
