\set ON_ERROR_STOP on

-- Boundary assertions for trivia_competitive_pvp_paid_ready_v1 subsidy accounting:
-- Real Phase 2 trivia_ledger_subsidy() adds the horse stake to BOTH held_total
-- and subsidy_total (so a 10-Diamond human_horse match has gross_pool=20,
-- held_total=20, subsidy_total=10).
BEGIN;

-- 1. Valid Phase 2 human_horse matches (held_total=20, subsidy_total=10) pass.
DO $valid_horse_subsidy$
BEGIN
    IF NOT public.trivia_competitive_pvp_paid_ready_v1('93000000-0000-4000-8000-000000000002')
       OR NOT public.trivia_competitive_pvp_paid_ready_v1('93000000-0000-4000-8000-000000000003') THEN
        RAISE EXCEPTION 'valid Phase 2 human_horse matches with held_total=20, subsidy_total=10 were rejected';
    END IF;
    IF NOT public.trivia_competitive_pvp_paid_ready_v1('93000000-0000-4000-8000-000000000001') THEN
        RAISE EXCEPTION 'valid human_human match with held_total=20, subsidy_total=0 was rejected';
    END IF;
END
$valid_horse_subsidy$;

-- 2. A human_horse match with subsidy_total=0 (unfunded horse) must be rejected.
UPDATE public.trivia_settlements
   SET subsidy_total = 0
 WHERE subject_type = 'pvp_match'
   AND subject_id = '93000000-0000-4000-8000-000000000003';

DO $reject_zero_subsidy_horse$
BEGIN
    IF public.trivia_competitive_pvp_paid_ready_v1('93000000-0000-4000-8000-000000000003') THEN
        RAISE EXCEPTION 'human_horse match with subsidy_total=0 falsely passed';
    END IF;
END
$reject_zero_subsidy_horse$;

-- 3. A human_human match with nonzero subsidy_total must be rejected.
UPDATE public.trivia_settlements
   SET subsidy_total = 10
 WHERE subject_type = 'pvp_match'
   AND subject_id = '93000000-0000-4000-8000-000000000001';

DO $reject_subsidized_hh$
BEGIN
    IF public.trivia_competitive_pvp_paid_ready_v1('93000000-0000-4000-8000-000000000001') THEN
        RAISE EXCEPTION 'human_human match with nonzero subsidy_total falsely passed';
    END IF;
END
$reject_subsidized_hh$;

ROLLBACK;

SELECT 'p12 pvp horse subsidy accounting boundaries PASS' AS result;
