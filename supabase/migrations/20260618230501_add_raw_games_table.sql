-- Schema for raw_games, which replaces fct_games for tracker

CREATE TABLE IF NOT EXISTS public.raw_games (
    game_pk BIGINT UNIQUE NOT NULL,
    official_date DATE NOT NULL,
    start_time TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'Scheduled',
    away_team TEXT NOT NULL,
    home_team TEXT NOT NULL,
    away_score INT DEFAULT 0,
    home_score INT DEFAULT 0,
    inning TEXT,
    inning_state TEXT,
    live_win_prob_away NUMERIC,
    live_win_prob_home NUMERIC,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (game_pk)
);

ALTER TABLE public.raw_games ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read on raw_games" ON public.raw_games FOR SELECT USING (true);

-- Enable Realtime
BEGIN;
  -- remove the table if it is already in the publication
  ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.raw_games;
  -- add it back to ensure it is there
  ALTER PUBLICATION supabase_realtime ADD TABLE public.raw_games;
COMMIT;
