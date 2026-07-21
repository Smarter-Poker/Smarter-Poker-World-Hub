# Audit: Union-level functionality and structuring — full sweep + repair

Date: 2026-07-21
Author: Claude (fable-5), Club Arena session
Status: FIXED — all findings below repaired and deployed (WH SHA 69ff408e verified;
CA commit 9e74bc50 through the client + engine pipelines; 2 migrations applied).

## Structural verdict (before repair)

Union functionality was a facade over two half-connected backends:

1. The union tables (`unions`, `union_clubs`, `union_admins`, `union_wallets`) are
   service-role-write-only under RLS (correct posture), and none of the direct-write
   RPCs the SPA used (`fn_union_send_chips_to_club`, `increment_union_chip_balance`,
   `decrement_club_treasury`) are SECURITY DEFINER — so EVERY union mutation the SPA
   made (create union, save settings, join club, edit commission, add/remove admin,
   every wallet transfer) silently failed for real browser users.
2. The path that CAN work — the hardened WH ORB-4 routes (`manage-union`,
   `union-wallet`, `union-application`; zod + idempotency + role checks, service
   role) — was called by NOTHING in the SPA, and `union-wallet.js` crashed with 500
   on every request anyway (undeclared `error` variable in `verifyUnionLead`).
3. Dual wallet stores: all money RPCs operate on the `union_wallets` TABLE
   (live balance at audit time: 252,890 chips / 241,524 rake), while the legacy
   wallet COLUMNS on `unions` (all zero) were what `get_balances` displayed.

## Findings fixed (all deployed)

WH routes:
- union-wallet.js: G1 500-crash fixed; get_balances reads union_wallets;
  BBJ payout honors union-configured bbj_main/backup/promo split (was hardcoded
  50/25/25); payout claims a unique ledger row (union_id, tx_type='bbj_payout',
  period_id=poolId) BEFORE moving money — DB-level dedup surviving serverless churn.
- settle-period.js: union rake-hold credit awaited with compensating treasury refund
  (was fire-and-forget after debit — chips could vanish); duplicate ledger insert
  removed (RPC audits internally).
- union-application.js: apply/status accept explicit unionId (Midway ILIKE fallback
  retained for legacy horse-admin callers).
- manage-union.js create: provisions union_wallets row + shared union bbj_pools row.

Migrations (applied + assertions green):
- union_functionality_repair_20260721: union_wallets SELECT policy for union
  admins/owner (dashboard tiles were unreadable); unions public-browse policy
  (the /unions directory rendered empty for non-members); bbj_payout dedup partial
  unique index; union-level bbj_pools backfill (engine BBJ contributions from union
  clubs previously hit "no pool found" and were skipped FOREVER — the shared
  jackpot never accrued); record_insurance_transaction repointed from legacy
  unions.insurance_balance (0.00) to canonical union_wallets.insurance_wallet.
- union_atomic_deposit_clawback_20260721: fn_union_deposit_from_wallet +
  fn_union_clawback_from_club — SECURITY DEFINER, single-transaction
  debit+credit+ledger with the union-lead check inside. The SPA's old two-step
  chains could STRAND CHIPS (player-wallet debit succeeded, union credit
  RLS-blocked).

Club Arena SPA (commit 9e74bc50):
- NEW UnionApiService (bearer + idempotency wrapper for the ORB-4 routes).
- All union mutations repointed through it. addClub now submits a real
  union_applications row (the UI always claimed "Application sent"; previously it
  force-joined — and silently failed). Dashboard applications tab list/approve/
  reject via the API (direct reads used non-existent columns applicant_id/notes/
  created_at AND were RLS-hidden from leads — the tab was permanently empty).
- Commission column fixed: union_clubs.club_commission_rate (the live column);
  `commission_rate` never existed — reads were undefined, writes would error.
- Settings casing bug fixed (Detail page saved camelCase keys that mapUnion could
  never read back — every settings save was silently lost).
- Announcements go through manage-union → club_announcements (the feed members
  read); union_announcements was write-only dead storage.
- Deposit/clawback use the new atomic RPCs; send-chips via union-wallet API.

Engine (same CA commit):
- GameServer tournament union rake: read-then-write replaced with atomic
  increment_union_wallet RPC (concurrent tournament completions could lose rake).

Build-infra fixes made en route (needed to ship):
- patch-next.js patch 7: Next's proxied client-reference-manifest guards
  `currentManifest` for null but not `currentManifest[prop]` — a route registering
  a partial manifest crashed the /_not-found export nondeterministically. This was
  the true root cause of the "builtin/layout of undefined" build flake.
- Explicit app/layout.js + app/not-found.js (deterministic not-found bundling;
  pages/404.js unaffected). BUILD_CPUS env override in next.config.js.

## Known-remaining (documented, deliberate)

- Two BBJ ledgers still exist by design boundary: club-level `bbj_pools`
  (engine-fed, now including the union-shared pool) vs `unions.bbj_wallet` /
  `union_wallets.bbj_wallet` (manual admin funding). The union payout path debits
  union_wallets.bbj_wallet; the engine accrues into the union bbj_pools row. A
  future unification should make bbj_atomic_payout the single payout path and
  retire the manual process_bbj_payout, or auto-sweep pool → wallet. Not done now:
  changing payout sourcing is a product decision (which pot pays the jackpot).
- UnionService.getSettlementReport remains a client-side estimate (labeled as
  such); the real balances are on the Dashboard (union_wallets). RevenueSplitEditor
  + UnionSettingsPanel remain exported-but-unmounted dead components.
- union_leave_requests has UI only via manage-union list/approve/deny; no SPA
  surface submits leave requests yet.
- In-memory idempotency (5-min per-instance TTL) still fronts non-BBJ transfers;
  BBJ payouts now have hard DB dedup. Extending DB-level dedup to send_to_club /
  move_rake_to_chips would require a client-supplied stable operation id.

## BUILD IT follow-up (2026-07-21, Dan-approved) — both deferred items SHIPPED

BBJ unification (WH ad93e98b + CA 197d23be, migration union_bbj_pool_unification_20260721):
- bbj_pools is now the ONE jackpot ledger. process_bbj_payout pays from the
  union's shared pool via atomic fn_union_bbj_pool_payout (pool debit + player
  club-chip credits + treasury table share, one transaction, configured split);
  union_wallets.bbj_wallet retired from the payout path. Dedup keys on a
  per-event payoutEventId UUID (the old poolId key would have limited each pool
  to a single payout ever).
- NEW fund_bbj_pool action + fn_union_fund_bbj_pool: union bank -> shared
  jackpot, split per union BBJ settings, atomic with ledger row. Dashboard has
  a lead-only Fund BBJ Pool card; BBJ tiles read the live pool.
- Live verification: 1-chip fund confirmed bank debit + pool credit + ledger
  row on the production union. The seeded pool had ALREADY accrued 16,688
  chips from real hands in ~24h — the engine-fed shared jackpot is working.

Real financials (CA 197d23be):
- UnionService.getSettlementReport now reports from the actual money ledger:
  union tax = real settlement_hold credits per club; per-club rake derived at
  the union_rake_hold rate; net union revenue = holds + engine rake credits;
  settled vs pending clubs distinguished by ledger presence. Agent commissions
  / player rakeback are club-internal and report 0 instead of fabrications.

Build-infra: patch-next.js patch 8 (entry-files manifest guard) completes
patch 7 — the /_not-found export flake is now guarded on both proxy branches.
Also caught: an edit splice left an unclosed legacy block in union-wallet.js
that node --check tolerated but SWC crashed on natively — direct
swc.transform() is now a proven fast bisect tool for native build crashes.

## IMPROVE pass (2026-07-21, Dan: "IMPROVE THIS IN EVERY WAY POSSIBLE") — SHIPPED

WH 24959f9a (DEPLOY_VERIFIED) + CA 7316aa58; migration
union_money_ops_hardening_20260721 applied.

Money-ops hardening — the union money layer is now fully atomic AND replay-proof:
- fn_union_send_to_club_atomic + fn_union_move_rake_to_chips_atomic replace the
  last two route-chained transfers (debit+credit+ledgers, one transaction; no
  compensating-rollback JS remains anywhere in the union layer).
- Universal DB-level idempotency: all five union money RPCs accept p_op_id;
  a generalized unique index (union_id, tx_type, period_id) rejects replays
  inside the transaction. The route passes the client X-Idempotency-Key as the
  op id — end-to-end dedup across serverless instances and cache expiry.
  LIVE-VERIFIED: same op id twice on a 1-chip move -> second call duplicate:true,
  exactly one chip moved. Old RPC signatures dropped (no ambiguous overloads).

Leave-union workflow (was approve/deny with no way to ever submit):
- manage-union request_leave (club-owner auth, dup-pending guard, sanitized
  reason); zod action added. Union page's button turns into "Request to Leave"
  when your club is in that union; Dashboard applications tab gains a Leave
  Requests panel with lead-only Approve Exit / Deny.

UX/perf/cleanliness:
- Live jackpot: Dashboard subscribes to bbj_pools UPDATEs — BBJ tiles tick in
  realtime as engine contributions land.
- get_transactions cursor pagination (before/hasMore/nextBefore).
- Dead code removed: RevenueSplitEditor + UnionSettingsPanel (never mounted)
  and getUnionSettings/updateUnionSettings (hardcoded; the update would have
  wiped sibling settings keys). Barrel now exports only the live modal.
- Engine: logBBJCollection per-club pool-id cache (5-min TTL) — one query per
  raked hand instead of two; pivot check still reads the live balance.
