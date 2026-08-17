-- APPLIED TO PRODUCTION 2026-08-17 (Supabase version recorded as
-- create_get_unseen_questions_phantom_rpc)
--
-- PHANTOM RPC: get_unseen_questions
--
-- WH src/lib/triviaQuestionLoader.js calls
--   supabase.rpc('get_unseen_questions', { p_user, p_categories, p_count })
-- as step 1 of loadQuestionsForUser(), described in its own comment as
-- "the server-side anti-join if the database exposes it". It never existed, so
-- every call threw PGRST202 and fell through to the client-side pipeline, which
-- pulls a random pool of at least max(200, count*5) rows, retries up to 3 times,
-- and filters in JavaScript.
--
-- Note the join is question_id::text -- user_seen_questions.question_id is text
-- while trivia_questions.id is uuid, because that table is shared with
-- non-trivia games keyed by game_id.
--
-- The client fallback is deliberately left in place: it also handles the
-- userId-less case and the category/difficulty shaping this RPC does not cover.
--
-- Verified after apply against the heaviest real user (333 questions already
-- seen, pool of 11,197): 20 rows returned, 0 already-seen rows leaked.

CREATE OR REPLACE FUNCTION public.get_unseen_questions(
  p_user       uuid,
  p_categories text[] DEFAULT NULL,
  p_count      integer DEFAULT 20
)
RETURNS SETOF public.trivia_questions
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  SELECT q.*
    FROM public.trivia_questions q
   WHERE (p_categories IS NULL OR array_length(p_categories, 1) IS NULL OR q.category = ANY(p_categories))
     AND NOT EXISTS (
           SELECT 1
             FROM public.user_seen_questions s
            WHERE s.user_id = p_user
              AND s.question_id = q.id::text
         )
   ORDER BY random()
   LIMIT GREATEST(COALESCE(p_count, 20), 0);
$function$;

REVOKE EXECUTE ON FUNCTION public.get_unseen_questions(uuid, text[], integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_unseen_questions(uuid, text[], integer) TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_user_seen_questions_user_question
  ON public.user_seen_questions (user_id, question_id);

COMMENT ON FUNCTION public.get_unseen_questions(uuid, text[], integer) IS
  'Server-side anti-join for triviaQuestionLoader.loadQuestionsForUser(). Returns up to p_count trivia_questions the user has never been shown. SECURITY INVOKER so RLS on trivia_questions still applies.';
