-- ═══════════════════════════════════════════════════════════════════════════
-- BUG FIX: Add live_pins to supabase_realtime publication + create
--          update_live_peak_viewers RPC that was referenced but never defined.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- BUGS FOUND (Deep Audit Pass 4):
--
-- 1. live_pins NOT in supabase_realtime publication (CRITICAL)
--    The viewer-side pin subscription at LiveStreamViewer.jsx:204 subscribes to
--    postgres_changes on live_pins but the table was never added to the
--    supabase_realtime publication. Result: ALL pin/unpin events are silently
--    dropped — viewers NEVER see pinned comments update in real-time.
--    Only live_streams, live_comments, live_viewers, and live_signaling were
--    added to the publication. live_pins was completely omitted.
--
-- 2. update_live_peak_viewers RPC referenced but never defined
--    LiveStreamService.js calls supabase.rpc('update_live_peak_viewers', ...)
--    at two sites (joinStream + _updateViewerCount). The RPC does not exist in
--    any migration — all calls throw a 404/PGRST202 error and fall through to
--    the catch block. The fallback in _updateViewerCount uses a direct UPDATE
--    with a .lt() guard so peak_viewers is still set correctly for the
--    broadcaster's debounced writes. However, the joinStream call at line 470
--    was intended to bump peak_viewers when a viewer joins — without the RPC,
--    peak_viewers is ONLY set during broadcaster-side debounced updates (every
--    5s minimum), not on each viewer join. This means analytics cards often
--    show 0 for peak_viewers on short streams where no debounce fired.
--    FIX: Create the RPC so both call sites work correctly.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Add live_pins to the realtime publication so postgres_changes events
--    are delivered to subscriber channels.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'live_pins'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.live_pins;
  END IF;
END $$;

-- 2. Create update_live_peak_viewers RPC.
--    Atomically updates peak_viewers only if the new count exceeds the current
--    value. Uses a conditional UPDATE to avoid unnecessary writes.
--    Called from:
--      - LiveStreamService.joinStream() — bump by 1 per viewer join
--      - LiveStreamService._updateViewerCount() — set actual room participant count
CREATE OR REPLACE FUNCTION public.update_live_peak_viewers(
    p_stream_id UUID,
    p_count      INTEGER
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.live_streams
    SET peak_viewers = p_count
    WHERE id = p_stream_id
      AND (peak_viewers IS NULL OR peak_viewers < p_count);
END;
$$;

-- Grant execution to authenticated and service_role users
GRANT EXECUTE ON FUNCTION public.update_live_peak_viewers(UUID, INTEGER)
    TO authenticated, service_role;

COMMIT;
