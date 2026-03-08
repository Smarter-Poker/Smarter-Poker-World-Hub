-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: BBJ club-level config + Union Leave Requests
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Add bbj_enabled column to clubs ─────────────────────────────────────
-- NULL = use platform default (enabled for eligible stakes/variants)
-- TRUE = explicitly enabled
-- FALSE = explicitly disabled for this club
ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS bbj_enabled BOOLEAN DEFAULT NULL;

COMMENT ON COLUMN public.clubs.bbj_enabled IS
  'Club-level BBJ override. NULL = platform default (on), FALSE = disabled, TRUE = explicitly on.';

-- ── 2. Create union_leave_requests table ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.union_leave_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  union_id            UUID NOT NULL REFERENCES public.unions(id) ON DELETE CASCADE,
  club_id             UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  requester_user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  club_name           TEXT NOT NULL,
  club_code           INTEGER,
  reason              TEXT,
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'approved', 'denied')),
  requested_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at         TIMESTAMPTZ,
  UNIQUE (club_id, status) DEFERRABLE INITIALLY DEFERRED
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_union_leave_requests_union_id    ON public.union_leave_requests(union_id);
CREATE INDEX IF NOT EXISTS idx_union_leave_requests_club_id     ON public.union_leave_requests(club_id);
CREATE INDEX IF NOT EXISTS idx_union_leave_requests_status      ON public.union_leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_union_leave_requests_requested   ON public.union_leave_requests(requested_at DESC);

-- ── 3. RLS for union_leave_requests ─────────────────────────────────────────
ALTER TABLE public.union_leave_requests ENABLE ROW LEVEL SECURITY;

-- Club owner can view their own leave requests
CREATE POLICY "club_owner_view_leave_requests"
  ON public.union_leave_requests FOR SELECT
  USING (
    requester_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.clubs
      WHERE id = club_id AND owner_id = auth.uid()
    )
  );

-- Club owner can insert leave request for their club
CREATE POLICY "club_owner_insert_leave_request"
  ON public.union_leave_requests FOR INSERT
  WITH CHECK (
    requester_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.clubs
      WHERE id = club_id AND owner_id = auth.uid()
    )
  );

-- Platform admin can view all leave requests
CREATE POLICY "platform_admin_view_leave_requests"
  ON public.union_leave_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
    )
  );

-- Platform admin can update (approve/deny) leave requests
CREATE POLICY "platform_admin_update_leave_requests"
  ON public.union_leave_requests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
    )
  );

-- ── 4. Add to realtime publication ──────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename = 'union_leave_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.union_leave_requests;
  END IF;
END $$;
