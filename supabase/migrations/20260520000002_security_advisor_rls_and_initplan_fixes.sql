-- ═══════════════════════════════════════════════════════════════════════
-- 20260520000002_security_advisor_rls_and_initplan_fixes.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2
-- AUTHOR:      antigravity
-- AFFECTS:     RLS policies (auth_rls_initplan, multiple_permissive_policies)
-- IRREVERSIBLE: no
--
-- WHY:
--   After the first remediation pass, the following issues remain:
--   1. auth_rls_initplan (52): Policies using bare auth.uid() instead of
--      (SELECT auth.uid()) — causes re-evaluation per row rather than once
--      per query, hurting performance.
--   2. multiple_permissive_policies (4 tables with true duplicates):
--      live_help_tickets, trivia_question_reports, video_analysis
--   3. "deny-all" policies using the uuid sentinel pattern
--      auth.uid() = '00000000...' — should just be 'false'
--
-- HOW:
--   1. Replace deny-all sentinel policies with simple FALSE condition.
--   2. Replace bare auth.uid() in user-facing policies with (SELECT auth.uid()).
--   3. Consolidate true duplicate permissive policies on live_help_tickets,
--      trivia_question_reports by merging conditions into single policies.
--   4. Remove the duplicate video_analysis_public_read (superseded by
--      users_read_own_analysis + service_role write).
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ──────────────────────────────────────────────────────────────────────
-- 1. Fix deny-all sentinel policies (auth.uid() = '00000000...') → false
--    These tables are service_role-only; RLS just needs to deny everyone.
-- ──────────────────────────────────────────────────────────────────────

-- anti_farming_ips
DROP POLICY IF EXISTS "deny_all_anti_farming_ips" ON public.anti_farming_ips;
CREATE POLICY "deny_all_anti_farming_ips"
    ON public.anti_farming_ips FOR ALL TO authenticated USING (false);

-- autofix tables
DROP POLICY IF EXISTS "autofix_budget_service_only" ON public.autofix_budget;
CREATE POLICY "autofix_budget_service_only"
    ON public.autofix_budget FOR ALL TO authenticated USING (false);

DROP POLICY IF EXISTS "autofix_config_service_only" ON public.autofix_config;
CREATE POLICY "autofix_config_service_only"
    ON public.autofix_config FOR ALL TO authenticated USING (false);

DROP POLICY IF EXISTS "autofix_projects_service_only" ON public.autofix_projects;
CREATE POLICY "autofix_projects_service_only"
    ON public.autofix_projects FOR ALL TO authenticated USING (false);

-- commander tables
DROP POLICY IF EXISTS "deny_all_commander_clock_presets" ON public.commander_clock_presets;
CREATE POLICY "deny_all_commander_clock_presets"
    ON public.commander_clock_presets FOR ALL TO authenticated USING (false);

DROP POLICY IF EXISTS "deny_all_commander_dealer_marketplace" ON public.commander_dealer_marketplace;
CREATE POLICY "deny_all_commander_dealer_marketplace"
    ON public.commander_dealer_marketplace FOR ALL TO authenticated USING (false);

DROP POLICY IF EXISTS "deny_all_commander_dealer_rotations" ON public.commander_dealer_rotations;
CREATE POLICY "deny_all_commander_dealer_rotations"
    ON public.commander_dealer_rotations FOR ALL TO authenticated USING (false);

DROP POLICY IF EXISTS "deny_all_commander_equipment_rentals" ON public.commander_equipment_rentals;
CREATE POLICY "deny_all_commander_equipment_rentals"
    ON public.commander_equipment_rentals FOR ALL TO authenticated USING (false);

DROP POLICY IF EXISTS "deny_all_commander_floor_calls" ON public.commander_floor_calls;
CREATE POLICY "deny_all_commander_floor_calls"
    ON public.commander_floor_calls FOR ALL TO authenticated USING (false);

DROP POLICY IF EXISTS "deny_all_commander_hand_history" ON public.commander_hand_history;
CREATE POLICY "deny_all_commander_hand_history"
    ON public.commander_hand_history FOR ALL TO authenticated USING (false);

DROP POLICY IF EXISTS "deny_all_commander_progressive_jackpots" ON public.commander_progressive_jackpots;
CREATE POLICY "deny_all_commander_progressive_jackpots"
    ON public.commander_progressive_jackpots FOR ALL TO authenticated USING (false);

DROP POLICY IF EXISTS "deny_all_commander_streams" ON public.commander_streams;
CREATE POLICY "deny_all_commander_streams"
    ON public.commander_streams FOR ALL TO authenticated USING (false);

DROP POLICY IF EXISTS "deny_all_commander_table_displays" ON public.commander_table_displays;
CREATE POLICY "deny_all_commander_table_displays"
    ON public.commander_table_displays FOR ALL TO authenticated USING (false);

DROP POLICY IF EXISTS "deny_all_commander_table_seats" ON public.commander_table_seats;
CREATE POLICY "deny_all_commander_table_seats"
    ON public.commander_table_seats FOR ALL TO authenticated USING (false);

DROP POLICY IF EXISTS "deny_all_commander_table_sessions" ON public.commander_table_sessions;
CREATE POLICY "deny_all_commander_table_sessions"
    ON public.commander_table_sessions FOR ALL TO authenticated USING (false);

DROP POLICY IF EXISTS "deny_all_commander_time_purchases" ON public.commander_time_purchases;
CREATE POLICY "deny_all_commander_time_purchases"
    ON public.commander_time_purchases FOR ALL TO authenticated USING (false);

DROP POLICY IF EXISTS "deny_all_commander_wait_time_predictions" ON public.commander_wait_time_predictions;
CREATE POLICY "deny_all_commander_wait_time_predictions"
    ON public.commander_wait_time_predictions FOR ALL TO authenticated USING (false);

DROP POLICY IF EXISTS "deny_all_commander_waitlist_groups" ON public.commander_waitlist_groups;
CREATE POLICY "deny_all_commander_waitlist_groups"
    ON public.commander_waitlist_groups FOR ALL TO authenticated USING (false);

-- cron_locks
DROP POLICY IF EXISTS "cron_locks_no_anon" ON public.cron_locks;
CREATE POLICY "cron_locks_no_anon"
    ON public.cron_locks FOR ALL TO authenticated USING (false);

-- horse tables
DROP POLICY IF EXISTS "deny_all_horse_hand_history" ON public.horse_hand_history;
CREATE POLICY "deny_all_horse_hand_history"
    ON public.horse_hand_history FOR ALL TO authenticated USING (false);

DROP POLICY IF EXISTS "deny_all_horse_opponent_journals" ON public.horse_opponent_journals;
CREATE POLICY "deny_all_horse_opponent_journals"
    ON public.horse_opponent_journals FOR ALL TO authenticated USING (false);

DROP POLICY IF EXISTS "deny_all_horse_opponent_reads" ON public.horse_opponent_reads;
CREATE POLICY "deny_all_horse_opponent_reads"
    ON public.horse_opponent_reads FOR ALL TO authenticated USING (false);

DROP POLICY IF EXISTS "deny_all_horse_source_assignments" ON public.horse_source_assignments;
CREATE POLICY "deny_all_horse_source_assignments"
    ON public.horse_source_assignments FOR ALL TO authenticated USING (false);

DROP POLICY IF EXISTS "deny_all_horse_sports_source_assignments" ON public.horse_sports_source_assignments;
CREATE POLICY "deny_all_horse_sports_source_assignments"
    ON public.horse_sports_source_assignments FOR ALL TO authenticated USING (false);

-- live_ban_audit
DROP POLICY IF EXISTS "deny_all_live_ban_audit" ON public.live_ban_audit;
CREATE POLICY "deny_all_live_ban_audit"
    ON public.live_ban_audit FOR ALL TO authenticated USING (false);

-- rate_limit_buckets
DROP POLICY IF EXISTS "rate_limit_buckets_no_anon" ON public.rate_limit_buckets;
CREATE POLICY "rate_limit_buckets_no_anon"
    ON public.rate_limit_buckets FOR ALL TO authenticated USING (false);

-- scraper_runs
DROP POLICY IF EXISTS "deny_all_scraper_runs" ON public.scraper_runs;
CREATE POLICY "deny_all_scraper_runs"
    ON public.scraper_runs FOR ALL TO authenticated USING (false);

-- sms_otp_codes
DROP POLICY IF EXISTS "deny_all_sms_otp_codes" ON public.sms_otp_codes;
CREATE POLICY "deny_all_sms_otp_codes"
    ON public.sms_otp_codes FOR ALL TO authenticated USING (false);

-- tour_schedule_sources
DROP POLICY IF EXISTS "deny_all_tour_schedule_sources" ON public.tour_schedule_sources;
CREATE POLICY "deny_all_tour_schedule_sources"
    ON public.tour_schedule_sources FOR ALL TO authenticated USING (false);

-- venue_verification_log
DROP POLICY IF EXISTS "deny_all_venue_verification_log" ON public.venue_verification_log;
CREATE POLICY "deny_all_venue_verification_log"
    ON public.venue_verification_log FOR ALL TO authenticated USING (false);

-- ──────────────────────────────────────────────────────────────────────
-- 2. Fix bare auth.uid() in user-facing policies → (SELECT auth.uid())
--    This prevents per-row re-evaluation (initplan issue).
-- ──────────────────────────────────────────────────────────────────────

-- home_game_vouches
DROP POLICY IF EXISTS "Authenticated users can vouch" ON public.home_game_vouches;
CREATE POLICY "Authenticated users can vouch"
    ON public.home_game_vouches FOR INSERT TO authenticated
    WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can remove own vouch" ON public.home_game_vouches;
CREATE POLICY "Users can remove own vouch"
    ON public.home_game_vouches FOR DELETE TO authenticated
    USING ((SELECT auth.uid()) = user_id);

-- horse_bug_reports
DROP POLICY IF EXISTS "Authenticated users can insert bug reports" ON public.horse_bug_reports;
CREATE POLICY "Authenticated users can insert bug reports"
    ON public.horse_bug_reports FOR INSERT TO authenticated
    WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

-- horse_session_stats (profile_id is text, cast preserved)
DROP POLICY IF EXISTS "horse_session_stats_owner" ON public.horse_session_stats;
CREATE POLICY "horse_session_stats_owner"
    ON public.horse_session_stats FOR ALL TO authenticated
    USING (profile_id = ((SELECT auth.uid()))::text)
    WITH CHECK (profile_id = ((SELECT auth.uid()))::text);

-- live_help_tickets — fix bare auth.uid() in admin policies
DROP POLICY IF EXISTS "Admins and Support can view all tickets" ON public.live_help_tickets;
CREATE POLICY "Admins and Support can view all tickets"
    ON public.live_help_tickets FOR SELECT TO authenticated
    USING (
        ((SELECT auth.jwt()) ->> 'email') = ANY (ARRAY['admin@smarter.poker', 'support@smarter.poker'])
        OR EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (SELECT auth.uid())
              AND profiles.role = ANY (ARRAY['admin', 'super_agent', 'owner'])
        )
    );

DROP POLICY IF EXISTS "Admins and Support can update all tickets" ON public.live_help_tickets;
CREATE POLICY "Admins and Support can update all tickets"
    ON public.live_help_tickets FOR UPDATE TO authenticated
    USING (
        ((SELECT auth.jwt()) ->> 'email') = ANY (ARRAY['admin@smarter.poker', 'support@smarter.poker'])
        OR EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (SELECT auth.uid())
              AND profiles.role = ANY (ARRAY['admin', 'super_agent', 'owner'])
        )
    );

-- qr_code_scans
DROP POLICY IF EXISTS "Authenticated users can record scans" ON public.qr_code_scans;
CREATE POLICY "Authenticated users can record scans"
    ON public.qr_code_scans FOR INSERT TO authenticated
    WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

-- training_hand_replay
DROP POLICY IF EXISTS "thr_self_delete" ON public.training_hand_replay;
CREATE POLICY "thr_self_delete"
    ON public.training_hand_replay FOR DELETE TO authenticated
    USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "thr_self_insert" ON public.training_hand_replay;
CREATE POLICY "thr_self_insert"
    ON public.training_hand_replay FOR INSERT TO authenticated
    WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "thr_self_read" ON public.training_hand_replay;
CREATE POLICY "thr_self_read"
    ON public.training_hand_replay FOR SELECT TO authenticated
    USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "thr_self_update" ON public.training_hand_replay;
CREATE POLICY "thr_self_update"
    ON public.training_hand_replay FOR UPDATE TO authenticated
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);

-- training_user_progress
DROP POLICY IF EXISTS "tup_self_read" ON public.training_user_progress;
CREATE POLICY "tup_self_read"
    ON public.training_user_progress FOR SELECT TO authenticated
    USING ((SELECT auth.uid()) = user_id);

-- trivia_category_health
DROP POLICY IF EXISTS "Admins read category health" ON public.trivia_category_health;
CREATE POLICY "Admins read category health"
    ON public.trivia_category_health FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = (SELECT auth.uid()) AND profiles.is_admin = true
    ));

-- trivia_quality_audits
DROP POLICY IF EXISTS "Admins can read audit log" ON public.trivia_quality_audits;
CREATE POLICY "Admins can read audit log"
    ON public.trivia_quality_audits FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = (SELECT auth.uid()) AND profiles.is_admin = true
    ));

-- trivia_question_reports
DROP POLICY IF EXISTS "Admins can manage all reports" ON public.trivia_question_reports;
CREATE POLICY "Admins can manage all reports"
    ON public.trivia_question_reports FOR ALL TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = (SELECT auth.uid()) AND profiles.is_admin = true
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = (SELECT auth.uid()) AND profiles.is_admin = true
    ));

DROP POLICY IF EXISTS "Users can report questions" ON public.trivia_question_reports;
CREATE POLICY "Users can report questions"
    ON public.trivia_question_reports FOR INSERT TO authenticated
    WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can view their own reports" ON public.trivia_question_reports;
CREATE POLICY "Users can view their own reports"
    ON public.trivia_question_reports FOR SELECT TO authenticated
    USING ((SELECT auth.uid()) = user_id);

-- trivia_regression_runs
DROP POLICY IF EXISTS "Admins read regression runs" ON public.trivia_regression_runs;
CREATE POLICY "Admins read regression runs"
    ON public.trivia_regression_runs FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = (SELECT auth.uid()) AND profiles.is_admin = true
    ));

-- ──────────────────────────────────────────────────────────────────────
-- 3. Fix multiple_permissive_policies:
--    video_analysis has redundant SELECT policy — remove the blanket
--    "public read" since service_role handles all writes and users see own.
-- ──────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "video_analysis_public_read" ON public.video_analysis;
-- users_read_own_analysis already exists and is correct

-- ──────────────────────────────────────────────────────────────────────
-- 4. Remove duplicate "Users can view own tickets" on live_help_tickets
--    The admin policy + the own-user policy use different roles, so they're
--    not technically duplicates in harm but do generate the advisor warning.
--    Consolidate SELECT into one policy covering both cases.
-- ──────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view own tickets" ON public.live_help_tickets;
DROP POLICY IF EXISTS "Admins and Support can view all tickets" ON public.live_help_tickets;
CREATE POLICY "live_help_tickets_select"
    ON public.live_help_tickets FOR SELECT TO authenticated
    USING (
        (SELECT auth.uid()) = user_id
        OR ((SELECT auth.jwt()) ->> 'email') = ANY (ARRAY['admin@smarter.poker', 'support@smarter.poker'])
        OR EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (SELECT auth.uid())
              AND profiles.role = ANY (ARRAY['admin', 'super_agent', 'owner'])
        )
    );

DROP POLICY IF EXISTS "Users can update own tickets" ON public.live_help_tickets;
DROP POLICY IF EXISTS "Admins and Support can update all tickets" ON public.live_help_tickets;
CREATE POLICY "live_help_tickets_update"
    ON public.live_help_tickets FOR UPDATE TO authenticated
    USING (
        (SELECT auth.uid()) = user_id
        OR ((SELECT auth.jwt()) ->> 'email') = ANY (ARRAY['admin@smarter.poker', 'support@smarter.poker'])
        OR EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (SELECT auth.uid())
              AND profiles.role = ANY (ARRAY['admin', 'super_agent', 'owner'])
        )
    );

-- trivia_question_reports — remove "Service role manages reports" duplicate
-- (service_role bypasses RLS entirely; this policy is redundant)
DROP POLICY IF EXISTS "Service role manages reports" ON public.trivia_question_reports;

-- ── POST-APPLY ASSERTIONS ──────────────────────────────────────────────
DO $$
DECLARE
    v_bad_count int;
    v_dup_count int;
BEGIN
    -- Assert no more deny-all sentinel patterns
    SELECT count(*) INTO v_bad_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND qual LIKE '%00000000-0000-0000-0000-000000000000%';
    IF v_bad_count > 0 THEN
        RAISE EXCEPTION 'post-apply: % policy(ies) still use the sentinel uuid deny pattern', v_bad_count;
    END IF;

    -- Assert live_help_tickets has consolidated SELECT policy
    SELECT count(*) INTO v_dup_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'live_help_tickets'
      AND cmd = 'SELECT'
      AND permissive = 'PERMISSIVE';
    IF v_dup_count != 1 THEN
        RAISE EXCEPTION 'post-apply: live_help_tickets SELECT policy count = %, expected 1', v_dup_count;
    END IF;
END $$;

COMMIT;
