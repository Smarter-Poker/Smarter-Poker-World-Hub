-- Live integration audit for the server-only Study Group RPCs.
-- Every write is wrapped in a transaction that is rolled back.
BEGIN;

DO $$
DECLARE
  v_owner uuid;
  v_member uuid;
  v_overflow uuid;
BEGIN
  SELECT id INTO v_owner FROM auth.users ORDER BY created_at, id LIMIT 1;
  SELECT id INTO v_member FROM auth.users ORDER BY created_at, id OFFSET 1 LIMIT 1;
  SELECT id INTO v_overflow FROM auth.users ORDER BY created_at, id OFFSET 2 LIMIT 1;

  IF v_owner IS NULL OR v_member IS NULL OR v_overflow IS NULL THEN
    RAISE EXCEPTION 'audit requires at least three auth users';
  END IF;

  PERFORM set_config('audit.owner_id', v_owner::text, true);
  PERFORM set_config('audit.member_id', v_member::text, true);
  PERFORM set_config('audit.overflow_id', v_overflow::text, true);
END $$;

SET LOCAL ROLE service_role;

DO $$
DECLARE
  v_owner uuid;
  v_member uuid;
  v_overflow uuid;
  v_group public.training_study_groups;
  v_result text;
  v_count integer;
BEGIN
  v_owner := current_setting('audit.owner_id')::uuid;
  v_member := current_setting('audit.member_id')::uuid;
  v_overflow := current_setting('audit.overflow_id')::uuid;

  SELECT * INTO v_group
  FROM public.create_training_study_group(
    v_owner,
    'Transactional Audit Group',
    'Cash',
    'All Stakes',
    'UTC',
    'Hand Review',
    'Flexible',
    'Any',
    2
  );

  IF v_group.id IS NULL OR v_group.owner_id <> v_owner THEN
    RAISE EXCEPTION 'create RPC did not return the owned group';
  END IF;

  SELECT public.join_training_study_group(v_group.id, v_member) INTO v_result;
  IF v_result <> 'joined' THEN
    RAISE EXCEPTION 'second member was not joined: %', v_result;
  END IF;

  SELECT public.join_training_study_group(v_group.id, v_overflow) INTO v_result;
  IF v_result <> 'full' THEN
    RAISE EXCEPTION 'capacity guard did not reject overflow member: %', v_result;
  END IF;

  SELECT count(*)::integer INTO v_count
  FROM public.training_study_group_members
  WHERE group_id = v_group.id;
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'capacity audit expected 2 members, found %', v_count;
  END IF;
END $$;

ROLLBACK;
