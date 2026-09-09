# 2026-09-08: six premium routes refused every user; a scanned receipt could be lost

Agent: cowork-gate / cowork-receipts (Claude). Continuation of the
2026-09-08 receipt-scanner handoff (`.agent/handoffs/`, PRs #1592-#1629).

## Incident 1: six premium API routes answered 403 to everyone, VIP included

**Measured** on production sha `1618b375`, signed in as the VIP test account
(`daniel@bekavactrading.com`, 494,455 diamonds), one call per route:

```
403  GET   /api/poker/player-notes
403  POST  /api/bankroll/export
403  GET   /api/bankroll/tax-report
403  POST  /api/bankroll/projection
403  GET   /api/bankroll/export-pdf
403  POST  /api/bankroll/scan-dealer-document
400  POST  /api/bankroll/scan-receipt          <- fixed in #1629, past the gate
```

**Root cause.** Each route called `checkFeatureAccess` from
`premiumFeatureGate`, which is a BROWSER gate: it reads localStorage, queries
`profiles` through the anon client (RLS refuses without a session), then
recovers by fetching a RELATIVE url Node cannot resolve. Every path fails
inside an API route, so it returns `hasAccess:false` and the route 403s.

**Fix.** PR #1650. Each route now calls
`checkServerFeatureAccess(getSupabase(), <jwt uid>, 'bankroll_pro')` from
`src/lib/gates/serverFeatureGate.js` (VIP first honouring `vip_expires_at`,
then `daily_unlock_all`, then the feature pass; fails CLOSED). Identity in all
six was already the JWT; nothing reads `req.query.userId`.

**Guard.** `__tests__/no-api-route-uses-the-browser-gate.law.test.mjs` walks
every file under `pages/api` and refuses any real call to the browser gate
(comments stripped). On the pre-fix `main` it failed naming exactly the six.
In `prebuild`.

**Verified live.** Production served `7ef9316a` (= `main`) at 21:17 UTC; the
same six calls returned 200 (five with real data; dealer scan 400 "No image
provided", i.e. past the gate).

## Incident 2: a scanned receipt could be closed and lost

Dan, with two screenshots of a W-2G (Four Winds, $2,140.00) under "Create
New Expense" / "Attach To Existing Entry": a W-2G should suggest the Vault; a
buy-in goes on a Trip, started if none is active; an expense goes to
Expenses; every scan must at least be SAVED and assignable later.

**Root cause.** The Receipt Saved sheet kept no record of a completed scan.
The image was in storage; closing the sheet orphaned it. The two buttons were
the same for every document type.

**Fix.** PR #1651.
- `bankroll_receipts` (migration `20260908210816`, applied to production via
  the Supabase MCP after a rolled-back dry run, owner-only RLS): one row per
  completed scan, written BEFORE a choice is offered; `unassigned` until
  attached to a ledger entry or filed in the W-2G vault.
- `src/lib/bankroll/receiptInbox.mjs`: the pure decision (`receiptActions`,
  `tripFromReceipt`, `w2gRowFromReceipt`, `receiptRowFromScan`).
- `pages/hub/bankroll-manager.js`: renders those actions; creates the trip
  when none is active and logs a buy-in as a SESSION; inserts the W-2G vault
  row; marks the receipt assigned on every path; "Receipts Waiting To Be
  Filed" on the dashboard lists and reopens unassigned scans.
- Handoff ITEM 2: DealerVault and TaxReportPanel uploads targeted the `images`
  bucket (no INSERT policy, always 403). Both now use `uploadBankrollFile()`;
  deletes use `removeBankrollObject()`, which reads the bucket from the URL.

W-2G `autoFile` stays `false`.

**Not proven on hardware.** No phone, camera, or real W-2G was used. The
decision is unit tested (16 cases) and the wiring source-pinned; the sheet
was not exercised end-to-end in a signed-in browser during this session
because neither the built-in browser pane nor the Chrome extension held a
smarter.poker session.

## Raised to Dan, not decided by an agent

1. `.agents/rules/00-agent-playbook.md` RULE 1 orders the `schedule` tool to
   wait for CI; `CLAUDE.md` 10.9 forbids agents from using the Claude
   scheduler at all. One of the two documents needs editing.
2. Handoff ITEM 4: iOS Safari has no Barcode Detection API, so ID barcodes
   cannot be read on an iPad. Adding `zxing-wasm` to the SHARED
   `commander-shared` package is a multi-megabyte dependency decision.
3. Handoff ITEM 6: nothing in CI enforces "land in `commander-shared` before
   vendoring". `check-vendor-drift.mjs` checks three other things.
