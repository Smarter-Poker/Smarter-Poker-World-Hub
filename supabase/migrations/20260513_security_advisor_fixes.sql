-- ═══════════════════════════════════════════════════════════════════════
-- 20260513_security_advisor_fixes.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2
-- AUTHOR:      antigravity
-- AFFECTS:     functions, RLS policies
-- IRREVERSIBLE: no
--
-- WHY:
--   Supabase Security Advisor flags three classes of issues:
--   1. SECURITY DEFINER trigger fn_notify_friend_accepted has no fixed
--      search_path → SQL injection risk (security advisor ERROR).
--   2. fn_get_or_create_conversation has two overloads with identical
--      (uuid, uuid) signature → ambiguity errors in 3 live callers.
--   3. 29 tables have RLS enabled but zero policies → all access
--      implicitly denied; advisor flags as WARNING.
--
-- HOW:
--   1. Replace fn_notify_friend_accepted with SET search_path = public.
--   2. Drop the old (uuid,uuid)→uuid overload of fn_get_or_create_conversation.
--   3. Add appropriate RLS policies to each of the 29 flagged tables.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Fix fn_notify_friend_accepted: add SET search_path ─────────────
CREATE OR REPLACE FUNCTION public.fn_notify_friend_accepted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    accepter_name TEXT;
BEGIN
    -- Only notify when status transitions TO 'accepted'
    IF NEW.status != 'accepted' OR (TG_OP = 'UPDATE' AND OLD.status = 'accepted') THEN
        RETURN NEW;
    END IF;

    SELECT COALESCE(full_name, username, 'Someone')
    INTO accepter_name
    FROM public.profiles WHERE id = NEW.friend_id;

    INSERT INTO public.notifications (user_id, actor_id, type, title, message, data)
    VALUES (
        NEW.user_id,
        NEW.friend_id,
        'friend_accepted',
        accepter_name || ' accepted your friend request',
        'You are now friends',
        jsonb_build_object('actor_id', NEW.friend_id, 'actor_name', accepter_name)
    );

    RETURN NEW;
END;
$$;

-- ── 2. Drop old (uuid,uuid)→uuid overload of fn_get_or_create_conversation ──
-- The correct overload is (uuid, uuid, text) → jsonb. The old (uuid,uuid)→uuid
-- was supposed to be dropped in 20260503_phase40 but was recreated by a later
-- phantom_rpcs sweep. Dropping it fixes ambiguity in 3 callers.
DROP FUNCTION IF EXISTS public.fn_get_or_create_conversation(user1_id uuid, user2_id uuid);

-- ── 3. RLS policies for tables that have RLS ON but zero policies ──────
-- Pattern: service_role bypasses RLS automatically; authenticated users get
-- access only where the table is user-facing. All others: deny explicitly.

-- anti_farming_ips (service_role only — internal security table)
DROP POLICY IF EXISTS "deny_all_anti_farming_ips" ON public.anti_farming_ips;
CREATE POLICY "deny_all_anti_farming_ips"
    ON public.anti_farming_ips FOR ALL TO authenticated USING (false);

-- commander_clock_presets (service_role only — commander internal)
DROP POLICY IF EXISTS "deny_all_commander_clock_presets" ON public.commander_clock_presets;
CREATE POLICY "deny_all_commander_clock_presets"
    ON public.commander_clock_presets FOR ALL TO authenticated USING (false);

-- commander_dealer_marketplace
DROP POLICY IF EXISTS "deny_all_commander_dealer_marketplace" ON public.commander_dealer_marketplace;
CREATE POLICY "deny_all_commander_dealer_marketplace"
    ON public.commander_dealer_marketplace FOR ALL TO authenticated USING (false);

-- commander_dealer_rotations
DROP POLICY IF EXISTS "deny_all_commander_dealer_rotations" ON public.commander_dealer_rotations;
CREATE POLICY "deny_all_commander_dealer_rotations"
    ON public.commander_dealer_rotations FOR ALL TO authenticated USING (false);

-- commander_equipment_rentals
DROP POLICY IF EXISTS "deny_all_commander_equipment_rentals" ON public.commander_equipment_rentals;
CREATE POLICY "deny_all_commander_equipment_rentals"
    ON public.commander_equipment_rentals FOR ALL TO authenticated USING (false);

-- commander_floor_calls
DROP POLICY IF EXISTS "deny_all_commander_floor_calls" ON public.commander_floor_calls;
CREATE POLICY "deny_all_commander_floor_calls"
    ON public.commander_floor_calls FOR ALL TO authenticated USING (false);

-- commander_hand_history
DROP POLICY IF EXISTS "deny_all_commander_hand_history" ON public.commander_hand_history;
CREATE POLICY "deny_all_commander_hand_history"
    ON public.commander_hand_history FOR ALL TO authenticated USING (false);

-- commander_progressive_jackpots
DROP POLICY IF EXISTS "deny_all_commander_progressive_jackpots" ON public.commander_progressive_jackpots;
CREATE POLICY "deny_all_commander_progressive_jackpots"
    ON public.commander_progressive_jackpots FOR ALL TO authenticated USING (false);

-- commander_streams
DROP POLICY IF EXISTS "deny_all_commander_streams" ON public.commander_streams;
CREATE POLICY "deny_all_commander_streams"
    ON public.commander_streams FOR ALL TO authenticated USING (false);

-- commander_table_displays
DROP POLICY IF EXISTS "deny_all_commander_table_displays" ON public.commander_table_displays;
CREATE POLICY "deny_all_commander_table_displays"
    ON public.commander_table_displays FOR ALL TO authenticated USING (false);

-- commander_table_seats
DROP POLICY IF EXISTS "deny_all_commander_table_seats" ON public.commander_table_seats;
CREATE POLICY "deny_all_commander_table_seats"
    ON public.commander_table_seats FOR ALL TO authenticated USING (false);

-- commander_table_sessions
DROP POLICY IF EXISTS "deny_all_commander_table_sessions" ON public.commander_table_sessions;
CREATE POLICY "deny_all_commander_table_sessions"
    ON public.commander_table_sessions FOR ALL TO authenticated USING (false);

-- commander_time_purchases
DROP POLICY IF EXISTS "deny_all_commander_time_purchases" ON public.commander_time_purchases;
CREATE POLICY "deny_all_commander_time_purchases"
    ON public.commander_time_purchases FOR ALL TO authenticated USING (false);

-- commander_wait_time_predictions
DROP POLICY IF EXISTS "deny_all_commander_wait_time_predictions" ON public.commander_wait_time_predictions;
CREATE POLICY "deny_all_commander_wait_time_predictions"
    ON public.commander_wait_time_predictions FOR ALL TO authenticated USING (false);

-- commander_waitlist_groups
DROP POLICY IF EXISTS "deny_all_commander_waitlist_groups" ON public.commander_waitlist_groups;
CREATE POLICY "deny_all_commander_waitlist_groups"
    ON public.commander_waitlist_groups FOR ALL TO authenticated USING (false);

-- grok_explanation_cache (read-only for authenticated — used by training UI)
DROP POLICY IF EXISTS "allow_read_grok_explanation_cache" ON public.grok_explanation_cache;
CREATE POLICY "allow_read_grok_explanation_cache"
    ON public.grok_explanation_cache FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "deny_write_grok_explanation_cache" ON public.grok_explanation_cache;
CREATE POLICY "deny_write_grok_explanation_cache"
    ON public.grok_explanation_cache FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- horse_hand_history (owner access)
DROP POLICY IF EXISTS "horse_hand_history_owner" ON public.horse_hand_history;
CREATE POLICY "horse_hand_history_owner"
    ON public.horse_hand_history FOR ALL TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- horse_opponent_journals (owner access)
DROP POLICY IF EXISTS "horse_opponent_journals_owner" ON public.horse_opponent_journals;
CREATE POLICY "horse_opponent_journals_owner"
    ON public.horse_opponent_journals FOR ALL TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- horse_opponent_reads (owner access)
DROP POLICY IF EXISTS "horse_opponent_reads_owner" ON public.horse_opponent_reads;
CREATE POLICY "horse_opponent_reads_owner"
    ON public.horse_opponent_reads FOR ALL TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- horse_session_stats (owner access)
DROP POLICY IF EXISTS "horse_session_stats_owner" ON public.horse_session_stats;
CREATE POLICY "horse_session_stats_owner"
    ON public.horse_session_stats FOR ALL TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- horse_source_assignments (service_role only)
DROP POLICY IF EXISTS "deny_all_horse_source_assignments" ON public.horse_source_assignments;
CREATE POLICY "deny_all_horse_source_assignments"
    ON public.horse_source_assignments FOR ALL TO authenticated USING (false);

-- horse_sports_source_assignments (service_role only)
DROP POLICY IF EXISTS "deny_all_horse_sports_source_assignments" ON public.horse_sports_source_assignments;
CREATE POLICY "deny_all_horse_sports_source_assignments"
    ON public.horse_sports_source_assignments FOR ALL TO authenticated USING (false);

-- live_ban_audit (service_role only — security audit log)
DROP POLICY IF EXISTS "deny_all_live_ban_audit" ON public.live_ban_audit;
CREATE POLICY "deny_all_live_ban_audit"
    ON public.live_ban_audit FOR ALL TO authenticated USING (false);

-- scraper_runs (service_role only — internal pipeline)
DROP POLICY IF EXISTS "deny_all_scraper_runs" ON public.scraper_runs;
CREATE POLICY "deny_all_scraper_runs"
    ON public.scraper_runs FOR ALL TO authenticated USING (false);

-- sms_otp_codes (service_role only — sensitive auth data)
DROP POLICY IF EXISTS "deny_all_sms_otp_codes" ON public.sms_otp_codes;
CREATE POLICY "deny_all_sms_otp_codes"
    ON public.sms_otp_codes FOR ALL TO authenticated USING (false);

-- table_activity (authenticated read — live game data)
DROP POLICY IF EXISTS "allow_read_table_activity" ON public.table_activity;
CREATE POLICY "allow_read_table_activity"
    ON public.table_activity FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "deny_write_table_activity" ON public.table_activity;
CREATE POLICY "deny_write_table_activity"
    ON public.table_activity FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- tour_schedule_registry (authenticated read — public schedule data)
DROP POLICY IF EXISTS "allow_read_tour_schedule_registry" ON public.tour_schedule_registry;
CREATE POLICY "allow_read_tour_schedule_registry"
    ON public.tour_schedule_registry FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "deny_write_tour_schedule_registry" ON public.tour_schedule_registry;
CREATE POLICY "deny_write_tour_schedule_registry"
    ON public.tour_schedule_registry FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- tour_schedule_sources (service_role only — scraper config)
DROP POLICY IF EXISTS "deny_all_tour_schedule_sources" ON public.tour_schedule_sources;
CREATE POLICY "deny_all_tour_schedule_sources"
    ON public.tour_schedule_sources FOR ALL TO authenticated USING (false);

-- venue_verification_log (service_role only — internal)
DROP POLICY IF EXISTS "deny_all_venue_verification_log" ON public.venue_verification_log;
CREATE POLICY "deny_all_venue_verification_log"
    ON public.venue_verification_log FOR ALL TO authenticated USING (false);

-- ── POST-APPLY ASSERTIONS ────────────────────────────────────────────────
DO $$
DECLARE
    v_overload_count int;
    v_has_search_path boolean;
BEGIN
    -- Assert only 1 overload of fn_get_or_create_conversation remains
    SELECT count(*) INTO v_overload_count
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_get_or_create_conversation';

    IF v_overload_count != 1 THEN
        RAISE EXCEPTION 'post-apply: expected 1 fn_get_or_create_conversation overload, got %', v_overload_count;
    END IF;

    -- Assert fn_notify_friend_accepted now has search_path set
    SELECT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'fn_notify_friend_accepted'
          AND array_to_string(p.proconfig, ',') LIKE '%search_path%'
    ) INTO v_has_search_path;

    IF NOT v_has_search_path THEN
        RAISE EXCEPTION 'post-apply: fn_notify_friend_accepted still missing search_path';
    END IF;
END $$;

COMMIT;
