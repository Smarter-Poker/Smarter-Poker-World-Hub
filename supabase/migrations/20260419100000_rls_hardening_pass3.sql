-- ============================================================
-- RLS HARDENING PASS 3 — AntiGravity Comprehensive Sweep
-- Date: 2026-04-19
-- Targets:
--   1. 6 tables with NO RLS (enable + policy)
--   2. Financial/security tables with open USING(true) policies
--   3. Sensitive tables with patch_maintain_access leftover
-- ============================================================

-- ─── SECTION 1: Enable RLS on tables with it fully disabled ─────────────────

ALTER TABLE IF EXISTS public.deploy_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.hand_state_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.scrape_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.scrape_source_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.tour_scrape_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_notification_preferences ENABLE ROW LEVEL SECURITY;

-- deploy_alerts — internal system table, service only
DROP POLICY IF EXISTS deploy_alerts_service_only ON public.deploy_alerts;
CREATE POLICY deploy_alerts_service_only ON public.deploy_alerts
  FOR ALL USING (auth.role() = 'service_role');

-- hand_state_snapshots — engine internal, service only
DROP POLICY IF EXISTS hand_state_snapshots_service_only ON public.hand_state_snapshots;
CREATE POLICY hand_state_snapshots_service_only ON public.hand_state_snapshots
  FOR ALL USING (auth.role() = 'service_role');

-- scrape_evidence — scraper internal, service only
DROP POLICY IF EXISTS scrape_evidence_service_only ON public.scrape_evidence;
CREATE POLICY scrape_evidence_service_only ON public.scrape_evidence
  FOR ALL USING (auth.role() = 'service_role');

-- scrape_source_registry — scraper internal, service only
DROP POLICY IF EXISTS scrape_source_registry_service_only ON public.scrape_source_registry;
CREATE POLICY scrape_source_registry_service_only ON public.scrape_source_registry
  FOR ALL USING (auth.role() = 'service_role');

-- tour_scrape_registry — scraper internal, service only
DROP POLICY IF EXISTS tour_scrape_registry_service_only ON public.tour_scrape_registry;
CREATE POLICY tour_scrape_registry_service_only ON public.tour_scrape_registry
  FOR ALL USING (auth.role() = 'service_role');

-- user_notification_preferences — user-owned, scoped to user_id (FK inspection needed)
-- Check actual column: use user_id if exists, else profile_id
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_notification_preferences' AND column_name='user_id') THEN
    EXECUTE 'DROP POLICY IF EXISTS unp_owner ON public.user_notification_preferences';
    EXECUTE 'CREATE POLICY unp_owner ON public.user_notification_preferences FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
    EXECUTE 'DROP POLICY IF EXISTS unp_service ON public.user_notification_preferences';
    EXECUTE 'CREATE POLICY unp_service ON public.user_notification_preferences FOR ALL USING (auth.role() = ''service_role'')';
  ELSE
    -- No user_id column — service only
    EXECUTE 'DROP POLICY IF EXISTS unp_service ON public.user_notification_preferences';
    EXECUTE 'CREATE POLICY unp_service ON public.user_notification_preferences FOR ALL USING (auth.role() = ''service_role'')';
  END IF;
END $$;


-- ─── SECTION 2: Financial / Security tables — lock to service_role ───────────

-- admin_audit_log — audit logs should be write-only via service, never user-readable
DROP POLICY IF EXISTS admin_audit_log_select ON public.admin_audit_log;
DROP POLICY IF EXISTS admin_audit_log_insert ON public.admin_audit_log;
DROP POLICY IF EXISTS admin_audit_log_update ON public.admin_audit_log;
DROP POLICY IF EXISTS admin_audit_log_delete ON public.admin_audit_log;
DROP POLICY IF EXISTS admin_audit_log_service_only ON public.admin_audit_log;
CREATE POLICY admin_audit_log_service_only ON public.admin_audit_log
  FOR ALL USING (auth.role() = 'service_role');

-- agent_commissions — financial, service only
DROP POLICY IF EXISTS agent_commissions_select ON public.agent_commissions;
DROP POLICY IF EXISTS agent_commissions_insert ON public.agent_commissions;
DROP POLICY IF EXISTS agent_commissions_service_only ON public.agent_commissions;
CREATE POLICY agent_commissions_service_only ON public.agent_commissions
  FOR ALL USING (auth.role() = 'service_role');

-- commander_subscriptions — subscription billing data, service only
DROP POLICY IF EXISTS commander_subscriptions_select ON public.commander_subscriptions;
DROP POLICY IF EXISTS commander_subscriptions_insert ON public.commander_subscriptions;
DROP POLICY IF EXISTS commander_subscriptions_update ON public.commander_subscriptions;
DROP POLICY IF EXISTS commander_subscriptions_delete ON public.commander_subscriptions;
DROP POLICY IF EXISTS commander_subscriptions_service_only ON public.commander_subscriptions;
CREATE POLICY commander_subscriptions_service_only ON public.commander_subscriptions
  FOR ALL USING (auth.role() = 'service_role');

-- commander_escrow_transactions — escrow financial, service only
DROP POLICY IF EXISTS patch_maintain_access ON public.commander_escrow_transactions;
DROP POLICY IF EXISTS commander_escrow_service_only ON public.commander_escrow_transactions;
CREATE POLICY commander_escrow_service_only ON public.commander_escrow_transactions
  FOR ALL USING (auth.role() = 'service_role');

-- commander_tax_events — tax records, service only
DROP POLICY IF EXISTS patch_maintain_access ON public.commander_tax_events;
DROP POLICY IF EXISTS commander_tax_events_service_only ON public.commander_tax_events;
CREATE POLICY commander_tax_events_service_only ON public.commander_tax_events
  FOR ALL USING (auth.role() = 'service_role');

-- commander_cash_transactions — cash transactions, service only
DROP POLICY IF EXISTS svc_cash_tx ON public.commander_cash_transactions;
DROP POLICY IF EXISTS commander_cash_tx_service_only ON public.commander_cash_transactions;
CREATE POLICY commander_cash_tx_service_only ON public.commander_cash_transactions
  FOR ALL USING (auth.role() = 'service_role');

-- staff_claim_tokens — security tokens, service only
DROP POLICY IF EXISTS staff_claim_tokens_select ON public.staff_claim_tokens;
DROP POLICY IF EXISTS staff_claim_tokens_insert ON public.staff_claim_tokens;
DROP POLICY IF EXISTS staff_claim_tokens_update ON public.staff_claim_tokens;
DROP POLICY IF EXISTS staff_claim_tokens_delete ON public.staff_claim_tokens;
DROP POLICY IF EXISTS staff_claim_tokens_service_only ON public.staff_claim_tokens;
CREATE POLICY staff_claim_tokens_service_only ON public.staff_claim_tokens
  FOR ALL USING (auth.role() = 'service_role');

-- wallets — financial, service only (INSERT was open)
DROP POLICY IF EXISTS "System can insert wallets" ON public.wallets;
DROP POLICY IF EXISTS wallets_service_only ON public.wallets;
CREATE POLICY wallets_service_only ON public.wallets
  FOR ALL USING (auth.role() = 'service_role');

-- diamond_ledger — financial ledger, service only
DROP POLICY IF EXISTS "Service role manages" ON public.diamond_ledger;
DROP POLICY IF EXISTS diamond_ledger_service_only ON public.diamond_ledger;
CREATE POLICY diamond_ledger_service_only ON public.diamond_ledger
  FOR ALL USING (auth.role() = 'service_role');

-- diamond_transactions — keep service-only INSERT, ensure no other access
DROP POLICY IF EXISTS "Service role can insert" ON public.diamond_transactions;
DROP POLICY IF EXISTS diamond_transactions_service_only ON public.diamond_transactions;
CREATE POLICY diamond_transactions_service_only ON public.diamond_transactions
  FOR ALL USING (auth.role() = 'service_role');

-- diamond_reward_claims — open on all 4 ops; lock to owner + service
DROP POLICY IF EXISTS diamond_reward_claims_select ON public.diamond_reward_claims;
DROP POLICY IF EXISTS diamond_reward_claims_insert ON public.diamond_reward_claims;
DROP POLICY IF EXISTS diamond_reward_claims_update ON public.diamond_reward_claims;
DROP POLICY IF EXISTS diamond_reward_claims_delete ON public.diamond_reward_claims;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='diamond_reward_claims' AND column_name='user_id') THEN
    EXECUTE 'CREATE POLICY diamond_reward_claims_owner ON public.diamond_reward_claims FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY diamond_reward_claims_service ON public.diamond_reward_claims FOR ALL USING (auth.role() = ''service_role'')';
  ELSE
    EXECUTE 'CREATE POLICY diamond_reward_claims_service ON public.diamond_reward_claims FOR ALL USING (auth.role() = ''service_role'')';
  END IF;
END $$;


-- ─── SECTION 3: patch_maintain_access cleanup ────────────────────────────────
-- These were inserted by an old patch migration and are open FOR ALL USING (true)

-- notification_reads — user_id is TEXT type, must cast auth.uid()
DROP POLICY IF EXISTS patch_maintain_access ON public.notification_reads;
DO $$
DECLARE
  col_type text;
BEGIN
  SELECT data_type INTO col_type FROM information_schema.columns 
  WHERE table_name='notification_reads' AND column_name='user_id';
  
  IF col_type = 'text' THEN
    EXECUTE 'CREATE POLICY notification_reads_owner ON public.notification_reads FOR ALL USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id)';
    EXECUTE 'CREATE POLICY notification_reads_service ON public.notification_reads FOR ALL USING (auth.role() = ''service_role'')';
  ELSIF col_type = 'uuid' THEN
    EXECUTE 'CREATE POLICY notification_reads_owner ON public.notification_reads FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY notification_reads_service ON public.notification_reads FOR ALL USING (auth.role() = ''service_role'')';
  ELSE
    EXECUTE 'CREATE POLICY notification_reads_service ON public.notification_reads FOR ALL USING (auth.role() = ''service_role'')';
  END IF;
END $$;

-- page_notifications — remove open policy, scope to service
DROP POLICY IF EXISTS patch_maintain_access ON public.page_notifications;
-- Keep existing page_notifications_select if it exists but ensure no open FOR ALL

-- sandbox_sessions — remove open patch policy, scope to user
DROP POLICY IF EXISTS patch_maintain_access ON public.sandbox_sessions;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sandbox_sessions' AND column_name='user_id') THEN
    EXECUTE 'CREATE POLICY sandbox_sessions_owner ON public.sandbox_sessions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY sandbox_sessions_service ON public.sandbox_sessions FOR ALL USING (auth.role() = ''service_role'')';
  ELSE
    EXECUTE 'CREATE POLICY sandbox_sessions_service ON public.sandbox_sessions FOR ALL USING (auth.role() = ''service_role'')';
  END IF;
END $$;

-- trivia_user_question_history — remove open patch policy, scope to user
DROP POLICY IF EXISTS patch_maintain_access ON public.trivia_user_question_history;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='trivia_user_question_history' AND column_name='user_id') THEN
    EXECUTE 'CREATE POLICY tqh_owner ON public.trivia_user_question_history FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY tqh_service ON public.trivia_user_question_history FOR ALL USING (auth.role() = ''service_role'')';
  ELSE
    EXECUTE 'CREATE POLICY tqh_service ON public.trivia_user_question_history FOR ALL USING (auth.role() = ''service_role'')';
  END IF;
END $$;

-- user_assistant_stats — remove open patch policy
DROP POLICY IF EXISTS patch_maintain_access ON public.user_assistant_stats;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_assistant_stats' AND column_name='user_id') THEN
    EXECUTE 'CREATE POLICY uas_owner ON public.user_assistant_stats FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY uas_service ON public.user_assistant_stats FOR ALL USING (auth.role() = ''service_role'')';
  ELSE
    EXECUTE 'CREATE POLICY uas_service ON public.user_assistant_stats FOR ALL USING (auth.role() = ''service_role'')';
  END IF;
END $$;

-- session_chat_messages — remove open SELECT
DROP POLICY IF EXISTS session_chat_select ON public.session_chat_messages;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='session_chat_messages' AND column_name='user_id') THEN
    EXECUTE 'CREATE POLICY scm_owner ON public.session_chat_messages FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY scm_service ON public.session_chat_messages FOR ALL USING (auth.role() = ''service_role'')';
  ELSE
    EXECUTE 'CREATE POLICY scm_service ON public.session_chat_messages FOR ALL USING (auth.role() = ''service_role'')';
  END IF;
END $$;


-- ─── SECTION 4: Commander session data ───────────────────────────────────────

-- commander_sessions — open SELECT+INSERT, scope to service
DROP POLICY IF EXISTS commander_sessions_select ON public.commander_sessions;
DROP POLICY IF EXISTS commander_sessions_insert ON public.commander_sessions;
DROP POLICY IF EXISTS commander_sessions_service_only ON public.commander_sessions;
CREATE POLICY commander_sessions_service_only ON public.commander_sessions
  FOR ALL USING (auth.role() = 'service_role');

-- bankroll_sessions — open on all ops
DROP POLICY IF EXISTS bs_sel ON public.bankroll_sessions;
DROP POLICY IF EXISTS bs_ins ON public.bankroll_sessions;
DROP POLICY IF EXISTS bs_upd ON public.bankroll_sessions;
DROP POLICY IF EXISTS bs_del ON public.bankroll_sessions;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bankroll_sessions' AND column_name='user_id') THEN
    EXECUTE 'CREATE POLICY bankroll_sessions_owner ON public.bankroll_sessions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY bankroll_sessions_service ON public.bankroll_sessions FOR ALL USING (auth.role() = ''service_role'')';
  ELSE
    EXECUTE 'CREATE POLICY bankroll_sessions_service ON public.bankroll_sessions FOR ALL USING (auth.role() = ''service_role'')';
  END IF;
END $$;

-- commander_member_comp_log — comp records, service only
DROP POLICY IF EXISTS commander_member_comp_log_select ON public.commander_member_comp_log;
DROP POLICY IF EXISTS commander_member_comp_log_insert ON public.commander_member_comp_log;
DROP POLICY IF EXISTS commander_member_comp_log_update ON public.commander_member_comp_log;
DROP POLICY IF EXISTS commander_member_comp_log_delete ON public.commander_member_comp_log;
DROP POLICY IF EXISTS commander_member_comp_log_service_only ON public.commander_member_comp_log;
CREATE POLICY commander_member_comp_log_service_only ON public.commander_member_comp_log
  FOR ALL USING (auth.role() = 'service_role');

-- commander_time_sessions — time billing records, service only
DROP POLICY IF EXISTS commander_time_sessions_select ON public.commander_time_sessions;
DROP POLICY IF EXISTS commander_time_sessions_insert ON public.commander_time_sessions;
DROP POLICY IF EXISTS commander_time_sessions_update ON public.commander_time_sessions;
DROP POLICY IF EXISTS commander_time_sessions_delete ON public.commander_time_sessions;
DROP POLICY IF EXISTS commander_time_sessions_service_only ON public.commander_time_sessions;
CREATE POLICY commander_time_sessions_service_only ON public.commander_time_sessions
  FOR ALL USING (auth.role() = 'service_role');

-- commission_history — financial, service only
DROP POLICY IF EXISTS "Service role can insert commission history" ON public.commission_history;
DROP POLICY IF EXISTS commission_history_service_only ON public.commission_history;
CREATE POLICY commission_history_service_only ON public.commission_history
  FOR ALL USING (auth.role() = 'service_role');


-- ─── SECTION 5: Membership plan data — public read, service write ─────────────

-- commander_membership_plans — plans are public-facing, writes need service
DROP POLICY IF EXISTS commander_membership_plans_select ON public.commander_membership_plans;
DROP POLICY IF EXISTS commander_membership_plans_insert ON public.commander_membership_plans;
DROP POLICY IF EXISTS commander_membership_plans_update ON public.commander_membership_plans;
DROP POLICY IF EXISTS commander_membership_plans_delete ON public.commander_membership_plans;
CREATE POLICY commander_membership_plans_public_read ON public.commander_membership_plans
  FOR SELECT USING (true);
CREATE POLICY commander_membership_plans_service_write ON public.commander_membership_plans
  FOR ALL USING (auth.role() = 'service_role');

-- reward_definitions — public read (display rewards), service write
DROP POLICY IF EXISTS "Public read access" ON public.reward_definitions;
DROP POLICY IF EXISTS reward_definitions_service_write ON public.reward_definitions;
CREATE POLICY reward_definitions_public_read ON public.reward_definitions
  FOR SELECT USING (true);
CREATE POLICY reward_definitions_service_write ON public.reward_definitions
  FOR ALL USING (auth.role() = 'service_role');


-- ─── VERIFICATION QUERY (run after to confirm) ───────────────────────────────
-- SELECT tablename, policyname, cmd, qual FROM pg_policies 
-- WHERE tablename IN ('admin_audit_log','agent_commissions','commander_subscriptions',
--   'commander_cash_transactions','staff_claim_tokens','wallets','diamond_ledger',
--   'deploy_alerts','hand_state_snapshots','user_notification_preferences')
-- ORDER BY tablename;
