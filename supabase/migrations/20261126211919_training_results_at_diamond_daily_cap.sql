-- TIER: 3
-- AUTHOR: Codex
-- AFFECTS: public.fn_complete_training_attempt_v2(uuid, uuid)
-- IRREVERSIBLE: no
-- A completed Training drill must be recorded when DR7 refuses its reward.
-- The journal still enforces the cap. The rejected award rolls back before the
-- Training transaction records the result with zero Diamonds.
BEGIN;

DO $training_cap$
DECLARE
  signature constant regprocedure := 'public.fn_complete_training_attempt_v2(uuid,uuid)'::regprocedure;
  definition text := pg_get_functiondef(signature);
  start_marker constant text := '    award_result := public.award_diamonds_v2(';
  end_marker constant text := '    -- A malformed economy response is an integrity failure';
  start_at integer := strpos(definition, start_marker);
  end_at integer := strpos(definition, end_marker);
  existing_call text;
  guarded_call text;
BEGIN
  IF start_at = 0 OR end_at <= start_at
     OR strpos(substring(definition FROM start_at + length(start_marker)), start_marker) <> 0
     OR strpos(definition, 'EXCEPTION WHEN SQLSTATE ''P0407'' THEN') <> 0
     OR right(trim(substring(definition FROM start_at FOR end_at - start_at), E' \n\t'), 2) <> ');' THEN
    RAISE EXCEPTION 'TRAINING_REWARD_DAILY_CAP_BOUNDARY_UNKNOWN';
  END IF;

  existing_call := substring(definition FROM start_at FOR end_at - start_at);
  guarded_call := E'    -- Isolate reward writes so a guarded refusal leaves no ledger or balance changes.\n'
    || E'    BEGIN\n' || existing_call
    || $guard$    EXCEPTION WHEN SQLSTATE 'P0407' THEN
      -- A refusal for any other journal rule remains a settlement failure.
      IF NOT starts_with(SQLERRM, 'DR7:user_over_daily_cap: promotional issuance refused (') THEN
        RAISE;
      END IF;
      award_result := jsonb_build_object(
        'success', false, 'awarded', 0, 'requested', reward_request,
        'reason', 'daily_cap', 'capped', true
      );
    END;

$guard$;

  EXECUTE overlay(definition placing guarded_call FROM start_at FOR end_at - start_at);

  definition := pg_get_functiondef(signature);
  IF strpos(definition, 'EXCEPTION WHEN SQLSTATE ''P0407'' THEN') = 0
     OR strpos(definition, 'DR7:user_over_daily_cap: promotional issuance refused (') = 0
     OR has_function_privilege('authenticated', signature, 'EXECUTE')
     OR has_function_privilege('anon', signature, 'EXECUTE')
     OR NOT has_function_privilege('service_role', signature, 'EXECUTE') THEN
    RAISE EXCEPTION 'TRAINING_REWARD_DAILY_CAP_POSTCHECK_FAILED';
  END IF;
END;
$training_cap$;

COMMIT;

-- ROLLBACK
-- Copy into a new versioned migration. Completed attempts and ledger rows stay intact.
-- BEGIN;
-- DO $rollback$
-- DECLARE
--   definition text := pg_get_functiondef('public.fn_complete_training_attempt_v2(uuid,uuid)'::regprocedure);
--   guard_start integer := strpos(definition, '    -- Isolate reward writes so a guarded refusal');
--   call_start integer := strpos(definition, '    award_result := public.award_diamonds_v2(');
--   call_end integer := strpos(definition, '    EXCEPTION WHEN SQLSTATE ''P0407'' THEN');
--   guard_end integer := strpos(definition, '    -- A malformed economy response is an integrity failure');
-- BEGIN
--   IF NOT (guard_start > 0 AND guard_start < call_start AND call_start < call_end AND call_end < guard_end) THEN
--     RAISE EXCEPTION 'TRAINING_REWARD_DAILY_CAP_ROLLBACK_BOUNDARY_UNKNOWN';
--   END IF;
--   EXECUTE overlay(definition placing substring(definition FROM call_start FOR call_end - call_start)
--     FROM guard_start FOR guard_end - guard_start);
-- END;
-- $rollback$;
-- COMMIT;
