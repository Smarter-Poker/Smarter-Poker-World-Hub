-- ═══════════════════════════════════════════════════════════════════════
-- 20261128110431_bankroll_owner_delete_policies.sql  (INSTALLED 2026-11-28 11:04 UTC)
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2 (RLS policies only)
-- AUTHOR:      Claude (Bankroll Manager programme coordinator, owner-authorized)
-- AFFECTS:     RLS on bankroll_rule_violations, bankroll_alerts, geofence_visits
-- IRREVERSIBLE: no
--
-- CLIENT CODE THAT DEPENDS ON THIS:
--   "Delete All Bankroll Data" (PR #3301, src/lib/bankroll data IO). Without a
--   DELETE policy a player's own delete matched zero rows under RLS, so those
--   rows were reported as "could not delete".
--
-- HOW: one FOR DELETE TO authenticated USING (auth.uid() = user_id) policy per
--   table. Grants unchanged (authenticated already held DELETE).
--
-- ROLLBACK: DROP POLICY "Users can delete own violations" ON public.bankroll_rule_violations;
--   DROP POLICY "Users can delete own alerts" ON public.bankroll_alerts;
--   DROP POLICY "Users can delete own geofence visits" ON public.geofence_visits;
-- ═══════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '20s';
DO $pre$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['bankroll_rule_violations','bankroll_alerts','geofence_visits'] LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.'||t)::regclass) THEN
      RAISE EXCEPTION 'pre-flight failed: RLS is off on %', t;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=t AND column_name='user_id') THEN
      RAISE EXCEPTION 'pre-flight failed: %.user_id missing', t;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND cmd IN ('DELETE','ALL')) THEN
      RAISE EXCEPTION 'pre-flight failed: % already has a DELETE/ALL policy', t;
    END IF;
  END LOOP;
END
$pre$;
CREATE POLICY "Users can delete own violations" ON public.bankroll_rule_violations
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users can delete own alerts" ON public.bankroll_alerts
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users can delete own geofence visits" ON public.geofence_visits
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);
DO $post$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['bankroll_rule_violations','bankroll_alerts','geofence_visits'] LOOP
    IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=t AND cmd='DELETE'
          AND roles = '{authenticated}' AND qual LIKE '%auth.uid()%= user_id%') <> 1 THEN
      RAISE EXCEPTION 'post-apply: expected one own-rows DELETE policy for authenticated on %', t;
    END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.'||t)::regclass) THEN
      RAISE EXCEPTION 'post-apply: RLS is off on %', t;
    END IF;
  END LOOP;
END
$post$;
COMMIT;
