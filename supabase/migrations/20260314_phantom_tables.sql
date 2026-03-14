-- ════════════════════════════════════════════════════════════════════════════════
--  PHANTOM TABLE CREATION — Smarter Poker World Hub
--  43 tables referenced in code but missing from Supabase
--  Generated: 2026-03-14
-- ════════════════════════════════════════════════════════════════════════════════

-- NOTE: avatars, images, uploads, messenger_media are STORAGE BUCKETS, not tables.
-- They use supabase.storage.from(), which is correct. No table creation needed.

-- ── active_tables ────────────────────────────────────────────
-- Referenced by: pages/api/club-arena/table-chat.js
CREATE TABLE IF NOT EXISTS public.active_tables (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  club_id uuid REFERENCES public.clubs(id) ON DELETE CASCADE,
  table_id uuid REFERENCES public.tables(id) ON DELETE CASCADE,
  game_type text,
  stakes text,
  player_count integer DEFAULT 0,
  max_players integer DEFAULT 9,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ── anti_cheat_events ────────────────────────────────────────
-- Referenced by: pages/api/club-arena/anti-cheat.js (5 refs)
CREATE TABLE IF NOT EXISTS public.anti_cheat_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  club_id uuid REFERENCES public.clubs(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  severity text DEFAULT 'low',
  details jsonb DEFAULT '{}',
  ip_address text,
  resolved boolean DEFAULT false,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- ── arcade_duels ─────────────────────────────────────────────
-- Referenced by: pages/api/arcade/find-duel.js
CREATE TABLE IF NOT EXISTS public.arcade_duels (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  player1_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  player2_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  game_mode text NOT NULL,
  status text DEFAULT 'waiting',
  winner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  player1_score integer DEFAULT 0,
  player2_score integer DEFAULT 0,
  stakes integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

-- ── arena_matches ────────────────────────────────────────────
-- Referenced by: src/lib/personal-assistant/contextAuthority.js
CREATE TABLE IF NOT EXISTS public.arena_matches (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  opponent_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  match_type text,
  result text,
  score integer DEFAULT 0,
  details jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- ── bankroll_assistant_memory ────────────────────────────────
-- Referenced by: src/lib/bankroll/locationMemory.ts (3 refs)
CREATE TABLE IF NOT EXISTS public.bankroll_assistant_memory (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  memory_type text NOT NULL,
  content jsonb DEFAULT '{}',
  location_id uuid,
  context text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ── bankroll_history ─────────────────────────────────────────
-- Referenced by: src/world/components/Jarvis/BankrollSync.tsx
CREATE TABLE IF NOT EXISTS public.bankroll_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  balance numeric DEFAULT 0,
  change_amount numeric DEFAULT 0,
  source text,
  notes text,
  snapshot_date date DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now()
);

-- ── commander_buyin_transactions ─────────────────────────────
-- Referenced by: pages/api/commander/sessions/[id]/buyin.js
CREATE TABLE IF NOT EXISTS public.commander_buyin_transactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL,
  player_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  venue_id uuid,
  amount numeric DEFAULT 0,
  chip_count integer DEFAULT 0,
  transaction_type text DEFAULT 'buyin',
  payment_method text,
  created_at timestamptz DEFAULT now()
);

-- ── commander_sessions ───────────────────────────────────────
-- Referenced by: pages/api/commander/reports/export.js
CREATE TABLE IF NOT EXISTS public.commander_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id uuid,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  table_id uuid,
  game_type text,
  stakes text,
  buy_in numeric DEFAULT 0,
  cash_out numeric DEFAULT 0,
  duration_minutes integer DEFAULT 0,
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz,
  status text DEFAULT 'active'
);

-- ── content_schedule ─────────────────────────────────────────
-- Referenced by: src/content-engine/ContentScheduler.js
CREATE TABLE IF NOT EXISTS public.content_schedule (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  content_type text NOT NULL,
  content_id uuid,
  scheduled_at timestamptz NOT NULL,
  published_at timestamptz,
  status text DEFAULT 'scheduled',
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- ── content_stats ────────────────────────────────────────────
-- Referenced by: src/content-engine/admin/HorsesAdmin.jsx
CREATE TABLE IF NOT EXISTS public.content_stats (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  content_type text NOT NULL,
  content_id uuid,
  views integer DEFAULT 0,
  likes integer DEFAULT 0,
  shares integer DEFAULT 0,
  comments integer DEFAULT 0,
  engagement_rate numeric DEFAULT 0,
  recorded_at date DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now()
);

-- ── cron_execution_log ───────────────────────────────────────
-- Referenced by: src/lib/club-arena/utcCronWrapper.js (2 refs)
CREATE TABLE IF NOT EXISTS public.cron_execution_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  job_name text NOT NULL,
  status text DEFAULT 'running',
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  result jsonb DEFAULT '{}',
  error text,
  duration_ms integer
);

-- ── god_mode_sessions ────────────────────────────────────────
-- Referenced by: pages/api/god-mode/submit-action.js
CREATE TABLE IF NOT EXISTS public.god_mode_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_type text,
  scenario_id text,
  actions jsonb DEFAULT '[]',
  score integer DEFAULT 0,
  completed boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ── hendon_scrape_log ────────────────────────────────────────
-- Referenced by: pages/api/cron/hendon-scraper.js (2 refs)
CREATE TABLE IF NOT EXISTS public.hendon_scrape_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  scrape_type text NOT NULL,
  url text,
  records_found integer DEFAULT 0,
  records_inserted integer DEFAULT 0,
  status text DEFAULT 'success',
  error text,
  duration_ms integer,
  created_at timestamptz DEFAULT now()
);

-- ── horse_analytics ──────────────────────────────────────────
-- Referenced by: src/content-engine/pipeline/HorseAlertingService.js
CREATE TABLE IF NOT EXISTS public.horse_analytics (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  horse_id text,
  metric_type text NOT NULL,
  metric_value numeric DEFAULT 0,
  details jsonb DEFAULT '{}',
  recorded_at timestamptz DEFAULT now()
);

-- ── horse_error_log ──────────────────────────────────────────
-- Referenced by: src/content-engine/pipeline/HorseAlertingService.js (3 refs)
CREATE TABLE IF NOT EXISTS public.horse_error_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  horse_id text,
  error_type text NOT NULL,
  error_message text,
  stack_trace text,
  context jsonb DEFAULT '{}',
  resolved boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- ── jarvis_conversations ─────────────────────────────────────
-- Referenced by: src/world/components/Jarvis/useConversationMemory.ts (3 refs)
CREATE TABLE IF NOT EXISTS public.jarvis_conversations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text,
  messages jsonb DEFAULT '[]',
  context jsonb DEFAULT '{}',
  model text DEFAULT 'gpt-4',
  token_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ── jarvis_weekly_reports ────────────────────────────────────
-- Referenced by: pages/api/cron/training-daily-report.js
CREATE TABLE IF NOT EXISTS public.jarvis_weekly_reports (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  report_type text DEFAULT 'weekly',
  period_start date,
  period_end date,
  summary jsonb DEFAULT '{}',
  insights jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now()
);

-- ── live_help_analytics ──────────────────────────────────────
-- Referenced by: pages/api/live-help/track-analytics.js
CREATE TABLE IF NOT EXISTS public.live_help_analytics (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  details jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- ── live_help_reactions ──────────────────────────────────────
-- Referenced by: pages/api/live-help/react.js (2 refs)
CREATE TABLE IF NOT EXISTS public.live_help_reactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id uuid NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  reaction text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(message_id, user_id, reaction)
);

-- ── messenger_labels ─────────────────────────────────────────
-- Referenced by: SmarterPokerMessenger.jsx, ClubArenaMessenger.jsx
CREATE TABLE IF NOT EXISTS public.messenger_labels (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(message_id, user_id, label)
);

-- ── messenger_themes ─────────────────────────────────────────
-- Referenced by: SmarterPokerMessenger.jsx, ClubArenaMessenger.jsx
CREATE TABLE IF NOT EXISTS public.messenger_themes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  theme_value text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(conversation_id, user_id)
);

-- ── opponent_profiles ────────────────────────────────────────
-- Referenced by: src/world/components/Jarvis/OpponentProfiler.tsx
CREATE TABLE IF NOT EXISTS public.opponent_profiles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  opponent_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  opponent_name text,
  play_style text,
  tendencies jsonb DEFAULT '{}',
  notes text,
  hands_observed integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ── poker_clips ──────────────────────────────────────────────
-- Referenced by: pages/api/admin/debug-clips.js, pages/api/cron/horses-batch-91-99.js
CREATE TABLE IF NOT EXISTS public.poker_clips (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  source_type text,
  source_url text,
  title text,
  description text,
  thumbnail_url text,
  duration_seconds integer,
  tags text[],
  last_used_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- ── poker_goals ──────────────────────────────────────────────
-- Referenced by: src/world/components/Jarvis/GoalTracker.tsx
CREATE TABLE IF NOT EXISTS public.poker_goals (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_type text NOT NULL,
  target_value numeric,
  current_value numeric DEFAULT 0,
  deadline date,
  status text DEFAULT 'active',
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ── poker_sessions ───────────────────────────────────────────
-- Referenced by: src/lib/personal-assistant/contextAuthority.js (2 refs)
CREATE TABLE IF NOT EXISTS public.poker_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  venue_id uuid,
  game_type text,
  stakes text,
  buy_in numeric DEFAULT 0,
  cash_out numeric DEFAULT 0,
  duration_minutes integer DEFAULT 0,
  hands_played integer DEFAULT 0,
  notes text,
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz
);

-- ── poy_leaderboard ──────────────────────────────────────────
-- Referenced by: pages/api/news/leaderboard.js
CREATE TABLE IF NOT EXISTS public.poy_leaderboard (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  player_name text NOT NULL,
  player_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  points numeric DEFAULT 0,
  cashes integer DEFAULT 0,
  earnings numeric DEFAULT 0,
  rank integer,
  year integer DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
  source text,
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- ── social_post_comments ─────────────────────────────────────
-- Referenced by: src/content-engine/services/HorseConversationService.js
CREATE TABLE IF NOT EXISTS public.social_post_comments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id uuid NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  content text NOT NULL,
  parent_comment_id uuid,
  likes_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- ── solver_queue ─────────────────────────────────────────────
-- Referenced by: pages/api/training/solver-api.js
CREATE TABLE IF NOT EXISTS public.solver_queue (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  hand_data jsonb NOT NULL,
  solver_type text DEFAULT 'pio',
  status text DEFAULT 'queued',
  result jsonb,
  priority integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

-- ── system_cache ─────────────────────────────────────────────
-- Referenced by: pages/api/cron/refresh-venue-json.js
CREATE TABLE IF NOT EXISTS public.system_cache (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  cache_key text UNIQUE NOT NULL,
  cache_value jsonb,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ── system_logs ──────────────────────────────────────────────
-- Referenced by: pages/api/cron/content-health-check.js
CREATE TABLE IF NOT EXISTS public.system_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  log_level text DEFAULT 'info',
  source text,
  message text NOT NULL,
  details jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- ── tilt_journal ─────────────────────────────────────────────
-- Referenced by: src/world/components/Jarvis/TiltJournal.tsx (3 refs)
CREATE TABLE IF NOT EXISTS public.tilt_journal (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_type text,
  mood text,
  trigger_event text,
  reflection text,
  action_taken text,
  intensity integer DEFAULT 5,
  created_at timestamptz DEFAULT now()
);

-- ── training_custom_drills ───────────────────────────────────
-- Referenced by: pages/hub/training/drill-builder.js (2 refs)
CREATE TABLE IF NOT EXISTS public.training_custom_drills (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  drill_type text,
  config jsonb DEFAULT '{}',
  difficulty text DEFAULT 'medium',
  is_public boolean DEFAULT false,
  plays_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ── training_events ──────────────────────────────────────────
-- Referenced by: src/engine/CentralBus.js
CREATE TABLE IF NOT EXISTS public.training_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  event_data jsonb DEFAULT '{}',
  session_id uuid,
  created_at timestamptz DEFAULT now()
);

-- ── training_hand_history ────────────────────────────────────
-- Referenced by: src/components/bankroll/SessionHandReview.jsx (2 refs)
CREATE TABLE IF NOT EXISTS public.training_hand_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id uuid,
  hand_number integer,
  hole_cards text,
  board text,
  position text,
  action_sequence jsonb DEFAULT '[]',
  result numeric DEFAULT 0,
  notes text,
  analysis jsonb DEFAULT '{}',
  played_at timestamptz DEFAULT now()
);

-- ── training_user_achievements ───────────────────────────────
-- Referenced by: pages/api/training/achievements.js (3 refs), pages/api/jarvis/user-insights.js
CREATE TABLE IF NOT EXISTS public.training_user_achievements (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id uuid REFERENCES public.training_achievement_definitions(id) ON DELETE CASCADE,
  achievement_key text,
  progress numeric DEFAULT 0,
  target numeric DEFAULT 1,
  unlocked boolean DEFAULT false,
  unlocked_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- ── trips ────────────────────────────────────────────────────
-- Referenced by: pages/api/bankroll/tax-report.js, src/components/bankroll/TripROICalculator.jsx
CREATE TABLE IF NOT EXISTS public.trips (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  venue_name text,
  venue_id uuid,
  location text,
  start_date date,
  end_date date,
  total_buy_in numeric DEFAULT 0,
  total_cash_out numeric DEFAULT 0,
  profit numeric DEFAULT 0,
  sessions_count integer DEFAULT 0,
  expenses numeric DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- ── user_reports ─────────────────────────────────────────────
-- Referenced by: pages/hub/user/[username].js
CREATE TABLE IF NOT EXISTS public.user_reports (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reported_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL,
  details text,
  status text DEFAULT 'pending',
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- ── user_stats ───────────────────────────────────────────────
-- Referenced by: pages/hub/settings.js
CREATE TABLE IF NOT EXISTS public.user_stats (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  total_hands integer DEFAULT 0,
  total_sessions integer DEFAULT 0,
  total_profit numeric DEFAULT 0,
  win_rate numeric DEFAULT 0,
  biggest_win numeric DEFAULT 0,
  biggest_loss numeric DEFAULT 0,
  favorite_game text,
  updated_at timestamptz DEFAULT now()
);

-- ════════════════════════════════════════════════════════════════════════════════
--  Enable RLS on all new tables (permissive for now)
-- ════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'active_tables','anti_cheat_events','arcade_duels','arena_matches',
    'bankroll_assistant_memory','bankroll_history','commander_buyin_transactions',
    'commander_sessions','content_schedule','content_stats','cron_execution_log',
    'god_mode_sessions','hendon_scrape_log','horse_analytics','horse_error_log',
    'jarvis_conversations','jarvis_weekly_reports','live_help_analytics',
    'live_help_reactions','messenger_labels','messenger_themes','opponent_profiles',
    'poker_clips','poker_goals','poker_sessions','poy_leaderboard',
    'social_post_comments','solver_queue','system_cache','system_logs',
    'tilt_journal','training_custom_drills','training_events','training_hand_history',
    'training_user_achievements','trips','user_reports','user_stats'
  ]) LOOP
    EXECUTE format('ALTER TABLE IF EXISTS public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('
      DO $p$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename=%L AND policyname=%L) THEN
          CREATE POLICY %I ON public.%I FOR SELECT USING (true);
        END IF;
      END $p$;
    ', t, t || '_select', t || '_select', t);
    EXECUTE format('
      DO $p$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename=%L AND policyname=%L) THEN
          CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (true);
        END IF;
      END $p$;
    ', t, t || '_insert', t || '_insert', t);
  END LOOP;
END $$;
