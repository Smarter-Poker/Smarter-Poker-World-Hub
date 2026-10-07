-- Gate: one logical scheduler owner; a stale owner is fenced out of every mutation.
\set ON_ERROR_STOP on
SELECT p6test.set_clock(clock_timestamp());
SELECT public.trivia_tournament_scheduler_acquire('dispatcher-a', 60) AS a \gset
SELECT public.trivia_tournament_scheduler_acquire('dispatcher-b', 60) AS b \gset
SELECT p6test.assert((:'a'::jsonb->>'owner')::boolean AND NOT (:'b'::jsonb->>'owner')::boolean, 'one owner, one standby');
SELECT p6test.assert((public.trivia_tournament_scheduler_tick((:'a'::jsonb->>'run_id')::uuid, (:'a'::jsonb->>'fencing_token')::bigint, false, 50)) ? 'healthy', 'owner ticks');
SELECT p6test.advance('61 seconds');   -- owner A stalls past its lease
SELECT public.trivia_tournament_scheduler_acquire('dispatcher-b', 60) AS b2 \gset
SELECT p6test.assert((:'b2'::jsonb->>'owner')::boolean
                     AND (:'b2'::jsonb->>'fencing_token')::bigint = (:'a'::jsonb->>'fencing_token')::bigint + 1, 'takeover increments the token');
DO $$ DECLARE v_tok bigint; v_ok boolean;
BEGIN
  SELECT fencing_token - 1 INTO v_tok FROM public.trivia_tournament_scheduler_leases;
  -- Every fenced entry point refuses the stale token.
  FOR i IN 1..4 LOOP
    v_ok := false;
    BEGIN
      CASE i
        WHEN 1 THEN PERFORM public.trivia_tournament_scheduler_tick(gen_random_uuid(), v_tok, true, 10);
        WHEN 2 THEN PERFORM public.trivia_tournament_reconcile_schedule(v_tok, NULL, 8);
        WHEN 3 THEN PERFORM public.trivia_tournament_scheduler_renew(v_tok, 60);
        WHEN 4 THEN PERFORM public.trivia_tournament_assert_fence(v_tok);
      END CASE;
    EXCEPTION WHEN OTHERS THEN
      v_ok := SQLERRM = 'stale_fencing_token';
    END;
    PERFORM p6test.assert(v_ok, 'stale token refused at entry point ' || i);
  END LOOP;
END $$;
SELECT public.trivia_tournament_scheduler_release((:'b2'::jsonb->>'run_id')::uuid, (:'b2'::jsonb->>'fencing_token')::bigint) AS rel \gset
SELECT public.trivia_tournament_scheduler_acquire('dispatcher-a', 60) AS a2 \gset
SELECT p6test.assert((:'a2'::jsonb->>'owner')::boolean
                     AND (:'a2'::jsonb->>'fencing_token')::bigint = (:'b2'::jsonb->>'fencing_token')::bigint + 1, 'release hands over cleanly');
SELECT public.trivia_tournament_scheduler_release((:'a2'::jsonb->>'run_id')::uuid, (:'a2'::jsonb->>'fencing_token')::bigint);
SELECT json_build_object('suite', 'lease_single_session', 'pass', true,
       'takeovers', (SELECT takeovers FROM public.trivia_tournament_scheduler_leases),
       'final_token', (SELECT fencing_token FROM public.trivia_tournament_scheduler_leases)) AS result;
