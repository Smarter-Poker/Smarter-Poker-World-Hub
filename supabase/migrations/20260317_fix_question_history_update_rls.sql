-- ═══════════════════════════════════════════════════════════════════════════
-- Fix trivia_user_question_history missing UPDATE RLS policy
-- ═══════════════════════════════════════════════════════════════════════════
-- Bug: The table has SELECT and INSERT policies, but NO UPDATE policy.
-- The [mode].js Phase 3 upsert uses onConflict: 'user_id,question_id'
-- with ignoreDuplicates: false, which tries to UPDATE on conflict.
-- Without an UPDATE policy, the UPDATE is silently blocked by RLS,
-- causing the seen_at timestamp to never refresh for re-seen questions.
-- ═══════════════════════════════════════════════════════════════════════════

-- Add UPDATE policy so upsert can refresh seen_at timestamp
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'trivia_user_question_history' 
    AND policyname = 'Users can update own question history'
  ) THEN
    CREATE POLICY "Users can update own question history" 
      ON trivia_user_question_history 
      FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;
