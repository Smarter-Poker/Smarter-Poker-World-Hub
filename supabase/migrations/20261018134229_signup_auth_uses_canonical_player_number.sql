-- TIER 2. Auth signup must use the same allocator as profile initialization.
-- Incident: signup_errors 9947-9949 on 2026-10-17; a raw value from the
-- independent profiles sequence collided and cascaded into two FK failures.
-- Preserve the installed trigger body, welcome eligibility and all other fields.
BEGIN;
SET LOCAL lock_timeout = '3s';
DO $migration$
DECLARE source text; patched text;
BEGIN
  source := pg_get_functiondef('public.handle_new_user()'::regprocedure);
  IF position('SELECT nextval(''public.profiles_player_number_seq'') INTO next_player_num;' in source)=0
     OR position('next_player_num BIGINT;' in source)=0 THEN
    RAISE EXCEPTION 'signup allocator preimage changed; inspect before installation';
  END IF;
  patched := replace(source, 'next_player_num BIGINT;', 'next_player_num TEXT;');
  patched := replace(patched,
    'SELECT nextval(''public.profiles_player_number_seq'') INTO next_player_num;',
    'SELECT public.fn_next_player_number() INTO next_player_num;');
  EXECUTE patched;
  source := pg_get_functiondef('public.handle_new_user()'::regprocedure);
  IF position('SELECT public.fn_next_player_number() INTO next_player_num;' in source)=0
     OR position('profiles_player_number_seq' in source)>0
     OR position('ON CONFLICT (id) DO UPDATE' in source)=0 THEN
    RAISE EXCEPTION 'signup allocator postcondition failed';
  END IF;
END $migration$;
COMMIT;
-- Rollback: forward migration replacing only the two asserted substitutions
-- above. Do not replay an older full trigger body and lose newer signup rules.
