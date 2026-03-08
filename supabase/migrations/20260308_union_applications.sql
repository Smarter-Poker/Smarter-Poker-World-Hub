-- ═══════════════════════════════════════════════════════════════════════════
-- UNION APPLICATIONS TABLE
-- ═══════════════════════════════════════════════════════════════════════════
-- Allows club owners to apply to join the Midway Union.
-- Platform admins (admin/superadmin role) review, approve, or reject.
-- Approving auto-integrates the club into the union via union_clubs + clubs.union_id.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.union_applications (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  union_id          UUID        NOT NULL REFERENCES public.unions(id) ON DELETE CASCADE,
  club_id           UUID        NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  applicant_user_id UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Snapshot at time of application (denormalized for display without joins)
  club_name         TEXT        NOT NULL,
  club_code         INTEGER,
  member_count      INTEGER     DEFAULT 0,

  -- Optional message from club owner to union admin
  message           TEXT,

  -- Lifecycle
  status            TEXT        NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'rejected')),
  applied_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at       TIMESTAMPTZ,
  review_note       TEXT,

  -- Prevent duplicate pending applications for the same club+union
  UNIQUE (union_id, club_id, status) DEFERRABLE INITIALLY DEFERRED
);

-- Index for fast lookup by club owner (checking own status)
CREATE INDEX IF NOT EXISTS idx_union_applications_club_id
  ON public.union_applications (club_id, applied_at DESC);

-- Index for admin list view (all pending across all unions)
CREATE INDEX IF NOT EXISTS idx_union_applications_status
  ON public.union_applications (status, applied_at DESC);

-- ─── ROW-LEVEL SECURITY ─────────────────────────────────────────────────────
ALTER TABLE public.union_applications ENABLE ROW LEVEL SECURITY;

-- Club owners can see their own club's applications
CREATE POLICY "club_owner_can_view_own_applications"
  ON public.union_applications
  FOR SELECT
  USING (
    applicant_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.clubs
      WHERE id = union_applications.club_id
        AND owner_id = auth.uid()
    )
  );

-- Club owners can insert (apply) — further auth is enforced at API level
CREATE POLICY "club_owner_can_apply"
  ON public.union_applications
  FOR INSERT
  WITH CHECK (applicant_user_id = auth.uid());

-- Platform admins can see and update all applications (via service role in API)
-- The API uses service role key, so RLS is bypassed server-side. 
-- These policies are for any future direct-Supabase access by admins.
CREATE POLICY "admin_can_view_all_applications"
  ON public.union_applications
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "admin_can_update_applications"
  ON public.union_applications
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'superadmin')
    )
  );

-- ─── REALTIME ────────────────────────────────────────────────────────────────
-- Add to realtime so the horses admin dashboard can get live notifications
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename = 'union_applications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.union_applications;
  END IF;
END $$;
