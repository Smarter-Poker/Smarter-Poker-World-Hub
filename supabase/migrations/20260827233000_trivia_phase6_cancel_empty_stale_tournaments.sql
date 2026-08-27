-- Retire abandoned empty tournament shells without touching any tournament
-- that accepted an entry, collected a fee, or built a prize pool.
BEGIN;

UPDATE public.trivia_tournaments t
   SET status = 'cancelled',
       completed_at = COALESCE(completed_at, now())
 WHERE status = 'active'
   AND COALESCE(ends_at,end_time) < now() - interval '7 days'
   AND COALESCE(current_players,0) = 0
   AND COALESCE(prize_pool,0) = 0
   AND NOT EXISTS (
       SELECT 1 FROM public.trivia_tournament_entries e
        WHERE e.tournament_id = t.id
   );

COMMIT;
