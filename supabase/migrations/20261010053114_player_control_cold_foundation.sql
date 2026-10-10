-- TIER: 3. Empty P3 storage foundation; install before 20261010053147.
-- Reserved through scripts/new-migration.mjs against remote branches.
-- Existing provider policy-grant checks lock unrelated auth relations. Keep this
-- cold transaction free of existing admission/financial relation locks.
-- No runtime RPC, enforcement trigger, original request hook or policy toggle changes.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
CREATE TABLE public.ca_player_control_operations (
  op_id text PRIMARY KEY CHECK (length(op_id) BETWEEN 1 AND 200),
  actor_id uuid NOT NULL, user_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('restrict','lift','force_logout')),
  payload jsonb NOT NULL, result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ca_player_control_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ca_player_control_operations FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT ON public.ca_player_control_operations TO service_role;

CREATE TABLE public.ca_player_session_revocations (
  user_id uuid PRIMARY KEY,
  revoked_before timestamptz NOT NULL,
  op_id text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ca_player_session_revocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ca_player_session_revocations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ca_player_session_revocations TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.ca_player_session_revocations TO service_role;
CREATE POLICY own_session_revocation ON public.ca_player_session_revocations
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
DO $publication$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ca_player_session_revocations;
  END IF;
END $publication$;

DO $empty$ BEGIN
 IF EXISTS(SELECT 1 FROM public.ca_player_control_operations)
 OR EXISTS(SELECT 1 FROM public.ca_player_session_revocations) THEN
  RAISE EXCEPTION 'P3 foundation must remain empty at installation';
 END IF;
END $empty$;
COMMIT;
/*
EXECUTABLE ROLLBACK TEMPLATE — run only as a new protected qualified migration.
This removes only the unused cold foundation. Never run after main P3 installation.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
LOCK TABLE public.ca_player_control_operations,public.ca_player_session_revocations
 IN SHARE ROW EXCLUSIVE MODE NOWAIT;
DO $rollback_foundation$
BEGIN
 IF to_regprocedure('public.fn_ca_player_session_live(uuid,uuid)') IS NOT NULL
 OR to_regprocedure('public.fn_ca_player_force_logout(uuid,uuid,text,text,text,text,text)') IS NOT NULL
 OR to_regprocedure('public.fn_ca_player_control_once(text,uuid,text,jsonb)') IS NOT NULL
 OR to_regprocedure('public.fn_ca_assert_player_action(uuid,text,text)') IS NOT NULL
 OR EXISTS(SELECT 1 FROM public.ca_player_control_operations)
 OR EXISTS(SELECT 1 FROM public.ca_player_session_revocations)
 OR position('ca_player_session_revocations' IN
  pg_get_functiondef('smarter_private.fn_smarter_data_api_pre_request()'::regprocedure))>0 THEN
  RAISE EXCEPTION 'P3 foundation rollback refused: enforcement or durable use exists';
 END IF;
END $rollback_foundation$;
-- No CASCADE: any other dependency refuses rather than discarding its owner.
DROP TABLE public.ca_player_session_revocations;
DROP TABLE public.ca_player_control_operations;
COMMIT;
*/
