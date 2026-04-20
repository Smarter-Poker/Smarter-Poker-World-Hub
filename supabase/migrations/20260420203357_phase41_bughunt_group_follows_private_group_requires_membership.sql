-- =====================================================================
-- Pass 24: commander_home_group_follows cannot be opened on private
-- groups where the caller is not an approved member.
--
-- BUG: a user could follow a private group simply by knowing its UUID.
-- Privacy leak: enables confirming membership/existence + future
-- notification flows pushing updates from groups the user shouldn't
-- have any relationship with.
--
-- FIX: tighten the INSERT CHECK policy.
-- =====================================================================

DROP POLICY IF EXISTS home_group_follows_insert ON public.commander_home_group_follows;

-- Reuse the existing policy pattern name (matches other home_ tables)
CREATE POLICY home_group_follows_insert
  ON public.commander_home_group_follows
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      -- Public groups can be followed by anyone
      EXISTS (
        SELECT 1 FROM commander_home_groups g
         WHERE g.id = group_id AND g.is_private = false
      )
      -- Private groups: caller must own it
      OR EXISTS (
        SELECT 1 FROM commander_home_groups g
         WHERE g.id = group_id AND g.owner_id = auth.uid()
      )
      -- Private groups: caller must be approved member
      OR EXISTS (
        SELECT 1 FROM commander_home_members m
         WHERE m.group_id = commander_home_group_follows.group_id
           AND m.user_id = auth.uid()
           AND m.status = 'approved'
      )
    )
  );
