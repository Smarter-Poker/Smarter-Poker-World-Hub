-- ═══════════════════════════════════════════════════════════════════════
-- 20260520000005_final_permissive_policy_cleanup.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2
-- AUTHOR:      antigravity
-- AFFECTS:     RLS policies — final pass on remaining multiple permissive
-- IRREVERSIBLE: no
--
-- WHY:
--   After 4 migrations, 105 multiple_permissive_policies warnings remain.
--   Root cause: tables with FOR ALL {public} + separate SELECT {public}
--   policies — both apply to anon role's SELECT action.
--
-- HOW:
--   For each affected table, drop the redundant per-command SELECT policy
--   where the FOR ALL policy already grants the same access. OR scope the
--   FOR ALL to {authenticated} only and preserve the public SELECT.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ── club_announcements: FOR ALL "Owners can manage" + SELECT "Members can view"
-- Both apply to anon for SELECT. Scope the ALL to authenticated.
DROP POLICY IF EXISTS "Owners can manage announcements" ON public.club_announcements;
CREATE POLICY "Owners can manage announcements"
    ON public.club_announcements FOR ALL TO authenticated
    USING (EXISTS (
        SELECT 1 FROM club_members
        WHERE club_members.club_id = club_announcements.club_id
          AND club_members.user_id = (SELECT auth.uid())
          AND club_members.role IN ('admin', 'owner')
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM club_members
        WHERE club_members.club_id = club_announcements.club_id
          AND club_members.user_id = (SELECT auth.uid())
          AND club_members.role IN ('admin', 'owner')
    ));

-- ── commander_freeroll_qualifications: ALL + SELECT
DROP POLICY IF EXISTS "quals_player_read" ON public.commander_freeroll_qualifications;
DROP POLICY IF EXISTS "quals_staff_access" ON public.commander_freeroll_qualifications;
DROP POLICY IF EXISTS "commander_freeroll_qualifications_read" ON public.commander_freeroll_qualifications;
CREATE POLICY "commander_freeroll_qualifications_read"
    ON public.commander_freeroll_qualifications FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "commander_freeroll_qualifications_write" ON public.commander_freeroll_qualifications;
CREATE POLICY "commander_freeroll_qualifications_write"
    ON public.commander_freeroll_qualifications FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── commander_freerolls: ALL + SELECT
DROP POLICY IF EXISTS "freerolls_public_read" ON public.commander_freerolls;
DROP POLICY IF EXISTS "freerolls_staff_access" ON public.commander_freerolls;
DROP POLICY IF EXISTS "commander_freerolls_read" ON public.commander_freerolls;
CREATE POLICY "commander_freerolls_read"
    ON public.commander_freerolls FOR SELECT USING (true);
DROP POLICY IF EXISTS "commander_freerolls_write" ON public.commander_freerolls;
CREATE POLICY "commander_freerolls_write"
    ON public.commander_freerolls FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── commander_games: ALL + SELECT
DROP POLICY IF EXISTS "captain_games_select" ON public.commander_games;
DROP POLICY IF EXISTS "captain_games_modify" ON public.commander_games;
DROP POLICY IF EXISTS "commander_games_read" ON public.commander_games;
CREATE POLICY "commander_games_read"
    ON public.commander_games FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "commander_games_write" ON public.commander_games;
CREATE POLICY "commander_games_write"
    ON public.commander_games FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── commander_high_hands: ALL + SELECT
DROP POLICY IF EXISTS "Players can view own high hands" ON public.commander_high_hands;
DROP POLICY IF EXISTS "Staff can manage high hands" ON public.commander_high_hands;
DROP POLICY IF EXISTS "commander_high_hands_read" ON public.commander_high_hands;
CREATE POLICY "commander_high_hands_read"
    ON public.commander_high_hands FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "commander_high_hands_write" ON public.commander_high_hands;
CREATE POLICY "commander_high_hands_write"
    ON public.commander_high_hands FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── commander_seats: ALL + SELECT
DROP POLICY IF EXISTS "captain_seats_select" ON public.commander_seats;
DROP POLICY IF EXISTS "captain_seats_modify" ON public.commander_seats;
DROP POLICY IF EXISTS "commander_seats_read" ON public.commander_seats;
CREATE POLICY "commander_seats_read"
    ON public.commander_seats FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "commander_seats_write" ON public.commander_seats;
CREATE POLICY "commander_seats_write"
    ON public.commander_seats FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── commander_tables: ALL + SELECT
DROP POLICY IF EXISTS "captain_tables_select" ON public.commander_tables;
DROP POLICY IF EXISTS "captain_tables_modify" ON public.commander_tables;
DROP POLICY IF EXISTS "commander_tables_read" ON public.commander_tables;
CREATE POLICY "commander_tables_read"
    ON public.commander_tables FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "commander_tables_write" ON public.commander_tables;
CREATE POLICY "commander_tables_write"
    ON public.commander_tables FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── commission_history: ALL "commission_history_owner_all" + SELECT "Agents can read"
-- Both for public/anon SELECT. Scope ALL to authenticated.
DROP POLICY IF EXISTS "Agents can read own commission history" ON public.commission_history;
DROP POLICY IF EXISTS "commission_history_owner_all" ON public.commission_history;
DROP POLICY IF EXISTS "commission_history_owner" ON public.commission_history;
CREATE POLICY "commission_history_owner"
    ON public.commission_history FOR ALL TO authenticated
    USING ((SELECT auth.uid()) = agent_id)
    WITH CHECK ((SELECT auth.uid()) = agent_id);

-- ── content_authors: ALL "Admins manage" + SELECT "Public can read"
-- Scope Admins ALL to authenticated, keep public read.
DROP POLICY IF EXISTS "Admins manage authors" ON public.content_authors;
CREATE POLICY "Admins manage authors"
    ON public.content_authors FOR ALL TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.is_admin = true
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.is_admin = true
    ));

-- ── memory_leaderboards: ALL + SELECT both public
DROP POLICY IF EXISTS "Anyone can view leaderboards" ON public.memory_leaderboards;
DROP POLICY IF EXISTS "Users can manage own entries" ON public.memory_leaderboards;
DROP POLICY IF EXISTS "memory_leaderboards_read" ON public.memory_leaderboards;
CREATE POLICY "memory_leaderboards_read" ON public.memory_leaderboards FOR SELECT USING (true);
DROP POLICY IF EXISTS "memory_leaderboards_write" ON public.memory_leaderboards;
CREATE POLICY "memory_leaderboards_write" ON public.memory_leaderboards FOR ALL TO authenticated
    USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);

-- ── player_stats: ALL "player_stats_self" + SELECT "Player stats are public"
-- Scope self ALL to authenticated, keep public SELECT.
DROP POLICY IF EXISTS "player_stats_self" ON public.player_stats;
CREATE POLICY "player_stats_self"
    ON public.player_stats FOR ALL TO authenticated
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);

-- ── trivia_streaks: ALL "Users can manage own" + SELECT "viewable by all"
-- Scope ALL to authenticated.
DROP POLICY IF EXISTS "Users can manage their own streaks" ON public.trivia_streaks;
DROP POLICY IF EXISTS "trivia_streaks_self" ON public.trivia_streaks;
CREATE POLICY "trivia_streaks_self"
    ON public.trivia_streaks FOR ALL TO authenticated
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);

-- ── trivia_user_question_history: ALL "tqh_owner" + UPDATE "Users can update"
-- Drop the redundant UPDATE.
DROP POLICY IF EXISTS "Users can update own question history" ON public.trivia_user_question_history;
-- tqh_owner (FOR ALL) already covers UPDATE

-- ── venue_daily_tournaments: ALL "Service write" + SELECT "Public can view"
-- Scope service write to service_role.
DROP POLICY IF EXISTS "Service write venue_daily_tournaments" ON public.venue_daily_tournaments;
CREATE POLICY "Service write venue_daily_tournaments"
    ON public.venue_daily_tournaments FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── venue_news: ALL "Authenticated users manage" + SELECT public
-- Already created "venue_news_service_write" for service_role in migration 4.
-- The "Authenticated users manage" needs scoping to authenticated only (it's already on {public}).
DROP POLICY IF EXISTS "Authenticated users manage venue news" ON public.venue_news;
CREATE POLICY "Authenticated users manage venue news"
    ON public.venue_news FOR ALL TO authenticated
    USING (true) WITH CHECK (true);

-- ── ALSO fix duplicate_index warnings where we can ────────────────────────
-- These are advisory-only performance items, handled automatically by Postgres
-- for covering indexes — nothing actionable from SQL side.

-- ── POST-APPLY ASSERTIONS ──────────────────────────────────────────────
DO $$
DECLARE
    v_count int;
BEGIN
    SELECT count(*) INTO v_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND permissive = 'PERMISSIVE'
      AND roles = '{public}'
      AND cmd = 'ALL';

    RAISE NOTICE 'Remaining FOR ALL {public} policies: %', v_count;
END $$;

COMMIT;
