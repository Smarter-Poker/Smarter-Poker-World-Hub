-- Phase 1 / 4: Cold Archiving Materialized View
-- Created by ORB-7 for Club Arena Leaderboards & Stats
CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_hand_histories AS
SELECT 
    id, 
    hand_number, 
    variant, 
    pot_total, 
    player_ids, 
    winner_ids, 
    hand_data, 
    rake, 
    completed_at, 
    club_id
FROM public.hand_histories;

-- Required for Concurrent Refreshes
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_hand_histories_id ON public.mv_hand_histories (id);

-- Query optimizations for ORB-7 Stats
CREATE INDEX IF NOT EXISTS idx_mv_hand_histories_club_id ON public.mv_hand_histories (club_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_mv_hand_histories_player_ids ON public.mv_hand_histories USING GIN (player_ids);
