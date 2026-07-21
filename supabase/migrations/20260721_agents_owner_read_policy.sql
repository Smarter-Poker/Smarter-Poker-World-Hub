-- agents had only a browser SELECT policy of "own row" (auth.uid()=user_id), so a
-- club owner/admin could not read (hence not list/manage) their club's agents.
-- Add a scoped SELECT policy: club owner (clubs.owner_id) or club_members owner/
-- co_owner/admin may read THAT club's agents. Regular members still see own row
-- only (peer financials stay private).
DROP POLICY IF EXISTS agents_club_owner_read ON public.agents;
CREATE POLICY agents_club_owner_read ON public.agents
  FOR SELECT TO public
  USING (
    EXISTS (SELECT 1 FROM clubs c WHERE c.id = agents.club_id AND (
      c.owner_id = (SELECT auth.uid())
      OR EXISTS (SELECT 1 FROM club_members cm WHERE cm.club_id = agents.club_id
                 AND cm.user_id = (SELECT auth.uid()) AND cm.role IN ('owner','co_owner','admin'))))
  );
