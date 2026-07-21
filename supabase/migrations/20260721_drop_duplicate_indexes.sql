-- Task #57: drop byte-identical duplicate indexes/constraints (all non-CA social/
-- streaming tables). Applied to prod via Supabase MCP 2026-07-21.
-- Verified: no FK depends on any dropped unique constraint. One index/constraint of
-- each pair is kept (canonical auto-named _key, or the more descriptive _id index).
ALTER TABLE public.blocked_users DROP CONSTRAINT IF EXISTS blocked_users_blocker_blocked_uniq;
ALTER TABLE public.live_bans     DROP CONSTRAINT IF EXISTS live_bans_stream_user_unique;
ALTER TABLE public.live_pins     DROP CONSTRAINT IF EXISTS live_pins_stream_id_unique;
DROP INDEX IF EXISTS public.idx_diamond_tx_reference_id;   -- keep idx_diamond_transactions_reference_id
DROP INDEX IF EXISTS public.idx_live_gifts_receiver;       -- keep idx_live_gifts_receiver_id
DROP INDEX IF EXISTS public.idx_live_gifts_sender;         -- keep idx_live_gifts_sender_id
