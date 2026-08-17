-- APPLIED TO PRODUCTION 2026-08-17 (club_members_roster_readable_by_club_staff_v2;
-- v1 hit a transient deadlock on the hot table — identical content, lock_timeout added)
--
-- Find a Player was silently broken for every elevated role. FindPlayerModal
-- reads club_members for all members of the caller's clubs, but the only read
-- policy was auth.uid() = user_id, so RLS trimmed the roster to the caller's
-- own row — no error. searchableUserIds collapsed to friends-only, and since
-- self is filtered out, a club owner/admin/agent could never find a single
-- club member. Same defect class as the verify_ledger_totals fallback: RLS
-- quietly shrinking a query the code assumed was global.
--
-- Staff (clubs.owner_id, or membership role owner/admin/manager/agent via the
-- SECURITY DEFINER is_club_admin(uuid) overload — the invoker-rights two-arg
-- overload would recurse) read the rosters of THEIR clubs; plain members
-- still see only their own row. Probes: staff sees full roster, member sees 1.
SET lock_timeout = '5s';

DROP POLICY IF EXISTS "Club staff can read club rosters" ON public.club_members;
CREATE POLICY "Club staff can read club rosters" ON public.club_members
  FOR SELECT TO authenticated
  USING (
    public.is_club_admin(club_id)
    OR EXISTS (SELECT 1 FROM public.clubs c
                WHERE c.id = club_members.club_id
                  AND c.owner_id = (SELECT auth.uid()))
  );
