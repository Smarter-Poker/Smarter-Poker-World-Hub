-- ═══════════════════════════════════════════════════════════════════════════
-- trivia_user_question_history: allow users to UPDATE their own rows
-- (lands at supabase/migrations/20260803190000_trivia_history_update_policy.sql)
--
-- WHY (retires the ignoreDuplicates workaround):
--   trivia_user_question_history is UNIQUE(user_id, question_id) and the
--   60-day no-repeat window is driven by seen_at recency. recordQuestionsSeen
--   (src/lib/triviaQuestionLoader.js) upserts with
--   onConflict: 'user_id,question_id' so that re-serving a question REFRESHES
--   its seen_at — that refresh is what keeps a recently-replayed question at
--   the top of the exclusion list.
--
--   Under RLS, a PostgREST upsert's conflict branch executes as an UPDATE.
--   With only INSERT/SELECT policies present, any upsert from a
--   user-authenticated (anon-key + JWT) client hit "42501 row-level security"
--   on the conflict path. The workaround in the field was to upsert with
--   ignoreDuplicates: true — which made the conflict a no-op, so seen_at was
--   NEVER refreshed and a replayed question aged out of the window as if the
--   replay had not happened, silently shortening the no-repeat guarantee.
--
--   This policy lets authenticated users update ONLY their own history rows
--   (both the row being targeted and the row as written must belong to them),
--   so the merge-duplicates upsert works from user-context clients and the
--   ignoreDuplicates workaround can be deleted. Service-role clients bypass
--   RLS and are unaffected.
--
-- Idempotent: DROP POLICY IF EXISTS first, safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "trivia_history_update_own"
    ON public.trivia_user_question_history;

CREATE POLICY "trivia_history_update_own"
    ON public.trivia_user_question_history
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
