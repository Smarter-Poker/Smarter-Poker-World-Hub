\set ON_ERROR_STOP on
SELECT set_config('request.jwt.claim.role','service_role',false);

DO $historical$
DECLARE r jsonb;
BEGIN
  IF (SELECT high_score FROM public.endless_high_scores WHERE user_id='10000000-0000-4000-8000-000000000009' AND mode='random')<>9
     OR EXISTS(SELECT 1 FROM public.endless_high_scores WHERE user_id='10000000-0000-4000-8000-000000000010' AND mode='random')
     OR (SELECT high_score FROM public.endless_high_scores WHERE user_id='10000000-0000-4000-8000-000000000010' AND mode='category:holdem')<>88
     OR (SELECT high_score FROM public.endless_high_scores WHERE user_id='10000000-0000-4000-8000-000000000011' AND mode='random')<>6
     OR (SELECT high_score FROM public.endless_high_scores WHERE user_id='10000000-0000-4000-8000-000000000012' AND mode='random')<>5 THEN
    RAISE EXCEPTION 'historical Endless reconciliation failed';
  END IF;
  IF (SELECT evidence_session_id FROM public.trivia_endless_high_score_reconciliations_v1 WHERE user_id='10000000-0000-4000-8000-000000000012')
       IS DISTINCT FROM '40000000-0000-4000-8000-000000000003'::uuid
     OR (SELECT action FROM public.trivia_endless_high_score_reconciliations_v1 WHERE user_id='10000000-0000-4000-8000-000000000010')<>'deleted' THEN
    RAISE EXCEPTION 'overrun/no-evidence reconciliation receipt failed';
  END IF;
  IF (SELECT source_binding FROM public.trivia_paid_skip_receipts_v1 WHERE session_id='40000000-0000-4000-8000-000000000005')<>'legacy_ledger_only'
     OR (SELECT spend_reference FROM public.trivia_paid_skip_receipts_v1 WHERE session_id='40000000-0000-4000-8000-000000000005')!~'^trivia_lifeline:'
     OR (SELECT source_binding FROM public.trivia_paid_skip_receipts_v1 WHERE session_id='40000000-0000-4000-8000-000000000006')<>'legacy_ledger_only'
     OR (SELECT spend_reference FROM public.trivia_paid_skip_receipts_v1 WHERE session_id='40000000-0000-4000-8000-000000000006')!~'^spend:' THEN
    RAISE EXCEPTION 'raw/canonical ledger-only evidence was not adopted';
  END IF;
  IF (SELECT outcome FROM public.trivia_session_answers WHERE session_id='40000000-0000-4000-8000-000000000005' AND position=1) IS NOT NULL
     OR (SELECT answers FROM public.trivia_sessions WHERE id='40000000-0000-4000-8000-000000000006')?public.test_q(112)::text THEN
    RAISE EXCEPTION 'submitted evidence mutated during adoption';
  END IF;
  r:=public.trivia_paid_skip_status_v1('40000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000018');
  IF r->>'paidSkipCount'<>'1' OR r->>'nonPaidMissCount'<>'3' OR r->>'runMissLimitReached'<>'true' OR r->>'overrun'<>'false' THEN
    RAISE EXCEPTION 'V3 historical boundary failed: %',r;
  END IF;
  r:=public.trivia_paid_skip_status_v1('40000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000019');
  IF r->>'paidSkipCount'<>'1' OR r->>'nonPaidMissCount'<>'3' OR r->>'runMissLimitReached'<>'true' OR r->>'overrun'<>'false' THEN
    RAISE EXCEPTION 'legacy historical boundary failed: %',r;
  END IF;
END $historical$;

DO $paid_skip$
DECLARE r jsonb; before_count integer;
BEGIN
  PERFORM set_config('test.solo_shape','off',false);
  r:=public.trivia_paid_skip_v1('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',public.test_q(1),NULL);
  IF r->>'success'<>'true' OR r->>'newlyCharged'<>'true' OR r->>'diamondsCharged'<>'5' OR r->>'newBalance'<>'95' THEN
    RAISE EXCEPTION 'fresh OFF skip failed: %',r;
  END IF;
  PERFORM public.trivia_paid_skip_v1('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',public.test_q(2),NULL);
  PERFORM public.trivia_paid_skip_v1('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',public.test_q(3),NULL);
  r:=public.trivia_paid_skip_v1('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',public.test_q(4),NULL);
  IF r->>'error'<>'paid_skip_limit_reached' OR (SELECT diamonds FROM public.profiles WHERE id='10000000-0000-4000-8000-000000000001')<>85
     OR (SELECT count(*) FROM public.diamond_transactions WHERE user_id='10000000-0000-4000-8000-000000000001')<>3
     OR (SELECT outcome FROM public.trivia_session_answers WHERE session_id='30000000-0000-4000-8000-000000000001' AND position=4) IS NOT NULL THEN
    RAISE EXCEPTION 'fourth skip was not refused: %',r;
  END IF;
  r:=public.trivia_paid_skip_status_v1('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001');
  IF r->>'paidSkipCount'<>'3' OR r->>'nonPaidMissCount'<>'0' OR r->>'runMissLimitReached'<>'false' THEN
    RAISE EXCEPTION 'paid skips counted as Endless misses: %',r;
  END IF;
  UPDATE public.profiles SET diamonds=diamonds+7 WHERE id='10000000-0000-4000-8000-000000000001';
  UPDATE public.trivia_sessions SET status='submitted',submitted_at=clock_timestamp() WHERE id='30000000-0000-4000-8000-000000000001';
  r:=public.trivia_paid_skip_v1('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',public.test_q(1),NULL);
  IF r->>'replayed'<>'true' OR r->>'newlyCharged'<>'false' OR r->>'newBalance'<>'92' OR r->>'chargeBalanceAfter'<>'95' THEN
    RAISE EXCEPTION 'closed replay/current balance failed: %',r;
  END IF;

  r:=public.trivia_paid_skip_v1('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',public.test_q(21),NULL);
  IF r->>'entitlementWasVip'<>'true' OR r->>'diamondsCharged'<>'0' OR r->>'newlyCharged'<>'false'
     OR EXISTS(SELECT 1 FROM public.diamond_transactions WHERE user_id='10000000-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION 'VIP skip failed: %',r;
  END IF;
  r:=public.trivia_paid_skip_status_v1('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002');
  IF r->>'survivalLevel'<>'1' OR r->>'requiredCorrect'<>'17' OR r->>'missLimit'<>'4' OR r->>'terminalFailureCount'<>'1' THEN
    RAISE EXCEPTION 'Survival status authority failed: %',r;
  END IF;

  r:=public.trivia_paid_skip_v1('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003',public.test_q(6),NULL);
  IF r->>'success'<>'true' OR r->>'replayed'<>'true' OR r->>'entitlementWasVip'<>'false' OR r->>'currentVipEligible'<>'true'
     OR r->>'diamondsCharged'<>'5' OR r->>'newBalance'<>'95'
     OR NOT((SELECT answers FROM public.trivia_sessions WHERE id='30000000-0000-4000-8000-000000000003')?public.test_q(6)::text)
     OR (SELECT count(*) FROM public.diamond_transactions WHERE user_id='10000000-0000-4000-8000-000000000003')<>1 THEN
    RAISE EXCEPTION 'open legacy debit adoption failed: %',r;
  END IF;

  SELECT count(*) INTO before_count FROM public.diamond_transactions;
  r:=public.trivia_paid_skip_v1('30000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000004',public.test_q(9),NULL);
  IF r->>'error'<>'question_unavailable' OR (SELECT diamonds FROM public.profiles WHERE id='10000000-0000-4000-8000-000000000004')<>100
     OR (SELECT count(*) FROM public.diamond_transactions)<>before_count
     OR EXISTS(SELECT 1 FROM public.trivia_paid_skip_receipts_v1 WHERE session_id='30000000-0000-4000-8000-000000000004')
     OR (SELECT server_voided_at FROM public.trivia_session_answers WHERE session_id='30000000-0000-4000-8000-000000000004') IS NULL THEN
    RAISE EXCEPTION 'invalid question left partial paid skip: %',r;
  END IF;
  r:=public.trivia_paid_skip_v1('30000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000005',public.test_q(10),NULL);
  IF r->>'error'<>'insufficient_diamonds' OR (SELECT outcome FROM public.trivia_session_answers WHERE session_id='30000000-0000-4000-8000-000000000005') IS NOT NULL THEN
    RAISE EXCEPTION 'insufficient balance bound answer: %',r;
  END IF;
  PERFORM set_config('test.solo_shape','on',false);
  r:=public.trivia_paid_skip_v1('30000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000006',public.test_q(11),NULL);
  IF r->>'success'<>'true' OR r->>'newlyCharged'<>'true' OR r->>'diamondsCharged'<>'5' THEN RAISE EXCEPTION 'fresh ON skip failed: %',r; END IF;
END $paid_skip$;

DO $late_adoption$
DECLARE r jsonb;
BEGIN
  PERFORM set_config('trivia.phase9_paid_skip_authority','on',true);
  UPDATE public.profiles SET diamonds=95 WHERE id='10000000-0000-4000-8000-000000000025';
  INSERT INTO public.diamond_transactions(user_id,amount,transaction_type,type,description,balance_after,reference_id,counterparty,issuance_class,created_at)
  VALUES('10000000-0000-4000-8000-000000000025',-5,'trivia_lifeline','trivia_lifeline','late old-client skip',95,
    'trivia_lifeline:30000000-0000-4000-8000-000000000025:20000000-0000-4000-8000-000000000220:skip','revenue:trivia_lifeline','spend',
    (SELECT created_at+interval '1 second' FROM public.trivia_sessions WHERE id='30000000-0000-4000-8000-000000000025'));
  PERFORM set_config('trivia.phase9_paid_skip_authority','',true);
  r:=public.trivia_paid_skip_v1('30000000-0000-4000-8000-000000000025','10000000-0000-4000-8000-000000000025',public.test_q(220),NULL);
  IF r->>'success'<>'true' OR r->>'replayed'<>'true' OR r->>'newlyCharged'<>'false' OR r->>'paidSkipCount'<>'1'
     OR (SELECT count(*) FROM public.diamond_transactions WHERE user_id='10000000-0000-4000-8000-000000000025')<>1
     OR (SELECT outcome FROM public.trivia_session_answers WHERE session_id='30000000-0000-4000-8000-000000000025' AND position=1)<>'skip' THEN
    RAISE EXCEPTION 'late same-question adoption failed: %',r;
  END IF;

  PERFORM set_config('trivia.phase9_paid_skip_authority','on',true);
  UPDATE public.profiles SET diamonds=85 WHERE id='10000000-0000-4000-8000-000000000026';
  INSERT INTO public.diamond_transactions(user_id,amount,transaction_type,type,description,balance_after,reference_id,counterparty,issuance_class,created_at)
  SELECT '10000000-0000-4000-8000-000000000026',-5,'trivia_lifeline','trivia_lifeline','late capped skip',100-q.position::integer*5,
    'trivia_lifeline:30000000-0000-4000-8000-000000000026:'||q.question_id::text||':skip','revenue:trivia_lifeline','spend',
    (SELECT created_at FROM public.trivia_sessions WHERE id='30000000-0000-4000-8000-000000000026')
      +q.position::integer*interval '1 second'
  FROM unnest(ARRAY[public.test_q(222),public.test_q(223),public.test_q(224)]) WITH ORDINALITY q(question_id,position);
  PERFORM set_config('trivia.phase9_paid_skip_authority','',true);
  r:=public.trivia_paid_skip_v1('30000000-0000-4000-8000-000000000026','10000000-0000-4000-8000-000000000026',public.test_q(225),NULL);
  IF r->>'error'<>'paid_skip_limit_reached' OR r->>'paidSkipCount'<>'3'
     OR (SELECT count(*) FROM public.trivia_paid_skip_receipts_v1 WHERE session_id='30000000-0000-4000-8000-000000000026')<>3
     OR (SELECT outcome FROM public.trivia_session_answers WHERE session_id='30000000-0000-4000-8000-000000000026' AND position=4) IS NOT NULL THEN
    RAISE EXCEPTION 'late third receipt did not close cap: %',r;
  END IF;
END $late_adoption$;

DO $answer_boundaries$
DECLARE r jsonb; g jsonb;
BEGIN
  r:=public.trivia_legacy_session_answer_v1('30000000-0000-4000-8000-000000000014','10000000-0000-4000-8000-000000000014',public.test_q(47),0,NULL);
  IF r->>'error'<>'position_out_of_order' OR r->>'expectedPosition'<>'1' OR r->>'priorQuestionId'<>public.test_q(46)::text THEN
    RAISE EXCEPTION 'legacy sequence refusal failed: %',r;
  END IF;
  r:=public.trivia_paid_skip_v1('30000000-0000-4000-8000-000000000014','10000000-0000-4000-8000-000000000014',public.test_q(47),NULL);
  IF r->>'error'<>'position_out_of_order' OR r->>'expectedPosition'<>'1' OR r->>'priorQuestionId'<>public.test_q(46)::text THEN
    RAISE EXCEPTION 'paid skip sequence refusal failed: %',r;
  END IF;
  PERFORM public.trivia_legacy_session_answer_v1('30000000-0000-4000-8000-000000000014','10000000-0000-4000-8000-000000000014',public.test_q(46),-1,NULL);
  r:=public.trivia_paid_skip_v1('30000000-0000-4000-8000-000000000014','10000000-0000-4000-8000-000000000014',public.test_q(47),NULL);
  IF r->>'success'<>'true' OR r->>'nonPaidMissCount'<>'1' THEN RAISE EXCEPTION 'prior retry did not reopen next position: %',r; END IF;

  PERFORM public.trivia_session_answer_v4('30000000-0000-4000-8000-000000000013','10000000-0000-4000-8000-000000000013',public.test_q(41),1,NULL);
  PERFORM public.trivia_session_answer_v4('30000000-0000-4000-8000-000000000013','10000000-0000-4000-8000-000000000013',public.test_q(42),1,NULL);
  r:=public.trivia_session_answer_v4('30000000-0000-4000-8000-000000000013','10000000-0000-4000-8000-000000000013',public.test_q(43),1,NULL);
  IF r->>'success'<>'true' OR r->>'nonPaidMissCount'<>'3' OR r->>'runMissLimitReached'<>'true' THEN RAISE EXCEPTION 'third Endless miss failed: %',r; END IF;
  r:=public.trivia_session_answer_v4('30000000-0000-4000-8000-000000000013','10000000-0000-4000-8000-000000000013',public.test_q(44),0,NULL);
  IF r->>'error'<>'run_miss_limit_reached' THEN RAISE EXCEPTION 'fourth Endless answer admitted: %',r; END IF;
  r:=public.trivia_paid_skip_v1('30000000-0000-4000-8000-000000000013','10000000-0000-4000-8000-000000000013',public.test_q(44),NULL);
  IF r->>'error'<>'run_miss_limit_reached' THEN RAISE EXCEPTION 'terminal Endless paid skip admitted: %',r; END IF;
  UPDATE public.trivia_session_answers SET outcome='correct',display_index=0,original_index=0,is_correct=true,sequence=4,answered_at=clock_timestamp()
   WHERE session_id='30000000-0000-4000-8000-000000000013' AND position=4;
  g:=public.trivia_p3_grade('30000000-0000-4000-8000-000000000013');
  r:=public.trivia_session_settle_solo_v4('30000000-0000-4000-8000-000000000013','10000000-0000-4000-8000-000000000013',0,g,extensions.gen_random_uuid());
  IF r->>'error'<>'run_miss_limit_reached' OR (SELECT status FROM public.trivia_sessions WHERE id='30000000-0000-4000-8000-000000000013')<>'open'
     OR EXISTS(SELECT 1 FROM public.trivia_scores WHERE session_id='30000000-0000-4000-8000-000000000013') THEN
    RAISE EXCEPTION 'forged overrun settled: %',r;
  END IF;

  r:=public.trivia_session_answer_v4('30000000-0000-4000-8000-000000000015','10000000-0000-4000-8000-000000000015',public.test_q(19),1,NULL);
  IF r->>'success'<>'true' OR r->>'voided'<>'true' OR r->>'nonPaidMissCount'<>'0' OR r->>'terminalFailureCount'<>'0' OR r->>'runMissLimitReached'<>'false' THEN
    RAISE EXCEPTION 'engine neutral void counted: %',r;
  END IF;
  r:=public.trivia_session_answer_v4('30000000-0000-4000-8000-000000000015','10000000-0000-4000-8000-000000000015',public.test_q(20),0,NULL);
  IF r->>'success'<>'true' THEN RAISE EXCEPTION 'engine did not advance after void: %',r; END IF;
  r:=public.trivia_legacy_session_answer_v1('30000000-0000-4000-8000-000000000016','10000000-0000-4000-8000-000000000016',public.test_q(19),1,NULL);
  IF r->>'success'<>'true' OR r->>'voided'<>'true' OR r->>'nonPaidMissCount'<>'0' OR r->>'terminalFailureCount'<>'0' OR r->>'runMissLimitReached'<>'false' THEN
    RAISE EXCEPTION 'legacy neutral void counted: %',r;
  END IF;
  r:=public.trivia_legacy_session_answer_v1('30000000-0000-4000-8000-000000000016','10000000-0000-4000-8000-000000000016',public.test_q(20),0,NULL);
  IF r->>'success'<>'true' THEN RAISE EXCEPTION 'legacy did not advance after void: %',r; END IF;
END $answer_boundaries$;

DO $survival$
DECLARE r jsonb; g jsonb;
BEGIN
  PERFORM public.trivia_session_answer_v4('30000000-0000-4000-8000-000000000022','10000000-0000-4000-8000-000000000022',public.test_q(160),1,NULL);
  PERFORM public.trivia_session_answer_v4('30000000-0000-4000-8000-000000000022','10000000-0000-4000-8000-000000000022',public.test_q(161),1,NULL);
  r:=public.trivia_session_answer_v4('30000000-0000-4000-8000-000000000022','10000000-0000-4000-8000-000000000022',public.test_q(162),1,NULL);
  IF r->>'terminalFailureCount'<>'3' OR r->>'runMissLimitReached'<>'false' THEN RAISE EXCEPTION 'level1 stopped at miss3: %',r; END IF;
  r:=public.trivia_session_answer_v4('30000000-0000-4000-8000-000000000022','10000000-0000-4000-8000-000000000022',public.test_q(163),0,NULL);
  IF r->>'success'<>'true' OR r->>'runMissLimitReached'<>'false' THEN RAISE EXCEPTION 'level1 correct after miss3 blocked: %',r; END IF;
  r:=public.trivia_session_answer_v4('30000000-0000-4000-8000-000000000022','10000000-0000-4000-8000-000000000022',public.test_q(164),1,NULL);
  IF r->>'terminalFailureCount'<>'4' OR r->>'missLimit'<>'4' OR r->>'runMissLimitReached'<>'true' THEN RAISE EXCEPTION 'level1 miss4 not terminal: %',r; END IF;
  r:=public.trivia_session_answer_v4('30000000-0000-4000-8000-000000000022','10000000-0000-4000-8000-000000000022',public.test_q(165),0,NULL);
  IF r->>'error'<>'run_miss_limit_reached' THEN RAISE EXCEPTION 'post-terminal Survival answer admitted: %',r; END IF;
  g:=public.trivia_p3_grade('30000000-0000-4000-8000-000000000022');
  r:=public.trivia_session_settle_solo_v4('30000000-0000-4000-8000-000000000022','10000000-0000-4000-8000-000000000022',0,g,extensions.gen_random_uuid());
  IF r->>'success'<>'true' THEN RAISE EXCEPTION 'exact-terminal Survival settlement blocked: %',r; END IF;

  r:=public.trivia_session_answer_v4('30000000-0000-4000-8000-000000000023','10000000-0000-4000-8000-000000000023',public.test_q(180),1,NULL);
  IF r->>'runMissLimitReached'<>'false' THEN RAISE EXCEPTION 'level4 stopped at miss1: %',r; END IF;
  r:=public.trivia_session_answer_v4('30000000-0000-4000-8000-000000000023','10000000-0000-4000-8000-000000000023',public.test_q(181),1,NULL);
  IF r->>'runMissLimitReached'<>'true' OR r->>'missLimit'<>'2' THEN RAISE EXCEPTION 'level4 miss2 not terminal: %',r; END IF;
  r:=public.trivia_paid_skip_status_v1('30000000-0000-4000-8000-000000000023','10000000-0000-4000-8000-000000000023');
  IF r->>'survivalLevel'<>'4' OR r->>'requiredCorrect'<>'19' OR r->>'maxPossibleCorrect'<>'18' THEN RAISE EXCEPTION 'level4 projection failed: %',r; END IF;

  PERFORM public.trivia_session_answer_v4('30000000-0000-4000-8000-000000000024','10000000-0000-4000-8000-000000000024',public.test_q(200),1,NULL);
  PERFORM public.trivia_session_answer_v4('30000000-0000-4000-8000-000000000024','10000000-0000-4000-8000-000000000024',public.test_q(201),1,NULL);
  PERFORM public.trivia_session_answer_v4('30000000-0000-4000-8000-000000000024','10000000-0000-4000-8000-000000000024',public.test_q(202),1,NULL);
  r:=public.trivia_paid_skip_v1('30000000-0000-4000-8000-000000000024','10000000-0000-4000-8000-000000000024',public.test_q(203),NULL);
  IF r->>'success'<>'true' OR r->>'terminalFailureCount'<>'4' OR r->>'runMissLimitReached'<>'true' THEN RAISE EXCEPTION 'terminal paid skip failed: %',r; END IF;
  r:=public.trivia_paid_skip_v1('30000000-0000-4000-8000-000000000024','10000000-0000-4000-8000-000000000024',public.test_q(204),NULL);
  IF r->>'error'<>'run_miss_limit_reached' OR (SELECT diamonds FROM public.profiles WHERE id='10000000-0000-4000-8000-000000000024')<>95 THEN
    RAISE EXCEPTION 'post-terminal paid skip charged: %',r;
  END IF;
END $survival$;

DO $settlement$
DECLARE r jsonb; replay jsonb; g jsonb; snapshot jsonb;
BEGIN
  PERFORM public.trivia_session_answer_v4('30000000-0000-4000-8000-000000000020','10000000-0000-4000-8000-000000000020',public.test_q(71),0,NULL);
  g:=public.trivia_p3_grade('30000000-0000-4000-8000-000000000020');
  r:=public.trivia_session_settle_solo_v4('30000000-0000-4000-8000-000000000020','10000000-0000-4000-8000-000000000020',0,g,'51000000-0000-4000-8000-000000000020');
  IF r->>'success'<>'true' OR r#>>'{highScoreProjection,status}'<>'persisted' OR r#>>'{highScoreProjection,verifiedCorrect}'<>'1'
     OR (SELECT high_score FROM public.endless_high_scores WHERE user_id='10000000-0000-4000-8000-000000000020' AND mode='random')<>1 THEN
    RAISE EXCEPTION 'engine v4 settle/project failed: %',r;
  END IF;
  replay:=public.trivia_session_settle_solo_v4('30000000-0000-4000-8000-000000000020','10000000-0000-4000-8000-000000000020',0,g,'51000000-0000-4000-8000-000000000020');
  IF replay->>'replayed'<>'true' OR replay#>>'{highScoreProjection,replayed}'<>'true'
     OR (SELECT count(*) FROM public.trivia_endless_high_score_projections_v1 WHERE session_id='30000000-0000-4000-8000-000000000020')<>1 THEN
    RAISE EXCEPTION 'engine settle replay failed: %',replay;
  END IF;
  INSERT INTO public.trivia_question_quarantine(question_id) VALUES(public.test_q(72));
  replay:=public.trivia_session_settle_solo_v4('30000000-0000-4000-8000-000000000020','10000000-0000-4000-8000-000000000020',0,g,'51000000-0000-4000-8000-000000000020');
  IF replay->>'success'<>'true' OR (SELECT outcome FROM public.trivia_session_answers WHERE session_id='30000000-0000-4000-8000-000000000020' AND position=2) IS NOT NULL
     OR (SELECT server_voided_at FROM public.trivia_session_answers WHERE session_id='30000000-0000-4000-8000-000000000020' AND position=2) IS NOT NULL THEN
    RAISE EXCEPTION 'quarantine mutated sealed evidence: %',replay;
  END IF;

  PERFORM public.trivia_legacy_session_answer_v1('30000000-0000-4000-8000-000000000021','10000000-0000-4000-8000-000000000021',public.test_q(73),0,NULL);
  g:=public.trivia_p8_legacy_grade_locked_v1('30000000-0000-4000-8000-000000000021');
  snapshot:=jsonb_build_object('deadlinePassed',false,'perQuestion',g->'per_question');
  r:=public.award_trivia_run_v4('30000000-0000-4000-8000-000000000021',(g->>'score')::integer,(g->>'correct')::integer,
      (g->>'graded_total')::integer,(g->>'answered')::integer,0,(g->>'total')::integer,(g->>'completion_answered')::integer,
      '51000000-0000-4000-8000-000000000021',snapshot);
  IF r->>'success'<>'true' OR r#>>'{highScoreProjection,status}'<>'persisted' OR r#>>'{highScoreProjection,verifiedCorrect}'<>'1' THEN
    RAISE EXCEPTION 'legacy v4 award/project failed: %, grade: %, snapshot: %',r,g,snapshot;
  END IF;
  replay:=public.award_trivia_run_v4('30000000-0000-4000-8000-000000000021',(g->>'score')::integer,(g->>'correct')::integer,
      (g->>'graded_total')::integer,(g->>'answered')::integer,0,(g->>'total')::integer,(g->>'completion_answered')::integer,
      '51000000-0000-4000-8000-000000000021',snapshot);
  IF replay->>'replayed'<>'true' OR replay#>>'{highScoreProjection,replayed}'<>'true' THEN RAISE EXCEPTION 'legacy award replay failed: %',replay; END IF;

  r:=public.trivia_session_settle_solo_v4('40000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000012',0,'{}','51000000-0000-4000-8000-000000000004');
  IF r->>'success'<>'true' OR r->>'replayed'<>'true' OR r#>>'{highScoreProjection,status}'<>'ineligible'
     OR r#>>'{highScoreProjection,reason}'<>'historical_run_boundary_overrun' THEN
    RAISE EXCEPTION 'historical overrun receipt replay failed: %',r;
  END IF;
  INSERT INTO public.trivia_question_quarantine(question_id) VALUES(public.test_q(107));
  replay:=public.trivia_session_settle_solo_v4('40000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000012',0,'{}','51000000-0000-4000-8000-000000000004');
  IF replay#>>'{highScoreProjection,status}'<>'ineligible'
     OR (SELECT server_voided_at FROM public.trivia_session_answers WHERE session_id='40000000-0000-4000-8000-000000000004' AND position=4) IS NOT NULL THEN
    RAISE EXCEPTION 'quarantine changed historical replay: %',replay;
  END IF;
  r:=public.trivia_endless_high_score_project_v1('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000009');
  IF r->>'verifiedCorrect'<>'7' OR r->>'highScore'<>'9' OR r->>'improved'<>'false' OR r->>'replayed'<>'false' THEN
    RAISE EXCEPTION 'projection used points/lowered max: %',r;
  END IF;
END $settlement$;

CREATE FUNCTION public.phase9_test_projection_failure() RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN RAISE EXCEPTION 'forced_projection_failure'; END $f$;
CREATE TRIGGER trg_phase9_test_projection_failure BEFORE INSERT ON public.trivia_endless_high_score_projections_v1
FOR EACH ROW EXECUTE FUNCTION public.phase9_test_projection_failure();

DO $projection_rollback$
DECLARE r jsonb; g jsonb; failed boolean:=false;
BEGIN
  PERFORM public.trivia_session_answer_v4('30000000-0000-4000-8000-000000000027','10000000-0000-4000-8000-000000000027',public.test_q(226),0,NULL);
  g:=public.trivia_p3_grade('30000000-0000-4000-8000-000000000027');
  BEGIN
    r:=public.trivia_session_settle_solo_v4('30000000-0000-4000-8000-000000000027','10000000-0000-4000-8000-000000000027',0,g,'51000000-0000-4000-8000-000000000027');
  EXCEPTION WHEN OTHERS THEN failed:=SQLERRM='forced_projection_failure'; END;
  IF NOT failed OR (SELECT status FROM public.trivia_sessions WHERE id='30000000-0000-4000-8000-000000000027')<>'open'
     OR EXISTS(SELECT 1 FROM public.trivia_scores WHERE session_id='30000000-0000-4000-8000-000000000027')
     OR EXISTS(SELECT 1 FROM public.trivia_session_results WHERE session_id='30000000-0000-4000-8000-000000000027')
     OR EXISTS(SELECT 1 FROM public.endless_high_scores WHERE user_id='10000000-0000-4000-8000-000000000027' AND mode='random') THEN
    RAISE EXCEPTION 'projection failure left partial settlement: %',r;
  END IF;
END $projection_rollback$;
DROP TRIGGER trg_phase9_test_projection_failure ON public.trivia_endless_high_score_projections_v1;
DROP FUNCTION public.phase9_test_projection_failure();

DO $acl$
BEGIN
  IF has_table_privilege('authenticated','public.endless_high_scores','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     OR has_table_privilege('anon','public.endless_high_scores','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     OR has_table_privilege('service_role','public.endless_high_scores','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     OR has_table_privilege('anon','public.trivia_paid_skip_receipts_v1','SELECT,INSERT,UPDATE,DELETE')
     OR has_table_privilege('authenticated','public.trivia_paid_skip_receipts_v1','SELECT,INSERT,UPDATE,DELETE')
     OR has_table_privilege('service_role','public.trivia_paid_skip_receipts_v1','SELECT,INSERT,UPDATE,DELETE')
     OR has_function_privilege('anon','public.trivia_paid_skip_v1(uuid,uuid,uuid,uuid)','EXECUTE')
     OR has_function_privilege('authenticated','public.trivia_paid_skip_v1(uuid,uuid,uuid,uuid)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.trivia_paid_skip_v1(uuid,uuid,uuid,uuid)','EXECUTE')
     OR has_function_privilege('service_role','public.trivia_paid_skip_adopt_legacy_v1(uuid,uuid)','EXECUTE')
     OR has_function_privilege('service_role','public.trivia_session_answer_before_phase9_v4(uuid,uuid,uuid,integer,uuid)','EXECUTE')
     OR has_function_privilege('anon','public.trivia_session_answer_v4(uuid,uuid,uuid,integer,uuid)','EXECUTE')
     OR has_function_privilege('authenticated','public.trivia_session_answer_v4(uuid,uuid,uuid,integer,uuid)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.trivia_session_answer_v4(uuid,uuid,uuid,integer,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'least-privilege boundary failed';
  END IF;
  IF (SELECT count(*) FROM pg_policy WHERE polname IN('trivia_paid_skip_receipts_rpc_only','trivia_endless_projections_rpc_only','trivia_endless_reconciliations_rpc_only')
      AND polcmd='*' AND polpermissive IS FALSE AND pg_get_expr(polqual,polrelid)='false' AND pg_get_expr(polwithcheck,polrelid)='false')<>3 THEN
    RAISE EXCEPTION 'RPC-only RLS policies missing';
  END IF;
  IF (SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname IN('trivia_paid_skip_receipts_question_idx','trivia_paid_skip_receipts_wallet_transaction_idx','trivia_endless_high_score_reconciliations_evidence_session_idx'))<>3 THEN
    RAISE EXCEPTION 'FK indexes missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM pg_index i
      JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attname='wallet_transaction_id'
     WHERE i.indexrelid='public.trivia_paid_skip_receipts_wallet_transaction_idx'::regclass
       AND i.indrelid='public.trivia_paid_skip_receipts_v1'::regclass
       AND i.indisvalid AND i.indisready AND i.indislive
       AND i.indpred IS NULL AND i.indexprs IS NULL
       AND i.indnatts=1 AND i.indnkeyatts=1 AND i.indkey[0]=a.attnum
  ) OR NOT EXISTS (
    SELECT 1
      FROM pg_index i
      JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attname='evidence_session_id'
     WHERE i.indexrelid='public.trivia_endless_high_score_reconciliations_evidence_session_idx'::regclass
       AND i.indrelid='public.trivia_endless_high_score_reconciliations_v1'::regclass
       AND i.indisvalid AND i.indisready AND i.indislive
       AND i.indpred IS NULL AND i.indexprs IS NULL
       AND i.indnatts=1 AND i.indnkeyatts=1 AND i.indkey[0]=a.attnum
  ) THEN
    RAISE EXCEPTION 'FK indexes are not full valid coverage';
  END IF;
  BEGIN UPDATE public.trivia_paid_skip_receipts_v1 SET balance_after=balance_after; RAISE EXCEPTION 'receipt mutated'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN DELETE FROM public.trivia_endless_high_score_projections_v1; RAISE EXCEPTION 'projection deleted'; EXCEPTION WHEN check_violation THEN NULL; END;
END $acl$;

SELECT jsonb_build_object('suite','phase9-solo-authority-pg17','status','PASS',
 'paidSkipReceipts',(SELECT count(*) FROM public.trivia_paid_skip_receipts_v1),
 'projections',(SELECT count(*) FROM public.trivia_endless_high_score_projections_v1),
 'reconciliations',(SELECT count(*) FROM public.trivia_endless_high_score_reconciliations_v1));
