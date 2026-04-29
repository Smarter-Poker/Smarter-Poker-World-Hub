-- ════════════════════════════════════════════════════════════════════════════════
-- Migration: Fix live_sessions + session_chat_messages FK targets
-- ════════════════════════════════════════════════════════════════════════════════
-- PROBLEM: Both tables had FK(user_id) → auth.users, but PostgREST join hints
--          like `profiles:user_id(...)` only resolve when the FK points to
--          public.profiles. This caused null profile data in API responses.
--
-- FIX: Retarget user_id FKs from auth.users → public.profiles(id)
-- IDEMPOTENT: Safe to re-run — checks current FK target before altering.
-- ════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Fix live_sessions.user_id FK
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE contype = 'f'
      AND conrelid = 'public.live_sessions'::regclass
      AND confrelid = 'auth.users'::regclass
      AND a.attname = 'user_id'
  ) THEN
    ALTER TABLE public.live_sessions DROP CONSTRAINT live_sessions_user_id_fkey;
    ALTER TABLE public.live_sessions
      ADD CONSTRAINT live_sessions_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
    RAISE NOTICE 'Fixed live_sessions.user_id FK → profiles';
  ELSE
    RAISE NOTICE 'live_sessions.user_id FK already targets profiles (or no FK)';
  END IF;
END $$;

-- 2. Fix session_chat_messages.user_id FK
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE contype = 'f'
      AND conrelid = 'public.session_chat_messages'::regclass
      AND confrelid = 'auth.users'::regclass
      AND a.attname = 'user_id'
  ) THEN
    ALTER TABLE public.session_chat_messages DROP CONSTRAINT session_chat_messages_user_id_fkey;
    ALTER TABLE public.session_chat_messages
      ADD CONSTRAINT session_chat_messages_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
    RAISE NOTICE 'Fixed session_chat_messages.user_id FK → profiles';
  ELSE
    RAISE NOTICE 'session_chat_messages.user_id FK already targets profiles (or no FK)';
  END IF;
END $$;

COMMIT;
