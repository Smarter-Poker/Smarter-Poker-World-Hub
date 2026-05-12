-- Dan-fix/audit-8 (2026-05-11): commander_home_join_attempts (rate-limit
-- audit table for failed/successful join attempts) lacks FK constraints on
-- both group_id and user_id. Found 2 orphan rows from Phase 40 testing
-- where the home_group was later deleted but the attempt log stayed.
--
-- Adds FKs with ON DELETE CASCADE so the audit trail auto-cleans when the
-- referenced entity is deleted (matches the pattern used by every other
-- commander_home_* child table).
--
-- Cleanup of existing orphans first so the FK creation doesn't fail.

DELETE FROM public.commander_home_join_attempts cja
WHERE NOT EXISTS(SELECT 1 FROM public.commander_home_groups g WHERE g.id = cja.group_id);

DELETE FROM public.commander_home_join_attempts cja
WHERE cja.user_id IS NOT NULL
  AND NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id = cja.user_id);

ALTER TABLE public.commander_home_join_attempts
  ADD CONSTRAINT commander_home_join_attempts_group_id_fkey
  FOREIGN KEY (group_id) REFERENCES public.commander_home_groups(id) ON DELETE CASCADE;

ALTER TABLE public.commander_home_join_attempts
  ADD CONSTRAINT commander_home_join_attempts_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
