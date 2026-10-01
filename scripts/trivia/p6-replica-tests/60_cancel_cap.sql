-- Gate: short horse field and insufficient entrants cancel with exact refunds;
-- a human champion is paid despite an exhausted 2,000/day solo Trivia cap;
-- tiny-bracket rounding conserves the pool.
\set ON_ERROR_STOP on
SELECT p6test.set_clock(date_trunc('minute', clock_timestamp()) + interval '1 minute') AS t0 \gset
-- (a) Short field: only 60 horses can be entered for a target of 100.
UPDATE public.profiles SET horse_status = 'retired_for_test' WHERE is_horse AND id NOT IN (SELECT p6test.horse(g) FROM generate_series(1, 60) g);
SELECT (public.trivia_tournament_create_test_instance('test', 'short-100', :'t0'::timestamptz + interval '60 minutes', 100, false)->>'tournament_id') AS ts \gset
INSERT INTO public.trivia_tournament_canary_access (tournament_id, user_id, approved_by) SELECT :'ts', p6test.human(g), 'p6' FROM generate_series(1, 5) g;
SELECT count(*) FROM generate_series(1, 5) g WHERE (public.trivia_tournament_enter(:'ts', p6test.human(g), 'short-nonce-' || g)->>'success')::boolean;
SELECT balance AS treasury_before FROM public.trivia_ledger_accounts WHERE account_code = 'treasury:trivia' \gset
DO $$ BEGIN FOR i IN 1..60 LOOP PERFORM p6test.advance('1 minute'); PERFORM p6test.tick(); END LOOP; END $$;
SELECT lifecycle_state, terminal_reason FROM public.trivia_tournaments WHERE id = :'ts';
SELECT p6test.assert(t.lifecycle_state = 'cancelled' AND t.terminal_reason = 'horse_population_short', 'short field cancels (never fabricated)')
  FROM public.trivia_tournaments t WHERE t.id = :'ts';
SELECT p6test.assert((SELECT outcome FROM public.trivia_tournament_population_runs WHERE tournament_id = :'ts' AND run_kind = 'final_reconcile') = 'held'
       AND (SELECT count(*) FROM public.trivia_tournament_entrants WHERE tournament_id = :'ts' AND participant_kind = 'horse') = 60, 'held at 60 real horses');
SELECT p6test.assert(bool_and(p.diamonds = 1000), 'humans refunded exactly') FROM public.profiles p WHERE p.id IN (SELECT p6test.human(g) FROM generate_series(1, 5) g);
SELECT p6test.assert((SELECT balance FROM public.trivia_ledger_accounts WHERE account_code = 'treasury:trivia') = :treasury_before, 'all 600 of horse entries returned to treasury');
SELECT p6test.assert(s.state = 'refunded' AND s.refunded_total = 650 AND COALESCE(a.balance, 0) = 0, 'refunded once, escrow zero')
  FROM public.trivia_settlements s LEFT JOIN public.trivia_ledger_accounts a ON a.account_code = s.escrow_account_code
 WHERE s.subject_type = 'tournament' AND s.subject_id = :'ts';
UPDATE public.profiles SET horse_status = 'available' WHERE is_horse;
-- (b) Insufficient entrants with horses switched off: one human, refunded.
SELECT p6test.set_clock(date_trunc('minute', clock_timestamp()) + interval '2 hours') AS t1 \gset
SELECT (public.trivia_tournament_create_test_instance('test', 'lonely', :'t1'::timestamptz + interval '60 minutes', 70, false)->>'tournament_id') AS tl \gset
INSERT INTO public.trivia_tournament_canary_access VALUES (:'tl', p6test.human(9), 'p6', now());
SELECT public.trivia_tournament_enter(:'tl', p6test.human(9), 'lonely-1')->>'success';
DO $$ BEGIN FOR i IN 1..60 LOOP PERFORM p6test.advance('1 minute'); PERFORM p6test.tick(false); END LOOP; END $$;
SELECT p6test.assert(t.lifecycle_state = 'cancelled' AND t.terminal_reason = 'insufficient_entrants' AND t.horse_population_mode = 'disabled'
       AND (SELECT diamonds FROM public.profiles WHERE id = p6test.human(9)) = 1000, 'insufficient entrants refunded') FROM public.trivia_tournaments t WHERE t.id = :'tl';
-- (c) DR7: the solo Trivia cap is armed and exhausted for human 50, yet the tournament prize is paid.
SELECT public.add_diamonds_to_balance(p6test.human(50), 2000, 'trivia_run', 'p6 cap fixture', 'trivia_session_p6capfixture-1')->>'success' AS cap_fill;
DO $$ BEGIN
  BEGIN
    PERFORM public.add_diamonds_to_balance(p6test.human(50), 5, 'trivia_run', 'p6 cap probe', 'trivia_session_p6capprobe-1');
    RAISE EXCEPTION 'cap did not refuse';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'DR7%' THEN RAISE; END IF;
  END;
END $$;
SELECT diamonds AS h50_before FROM public.profiles WHERE id = p6test.human(50) \gset
SELECT p6test.set_clock(date_trunc('minute', clock_timestamp()) + interval '4 hours') AS t2 \gset
SELECT (public.trivia_tournament_create_test_instance('test', 'duel', :'t2'::timestamptz + interval '60 minutes', 70, false)->>'tournament_id') AS td \gset
INSERT INTO public.trivia_tournament_canary_access VALUES (:'td', p6test.human(50), 'p6', now()), (:'td', p6test.human(51), 'p6', now());
SELECT public.trivia_tournament_enter(:'td', p6test.human(50), 'duel-nonce-50')->>'success', public.trivia_tournament_enter(:'td', p6test.human(51), 'duel-nonce-51')->>'success';
DO $$ BEGIN FOR i IN 1..60 LOOP PERFORM p6test.advance('1 minute'); PERFORM p6test.tick(false); END LOOP; END $$;
SELECT p6test.assert(lifecycle_state = 'live' AND total_rounds = 1, 'two-human final is live') FROM public.trivia_tournaments WHERE id = :'td';
SELECT p6test.play_scripted(:'td', p6test.human(50), true) AS right_answers, p6test.play_scripted(:'td', p6test.human(51), false) AS wrong_answers;
SELECT p6test.tick(false)->'actions' AS settle_tick;
SELECT r.final_rank, r.participant_kind, r.correct_total, r.payout, r.payout_destination FROM public.trivia_tournament_results r WHERE r.tournament_id = :'td' ORDER BY 1;
SELECT p6test.assert((SELECT lifecycle_state FROM public.trivia_tournaments WHERE id = :'td') = 'settled'
       AND (SELECT payout FROM public.trivia_tournament_results r JOIN public.trivia_tournament_entrants e ON e.id = r.entrant_id
             WHERE r.tournament_id = :'td' AND e.participant_id = p6test.human(50)) = 15
       AND (SELECT payout FROM public.trivia_tournament_results r JOIN public.trivia_tournament_entrants e ON e.id = r.entrant_id
             WHERE r.tournament_id = :'td' AND e.participant_id = p6test.human(51)) = 3
       AND (SELECT diamonds FROM public.profiles WHERE id = p6test.human(50)) = :h50_before - 10 + 15,
       'capped human champion paid 15 (pool 18: runner-up floor(18*20%)=3, remainder to champion)');
SELECT json_build_object('suite', 'cancel_short_cap', 'pass', true,
  'short_field', json_build_object('target', 100, 'entered_horses', 60, 'refunded_total', 650),
  'cap_exempt_prize', 15, 'runner_up_prize', 3) AS result;
