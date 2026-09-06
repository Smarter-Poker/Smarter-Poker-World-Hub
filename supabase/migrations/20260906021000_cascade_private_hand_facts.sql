-- =============================================================================
-- 20260906021000_cascade_private_hand_facts.sql
-- =============================================================================
-- TIER:        3
-- AUTHOR:      Codex
-- AFFECTS:     public.ca_hand_facts foreign keys
-- IRREVERSIBLE: no
--
-- WHY:
--   ca_hand_facts stores private hole-card facts used by Leak Finder. Without
--   foreign keys, deleting an account or its source hand can leave that
--   private evidence orphaned indefinitely.
--
-- HOW:
--   - Fail closed if the expected UUID keys or clean ownership graph changed.
--   - Add account and hand foreign keys with ON DELETE CASCADE.
--   - Validate both constraints in the same audited migration.
-- =============================================================================

BEGIN;

-- 1. PRE-FLIGHT ASSERTIONS
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ca_hand_facts'
      AND column_name = 'user_id' AND data_type = 'uuid'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ca_hand_facts'
      AND column_name = 'hand_id' AND data_type = 'uuid'
  ) THEN
    RAISE EXCEPTION 'pre-flight failed: ca_hand_facts UUID ownership keys are missing';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.ca_hand_facts f
    LEFT JOIN auth.users u ON u.id = f.user_id
    WHERE u.id IS NULL
  ) THEN
    RAISE EXCEPTION 'pre-flight failed: ca_hand_facts contains orphaned users';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.ca_hand_facts f
    LEFT JOIN public.hand_history h ON h.id = f.hand_id
    WHERE h.id IS NULL
  ) THEN
    RAISE EXCEPTION 'pre-flight failed: ca_hand_facts contains orphaned hands';
  END IF;
END $$;

-- 2. THE ACTUAL CHANGES
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.ca_hand_facts'::regclass
      AND conname = 'ca_hand_facts_user_id_fkey'
  ) THEN
    ALTER TABLE public.ca_hand_facts
      ADD CONSTRAINT ca_hand_facts_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id)
      ON DELETE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.ca_hand_facts'::regclass
      AND conname = 'ca_hand_facts_hand_id_fkey'
  ) THEN
    ALTER TABLE public.ca_hand_facts
      ADD CONSTRAINT ca_hand_facts_hand_id_fkey
      FOREIGN KEY (hand_id) REFERENCES public.hand_history(id)
      ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

ALTER TABLE public.ca_hand_facts
  VALIDATE CONSTRAINT ca_hand_facts_user_id_fkey;
ALTER TABLE public.ca_hand_facts
  VALIDATE CONSTRAINT ca_hand_facts_hand_id_fkey;

-- 3. POST-APPLY ASSERTIONS
DO $$
BEGIN
  IF 2 <> (
    SELECT count(*)
    FROM pg_constraint
    WHERE conrelid = 'public.ca_hand_facts'::regclass
      AND conname IN ('ca_hand_facts_user_id_fkey', 'ca_hand_facts_hand_id_fkey')
      AND convalidated
      AND confdeltype = 'c'
  ) THEN
    RAISE EXCEPTION 'post-apply failed: private hand-fact cascades are not validated';
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- ROLLBACK (apply as a NEW migration if rollback is required)
-- =============================================================================
-- BEGIN;
-- ALTER TABLE public.ca_hand_facts DROP CONSTRAINT IF EXISTS ca_hand_facts_hand_id_fkey;
-- ALTER TABLE public.ca_hand_facts DROP CONSTRAINT IF EXISTS ca_hand_facts_user_id_fkey;
-- COMMIT;
