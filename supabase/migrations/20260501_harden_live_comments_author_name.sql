-- ═══════════════════════════════════════════════════════════════════════
-- Harden live_comments: eliminate author_name spoofing
--
-- Problem: live_comments.author_name was a free-text column that the
-- client could set to any value, allowing anyone to impersonate another user.
--
-- Solution (3-layer defence):
-- 1. Trigger: on every INSERT, overwrite author_name with the canonical
--    profiles.username (or full_name fallback). The client value is ignored.
-- 2. RLS policy: INSERT policy now requires user_id = auth.uid() to prevent
--    a client from posting comments attributed to another user_id.
-- 3. API route /api/live/comment enforces server-side resolution too (defence
--    in depth — DB trigger is the backstop).
--
-- ALSO: tighten live_gifts INSERT policy — was WITH CHECK (true) (open).
-- Gift inserts must now go through /api/live/gift (service role only).
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Trigger function: overwrite author_name from profiles ─────────
CREATE OR REPLACE FUNCTION public.enforce_live_comment_author_name()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_username TEXT;
    v_full_name TEXT;
BEGIN
    -- Resolve the canonical username from profiles
    SELECT username, full_name
      INTO v_username, v_full_name
      FROM public.profiles
     WHERE id = NEW.user_id
     LIMIT 1;

    -- Always overwrite — client value is ignored
    NEW.author_name := COALESCE(v_username, v_full_name, 'Viewer');

    RETURN NEW;
END;
$$;

-- ── 2. Attach trigger to live_comments ──────────────────────────────
DROP TRIGGER IF EXISTS trig_enforce_live_comment_author_name ON public.live_comments;
CREATE TRIGGER trig_enforce_live_comment_author_name
    BEFORE INSERT ON public.live_comments
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_live_comment_author_name();

-- ── 3. Harden live_comments RLS ─────────────────────────────────────
-- Drop the old permissive INSERT policy (if it exists) and replace it
-- with one that requires user_id = auth.uid().
DROP POLICY IF EXISTS "live_comments_insert" ON public.live_comments;
DROP POLICY IF EXISTS "Anyone can insert comments" ON public.live_comments;
DROP POLICY IF EXISTS "Authenticated users can insert live_comments" ON public.live_comments;

CREATE POLICY live_comments_insert
    ON public.live_comments
    FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

-- Ensure SELECT is open (readers need to see all comments)
DROP POLICY IF EXISTS "live_comments_select" ON public.live_comments;
CREATE POLICY live_comments_select
    ON public.live_comments
    FOR SELECT
    USING (true);

-- ── 4. Lock live_gifts: service-role-only inserts ───────────────────
-- The open INSERT WITH CHECK (true) policy allowed any authenticated
-- client to write gift rows directly, bypassing the atomic diamond
-- deduction in /api/live/gift. Revoke client INSERT; service role (API)
-- bypasses RLS so the API route still works.
DROP POLICY IF EXISTS lg_ins ON public.live_gifts;
-- NOTE: No replacement INSERT policy for authenticated users.
-- /api/live/gift uses SUPABASE_SERVICE_ROLE_KEY which bypasses RLS.
-- Clients can still SELECT gifts via lg_sel policy.
