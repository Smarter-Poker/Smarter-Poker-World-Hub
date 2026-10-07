-- ============================================================================
-- 20261006061400_trivia_phase9_retire_generic_lifeline_spend.sql
-- ============================================================================
-- TIER:         3 (financial write-authority cutover)
-- AUTHOR:       Codex
-- AFFECTS:      generic Diamond spend; Trivia paid-skip debit authority
-- IRREVERSIBLE: no, but rollback is permitted only before Phase9 receipts exist
--
-- The historical generic spend request cannot bind a Trivia session/question,
-- cap paid skips, or commit the debit with the first-answer receipt. This
-- separately committed migration closes that path before the following Phase9
-- reconciliation scans the ledger. A cached caller stays bound to the same
-- canonical function OID, whose body is replaced in place and fails closed.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $preflight$
DECLARE
    v_owner text;
    v_security_definer boolean;
BEGIN
    IF to_regprocedure('public.trivia_solo_spend(uuid,integer,text,text,text)') IS NULL
       OR to_regprocedure('public.trivia_solo_spend_before_phase9_v1(uuid,integer,text,text,text)') IS NOT NULL THEN
        RAISE EXCEPTION 'phase9 lifeline cutover preflight: canonical/helper function state is invalid';
    END IF;
    IF encode(extensions.digest(convert_to(pg_get_functiondef(
            'public.trivia_solo_spend(uuid,integer,text,text,text)'::regprocedure), 'UTF8'), 'sha256'), 'hex')
            <> '92044f698f1a78110cea321397f8344751170ec011ff90c6ee92a7d9530fdf35' THEN
        RAISE EXCEPTION 'phase9 lifeline cutover preflight: canonical spend pre-image drifted';
    END IF;
    SELECT owner.rolname,p.prosecdef INTO v_owner,v_security_definer
      FROM pg_proc p JOIN pg_roles owner ON owner.oid=p.proowner
     WHERE p.oid='public.trivia_solo_spend(uuid,integer,text,text,text)'::regprocedure;
    IF v_owner IS DISTINCT FROM 'postgres' OR v_security_definer IS NOT TRUE
       OR has_function_privilege('anon','public.trivia_solo_spend(uuid,integer,text,text,text)','EXECUTE')
       OR has_function_privilege('authenticated','public.trivia_solo_spend(uuid,integer,text,text,text)','EXECUTE')
       OR NOT has_function_privilege('service_role','public.trivia_solo_spend(uuid,integer,text,text,text)','EXECUTE') THEN
        RAISE EXCEPTION 'phase9 lifeline cutover preflight: canonical spend authority drifted';
    END IF;
END;
$preflight$;

-- Exact Phase2 implementation retained only as an owner-internal dependency
-- for the new atomic paid-skip authority. It is intentionally not executable
-- by service_role because its arguments include caller-selected user identity.
CREATE FUNCTION public.trivia_solo_spend_before_phase9_v1(
    p_user_id uuid, p_amount integer, p_description text,
    p_transaction_type text, p_reference_id text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE r jsonb; v_rules text; v_now integer; v_session uuid;
BEGIN
  IF NOT public.trivia_ledger_switch_enabled('solo_journal') OR p_transaction_type IS DISTINCT FROM 'trivia_lifeline' THEN
    RETURN public.deduct_diamonds(p_user_id, p_amount, p_description, p_transaction_type, NULL, '{}'::jsonb, p_reference_id, 0);
  END IF;
  IF p_reference_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'reference_id_required');
  END IF;
  BEGIN
    v_session := substring(p_reference_id FROM 'trivia_lifeline:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})')::uuid;
  EXCEPTION WHEN OTHERS THEN v_session := NULL;
  END;
  SELECT s.rules_version_id INTO v_rules FROM public.trivia_sessions s WHERE s.id = v_session AND s.user_id = p_user_id;
  r := public.trivia_ledger_debit(p_reference_id, p_user_id, p_amount, 'trivia_lifeline', p_description,
                                  'trivia_lifeline', p_reference_id, v_rules);
  IF COALESCE((r ->> 'success')::boolean, false) AND NOT COALESCE((r ->> 'replayed')::boolean, false) THEN
    r := public.trivia_solo_wallet_receipt(r);
    IF r IS NULL OR COALESCE((r ->> 'success')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION 'trivia ledger: platform receipt missing for a lifeline spend' USING ERRCODE = 'TL003';
    END IF;
    RETURN r;
  END IF;
  IF COALESCE((r ->> 'replayed')::boolean, false) OR r ->> 'error' = 'reference_already_used_outside_ledger' THEN
    RETURN public.deduct_diamonds(p_user_id, p_amount, p_description, p_transaction_type, NULL, '{}'::jsonb, p_reference_id, 0);
  END IF;
  SELECT diamonds INTO v_now FROM public.profiles WHERE id = p_user_id;
  IF r ->> 'error' = 'insufficient_funds' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient diamonds', 'balance', v_now);
  END IF;
  IF r ->> 'error' = 'idempotency_conflict' THEN
    RETURN jsonb_build_object('success', false, 'error', 'idempotency_conflict', 'balance', v_now, 'reference_id', p_reference_id);
  END IF;
  RETURN jsonb_build_object('success', false, 'error', COALESCE(r ->> 'error', 'ledger_error'), 'balance', v_now);
END $fn$;

CREATE OR REPLACE FUNCTION public.trivia_solo_spend(
    p_user_id uuid, p_amount integer, p_description text,
    p_transaction_type text, p_reference_id text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
BEGIN
  IF p_transaction_type IS NOT DISTINCT FROM 'trivia_lifeline' THEN
    RETURN jsonb_build_object('success',false,'error','paid_skip_requires_session_authority');
  END IF;
  RETURN public.trivia_solo_spend_before_phase9_v1(
      p_user_id,p_amount,p_description,p_transaction_type,p_reference_id);
END $fn$;

-- A body already executing when the canonical OID changes must not be able to
-- insert after cutover. CREATE TRIGGER takes the relation lock needed to drain
-- an INSERT already in progress; any older invocation that reaches INSERT
-- later is rejected unless the new atomic authority set this transaction-local
-- capability immediately around its canonical debit.
CREATE FUNCTION public.trivia_phase9_guard_lifeline_ledger_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $body$
BEGIN
    IF coalesce(NEW.transaction_type, NEW.type) = 'trivia_lifeline'
       AND current_setting('trivia.phase9_paid_skip_authority', true)
            IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION 'paid_skip_requires_session_authority'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
END;
$body$;

CREATE TRIGGER trg_phase9_guard_lifeline_ledger
    BEFORE INSERT ON public.diamond_transactions
    FOR EACH ROW EXECUTE FUNCTION public.trivia_phase9_guard_lifeline_ledger_v1();

ALTER FUNCTION public.trivia_solo_spend_before_phase9_v1(uuid,integer,text,text,text) OWNER TO postgres;
ALTER FUNCTION public.trivia_solo_spend(uuid,integer,text,text,text) OWNER TO postgres;
ALTER FUNCTION public.trivia_phase9_guard_lifeline_ledger_v1() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.trivia_solo_spend_before_phase9_v1(uuid,integer,text,text,text),
    public.trivia_solo_spend(uuid,integer,text,text,text),
    public.trivia_phase9_guard_lifeline_ledger_v1()
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.trivia_solo_spend(uuid,integer,text,text,text) TO service_role;

DO $postflight$
DECLARE
    v_definition text;
BEGIN
    IF has_function_privilege('anon','public.trivia_solo_spend(uuid,integer,text,text,text)','EXECUTE')
       OR has_function_privilege('authenticated','public.trivia_solo_spend(uuid,integer,text,text,text)','EXECUTE')
       OR NOT has_function_privilege('service_role','public.trivia_solo_spend(uuid,integer,text,text,text)','EXECUTE')
       OR has_function_privilege('anon','public.trivia_solo_spend_before_phase9_v1(uuid,integer,text,text,text)','EXECUTE')
       OR has_function_privilege('authenticated','public.trivia_solo_spend_before_phase9_v1(uuid,integer,text,text,text)','EXECUTE')
       OR has_function_privilege('service_role','public.trivia_solo_spend_before_phase9_v1(uuid,integer,text,text,text)','EXECUTE')
       OR has_function_privilege('anon','public.trivia_phase9_guard_lifeline_ledger_v1()','EXECUTE')
       OR has_function_privilege('authenticated','public.trivia_phase9_guard_lifeline_ledger_v1()','EXECUTE')
       OR has_function_privilege('service_role','public.trivia_phase9_guard_lifeline_ledger_v1()','EXECUTE') THEN
        RAISE EXCEPTION 'phase9 lifeline cutover postflight: function authority leaked';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
         WHERE tgrelid='public.diamond_transactions'::regclass
           AND tgname='trg_phase9_guard_lifeline_ledger'
           AND NOT tgisinternal
    ) THEN
        RAISE EXCEPTION 'phase9 lifeline cutover postflight: ledger guard is missing';
    END IF;
    SELECT pg_get_functiondef('public.trivia_solo_spend(uuid,integer,text,text,text)'::regprocedure)
      INTO v_definition;
    IF v_definition !~ 'paid_skip_requires_session_authority'
       OR v_definition !~ 'trivia_solo_spend_before_phase9_v1' THEN
        RAISE EXCEPTION 'phase9 lifeline cutover postflight: canonical refusal is incomplete';
    END IF;
END;
$postflight$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================================
-- ROLLBACK (Tier 3; apply only through a NEW reviewed migration)
-- This exact pre-image restoration is allowed only before Phase9 receipt tables
-- exist. Reopening generic lifeline spend after paid-skip authority is live
-- would recreate the paid-but-unbound defect.
-- ============================================================================
-- BEGIN;
-- DO $$ BEGIN
--   IF to_regclass('public.trivia_paid_skip_receipts_v1') IS NOT NULL THEN
--     RAISE EXCEPTION 'cannot restore generic lifeline spend after Phase9 authority exists';
--   END IF;
-- END $$;
-- CREATE OR REPLACE FUNCTION public.trivia_solo_spend(p_user_id uuid, p_amount integer, p_description text,
--   p_transaction_type text, p_reference_id text)
-- RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
-- DECLARE r jsonb; v_rules text; v_now integer; v_session uuid;
-- BEGIN
--   IF NOT public.trivia_ledger_switch_enabled('solo_journal') OR p_transaction_type IS DISTINCT FROM 'trivia_lifeline' THEN
--     RETURN public.deduct_diamonds(p_user_id, p_amount, p_description, p_transaction_type, NULL, '{}'::jsonb, p_reference_id, 0);
--   END IF;
--   IF p_reference_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'reference_id_required'); END IF;
--   BEGIN v_session := substring(p_reference_id FROM 'trivia_lifeline:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})')::uuid;
--   EXCEPTION WHEN OTHERS THEN v_session := NULL; END;
--   SELECT s.rules_version_id INTO v_rules FROM public.trivia_sessions s WHERE s.id = v_session AND s.user_id = p_user_id;
--   r := public.trivia_ledger_debit(p_reference_id, p_user_id, p_amount, 'trivia_lifeline', p_description,
--                                   'trivia_lifeline', p_reference_id, v_rules);
--   IF COALESCE((r ->> 'success')::boolean, false) AND NOT COALESCE((r ->> 'replayed')::boolean, false) THEN
--     r := public.trivia_solo_wallet_receipt(r);
--     IF r IS NULL OR COALESCE((r ->> 'success')::boolean, false) IS NOT TRUE THEN
--       RAISE EXCEPTION 'trivia ledger: platform receipt missing for a lifeline spend' USING ERRCODE = 'TL003';
--     END IF;
--     RETURN r;
--   END IF;
--   IF COALESCE((r ->> 'replayed')::boolean, false) OR r ->> 'error' = 'reference_already_used_outside_ledger' THEN
--     RETURN public.deduct_diamonds(p_user_id, p_amount, p_description, p_transaction_type, NULL, '{}'::jsonb, p_reference_id, 0);
--   END IF;
--   SELECT diamonds INTO v_now FROM public.profiles WHERE id = p_user_id;
--   IF r ->> 'error' = 'insufficient_funds' THEN RETURN jsonb_build_object('success', false, 'error', 'Insufficient diamonds', 'balance', v_now); END IF;
--   IF r ->> 'error' = 'idempotency_conflict' THEN RETURN jsonb_build_object('success', false, 'error', 'idempotency_conflict', 'balance', v_now, 'reference_id', p_reference_id); END IF;
--   RETURN jsonb_build_object('success', false, 'error', COALESCE(r ->> 'error', 'ledger_error'), 'balance', v_now);
-- END $fn$;
-- DROP TRIGGER trg_phase9_guard_lifeline_ledger ON public.diamond_transactions;
-- DROP FUNCTION public.trivia_phase9_guard_lifeline_ledger_v1();
-- ALTER FUNCTION public.trivia_solo_spend(uuid,integer,text,text,text) OWNER TO postgres;
-- REVOKE ALL ON FUNCTION public.trivia_solo_spend(uuid,integer,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
-- GRANT EXECUTE ON FUNCTION public.trivia_solo_spend(uuid,integer,text,text,text) TO service_role;
-- DROP FUNCTION public.trivia_solo_spend_before_phase9_v1(uuid,integer,text,text,text);
-- NOTIFY pgrst, 'reload schema';
-- COMMIT;
