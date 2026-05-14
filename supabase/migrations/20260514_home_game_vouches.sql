-- =====================================================================
-- Home Game Vouches System
-- Adds vouch_count to commander_home_groups + dedicated vouch table.
-- vouch_count is server-maintained via trigger (not directly user-writable).
-- =====================================================================

-- 1. Add vouch_count column to commander_home_groups
ALTER TABLE public.commander_home_groups
    ADD COLUMN IF NOT EXISTS vouch_count INTEGER NOT NULL DEFAULT 0;

-- 2. Create the home_game_vouches table (one vouch per user per group)
CREATE TABLE IF NOT EXISTS public.home_game_vouches (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id    UUID NOT NULL REFERENCES public.commander_home_groups(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (group_id, user_id)
);

-- 3. Index for fast "who vouched for this group?" lookups
CREATE INDEX IF NOT EXISTS idx_home_game_vouches_group_id ON public.home_game_vouches (group_id);
CREATE INDEX IF NOT EXISTS idx_home_game_vouches_user_id  ON public.home_game_vouches (user_id);

-- 4. Trigger function: keep vouch_count in sync atomically
CREATE OR REPLACE FUNCTION public.fn_sync_home_game_vouch_count()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.commander_home_groups
           SET vouch_count = vouch_count + 1
         WHERE id = NEW.group_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.commander_home_groups
           SET vouch_count = GREATEST(0, vouch_count - 1)
         WHERE id = OLD.group_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_home_game_vouch_count ON public.home_game_vouches;
CREATE TRIGGER trg_sync_home_game_vouch_count
AFTER INSERT OR DELETE ON public.home_game_vouches
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_home_game_vouch_count();

-- 5. Lock vouch_count from direct user updates (extend stat lockdown trigger)
-- vouch_count is now blocked alongside quality_score and vitality_score
-- by the existing fn_enforce_home_group_stat_lockdown trigger ONLY if we extend it.
-- We patch the function here (idempotent CREATE OR REPLACE).
CREATE OR REPLACE FUNCTION public.fn_enforce_home_group_stat_lockdown()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE v_role text := current_user;
BEGIN
  IF v_role IN ('postgres','supabase_admin','service_role',
                'supabase_auth_admin','supabase_storage_admin') THEN
    RETURN NEW;
  END IF;
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;
  IF NEW.quality_score IS DISTINCT FROM OLD.quality_score THEN
    RAISE EXCEPTION 'IMMUTABLE_OR_COMPUTED_FIELD'
          USING HINT = 'quality_score is computed server-side by the ranking job';
  END IF;
  IF NEW.vitality_score IS DISTINCT FROM OLD.vitality_score THEN
    RAISE EXCEPTION 'IMMUTABLE_OR_COMPUTED_FIELD'
          USING HINT = 'vitality_score is computed server-side by the vitality job';
  END IF;
  IF NEW.vitality_refreshed_at IS DISTINCT FROM OLD.vitality_refreshed_at THEN
    RAISE EXCEPTION 'IMMUTABLE_OR_COMPUTED_FIELD'
          USING HINT = 'vitality_refreshed_at is set by the vitality-refresh job';
  END IF;
  IF NEW.vouch_count IS DISTINCT FROM OLD.vouch_count THEN
    RAISE EXCEPTION 'IMMUTABLE_OR_COMPUTED_FIELD'
          USING HINT = 'vouch_count is maintained by the vouch trigger';
  END IF;
  IF NEW.promotion_approved_at IS DISTINCT FROM OLD.promotion_approved_at THEN
    RAISE EXCEPTION 'IMMUTABLE_OR_COMPUTED_FIELD'
          USING HINT = 'promotion_approved_at is set by the club-promotion approval flow';
  END IF;
  IF NEW.promotion_requested_at IS DISTINCT FROM OLD.promotion_requested_at THEN
    RAISE EXCEPTION 'IMMUTABLE_OR_COMPUTED_FIELD'
          USING HINT = 'promotion_requested_at is set by request_home_group_promotion RPC';
  END IF;
  IF NEW.inactivity_hidden_sent_at IS DISTINCT FROM OLD.inactivity_hidden_sent_at THEN
    RAISE EXCEPTION 'IMMUTABLE_OR_COMPUTED_FIELD'
          USING HINT = 'inactivity_hidden_sent_at is set by the dormancy-hide job';
  END IF;
  IF NEW.inactivity_warning_sent_at IS DISTINCT FROM OLD.inactivity_warning_sent_at THEN
    RAISE EXCEPTION 'IMMUTABLE_OR_COMPUTED_FIELD'
          USING HINT = 'inactivity_warning_sent_at is set by the dormancy-warning job';
  END IF;
  RETURN NEW;
END;
$$;

-- 6. RLS — authenticated users can see all vouches; only own vouch for insert/delete
ALTER TABLE public.home_game_vouches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read vouches"        ON public.home_game_vouches;
DROP POLICY IF EXISTS "Authenticated users can vouch"  ON public.home_game_vouches;
DROP POLICY IF EXISTS "Users can remove own vouch"     ON public.home_game_vouches;

CREATE POLICY "Anyone can read vouches"
    ON public.home_game_vouches FOR SELECT USING (true);

CREATE POLICY "Authenticated users can vouch"
    ON public.home_game_vouches FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove own vouch"
    ON public.home_game_vouches FOR DELETE
    USING (auth.uid() = user_id);

-- 7. Backfill vouch_count for any existing vouches (safe to run even if table is empty)
UPDATE public.commander_home_groups g
   SET vouch_count = (
       SELECT COUNT(*) FROM public.home_game_vouches v WHERE v.group_id = g.id
   )
 WHERE TRUE;
