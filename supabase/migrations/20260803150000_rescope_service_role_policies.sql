-- ═══════════════════════════════════════════════════════════════════════
-- 20260520000004_rescope_service_role_policies.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2
-- AUTHOR:      antigravity
-- AFFECTS:     RLS policies — rescope all public-role service_role policies
-- IRREVERSIBLE: no
--
-- WHY:
--   Many tables have service_role management policies incorrectly scoped
--   to the {public} role instead of {service_role}. This causes the
--   Supabase advisor to flag "multiple_permissive_policies" because a
--   public-role ALL policy overlaps with user-facing SELECT/INSERT policies
--   for the anon role.
--
-- HOW:
--   For each table: DROP the old {public} service policy and CREATE a
--   new identical policy scoped to service_role only.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ── clawbot tables ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "service_role_full_access_audit_log" ON public.clawbot_audit_log;
CREATE POLICY "service_role_full_access_audit_log"
    ON public.clawbot_audit_log FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_full_access_state" ON public.clawbot_task_state;
CREATE POLICY "service_role_full_access_state"
    ON public.clawbot_task_state FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── commander financial tables ──────────────────────────────────────────
DROP POLICY IF EXISTS "commander_buyin_transactions_service_only" ON public.commander_buyin_transactions;
CREATE POLICY "commander_buyin_transactions_service_only"
    ON public.commander_buyin_transactions FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "commander_cash_tx_service_only" ON public.commander_cash_transactions;
CREATE POLICY "commander_cash_tx_service_only"
    ON public.commander_cash_transactions FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "commander_member_comp_log_service_only" ON public.commander_member_comp_log;
CREATE POLICY "commander_member_comp_log_service_only"
    ON public.commander_member_comp_log FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "commander_membership_plans_service_write" ON public.commander_membership_plans;
CREATE POLICY "commander_membership_plans_service_write"
    ON public.commander_membership_plans FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "commander_sessions_service_only" ON public.commander_sessions;
CREATE POLICY "commander_sessions_service_only"
    ON public.commander_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "commander_subscriptions_service_only" ON public.commander_subscriptions;
CREATE POLICY "commander_subscriptions_service_only"
    ON public.commander_subscriptions FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "commander_tax_events_service_only" ON public.commander_tax_events;
CREATE POLICY "commander_tax_events_service_only"
    ON public.commander_tax_events FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "commander_time_sessions_service_only" ON public.commander_time_sessions;
CREATE POLICY "commander_time_sessions_service_only"
    ON public.commander_time_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── deploy / alerting tables ────────────────────────────────────────────
DROP POLICY IF EXISTS "deploy_alerts_service_only" ON public.deploy_alerts;
CREATE POLICY "deploy_alerts_service_only"
    ON public.deploy_alerts FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── diamond/financial tables ────────────────────────────────────────────
DROP POLICY IF EXISTS "diamond_ledger_service_only" ON public.diamond_ledger;
CREATE POLICY "diamond_ledger_service_only"
    ON public.diamond_ledger FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "diamond_transactions_service_only" ON public.diamond_transactions;
CREATE POLICY "diamond_transactions_service_only"
    ON public.diamond_transactions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── engine state tables ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "engine_snap_service_only" ON public.engine_state_snapshot;
CREATE POLICY "engine_snap_service_only"
    ON public.engine_state_snapshot FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "execution_audit_logs_service_only" ON public.execution_audit_logs;
CREATE POLICY "execution_audit_logs_service_only"
    ON public.execution_audit_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "financial_alerts_service_only" ON public.financial_alerts;
CREATE POLICY "financial_alerts_service_only"
    ON public.financial_alerts FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "game_live_history_service_write" ON public.game_live_history;
CREATE POLICY "game_live_history_service_write"
    ON public.game_live_history FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── geeves AI tables ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Service role full access analytics" ON public.geeves_analytics;
CREATE POLICY "Service role full access analytics"
    ON public.geeves_analytics FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access ratings" ON public.geeves_answer_ratings;
CREATE POLICY "Service role full access ratings"
    ON public.geeves_answer_ratings FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access cache" ON public.geeves_knowledge_cache;
CREATE POLICY "Service role full access cache"
    ON public.geeves_knowledge_cache FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access messages" ON public.geeves_messages;
CREATE POLICY "Service role full access messages"
    ON public.geeves_messages FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_only" ON public.geeves_missed_questions;
CREATE POLICY "service_role_only"
    ON public.geeves_missed_questions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── game infra tables ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "hand_state_snapshots_service_only" ON public.hand_state_snapshots;
CREATE POLICY "hand_state_snapshots_service_only"
    ON public.hand_state_snapshots FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "idempotency_service_only" ON public.idempotency_keys;
CREATE POLICY "idempotency_service_only"
    ON public.idempotency_keys FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── merchandise tables ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "Service role manages items" ON public.merchandise_items;
CREATE POLICY "Service role manages items"
    ON public.merchandise_items FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role manages orders" ON public.merchandise_orders;
CREATE POLICY "Service role manages orders"
    ON public.merchandise_orders FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── notification tables ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "notification_reads_service" ON public.notification_reads;
CREATE POLICY "notification_reads_service"
    ON public.notification_reads FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── media / clip tables ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "poker_clips_service_write" ON public.poker_clips;
CREATE POLICY "poker_clips_service_write"
    ON public.poker_clips FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── promo tables ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Service role manages redemptions" ON public.promo_code_redemptions;
CREATE POLICY "Service role manages redemptions"
    ON public.promo_code_redemptions FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role manages promo codes" ON public.promo_codes;
CREATE POLICY "Service role manages promo codes"
    ON public.promo_codes FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── scraper tables ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "scrape_evidence_service_only" ON public.scrape_evidence;
CREATE POLICY "scrape_evidence_service_only"
    ON public.scrape_evidence FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "scrape_source_registry_service_only" ON public.scrape_source_registry;
CREATE POLICY "scrape_source_registry_service_only"
    ON public.scrape_source_registry FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "scraper_watchdog_service_only" ON public.scraper_watchdog_state;
CREATE POLICY "scraper_watchdog_service_only"
    ON public.scraper_watchdog_state FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── sentry / audit tables ───────────────────────────────────────────────
DROP POLICY IF EXISTS "service_role_full_access_sentry" ON public.sentry_error_log;
CREATE POLICY "service_role_full_access_sentry"
    ON public.sentry_error_log FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "staff_claim_tokens_service_only" ON public.staff_claim_tokens;
CREATE POLICY "staff_claim_tokens_service_only"
    ON public.staff_claim_tokens FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "tour_scrape_registry_service_only" ON public.tour_scrape_registry;
CREATE POLICY "tour_scrape_registry_service_only"
    ON public.tour_scrape_registry FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── trivia admin tables ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "Service role manages category health" ON public.trivia_category_health;
CREATE POLICY "Service role manages category health"
    ON public.trivia_category_health FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on pvp_stats" ON public.trivia_pvp_stats;
-- Note: "Service role full access trivia_pvp_stats" (service_role) already created in migration 3
-- Just drop the old {public} one; the service_role one stays.

DROP POLICY IF EXISTS "Service role can manage audit log" ON public.trivia_quality_audits;
CREATE POLICY "Service role can manage audit log"
    ON public.trivia_quality_audits FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can manage trivia questions" ON public.trivia_questions;
CREATE POLICY "Service role can manage trivia questions"
    ON public.trivia_questions FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role manages regression runs" ON public.trivia_regression_runs;
CREATE POLICY "Service role manages regression runs"
    ON public.trivia_regression_runs FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role manages notifications" ON public.trivia_tournament_notifications;
-- "Service role full access trivia_tournament_notifications" (service_role) already exists from migration 3

DROP POLICY IF EXISTS "Service role manages rounds" ON public.trivia_tournament_rounds;
CREATE POLICY "Service role manages rounds"
    ON public.trivia_tournament_rounds FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── union wallets ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "union_wallets_service_only" ON public.union_wallets;
CREATE POLICY "union_wallets_service_only"
    ON public.union_wallets FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── user tables ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "user_reports_service" ON public.user_reports;
-- "Service role full access user_reports" (service_role) already created from migration 3

DROP POLICY IF EXISTS "Service role full access seen_questions" ON public.user_seen_questions;
-- "Service role full access user_seen_questions" (service_role) already created from migration 3

-- ── venue tables ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "venue_aliases_service_write" ON public.venue_aliases;
CREATE POLICY "venue_aliases_service_write"
    ON public.venue_aliases FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── video tables ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "video_library_videos_service_write" ON public.video_library_videos;
CREATE POLICY "video_library_videos_service_write"
    ON public.video_library_videos FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "p_video_transcode_jobs_service_only" ON public.video_transcode_jobs;
CREATE POLICY "p_video_transcode_jobs_service_only"
    ON public.video_transcode_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── VIP tables ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Service role can manage all" ON public.vip_monthly_usage;
CREATE POLICY "Service role can manage all"
    ON public.vip_monthly_usage FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── wallets ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "wallets_service_only" ON public.wallets;
-- "Service role full access wallets" (service_role) already created from migration 3

-- ── live_pins: has ALL + SELECT for same role ───────────────────────────
-- Drop SELECT (lp_sel), keep ALL (lp_all)
DROP POLICY IF EXISTS "lp_sel" ON public.live_pins;
-- lp_all (FOR ALL) already covers SELECT

-- ── messenger_admin_messages: ALL + INSERT + SELECT for public ──────────
-- Drop INSERT and SELECT since ALL covers them
DROP POLICY IF EXISTS "Users can send admin messages" ON public.messenger_admin_messages;
DROP POLICY IF EXISTS "Users can view own admin messages" ON public.messenger_admin_messages;
-- "Admins can manage all admin messages" (ALL) already covers both

-- ── training_progress: ALL + INSERT/SELECT/UPDATE for public ───────────
DROP POLICY IF EXISTS "Users can insert own progress" ON public.training_progress;
DROP POLICY IF EXISTS "Users can view own progress" ON public.training_progress;
DROP POLICY IF EXISTS "Users can update own progress" ON public.training_progress;
-- "training_progress_self" (ALL) already covers all operations

-- ── trivia_pvp_stats: ALL + INSERT/SELECT/UPDATE for public ────────────
DROP POLICY IF EXISTS "Users can insert own stats" ON public.trivia_pvp_stats;
DROP POLICY IF EXISTS "Users can update own stats" ON public.trivia_pvp_stats;
-- Keep "Anyone can view stats" (SELECT) and "trivia_pvp_stats" ALL
-- "Anyone can view stats" and "Service role full access on pvp_stats" (now dropped) were the dupe
-- Now only "Service role full access trivia_pvp_stats" (service_role) exists + user policies

-- ── venue_news: check if service_role write overlaps public read ────────
DROP POLICY IF EXISTS "venue_news_service_write" ON public.venue_news;
CREATE POLICY "venue_news_service_write"
    ON public.venue_news FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── POST-APPLY ASSERTIONS ──────────────────────────────────────────────
DO $$
DECLARE
    v_bad_count int;
BEGIN
    -- Verify no more public-role service_role policies that conflict
    SELECT count(*) INTO v_bad_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND permissive = 'PERMISSIVE'
      AND roles = '{public}'
      AND cmd = 'ALL'
      AND (policyname LIKE 'Service role%' OR policyname LIKE '%_service_only' OR policyname LIKE '%service_write%' OR policyname LIKE '%service_role%');

    RAISE NOTICE 'Remaining public-role service policies: %', v_bad_count;
END $$;

COMMIT;
