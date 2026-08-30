-- ═══════════════════════════════════════════════════════════════════════
-- 20260829120000_training_study_groups.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2
-- AUTHOR:      Codex
-- AFFECTS:     tables: training_study_groups, members, messages; RLS; indexes
-- IRREVERSIBLE: no
--
-- WHY:
--   Study Group pages previously had no durable membership or messaging
--   backend. These records must be shared, authenticated, and user-scoped.
--
-- HOW (high level):
--   - Creates groups, memberships, and member-only message storage.
--   - Adds ownership/member RLS and lookup indexes.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
BEGIN
  IF to_regclass('auth.users') IS NULL THEN
    RAISE EXCEPTION 'pre-flight failed: auth.users not found';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.training_study_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 3 AND 80),
  format text NOT NULL DEFAULT 'Cash',
  stakes text NOT NULL DEFAULT 'All Stakes',
  timezone text NOT NULL DEFAULT 'UTC',
  focus text NOT NULL DEFAULT 'Hand Review',
  schedule text NOT NULL DEFAULT 'Flexible',
  level text NOT NULL DEFAULT 'Any',
  max_members integer NOT NULL DEFAULT 8 CHECK (max_members BETWEEN 2 AND 20),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.training_study_group_members (
  group_id uuid NOT NULL REFERENCES public.training_study_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.training_study_group_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.training_study_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_training_study_groups_created
  ON public.training_study_groups(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_training_study_group_members_user
  ON public.training_study_group_members(user_id, joined_at DESC);
CREATE INDEX IF NOT EXISTS idx_training_study_group_messages_group
  ON public.training_study_group_messages(group_id, created_at DESC);

ALTER TABLE public.training_study_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_study_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_study_group_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS training_study_groups_read ON public.training_study_groups;
CREATE POLICY training_study_groups_read ON public.training_study_groups
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS training_study_groups_owner_insert ON public.training_study_groups;
CREATE POLICY training_study_groups_owner_insert ON public.training_study_groups
  FOR INSERT TO authenticated WITH CHECK (owner_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS training_study_groups_owner_update ON public.training_study_groups;
CREATE POLICY training_study_groups_owner_update ON public.training_study_groups
  FOR UPDATE TO authenticated
  USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (owner_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS training_study_groups_owner_delete ON public.training_study_groups;
CREATE POLICY training_study_groups_owner_delete ON public.training_study_groups
  FOR DELETE TO authenticated USING (owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS training_study_group_members_read ON public.training_study_group_members;
CREATE POLICY training_study_group_members_read ON public.training_study_group_members
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS training_study_group_members_join ON public.training_study_group_members;
CREATE POLICY training_study_group_members_join ON public.training_study_group_members
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND role = 'member');
DROP POLICY IF EXISTS training_study_group_members_leave ON public.training_study_group_members;
CREATE POLICY training_study_group_members_leave ON public.training_study_group_members
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS training_study_group_messages_member_read ON public.training_study_group_messages;
CREATE POLICY training_study_group_messages_member_read ON public.training_study_group_messages
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.training_study_group_members m
      WHERE m.group_id = training_study_group_messages.group_id
        AND m.user_id = (SELECT auth.uid())
    )
  );
DROP POLICY IF EXISTS training_study_group_messages_member_write ON public.training_study_group_messages;
CREATE POLICY training_study_group_messages_member_write ON public.training_study_group_messages
  FOR INSERT TO authenticated WITH CHECK (
    user_id = (SELECT auth.uid()) AND EXISTS (
      SELECT 1 FROM public.training_study_group_members m
      WHERE m.group_id = training_study_group_messages.group_id
        AND m.user_id = (SELECT auth.uid())
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_study_groups TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.training_study_group_members TO authenticated;
GRANT SELECT, INSERT ON public.training_study_group_messages TO authenticated;
GRANT ALL ON public.training_study_groups TO service_role;
GRANT ALL ON public.training_study_group_members TO service_role;
GRANT ALL ON public.training_study_group_messages TO service_role;

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'training_study_groups',
    'training_study_group_members',
    'training_study_group_messages'
  ]
  LOOP
    IF to_regclass('public.' || v_table) IS NULL THEN
      RAISE EXCEPTION 'post-apply failed: public.% not found', v_table;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = v_table AND c.relrowsecurity
    ) THEN
      RAISE EXCEPTION 'post-apply failed: RLS is not enabled on public.%', v_table;
    END IF;
  END LOOP;
END $$;

COMMIT;
