\set ON_ERROR_STOP on
SELECT set_config('request.jwt.claim.role','service_role',false);

DO $$
BEGIN
  IF (SELECT count(*) FROM public.trivia_paid_skip_receipts_v1 WHERE session_id='30000000-0000-4000-8000-000000000007') <> 3
     OR (SELECT diamonds FROM public.profiles WHERE id='10000000-0000-4000-8000-000000000007') <> 85
     OR (SELECT count(*) FROM public.trivia_session_answers WHERE session_id='30000000-0000-4000-8000-000000000007' AND outcome='skip') <> 3 THEN
    RAISE EXCEPTION 'concurrent cap did not admit exactly one third skip';
  END IF;
  IF (SELECT count(*) FROM public.trivia_paid_skip_receipts_v1 WHERE session_id='30000000-0000-4000-8000-000000000008') <> 1
     OR (SELECT diamonds FROM public.profiles WHERE id='10000000-0000-4000-8000-000000000008') <> 95
     OR (SELECT count(*) FROM public.diamond_transactions WHERE user_id='10000000-0000-4000-8000-000000000008') <> 1 THEN
    RAISE EXCEPTION 'concurrent same-question retry was not exact-once';
  END IF;
  IF (SELECT high_score FROM public.endless_high_scores WHERE user_id='10000000-0000-4000-8000-000000000009' AND mode='random') <> 9
     OR (SELECT count(*) FROM public.trivia_endless_high_score_projections_v1 WHERE session_id IN ('40000000-0000-4000-8000-000000000007','40000000-0000-4000-8000-000000000008')) <> 2 THEN
    RAISE EXCEPTION 'concurrent high-score GREATEST projection failed';
  END IF;
END $$;

SELECT jsonb_build_object('suite','phase9-solo-authority-concurrency-pg17','status','PASS');
