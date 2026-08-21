-- ═══════════════════════════════════════════════════════════════════════
-- 20260821200000_user_avatar_stats.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2                              (1 = doc-only, 2 = additive, 3 = destructive)
-- AUTHOR:      Antigravity
-- AFFECTS:     tables: public.user_avatar_stats (new)
-- IRREVERSIBLE: no                            (see ROLLBACK at the bottom)
--
-- WHY:
--   Avatars are becoming RPG items ("Stat-Trak" avatars). We need to track
--   how many hands have been played, tournaments won, and biggest pots won
--   by a user while wearing a specific avatar.
--
-- HOW:
--   - user_avatar_stats(user_id, avatar_id) with unique constraint.
--   - avatar_id is text because preset avatars use string IDs ("free-animal-001") 
--     and custom avatars use UUIDs.
--   - FK to auth.users ON DELETE CASCADE.
--   - RLS: Only the user can read their own stats. Server handles writing.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'user_avatar_stats'
    ) THEN
        RAISE NOTICE 'pre-flight: user_avatar_stats already exists; this is a no-op';
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.user_avatar_stats (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    avatar_id     text NOT NULL,
    hands_played  bigint NOT NULL DEFAULT 0,
    tourneys_won  integer NOT NULL DEFAULT 0,
    biggest_pot   bigint NOT NULL DEFAULT 0,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT user_avatar_stats_unique UNIQUE (user_id, avatar_id)
);

COMMENT ON TABLE public.user_avatar_stats IS
    'RPG progression stats tracked for each specific avatar a user equips.';

CREATE INDEX IF NOT EXISTS user_avatar_stats_user_idx
    ON public.user_avatar_stats (user_id, avatar_id);

ALTER TABLE public.user_avatar_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_avatar_stats_select_own ON public.user_avatar_stats;
CREATE POLICY user_avatar_stats_select_own
    ON public.user_avatar_stats FOR SELECT
    TO authenticated
    USING (user_id = (SELECT auth.uid()));

GRANT SELECT ON public.user_avatar_stats TO authenticated;

-- Function and trigger to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION public.set_current_timestamp_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_user_avatar_stats_updated_at ON public.user_avatar_stats;
CREATE TRIGGER set_user_avatar_stats_updated_at
BEFORE UPDATE ON public.user_avatar_stats
FOR EACH ROW
EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- Provide a server-side RPC for upserting stats
CREATE OR REPLACE FUNCTION public.increment_avatar_stats(
    p_user_id uuid,
    p_avatar_id text,
    p_hands_played int DEFAULT 0,
    p_tourneys_won int DEFAULT 0,
    p_pot_won bigint DEFAULT 0
) RETURNS void AS $$
BEGIN
    INSERT INTO public.user_avatar_stats (user_id, avatar_id, hands_played, tourneys_won, biggest_pot)
    VALUES (p_user_id, p_avatar_id, p_hands_played, p_tourneys_won, p_pot_won)
    ON CONFLICT (user_id, avatar_id) DO UPDATE SET
        hands_played = user_avatar_stats.hands_played + p_hands_played,
        tourneys_won = user_avatar_stats.tourneys_won + p_tourneys_won,
        biggest_pot = GREATEST(user_avatar_stats.biggest_pot, p_pot_won);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;

-- ROLLBACK:
-- DROP TABLE IF EXISTS public.user_avatar_stats CASCADE;
-- DROP FUNCTION IF EXISTS public.increment_avatar_stats;
