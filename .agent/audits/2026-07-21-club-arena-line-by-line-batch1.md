# Club Arena line-by-line audit — batch 1 (verified + shipped)

Date: 2026-07-21
Author: Claude (fable-5)
Status: SHIPPED — prod serves WH SHA b032f570 (DEPLOY_VERIFIED); CA client SHA
7c001bde (DEPLOY_VERIFIED); 2 migrations applied + asserted.

## Method

A 6-subagent line-by-line sweep produced ~30 candidate findings. Each is being
verified against LIVE code + the LIVE database (pg_get_functiondef / advisors /
information_schema) before any fix — the subagent reports contain misdiagnoses
(see "Corrections" below), so none were trusted blind.

## Shipped this batch (verified real, fixed, deployed)

1. DB performance + RLS hygiene (migration ca_perf_indexes_rls_dedup_20260721):
   - Added 10 covering indexes for unindexed FKs on hot CA money/hand tables
     (agent_commissions.club_id, club_members.agent_id,
     club_wallet_transactions.club_id, hand_players.hand_id/user_id,
     rake_records.club_id/table_id, tables.club_id/union_id,
     union_wallet_transactions.club_id). Verified via performance advisor
     (14 unindexed FKs live; the 4 non-CA ones left alone). All target tables
     modest (max 111k rows, hand_players empty) so plain CREATE INDEX is safe.
   - seven_deuce_bounties_select RLS rewritten from bare auth.uid() to
     (SELECT auth.uid()) — stops per-row re-evaluation (init-plan advisor).
   - Dropped duplicate partial-unique index idx_single_pending_cashout on
     cashout_requests (byte-identical to cashout_requests_one_pending_per_player_uidx).
   - Post-apply assertions green.

2. Tournament prize pool no longer wipes rebuy/add-on money
   (src/services/TournamentService.ts, registerPlayer + unregisterPlayer):
   - Both recomputed prize_pool as buyIn*current_players (max guarantee),
     discarding any rebuy/add-on contributions accrued during the late-reg /
     rebuy overlap window. Replaced with a call to recalculatePrizePool(), which
     correctly sums entries*buyIn + rebuys + add-ons from tournament_players +
     wallet_transactions. Verified the registration row is inserted (register,
     atomic RPC at line 854) / deleted (unregister, line 1205) BEFORE the count
     block, so recalculatePrizePool counts correctly. tsc clean.

3. Chip-mint authorization hole closed
   (migration mint_require_minter_20260721 + src/services/WalletService.ts):
   - mint_club_chips is SECURITY INVOKER and only checked authorization
     `IF p_minted_by IS NOT NULL`. The CA client wrapper passed
     `p_minted_by: requestingUserId || null`, and its callers (useWalletStore,
     ClubFinancialDashboard, CashierPage) omit requestingUserId — so the union
     mint-lock + owner check was skipped entirely. RPC now rejects a null minter
     ('minter identity required'); both trusted callers (WH mint-chips route,
     CA AdminDashboard) already pass the authenticated user id. WalletService
     .mintChips now resolves the minter from the session and enforces the
     union-owner check unconditionally. Migration assertion (null minter ->
     rejected) green. tsc clean.

4. Build-gate tooling fix (scripts/git-safe-push.sh):
   - Phase 2.5 "intelligent skip" excluded md/sh/yml/txt/csv + scripts/ +
     .github/ but NOT .sql / supabase/ — so migration-only commits forced a full
     Next build (which is currently flaky in-sandbox on the /_not-found export).
     Added `sql` + `^supabase/` to the skip list. Migration-only commits now
     skip the build gate correctly (Vercel still builds).

## Corrections to subagent findings (do NOT apply as reported)

- CreditService.ts:447 "settlement_invoices -> credit_invoices one-line fix" is
  WRONG. `credit_invoices` does not exist in the DB (no table/view, never in a
  migration). `settlement_invoices` exists but has a totally different schema
  (club_id/period_id/from_entity/to_entity/gross_amount...), NOT the
  agent_id/debt_owed/amount_remaining columns CreditService selects. The whole
  credit-invoice subsystem (getAgentInvoices, processPayment, wired into 4 agent
  UI pages) reads/writes a phantom table behind a circuit-breaker that silently
  returns []. This is an architecture gap, not a one-liner — see Needs-decision.

## Batch 2 — Dan's decisions resolved + shipped (CA SHA 80e3137)

Dan chose: (1) build the real credit_invoices table; (2) leave-club moves chips
to the club TREASURY (not the player's main wallet).

1. leave-club fixed (migration leave_club_to_treasury_20260721 +
   ClubsService.leaveClub): new SECURITY DEFINER fn_member_leave_to_treasury
   moves the member's chip_balance into clubs.chip_treasury (the store the SPA
   shows as the club "bank" in DynamicWallet/ClubLobby), logs chip_transactions,
   and deletes the club_members row — one atomic transaction. leaveClub calls it,
   checks success, throws on failure. The old code DEBITED the player's main
   wallet (wrong account + direction) and deleted membership even when the RPC
   returned false. Operates on canonical club_members (club_memberships is a VIEW
   over it). Migration assertion green; tsc clean.

2. credit_invoices subsystem built (migration credit_invoices_subsystem_20260721
   + CreditService): created credit_invoices + credit_payments tables (real
   schema, FKs, indexes, CHECK constraints), RLS (agent reads own; writes
   service-role-only), and two SECURITY DEFINER RPCs — fn_generate_credit_invoice
   (idempotent per agent+period) and fn_apply_credit_payment (atomic invoice
   update + payment row, recomputes partial/paid + paid_at from the locked row).
   CreditService repointed: generateSundayInvoice -> RPC; processPayment now
   READS credit_invoices (was reading the wrong settlement_invoices table) and
   applies the payment via the RPC (was a split direct-update + separate
   credit_payments insert that could diverge). Migration assertions green; tsc
   clean.

   FOLLOW-ON (not done — feature is code-correct but not end-to-end live): the
   invoice generator (generateSundayInvoice) and the pay flow (processPayment)
   are wired but UNCALLED — there is no server-side weekly cron generating
   invoices and no agent-facing UI to view/pay them. To make the feature live:
   (a) add a World Hub cron (Open Claw) that calls fn_generate_credit_invoice
   for each agent with debt every billing period; (b) build the agent UI in
   AgentFinancialPortal to list invoices (getAgentInvoices) and pay them
   (processPayment). Until then the suspension cron sees no invoices and never
   suspends. This is a scoped follow-on project, flagged for Dan.

## Still to verify (remaining subagent candidates, unverified)

Engine: HandController Big Blind Ante refund (headline — needs deep
returnUncalledBet/calculatePots tracing before touching); markSeatAsLeft
non-atomic wallet credit; ChannelHub reconnect teardown; RakebackSettler
double-count; GameServer hand-for-hand timer / elimination N+1; ServerTableEngine
BBJ-on-RIT. Client: AgentService direct RLS writes; TablePage pre-action + tourney
channel teardown; CashierPage stale balances; HorseOrchestrator/AutoRebuy mint
paths; BBJService strand; RakeService fire-and-forget; SettlementService fake
UUID; HorseLifecycleManager stale-SNG fee/casing/status. Each needs the same
live verification before fixing.
