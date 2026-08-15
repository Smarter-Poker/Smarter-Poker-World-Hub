-- The forensic snapshot table created by the horse-avatar restore was left
-- with RLS off and Supabase's default client grants, tripping the
-- no_rls_off_tables_writable_by_clients economy invariant. It is an
-- internal audit artifact: lock it to service_role only.
REVOKE ALL ON TABLE public._audit_horse_avatar_restore_20260815 FROM PUBLIC;
REVOKE ALL ON TABLE public._audit_horse_avatar_restore_20260815 FROM anon;
REVOKE ALL ON TABLE public._audit_horse_avatar_restore_20260815 FROM authenticated;
ALTER TABLE public._audit_horse_avatar_restore_20260815 ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE bad int;
BEGIN
  SELECT count(*) INTO bad FROM public.economy_invariants() WHERE NOT ok;
  IF bad > 0 THEN
    RAISE EXCEPTION 'economy_invariants still failing: % check(s)', bad;
  END IF;
END $$;
