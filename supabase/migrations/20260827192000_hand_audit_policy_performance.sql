-- Scope solver hand-audit policies to their intended roles and evaluate auth.uid()
-- once per statement instead of once per row.

DROP POLICY IF EXISTS "Users can view own hand audit decisions"
  ON public.hand_audit_decisions;
CREATE POLICY "Users can view own hand audit decisions"
  ON public.hand_audit_decisions FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Service role manages hand audit decisions"
  ON public.hand_audit_decisions;
CREATE POLICY "Service role manages hand audit decisions"
  ON public.hand_audit_decisions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
