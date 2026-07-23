-- credit_assignments — audit log of agent credit-limit changes.
--
-- WHY: fn_admin_update_agent INSERTs a row here every time an agent's
-- credit_limit changes. The table was missing in prod, so EVERY credit-limit
-- change threw (relation "credit_assignments" does not exist) and the whole
-- fn_admin_update_agent transaction rolled back — silently breaking the club
-- owner "issue credit / set credit line" flow (CreditService.setCreditLine →
-- fn_admin_update_agent). Creating this table unblocks that flow.
--
-- Applied to prod via Supabase MCP 2026-07-22; this file backfills the
-- migration record so repo and DB don't drift.
--
-- RLS: service_role writes (the SECURITY DEFINER fn_admin_update_agent owner
-- bypasses RLS anyway); the agent themselves and their club owner/co_owner/
-- admin can read their own credit history. No client write path.

CREATE TABLE IF NOT EXISTS public.credit_assignments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  old_limit   numeric,
  new_limit   numeric,
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_assignments_agent
  ON public.credit_assignments (agent_id, created_at DESC);

ALTER TABLE public.credit_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS credit_assignments_svc ON public.credit_assignments;
CREATE POLICY credit_assignments_svc ON public.credit_assignments
  AS PERMISSIVE FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS credit_assignments_read ON public.credit_assignments;
CREATE POLICY credit_assignments_read ON public.credit_assignments
  AS PERMISSIVE FOR SELECT TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.agents a
      WHERE a.id = credit_assignments.agent_id
        AND (
          a.user_id = (SELECT auth.uid())
          OR EXISTS (
            SELECT 1 FROM public.clubs c
            WHERE c.id = a.club_id
              AND (
                c.owner_id = (SELECT auth.uid())
                OR EXISTS (
                  SELECT 1 FROM public.club_members cm
                  WHERE cm.club_id = a.club_id
                    AND cm.user_id = (SELECT auth.uid())
                    AND cm.role = ANY (ARRAY['owner','co_owner','admin'])
                )
              )
          )
        )
    )
  );
