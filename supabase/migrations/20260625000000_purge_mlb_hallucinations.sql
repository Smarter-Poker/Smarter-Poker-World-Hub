-- Purge dummy records inserted by 20260618000009
DELETE FROM public.fct_games WHERE game_pk IN (999001, 999002);
DELETE FROM public.pred_props WHERE game_pk IN (999001, 999002);
DELETE FROM public.agg_model WHERE total_bets_tracked = 1254 AND recent_roi = 8.4;
