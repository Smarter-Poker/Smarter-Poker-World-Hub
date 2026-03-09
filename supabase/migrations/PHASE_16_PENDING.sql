-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 16 PENDING MIGRATIONS
-- Run this entire file in the Supabase SQL Editor.
-- Tables: sticker_assets (Phase 16), geeves_missed_questions (Phase 16)
-- ═══════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════
-- PART 1: sticker_assets — GameCard sticker system
-- ════════════════════════════════════════════════════════
-- ============================================================
-- Smarter.Poker Club Arena Sticker Assets — Supabase SQL
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Create sticker_assets table if not exists
CREATE TABLE IF NOT EXISTS public.sticker_assets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key           text UNIQUE NOT NULL,
  label         text NOT NULL,
  category      text NOT NULL,
  storage_path  text NOT NULL,
  applies_to    text[] DEFAULT '{}',
  is_dynamic    boolean DEFAULT false,
  dynamic_field text,
  sort_order    int DEFAULT 0,
  created_at    timestamptz DEFAULT now()
);

-- 2. Seed all 38 stickers
INSERT INTO public.sticker_assets (key, label, category, storage_path, applies_to, is_dynamic, dynamic_field, sort_order)
VALUES
  ('2max_hu',        'Heads Up',          'cash',       'stickers/2max_hu.png',        ARRAY['cash'],             false, null, 10),
  ('6max',           '6-Max',             'cash',       'stickers/6max.png',            ARRAY['cash'],             false, null, 11),
  ('9max',           '9-Max',             'cash',       'stickers/9max.png',            ARRAY['cash'],             false, null, 12),
  ('straddle',       'Straddle',          'cash',       'stickers/straddle.png',        ARRAY['cash'],             false, null, 20),
  ('bomb_pot',       'Bomb Pots',         'cash',       'stickers/bomb_pot.png',        ARRAY['cash'],             false, null, 21),
  ('run_it_twice',   'Run It 2 or 3x',   'cash',       'stickers/run_it_twice.png',    ARRAY['cash'],             false, null, 22),
  ('insurance',      'Insurance',         'cash',       'stickers/insurance.png',       ARRAY['cash'],             false, null, 23),
  ('rabbit_hunt',    'Rabbit Hunt',       'cash',       'stickers/rabbit_hunt.png',     ARRAY['cash'],             false, null, 24),
  ('call_time',      'Call Time',         'cash',       'stickers/call_time.png',       ARRAY['cash'],             false, null, 25),
  ('call_time_game', 'Call Time Game',    'cash',       'stickers/call_time_game.png',  ARRAY['cash'],             false, null, 26),
  ('splash_pot',     'Splash Pot',        'cash',       'stickers/splash_pot.png',      ARRAY['cash'],             false, null, 27),
  ('fixed_limit',    'Fixed Limit',       'cash',       'stickers/fixed_limit.png',     ARRAY['cash'],             false, null, 30),
  ('deep_stack',     'Deep Stack',        'cash',       'stickers/deep_stack.png',      ARRAY['cash','tournament'],false, null, 40),
  ('super_deep',     'Super Deep',        'cash',       'stickers/super_deep.png',      ARRAY['cash','tournament'],false, null, 41),
  ('high_roller',    'High Roller',       'cash',       'stickers/high_roller.png',     ARRAY['cash','tournament'],false, null, 42),
  ('private_table',  'Private Table',     'access',     'stickers/private_table.png',   ARRAY['cash','tournament'],false, null, 50),
  ('password',       'Password',          'access',     'stickers/password.png',        ARRAY['cash','tournament'],false, null, 51),
  ('vip_only',       'VIP Only',          'access',     'stickers/vip_only.png',        ARRAY['cash','tournament'],false, null, 52),
  ('vpip_40',        'VPIP 40',           'vpip',       'stickers/vpip_40.png',         ARRAY['cash'],             false, null, 60),
  ('vpip_50',        'VPIP 50',           'vpip',       'stickers/vpip_50.png',         ARRAY['cash'],             false, null, 61),
  ('vpip_60',        'VPIP 60',           'vpip',       'stickers/vpip_60.png',         ARRAY['cash'],             false, null, 62),
  ('freezeout',      'Freezeout',         'tournament', 'stickers/freezeout.png',       ARRAY['tournament'],       false, null, 70),
  ('reentry',        'Re-Entry',          'tournament', 'stickers/reentry.png',         ARRAY['tournament'],       false, null, 71),
  ('freeroll',       'Freeroll',          'tournament', 'stickers/freeroll.png',        ARRAY['tournament'],       false, null, 72),
  ('satellite',      'Satellite',         'tournament', 'stickers/satellite.png',       ARRAY['tournament'],       false, null, 73),
  ('ticket_only',    'Ticket Only',       'tournament', 'stickers/ticket_only.png',     ARRAY['tournament'],       false, null, 74),
  ('addon',          'Add-On',            'tournament', 'stickers/addon.png',           ARRAY['tournament'],       false, null, 75),
  ('turbo',          'Turbo',             'tournament', 'stickers/turbo.png',           ARRAY['tournament'],       false, null, 80),
  ('hyper_turbo',    'Hyper Turbo',       'tournament', 'stickers/hyper_turbo.png',     ARRAY['tournament'],       false, null, 81),
  ('bounty',         'Bounty',            'tournament', 'stickers/bounty.png',          ARRAY['tournament'],       false, null, 90),
  ('pko',            'PKO',               'tournament', 'stickers/pko.png',             ARRAY['tournament'],       false, null, 91),
  ('mystery_bounty', 'Mystery Bounty',    'tournament', 'stickers/mystery_bounty.png',  ARRAY['tournament'],       false, null, 92),
  ('shootout',       'Shootout',          'tournament', 'stickers/shootout.png',        ARRAY['tournament'],       false, null, 100),
  ('guaranteed',     'Guaranteed',        'tournament', 'stickers/guaranteed.png',      ARRAY['tournament'],       true,  'gtd_amount', 110),
  ('live',           'Live',              'status',     'stickers/live.png',            ARRAY['cash','tournament'],false, null, 120),
  ('registering',    'Registering',       'status',     'stickers/registering.png',     ARRAY['tournament'],       false, null, 121),
  ('starting_soon',  'Starting Soon',     'status',     'stickers/starting_soon.png',   ARRAY['tournament'],       false, null, 122),
  ('sold_out',       'Sold Out',          'status',     'stickers/sold_out.png',        ARRAY['tournament'],       false, null, 123)
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  category = EXCLUDED.category,
  storage_path = EXCLUDED.storage_path,
  applies_to = EXCLUDED.applies_to,
  is_dynamic = EXCLUDED.is_dynamic,
  dynamic_field = EXCLUDED.dynamic_field,
  sort_order = EXCLUDED.sort_order;

-- 3. RLS
ALTER TABLE public.sticker_assets ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'sticker_assets' AND policyname = 'sticker_assets_public_read'
  ) THEN
    CREATE POLICY "sticker_assets_public_read" ON public.sticker_assets FOR SELECT USING (true);
  END IF;
END $$;

SELECT category, count(*) as total FROM public.sticker_assets GROUP BY category ORDER BY category;


-- ════════════════════════════════════════════════════════
-- PART 2: geeves_auto_learning — Geeves missed question KB
-- ════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════════════════════
-- Geeves Auto-Learning System — Full SQL Package
-- Run this in Supabase SQL Editor (or via CLI)
-- Includes: table, indexes, RLS, and 2 RPCs used by chat.js
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Table ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS geeves_missed_questions (
  id            BIGSERIAL    PRIMARY KEY,
  question      TEXT         NOT NULL,
  question_hash TEXT         NOT NULL,
  page          TEXT,
  asked_count   INT          NOT NULL DEFAULT 1,
  first_asked   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  last_asked    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  resolved      BOOLEAN      NOT NULL DEFAULT FALSE,
  added_to_kb   BOOLEAN      NOT NULL DEFAULT FALSE,
  grok_answer   TEXT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Unique on hash for ON CONFLICT upsert
CREATE UNIQUE INDEX IF NOT EXISTS geeves_mq_hash_idx
  ON geeves_missed_questions (question_hash);

-- Speed up top-missed queries (analytics dashboard)
CREATE INDEX IF NOT EXISTS geeves_mq_count_idx
  ON geeves_missed_questions (asked_count DESC, resolved)
  WHERE resolved = FALSE;

-- ── 2. RLS ────────────────────────────────────────────────────────────────
ALTER TABLE geeves_missed_questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_only" ON geeves_missed_questions;
CREATE POLICY "service_role_only" ON geeves_missed_questions
  USING (false) WITH CHECK (false);

-- ── 3. RPC: geeves_upsert_missed_question ─────────────────────────────────
-- Primary function called from chat.js Step 4.
-- Inserts on first ask, increments asked_count on repeat asks.
-- Security: SECURITY DEFINER so service_role can bypass RLS.
CREATE OR REPLACE FUNCTION geeves_upsert_missed_question(
  p_question   TEXT,
  p_hash       TEXT,
  p_page       TEXT     DEFAULT NULL,
  p_grok_answer TEXT    DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO geeves_missed_questions
    (question, question_hash, page, grok_answer, asked_count, first_asked, last_asked)
  VALUES
    (p_question, p_hash, p_page, LEFT(p_grok_answer, 2000), 1, now(), now())
  ON CONFLICT (question_hash) DO UPDATE
    SET asked_count = geeves_missed_questions.asked_count + 1,
        last_asked  = now(),
        -- Update grok_answer only if we have a newer one (not null)
        grok_answer = COALESCE(LEFT(EXCLUDED.grok_answer, 2000), geeves_missed_questions.grok_answer),
        page        = COALESCE(EXCLUDED.page, geeves_missed_questions.page);
END;
$$;

-- ── 4. RPC: geeves_increment_missed_count ─────────────────────────────────
-- Fallback function: called when INSERT returns a 23505 conflict
-- and the primary RPC wasn't available yet.
CREATE OR REPLACE FUNCTION geeves_increment_missed_count(
  p_hash        TEXT,
  p_grok_answer TEXT    DEFAULT NULL,
  p_page        TEXT    DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE geeves_missed_questions
  SET asked_count = asked_count + 1,
      last_asked  = now(),
      grok_answer = COALESCE(LEFT(p_grok_answer, 2000), grok_answer),
      page        = COALESCE(p_page, page)
  WHERE question_hash = p_hash;
END;
$$;

-- ── 5. Grant execute to service_role ──────────────────────────────────────
GRANT EXECUTE ON FUNCTION geeves_upsert_missed_question TO service_role;
GRANT EXECUTE ON FUNCTION geeves_increment_missed_count TO service_role;
