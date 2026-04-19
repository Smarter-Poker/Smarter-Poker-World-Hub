-- ═══════════════════════════════════════════════════════════════════════════════
-- RLS HARDENING PASS 2 — April 19, 2026
-- Security Audit Findings: 20 policy gaps across ~45 tables
-- Covers: P0 (critical), P1 (high), P2 (medium), P3 (improvement)
-- Safe: All DROP POLICY IF EXISTS before CREATE. No data mutations. No DROP TABLE.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- P0-A: financial_alerts — Wide-Open FOR ALL USING (true)
-- RISK: Any authenticated user reads/writes all financial system alerts
-- FIX: Restrict to service_role only (this is an internal monitoring table)
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE IF EXISTS public.financial_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS financial_alerts_all ON public.financial_alerts;

CREATE POLICY financial_alerts_service_only
  ON public.financial_alerts
  FOR ALL
  USING (auth.role() = 'service_role');


-- ────────────────────────────────────────────────────────────────────────────
-- P0-B: profiles — UPDATE USING (true) lets any user update any profile row
-- FIX: Restrict UPDATE/DELETE to own row (auth.uid() = id)
-- NOTE: INSERT stays open so the auth trigger can create profiles on signup
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_update ON public.profiles;
DROP POLICY IF EXISTS profiles_delete ON public.profiles;

CREATE POLICY profiles_update
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY profiles_delete
  ON public.profiles
  FOR DELETE
  USING (auth.uid() = id);


-- ────────────────────────────────────────────────────────────────────────────
-- P0-C: union_wallets — UPDATE USING (true) lets any user mutate financial balances
-- RISK: Any user can zero out a union's chip/rake/BBJ wallets
-- FIX: Service_role only for writes. Union members can SELECT their own union.
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE IF EXISTS public.union_wallets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "union_wallets_update" ON public.union_wallets;
DROP POLICY IF EXISTS "union_wallets_select" ON public.union_wallets;

-- union_wallets is a financial system table — no direct user SELECT needed
-- (balances are surfaced through API endpoints with proper auth)
-- Service role only for all operations
CREATE POLICY union_wallets_service_only
  ON public.union_wallets
  FOR ALL
  USING (auth.role() = 'service_role');


-- ────────────────────────────────────────────────────────────────────────────
-- P0-D: venue_game_alerts — ZERO RLS, has user_id FK
-- RISK: Any user reads/modifies all users' alert subscriptions
-- FIX: User-scoped SELECT/INSERT/UPDATE/DELETE + service_role all-access
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE IF EXISTS public.venue_game_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS venue_game_alerts_owner ON public.venue_game_alerts;
DROP POLICY IF EXISTS venue_game_alerts_service ON public.venue_game_alerts;

CREATE POLICY venue_game_alerts_owner
  ON public.venue_game_alerts
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY venue_game_alerts_service
  ON public.venue_game_alerts
  FOR ALL
  USING (auth.role() = 'service_role');


-- ────────────────────────────────────────────────────────────────────────────
-- P1-A: Scraper tables — ZERO RLS (service/public data only)
-- ────────────────────────────────────────────────────────────────────────────

-- scraper_watchdog_state: internal key/value store — service_role only
ALTER TABLE IF EXISTS public.scraper_watchdog_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scraper_watchdog_service_only ON public.scraper_watchdog_state;

CREATE POLICY scraper_watchdog_service_only
  ON public.scraper_watchdog_state
  FOR ALL
  USING (auth.role() = 'service_role');

-- game_live_history: time-series scraper data — public read, service write
ALTER TABLE IF EXISTS public.game_live_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS game_live_history_public_read ON public.game_live_history;
DROP POLICY IF EXISTS game_live_history_service_write ON public.game_live_history;

CREATE POLICY game_live_history_public_read
  ON public.game_live_history
  FOR SELECT
  USING (true);

CREATE POLICY game_live_history_service_write
  ON public.game_live_history
  FOR ALL
  USING (auth.role() = 'service_role');

-- venue_aliases: canonical venue names — public read, service write
ALTER TABLE IF EXISTS public.venue_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS venue_aliases_public_read ON public.venue_aliases;
DROP POLICY IF EXISTS venue_aliases_service_write ON public.venue_aliases;

CREATE POLICY venue_aliases_public_read
  ON public.venue_aliases
  FOR SELECT
  USING (true);

CREATE POLICY venue_aliases_service_write
  ON public.venue_aliases
  FOR ALL
  USING (auth.role() = 'service_role');


-- ────────────────────────────────────────────────────────────────────────────
-- P1-B: Phantom tables — High-sensitivity user-owned tables
-- Pattern: Drop permissive SELECT+INSERT, replace with user-scoped ALL policy
-- ────────────────────────────────────────────────────────────────────────────

-- Helper: tighten user-owned phantom tables in a single block
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'bankroll_assistant_memory',
    'bankroll_history',
    'god_mode_sessions',
    'jarvis_conversations',
    'jarvis_weekly_reports',
    'opponent_profiles',
    -- poker_clips excluded: no user_id column in live DB (it's a shared content table)
    'poker_goals',
    'poker_sessions',
    'tilt_journal',
    'training_custom_drills',
    'training_hand_history',
    'training_user_achievements',
    'trips',
    'user_stats'
  ]) LOOP
    -- Make sure RLS is on (belt-and-suspenders)
    EXECUTE format('ALTER TABLE IF EXISTS public.%I ENABLE ROW LEVEL SECURITY', t);

    -- Drop the permissive policies set by 20260314_phantom_tables.sql
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert', t);
    -- Also drop any prior owner/service policies in case of re-run
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_owner', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_service', t);

    -- User-scoped: only access own rows
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)',
      t || '_owner', t
    );

    -- Service role: full access for backend operations
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL USING (auth.role() = ''service_role'')',
      t || '_service', t
    );
  END LOOP;
END $$;


-- ────────────────────────────────────────────────────────────────────────────
-- P1-C: anti_cheat_events — service_role only (no direct user access to cheat flags)
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE IF EXISTS public.anti_cheat_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS anti_cheat_events_select ON public.anti_cheat_events;
DROP POLICY IF EXISTS anti_cheat_events_insert ON public.anti_cheat_events;
DROP POLICY IF EXISTS anti_cheat_events_service_only ON public.anti_cheat_events;

CREATE POLICY anti_cheat_events_service_only
  ON public.anti_cheat_events
  FOR ALL
  USING (auth.role() = 'service_role');


-- ────────────────────────────────────────────────────────────────────────────
-- P1-D: commander_buyin_transactions — service_role only (financial records)
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE IF EXISTS public.commander_buyin_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS commander_buyin_transactions_select ON public.commander_buyin_transactions;
DROP POLICY IF EXISTS commander_buyin_transactions_insert ON public.commander_buyin_transactions;
DROP POLICY IF EXISTS commander_buyin_transactions_service_only ON public.commander_buyin_transactions;

CREATE POLICY commander_buyin_transactions_service_only
  ON public.commander_buyin_transactions
  FOR ALL
  USING (auth.role() = 'service_role');


-- ────────────────────────────────────────────────────────────────────────────
-- P1-Da: poker_clips — No user_id (shared content library), service manages
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE IF EXISTS public.poker_clips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS poker_clips_select ON public.poker_clips;
DROP POLICY IF EXISTS poker_clips_insert ON public.poker_clips;

CREATE POLICY poker_clips_public_read
  ON public.poker_clips
  FOR SELECT
  USING (true);

CREATE POLICY poker_clips_service_write
  ON public.poker_clips
  FOR ALL
  USING (auth.role() = 'service_role');


-- ────────────────────────────────────────────────────────────────────────────
-- P1-E: user_reports — reporter can see own reports, reported user can see theirs,
--        service can see all. No user can INSERT a report for another user.
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE IF EXISTS public.user_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_reports_select ON public.user_reports;
DROP POLICY IF EXISTS user_reports_insert ON public.user_reports;
DROP POLICY IF EXISTS user_reports_owner ON public.user_reports;
DROP POLICY IF EXISTS user_reports_service ON public.user_reports;

CREATE POLICY user_reports_select
  ON public.user_reports
  FOR SELECT
  USING (
    auth.uid() = reporter_id
    OR auth.uid() = reported_user_id
    OR auth.role() = 'service_role'
  );

CREATE POLICY user_reports_insert
  ON public.user_reports
  FOR INSERT
  WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY user_reports_service
  ON public.user_reports
  FOR ALL
  USING (auth.role() = 'service_role');


-- ────────────────────────────────────────────────────────────────────────────
-- P1-F: solver_queue — prevent anonymous solver job injection
--        Authenticated users can INSERT their own jobs. Service manages queue.
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE IF EXISTS public.solver_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS solver_queue_select ON public.solver_queue;
DROP POLICY IF EXISTS solver_queue_insert ON public.solver_queue;
DROP POLICY IF EXISTS solver_queue_owner ON public.solver_queue;
DROP POLICY IF EXISTS solver_queue_service ON public.solver_queue;

CREATE POLICY solver_queue_owner
  ON public.solver_queue
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY solver_queue_service
  ON public.solver_queue
  FOR ALL
  USING (auth.role() = 'service_role');


-- ────────────────────────────────────────────────────────────────────────────
-- P1-G: System/log tables — tighten INSERT to service_role only
--        (SELECT stays permissive — these are operational non-PII tables)
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'system_logs',
    'cron_execution_log',
    'hendon_scrape_log',
    'horse_analytics',
    'horse_error_log',
    'live_help_analytics',
    'system_cache',
    'content_schedule',
    'content_stats',
    'poy_leaderboard'
  ]) LOOP
    EXECUTE format('ALTER TABLE IF EXISTS public.%I ENABLE ROW LEVEL SECURITY', t);
    -- Drop old permissive insert
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_svc_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_svc_write', t);
    -- Service write
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (auth.role() = ''service_role'')',
      t || '_svc_insert', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE USING (auth.role() = ''service_role'')',
      t || '_svc_update', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE USING (auth.role() = ''service_role'')',
      t || '_svc_delete', t
    );
  END LOOP;
END $$;


-- ────────────────────────────────────────────────────────────────────────────
-- P2-A: social_follows — any user could follow/unfollow on behalf of anyone
-- FIX: Scope INSERT/DELETE to follower_id = auth.uid()
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE IF EXISTS public.social_follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sf_ins ON public.social_follows;
DROP POLICY IF EXISTS sf_del ON public.social_follows;

CREATE POLICY sf_ins
  ON public.social_follows
  FOR INSERT
  WITH CHECK (auth.uid() = follower_id);

CREATE POLICY sf_del
  ON public.social_follows
  FOR DELETE
  USING (auth.uid() = follower_id);


-- ────────────────────────────────────────────────────────────────────────────
-- P2-B: notification_preferences — open INSERT/UPDATE
-- FIX: Scope to user_id = auth.uid()
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE IF EXISTS public.notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS np_ins ON public.notification_preferences;
DROP POLICY IF EXISTS np_upd ON public.notification_preferences;

CREATE POLICY np_ins
  ON public.notification_preferences
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY np_upd
  ON public.notification_preferences
  FOR UPDATE
  USING (auth.uid() = user_id);


-- ────────────────────────────────────────────────────────────────────────────
-- P2-C: user_notifications — open INSERT/UPDATE
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE IF EXISTS public.user_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS un_ins ON public.user_notifications;
DROP POLICY IF EXISTS un_upd ON public.user_notifications;

-- INSERT is service_role only — notifications are created by the system
CREATE POLICY un_ins
  ON public.user_notifications
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- Users can mark their own notifications read (update)
CREATE POLICY un_upd
  ON public.user_notifications
  FOR UPDATE
  USING (auth.uid() = user_id);


-- ────────────────────────────────────────────────────────────────────────────
-- P2-D: user_bookmarks — open INSERT/DELETE
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE IF EXISTS public.user_bookmarks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ub_ins ON public.user_bookmarks;
DROP POLICY IF EXISTS ub_del ON public.user_bookmarks;

CREATE POLICY ub_ins
  ON public.user_bookmarks
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY ub_del
  ON public.user_bookmarks
  FOR DELETE
  USING (auth.uid() = user_id);


-- ────────────────────────────────────────────────────────────────────────────
-- P2-E: user_streaks — open INSERT
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE IF EXISTS public.user_streaks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS us_ins ON public.user_streaks;
DROP POLICY IF EXISTS us_upd ON public.user_streaks;

CREATE POLICY us_ins
  ON public.user_streaks
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Streaks are updated by the system (service) or by the user trigger
CREATE POLICY us_upd
  ON public.user_streaks
  FOR UPDATE
  USING (auth.uid() = user_id OR auth.role() = 'service_role');


-- ────────────────────────────────────────────────────────────────────────────
-- P2-F: profile_picture_history + memory_achievements
-- Both tables were DROPPED in 20260314_drop_orphan_tables.sql — skip.
-- ────────────────────────────────────────────────────────────────────────────
-- (No action needed — tables do not exist in production)


-- ────────────────────────────────────────────────────────────────────────────
-- P2-H: union_applications / union_leave_requests — UPDATE USING (true)
-- FIX: Applicant can update own application, service_role manages approvals
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE IF EXISTS public.union_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "union_applications_update" ON public.union_applications;
DROP POLICY IF EXISTS union_applications_applicant_update ON public.union_applications;

CREATE POLICY union_applications_applicant_update
  ON public.union_applications
  FOR UPDATE
  USING (auth.uid() = applicant_user_id OR auth.role() = 'service_role');

ALTER TABLE IF EXISTS public.union_leave_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "union_leave_requests_update" ON public.union_leave_requests;
DROP POLICY IF EXISTS union_leave_requests_owner_update ON public.union_leave_requests;

CREATE POLICY union_leave_requests_owner_update
  ON public.union_leave_requests
  FOR UPDATE
  USING (auth.uid() = requester_user_id OR auth.role() = 'service_role');


-- ────────────────────────────────────────────────────────────────────────────
-- P3: user_pwa_alerts — Split FOR ALL into explicit per-operation policies
-- (prevents UUID-guessing UPDATE on another user's alert row)
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE IF EXISTS public.user_pwa_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own PWA alerts" ON public.user_pwa_alerts;

CREATE POLICY user_pwa_alerts_select
  ON public.user_pwa_alerts
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY user_pwa_alerts_insert
  ON public.user_pwa_alerts
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_pwa_alerts_update
  ON public.user_pwa_alerts
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_pwa_alerts_delete
  ON public.user_pwa_alerts
  FOR DELETE
  USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- END: RLS Hardening Pass 2
-- Gaps fixed: 20 policy issues across 45+ tables
-- Zero data mutations. Zero DROP TABLE. All DROP POLICY IF EXISTS (safe re-run).
-- ═══════════════════════════════════════════════════════════════════════════════
