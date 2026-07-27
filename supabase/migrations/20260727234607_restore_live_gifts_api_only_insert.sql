-- Mirrored from the live database on 2026-07-27. Applied via MCP as migration 20260727234607_restore_live_gifts_api_only_insert.
-- Recorded here so a fresh 'supabase db reset' replays it and cannot silently reopen what it closed.

-- ═══════════════════════════════════════════════════════════════════════
-- Restore the live_gifts INSERT lockdown that 20260520000006 reverted.
--
-- HISTORY:
--   20260430_live_streaming_missing_infra   created lg_ins WITH CHECK (true)
--   20260501_harden_live_gifts_rls          tightened to sender_id = auth.uid()
--   20260503_live_gifts_rls_api_only        locked to WITH CHECK (false)
--                                           (service_role bypasses RLS)
--   20260520000006_final_micro_policy_fixes DROPPED live_gifts_api_only_insert
--                                           and recreated WITH CHECK (true)
--                                           for `authenticated`.
--
-- That last migration was chasing a `multiple_permissive_policies`
-- PERFORMANCE advisor warning, not a security finding. Its own inline
-- comment concedes it did not understand the warning ("this warning may
-- be a false positive") and it dropped the security policy anyway. The
-- net effect was that any logged-in user could POST a fabricated row to
-- /rest/v1/live_gifts with an arbitrary sender_id, receiver_id and
-- amount, with no diamond ever being deducted — poisoning the stream
-- gift feed, gift analytics and leaderboards. This is precisely the bug
-- 20260501 and 20260503 were written to close.
--
-- SAFETY OF THIS CHANGE — every legitimate writer is verified unaffected:
--   * pages/api/live/gift.js is the only application writer. It builds its
--     client from SUPABASE_SERVICE_ROLE_KEY, and service_role bypasses RLS.
--   * public.send_stream_gift() also inserts here. It is SECURITY DEFINER
--     owned by `postgres`, which carries BYPASSRLS, so RLS is not enforced
--     inside it either.
--   * No browser/client code anywhere in World Hub, club-arena or
--     smarter-poker-commander calls .from('live_gifts') for a write.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

DROP POLICY IF EXISTS "live_gifts_insert" ON public.live_gifts;
DROP POLICY IF EXISTS "lg_ins" ON public.live_gifts;
DROP POLICY IF EXISTS "live_gifts_api_only_insert" ON public.live_gifts;

CREATE POLICY "live_gifts_api_only_insert" ON public.live_gifts
    FOR INSERT
    WITH CHECK (false);

COMMENT ON POLICY "live_gifts_api_only_insert" ON public.live_gifts IS
  'Deny-all for direct client inserts. Gifts must go through /api/live/gift '
  '(service_role) or send_stream_gift() (SECURITY DEFINER, postgres-owned), '
  'both of which deduct diamonds atomically before writing. Do NOT relax this '
  'to satisfy a multiple_permissive_policies performance advisor warning — '
  'that is exactly how 20260520000006 reopened the hole.';

-- Post-condition: fail loudly rather than half-apply.
DO $$
DECLARE
  n_permissive int;
BEGIN
  SELECT count(*) INTO n_permissive
  FROM pg_policy p
  WHERE p.polrelid = 'public.live_gifts'::regclass
    AND p.polcmd IN ('a','*')
    AND p.polpermissive
    AND coalesce(pg_get_expr(p.polwithcheck, p.polrelid), 'true') <> 'false';

  IF n_permissive > 0 THEN
    RAISE EXCEPTION 'live_gifts still has % permissive non-false INSERT policy(ies)', n_permissive;
  END IF;
END $$;

COMMIT;
