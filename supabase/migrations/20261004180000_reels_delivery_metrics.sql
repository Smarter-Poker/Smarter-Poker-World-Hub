-- Phase 7: privacy-bounded client delivery measurements for UX/OPS-06.
CREATE TABLE IF NOT EXISTS public.reels_delivery_metrics (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  measured_at timestamptz NOT NULL DEFAULT now(),
  surface text NOT NULL CHECK (surface IN ('standalone','social','library')),
  feed_mode text NOT NULL CHECK (feed_mode IN ('for-you','following','latest','learning','shorts')),
  viewport_width integer NOT NULL CHECK (viewport_width BETWEEN 240 AND 10000),
  startup_ms integer CHECK (startup_ms BETWEEN 0 AND 120000),
  dropped_frames integer CHECK (dropped_frames BETWEEN 0 AND 1000000),
  decoded_frames integer CHECK (decoded_frames BETWEEN 0 AND 100000000),
  memory_mb numeric(10,2) CHECK (memory_mb BETWEEN 0 AND 100000),
  transferred_kb numeric(12,2) CHECK (transferred_kb BETWEEN 0 AND 10000000),
  battery_level numeric(4,3) CHECK (battery_level BETWEEN 0 AND 1),
  data_saver boolean NOT NULL DEFAULT false,
  playback_type text CHECK (playback_type IN ('youtube_embed','native','unknown'))
);

CREATE INDEX IF NOT EXISTS reels_delivery_metrics_measured_idx
  ON public.reels_delivery_metrics(measured_at DESC, surface, feed_mode);

ALTER TABLE public.reels_delivery_metrics ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reels_delivery_metrics FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.reels_delivery_metrics TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.reels_delivery_metrics_id_seq TO service_role;

COMMENT ON TABLE public.reels_delivery_metrics IS
  'Phase 7 aggregate delivery measurements. Stores no user, reel, session, IP, URL, or device identifier.';
