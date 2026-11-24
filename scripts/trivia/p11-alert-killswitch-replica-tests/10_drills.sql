\set ON_ERROR_STOP on

SELECT pg_catalog.set_config('request.jwt.claim.role', 'service_role', false);

DO $drills$
DECLARE
  v_sup uuid := '11111111-1111-4111-8111-111111111111';
  v_obs uuid := '22222222-2222-4222-8222-222222222222';
  v_usr uuid := '33333333-3333-4333-8333-333333333333';
  v_q   uuid := '44444444-4444-4444-8444-444444444444';
  v_t1  uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  v_t2  uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
  v_t3  uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3';
  v_m1  uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
  v_p1  uuid := 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
  v_s1  uuid := 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';
  v_s2  uuid := 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2';
  v_res jsonb;
  v_res2 jsonb;
  v_codes text[];
  v_refused boolean;
BEGIN
  -- 1. Baseline healthy state: 0 active alerts
  v_res := public.trivia_operations_health_v1(v_sup, true);
  IF NOT (v_res->>'healthy')::boolean OR jsonb_array_length(v_res->'active_alerts') <> 0 THEN
    RAISE EXCEPTION 'baseline should be healthy: %', v_res;
  END IF;

  -- 2. Inject ALL 8 Phase 11 alert conditions simultaneously!
  -- (a) eligible_pool_short (< 256)
  UPDATE public.p11_drill_state SET eligible_pool = 120 WHERE id = 1;

  -- (b) horse_field_missing (active public_nightly with NULL horse_target)
  INSERT INTO public.trivia_tournaments
    (id, engine_version, schedule_kind, lifecycle_state, start_time, registration_closes_at, horse_target, horse_population_mode)
  VALUES
    (v_t1, 'trivia-nightly-bracket/1.0.0', 'public_nightly', 'scheduled', clock_timestamp() + interval '1 hour', clock_timestamp() + interval '1 hour', NULL, 'enabled');

  -- (c) horse_field_short (past registration_closes_at, target=100, only 2 horses entered)
  INSERT INTO public.trivia_tournaments
    (id, engine_version, schedule_kind, lifecycle_state, start_time, registration_closes_at, horse_target, horse_population_mode)
  VALUES
    (v_t2, 'trivia-nightly-bracket/1.0.0', 'public_nightly', 'live', clock_timestamp() - interval '10 minutes', clock_timestamp() - interval '10 minutes', 100, 'enabled');
  INSERT INTO public.trivia_tournament_entrants (tournament_id, participant_id, participant_kind, entry_state)
  VALUES (v_t2, extensions.gen_random_uuid(), 'horse', 'entered'),
         (v_t2, extensions.gen_random_uuid(), 'horse', 'entered');

  -- (d) scheduler_duplicate_owner (2 unfinished owner runs)
  INSERT INTO public.trivia_tournament_scheduler_runs (outcome, finished_at)
  VALUES ('owner', NULL), ('owner', NULL);

  -- (e) tournament_round_stuck + (f) tournament_match_stuck (>120s past deadline)
  INSERT INTO public.trivia_tournament_bracket_rounds (tournament_id, round_number, status, deadline_at, resolved_count, matchup_count)
  VALUES (v_t2, 1, 'open', clock_timestamp() - interval '180 seconds', 0, 1);
  INSERT INTO public.trivia_tournament_matchups (id, tournament_id, round_number, status)
  VALUES (v_m1, v_t2, 1, 'ready');

  -- (g) settlement_reconciliation_open (terminal PvP match with locked settlement)
  INSERT INTO public.trivia_pvp_matches (id, player1_id, player2_id, status, match_kind, stake_amount, completed_at)
  VALUES (v_p1, v_usr, extensions.gen_random_uuid(), 'complete', 'human_horse', 25, clock_timestamp());
  INSERT INTO public.trivia_ledger_accounts (account_code, balance) VALUES ('escrow:pvp:' || v_p1::text, 0);
  INSERT INTO public.trivia_settlements (id, subject_type, subject_id, escrow_account_code, state)
  VALUES (v_s1, 'pvp_match', v_p1, 'escrow:pvp:' || v_p1::text, 'locked');

  -- (h) settlement_escrow_nonzero (terminal settled tournament with nonzero escrow)
  INSERT INTO public.trivia_tournaments
    (id, engine_version, schedule_kind, lifecycle_state, start_time, registration_closes_at, horse_target, horse_population_mode)
  VALUES
    (v_t3, 'trivia-nightly-bracket/1.0.0', 'public_nightly', 'settled', clock_timestamp() - interval '2 hours', clock_timestamp() - interval '2 hours', 70, 'enabled');
  INSERT INTO public.trivia_ledger_accounts (account_code, balance) VALUES ('escrow:tournament:' || v_t3::text, 50);
  INSERT INTO public.trivia_settlements (id, subject_type, subject_id, escrow_account_code, state, outcome)
  VALUES (v_s2, 'tournament', v_t3, 'escrow:tournament:' || v_t3::text, 'settled', 'win');

  -- Fire health evaluation with p_record=true
  v_res := public.trivia_operations_health_v1(v_sup, true);
  SELECT array_agg(DISTINCT elem->>'code' ORDER BY elem->>'code')
    INTO v_codes
    FROM jsonb_array_elements(v_res->'active_alerts') elem;

  IF (v_res->>'healthy')::boolean THEN
    RAISE EXCEPTION 'expected unhealthy during 8-fault alert drill';
  END IF;
  IF v_codes <> ARRAY[
      'eligible_pool_short',
      'horse_field_missing',
      'horse_field_short',
      'scheduler_duplicate_owner',
      'settlement_escrow_nonzero',
      'settlement_reconciliation_open',
      'tournament_match_stuck',
      'tournament_round_stuck'
  ] THEN
    RAISE EXCEPTION 'alert drill missed conditions! got=%', v_codes;
  END IF;

  -- Verify durable firing episodes & events
  IF (SELECT count(*) FROM public.trivia_operations_alert_episodes_v1 WHERE resolved_at IS NULL) <> 8 THEN
    RAISE EXCEPTION 'expected 8 active alert episodes';
  END IF;
  IF (SELECT count(*) FROM public.trivia_operations_alert_events_v1 WHERE transition = 'firing') <> 8 THEN
    RAISE EXCEPTION 'expected 8 firing alert events';
  END IF;

  -- Idempotent re-poll must NOT create duplicate firing events or bump occurrence_count
  PERFORM public.trivia_operations_health_v1(v_sup, true);
  IF (SELECT count(*) FROM public.trivia_operations_alert_events_v1 WHERE transition = 'firing') <> 8
     OR (SELECT max(occurrence_count) FROM public.trivia_operations_alert_episodes_v1) <> 1 THEN
    RAISE EXCEPTION 'repeat poll duplicated alert firing events';
  END IF;

  -- 3. Clear ALL 8 faults and verify clean resolution transitions!
  UPDATE public.p11_drill_state SET eligible_pool = 15000 WHERE id = 1;
  UPDATE public.trivia_tournaments SET horse_target = 100 WHERE id = v_t1;
  UPDATE public.trivia_tournaments SET lifecycle_state = 'settled' WHERE id = v_t2;
  UPDATE public.trivia_tournament_scheduler_runs SET finished_at = clock_timestamp() WHERE finished_at IS NULL;
  UPDATE public.trivia_tournament_bracket_rounds SET status = 'closed' WHERE tournament_id = v_t2;
  UPDATE public.trivia_tournament_matchups SET status = 'resolved' WHERE id = v_m1;
  UPDATE public.trivia_settlements SET state = 'settled' WHERE id = v_s1;
  UPDATE public.trivia_ledger_accounts SET balance = 0 WHERE account_code = 'escrow:tournament:' || v_t3::text;

  v_res := public.trivia_operations_health_v1(v_sup, true);
  IF NOT (v_res->>'healthy')::boolean OR jsonb_array_length(v_res->'active_alerts') <> 0 THEN
    RAISE EXCEPTION 'alerts failed to resolve cleanly: %', v_res;
  END IF;
  IF (SELECT count(*) FROM public.trivia_operations_alert_events_v1 WHERE transition = 'resolved') <> 8 THEN
    RAISE EXCEPTION 'expected 8 resolved alert events';
  END IF;

  -- Re-fire one fault and verify occurrence_count increments to 2
  UPDATE public.p11_drill_state SET eligible_pool = 50 WHERE id = 1;
  PERFORM public.trivia_operations_health_v1(v_sup, true);
  IF (SELECT occurrence_count FROM public.trivia_operations_alert_episodes_v1 WHERE code = 'eligible_pool_short') <> 2 THEN
    RAISE EXCEPTION 'expected occurrence_count=2 on re-fire';
  END IF;
  UPDATE public.p11_drill_state SET eligible_pool = 15000 WHERE id = 1;
  PERFORM public.trivia_operations_health_v1(v_sup, true);

  -- 4. Kill-Switch Drills (pvp_joins_set, pvp_horses_set, replay, conflict)
  v_res := public.trivia_operator_execute_v1(v_sup, 'drill-kill-joins-01', 'pvp_joins_set', 'Phase 11 drill disabling PvP joins.', NULL, '{"enabled":false}'::jsonb);
  IF COALESCE((v_res->>'success')::boolean, false) IS NOT TRUE OR (SELECT joins_enabled FROM public.trivia_pvp_engine_config WHERE id = 1) THEN
    RAISE EXCEPTION 'pvp_joins_set false drill failed: %', v_res;
  END IF;
  -- Identical replay must return replayed=true with exact same receipt_id
  v_res2 := public.trivia_operator_execute_v1(v_sup, 'drill-kill-joins-01', 'pvp_joins_set', 'Phase 11 drill disabling PvP joins.', NULL, '{"enabled":false}'::jsonb);
  IF COALESCE((v_res2->>'replayed')::boolean, false) IS NOT TRUE
     OR COALESCE(v_res2->>'receipt_id', '') <> COALESCE(v_res->>'receipt_id', 'x') THEN
    RAISE EXCEPTION 'idempotent replay failed: % vs %', v_res, v_res2;
  END IF;
  -- Conflicting payload with same request_key must refuse with idempotency_conflict
  v_res2 := public.trivia_operator_execute_v1(v_sup, 'drill-kill-joins-01', 'pvp_joins_set', 'Phase 11 drill disabling PvP joins.', NULL, '{"enabled":true}'::jsonb);
  IF COALESCE(v_res2->>'error', '') <> 'idempotency_conflict' THEN
    RAISE EXCEPTION 'idempotency conflict was not refused: %', v_res2;
  END IF;
  -- Re-enable joins & toggle horses
  PERFORM public.trivia_operator_execute_v1(v_sup, 'drill-kill-joins-02', 'pvp_joins_set', 'Phase 11 drill restoring PvP joins.', NULL, '{"enabled":true}'::jsonb);
  PERFORM public.trivia_operator_execute_v1(v_sup, 'drill-kill-horses-01', 'pvp_horses_set', 'Phase 11 drill disabling PvP horses.', NULL, '{"enabled":false}'::jsonb);
  IF (SELECT horses_enabled FROM public.trivia_pvp_engine_config WHERE id = 1) THEN
    RAISE EXCEPTION 'pvp_horses_set false failed';
  END IF;
  PERFORM public.trivia_operator_execute_v1(v_sup, 'drill-kill-horses-02', 'pvp_horses_set', 'Phase 11 drill restoring PvP horses.', NULL, '{"enabled":true}'::jsonb);

  -- 5. PvP recovery standby vs owner receipt truthfulness
  UPDATE public.p11_drill_state SET pvp_recover_standby = true WHERE id = 1;
  v_res := public.trivia_operator_execute_v1(v_sup, 'drill-pvp-rec-standby', 'pvp_recover', 'Phase 11 drill testing standby PvP recovery.', NULL, '{"limit":25}'::jsonb);
  IF (v_res->>'success')::boolean OR (v_res->>'outcome') <> 'standby' THEN
    RAISE EXCEPTION 'standby PvP recovery falsely succeeded: %', v_res;
  END IF;
  UPDATE public.p11_drill_state SET pvp_recover_standby = false WHERE id = 1;
  v_res := public.trivia_operator_execute_v1(v_sup, 'drill-pvp-rec-owner', 'pvp_recover', 'Phase 11 drill testing owner PvP recovery.', NULL, '{"limit":25}'::jsonb);
  IF NOT (v_res->>'success')::boolean OR (v_res->>'outcome') <> 'succeeded' THEN
    RAISE EXCEPTION 'owner PvP recovery failed: %', v_res;
  END IF;

  -- 6. Tournament recover settlement fenced busy vs owner + tournament_cancel
  UPDATE public.trivia_tournaments SET lifecycle_state = 'settling' WHERE id = v_t1;
  UPDATE public.p11_drill_state SET scheduler_busy = true WHERE id = 1;
  v_res := public.trivia_operator_execute_v1(v_sup, 'drill-tourn-rec-busy', 'tournament_recover_settlement', 'Phase 11 drill testing busy fence refusal.', v_t1, '{}'::jsonb);
  IF (v_res->>'success')::boolean OR (v_res->'result'->>'error') <> 'scheduler_busy' THEN
    RAISE EXCEPTION 'busy fence was not respected: %', v_res;
  END IF;
  UPDATE public.p11_drill_state SET scheduler_busy = false WHERE id = 1;
  v_res := public.trivia_operator_execute_v1(v_sup, 'drill-tourn-rec-ok', 'tournament_recover_settlement', 'Phase 11 drill testing owner settlement recovery.', v_t1, '{}'::jsonb);
  IF NOT (v_res->>'success')::boolean OR (SELECT lifecycle_state FROM public.trivia_tournaments WHERE id = v_t1) <> 'settled' THEN
    RAISE EXCEPTION 'owner settlement recovery failed: %', v_res;
  END IF;

  -- 7. Incident note + question quarantine/release + immutability guard
  v_res := public.trivia_operator_execute_v1(v_sup, 'drill-note-01', 'incident_note', 'Phase 11 incident note drill.', NULL,
    '{"incidentKey":"p11-drill-001","severity":"warning","status":"open","note":"Testing immutable incident note persistence."}'::jsonb);
  IF NOT (v_res->>'success')::boolean THEN RAISE EXCEPTION 'incident note failed: %', v_res; END IF;
  PERFORM public.trivia_operator_execute_v1(v_sup, 'drill-q-quar-01', 'question_quarantine', 'Phase 11 question quarantine drill.', v_q, '{"reasonCode":"ambiguous_wording"}'::jsonb);
  PERFORM public.trivia_operator_execute_v1(v_sup, 'drill-q-rel-01', 'question_release', 'Phase 11 question release drill.', v_q, '{}'::jsonb);

  -- Immutability check: UPDATE/DELETE on operator events & alert events must raise 42501
  v_refused := false;
  BEGIN
    DELETE FROM public.trivia_operator_events_v1;
  EXCEPTION WHEN insufficient_privilege THEN v_refused := true; END;
  IF NOT v_refused THEN RAISE EXCEPTION 'trivia_operator_events_v1 DELETE was not refused'; END IF;

  v_refused := false;
  BEGIN
    UPDATE public.trivia_operations_alert_events_v1 SET summary = 'tampered';
  EXCEPTION WHEN insufficient_privilege THEN v_refused := true; END;
  IF NOT v_refused THEN RAISE EXCEPTION 'trivia_operations_alert_events_v1 UPDATE was not refused'; END IF;

  -- 8. RBAC & privacy-safe support lookup checks
  v_res := public.trivia_operator_execute_v1(v_obs, 'drill-obs-refuse-01', 'pvp_joins_set', 'Observer attempting kill switch.', NULL, '{"enabled":false}'::jsonb);
  IF COALESCE((v_res->>'success')::boolean, true) IS NOT FALSE
     OR COALESCE(v_res->>'error', '') <> 'operator_capability_required'
     OR NOT (SELECT joins_enabled FROM public.trivia_pvp_engine_config WHERE id = 1) THEN
    RAISE EXCEPTION 'observer kill switch refusal failed: %', v_res;
  END IF;

  -- Browser role ACL refusal check
  IF has_function_privilege('anon', 'public.trivia_operator_execute_v1(uuid,text,text,text,uuid,jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.trivia_operator_execute_v1(uuid,text,text,text,uuid,jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.trivia_operations_health_v1(uuid,boolean)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.trivia_operations_health_v1(uuid,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'browser role granted execute on operator RPC';
  END IF;

  v_refused := false;
  BEGIN
    PERFORM public.trivia_operations_health_v1(v_usr, false);
  EXCEPTION WHEN insufficient_privilege THEN v_refused := true; END;
  IF NOT v_refused THEN RAISE EXCEPTION 'non-operator was allowed to call trivia_operations_health_v1'; END IF;

  v_res := public.trivia_operator_support_lookup_v1(v_obs, 'question', v_q);
  IF v_res::text LIKE '%SECRET_ANSWER_NEVER_EXPOSE%' THEN
    RAISE EXCEPTION 'support lookup leaked correct_answer: %', v_res;
  END IF;
  v_res := public.trivia_operator_support_lookup_v1(v_obs, 'user', v_usr);
  IF v_res::text LIKE '%player@example.com%' THEN
    RAISE EXCEPTION 'support lookup leaked email: %', v_res;
  END IF;
END
$drills$;

SELECT jsonb_build_object(
  'suite', 'p11-alert-killswitch-drills-pg17',
  'status', 'PASS',
  'alert_episodes', (SELECT count(*) FROM public.trivia_operations_alert_episodes_v1),
  'firing_events', (SELECT count(*) FROM public.trivia_operations_alert_events_v1 WHERE transition = 'firing'),
  'resolved_events', (SELECT count(*) FROM public.trivia_operations_alert_events_v1 WHERE transition = 'resolved'),
  'operator_receipts', (SELECT count(*) FROM public.trivia_operator_events_v1),
  'incident_notes', (SELECT count(*) FROM public.trivia_incident_notes_v1)
) AS result;
