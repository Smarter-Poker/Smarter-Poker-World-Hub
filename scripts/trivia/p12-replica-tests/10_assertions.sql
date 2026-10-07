\set ON_ERROR_STOP on

DO $assertions$
DECLARE
    v_result jsonb;
    v_blocked boolean := false;
BEGIN
    IF (SELECT pg_catalog.count(*) FROM public.trivia_legacy_tournament_snapshots_v1) <> 3 THEN
        RAISE EXCEPTION 'expected exactly three completed legacy tournament snapshots';
    END IF;
    IF (SELECT pg_catalog.count(*) FROM public.trivia_legacy_tournament_result_rows_v1) <> 208 THEN
        RAISE EXCEPTION 'expected exactly 208 captured legacy result rows';
    END IF;
    IF (SELECT pg_catalog.count(*) FROM public.trivia_legacy_tournament_snapshots_v1
         WHERE classification = 'test_era' AND public_season_eligible IS FALSE) <> 2 THEN
        RAISE EXCEPTION 'the two completed 100-horse events must remain excluded test-era records';
    END IF;
    IF (SELECT pg_catalog.count(*) FROM public.trivia_legacy_tournament_snapshots_v1
         WHERE classification = 'quarantined'
           AND public_season_eligible IS FALSE
           AND prize_pool = 184
           AND entry_count = 8
           AND horse_count = 8
           AND human_count = 0
           AND ranked_count = 0
           AND total_payout = 0) <> 1 THEN
        RAISE EXCEPTION 'the quarantined 184-diamond event did not retain its exact evidence shape';
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.trivia_legacy_tournament_result_rows_v1
         WHERE tournament_id = '10000000-0000-4000-8000-000000000003'
           AND (participant_kind <> 'horse' OR final_rank IS NOT NULL OR payout <> 0
                OR result_state <> 'unranked_evidence')
    ) THEN
        RAISE EXCEPTION 'the quarantined result rows fabricated identity, rank, payout, or state';
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.trivia_legacy_tournament_snapshots_v1
         WHERE tournament_id IN (
             '10000000-0000-4000-8000-000000000004',
             '10000000-0000-4000-8000-000000000005'
         )
    ) THEN
        RAISE EXCEPTION 'cancelled legacy events must not be represented as settled results';
    END IF;

    v_result := public.trivia_legacy_tournament_results_v1(
        '10000000-0000-4000-8000-000000000003', 0, 50, NULL, false
    );
    IF v_result ->> 'error' <> 'excluded_from_public_seasons' THEN
        RAISE EXCEPTION 'default DTO access did not exclude the quarantined event: %', v_result;
    END IF;

    v_result := public.trivia_legacy_tournament_results_v1(
        '10000000-0000-4000-8000-000000000003', 0, 50, 'horse', true
    );
    IF (v_result ->> 'success')::boolean IS NOT TRUE
       OR v_result ->> 'contract' <> 'trivia-legacy-tournament-results/1'
       OR (v_result ->> 'total')::integer <> 8
       OR pg_catalog.jsonb_array_length(v_result -> 'items') <> 8
       OR EXISTS (
           SELECT 1
             FROM pg_catalog.jsonb_array_elements(v_result -> 'items') AS item
            WHERE item ->> 'participantKind' <> 'horse'
               OR item -> 'rank' <> 'null'::jsonb
               OR (item ->> 'payout')::integer <> 0
               OR item ? 'participantId'
               OR item ? 'userId'
               OR item ? 'answer'
               OR item ? 'question'
       ) THEN
        RAISE EXCEPTION 'internal answer-free DTO did not preserve the quarantined event: %', v_result;
    END IF;

    BEGIN
        UPDATE public.trivia_legacy_tournament_snapshots_v1
           SET source_name = source_name
         WHERE tournament_id = '10000000-0000-4000-8000-000000000001';
    EXCEPTION WHEN raise_exception THEN
        v_blocked := true;
    END;
    IF NOT v_blocked THEN
        RAISE EXCEPTION 'immutable snapshot UPDATE was not refused';
    END IF;

    IF pg_catalog.has_table_privilege('anon', 'public.trivia_legacy_tournament_snapshots_v1', 'SELECT')
       OR pg_catalog.has_table_privilege('authenticated', 'public.trivia_legacy_tournament_result_rows_v1', 'SELECT')
       OR pg_catalog.has_table_privilege('service_role', 'public.trivia_legacy_tournament_snapshots_v1', 'SELECT')
       OR NOT pg_catalog.has_function_privilege(
           'service_role',
           'public.trivia_legacy_tournament_results_v1(uuid,integer,integer,text,boolean)',
           'EXECUTE'
       ) THEN
        RAISE EXCEPTION 'least-privilege read boundary failed';
    END IF;

    IF (SELECT pg_catalog.sum(payout) FROM public.trivia_tournament_entries) <> 4600
       OR (SELECT pg_catalog.sum(prize_pool) FROM public.trivia_tournaments) <> 4784
       OR (SELECT pg_catalog.count(*) FROM public.trivia_tournament_entries WHERE rank IS NULL) <> 8 THEN
        RAISE EXCEPTION 'legacy source money/result evidence changed during reconciliation';
    END IF;
END
$assertions$;

SELECT pg_catalog.jsonb_build_object(
    'suite', 'trivia-p12-legacy-reconciliation',
    'tournaments', (SELECT pg_catalog.count(*) FROM public.trivia_legacy_tournament_snapshots_v1),
    'results', (SELECT pg_catalog.count(*) FROM public.trivia_legacy_tournament_result_rows_v1),
    'publicEligible', (SELECT pg_catalog.count(*) FROM public.trivia_legacy_tournament_snapshots_v1 WHERE public_season_eligible),
    'quarantined', (SELECT pg_catalog.count(*) FROM public.trivia_legacy_tournament_snapshots_v1 WHERE classification = 'quarantined'),
    'sourcePayout', (SELECT pg_catalog.sum(payout) FROM public.trivia_tournament_entries)
) AS result;
