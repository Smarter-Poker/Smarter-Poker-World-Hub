-- Migration: Mystery Bounty Audit Trail
-- 2026-03-09

CREATE TABLE IF NOT EXISTS public.tournament_mystery_draws (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id UUID NOT NULL REFERENCES public.club_tournaments(id) ON DELETE CASCADE,
    eliminator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    eliminated_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL,
    tier_label TEXT NOT NULL,
    multiplier NUMERIC NOT NULL,
    remaining_envelopes JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Index for fast lookup by tournament
CREATE INDEX IF NOT EXISTS idx_tournament_mystery_draws_tourn_id ON public.tournament_mystery_draws(tournament_id);
