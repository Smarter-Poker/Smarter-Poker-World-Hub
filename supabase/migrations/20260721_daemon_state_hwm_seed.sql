-- Seed the RakebackSettler watermark to ~1h ago so the first run after deploy
-- processes only recently-unsettled records instead of re-scanning the full
-- 7-day fallback window (which would re-increment player_stats once). Applied to
-- prod via MCP as migration daemon_state_hwm_seed_20260721.
INSERT INTO public.daemon_state (daemon, high_water_mark)
VALUES ('rakeback_settler', now() - interval '1 hour')
ON CONFLICT (daemon) DO NOTHING;
