-- Phase 7 follow-up: Supabase default privileges may grant sequence usage even
-- when the owning table is service-role-only. Keep the identity sequence private.
REVOKE ALL ON SEQUENCE public.reels_delivery_metrics_id_seq
  FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.reels_delivery_metrics_id_seq
  TO service_role;
