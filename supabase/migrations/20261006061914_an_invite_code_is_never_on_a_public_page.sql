-- 20261006061914_an_invite_code_is_never_on_a_public_page.sql
-- Applied to production 2026-10-06 06:19 UTC as version 20261006061914
-- (Supabase MCP apply_migration), after a rolled-back dry run. Post-apply:
-- 0 pages carry invite_code (3 before), club_code kept on all 3; new body
-- md5s autocreate 8ee5066a329a04e49456b58d3bea5470, sync
-- ba1d45ea36e136085a2b587760a99f14; a rolled-back group update re-synced its
-- page with home_group_id and club_code and no invite_code.
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:         2 (two trigger functions, one data correction)
-- AUTHOR:       Claude, privacy follow-ups 2026-10-06
-- AFFECTS:      public.autocreate_home_group_social_page(),
--               public.sync_home_group_to_social_page(),
--               public.social_pages.metadata (3 rows)
-- IRREVERSIBLE: no (the code still lives in commander_home_groups.invite_code)
--
-- WHY:
--   A home group's invite_code is its membership credential: join_home_group
--   accepts it as the secret for a private group (src/lib/home-games/urls.js,
--   discover.js and [slug].js all withhold it for that reason). Both triggers
--   that mirror a group into its social page still copied it into
--   social_pages.metadata, a column anon and authenticated can SELECT on
--   every public page, and /api/social/pages/follow?user_id= returned the
--   whole row as the service role. Found 2026-10-06 reading that route's
--   live output.
--
--   Exposure, read from production before this ran: 3 pages carried the
--   code, each equal to its group's live code. Two belong to public groups,
--   where a code grants nothing (join_home_group asks for no code and still
--   applies requires_approval). The one private group's page is not public,
--   so row security hid it from strangers and no account followed it. No
--   code that redeems anything was readable, so none is rotated.
--
--   Nothing reads metadata.invite_code. The host gets the code from their own
--   commander_home_groups row (manage.js, get_host_dashboard).
--
-- HOW:
--   1. md5-pinned, count-asserted substitution of each function body: drop
--      the invite_code entry; the sync trigger also removes any key a page
--      already carries.
--   2. Remove the key from the rows that have it.
--   3. Assert no page carries it and no function copies it.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

DO $migration$
DECLARE
  v_plan constant jsonb := $plan$[
    {"fn": "public.autocreate_home_group_social_page()", "md5": "e65b4b640563a4c185a8d5fc5dd662de",
     "subs": [["'invite_code', NEW.invite_code,", "", 1]]},
    {"fn": "public.sync_home_group_to_social_page()", "md5": "93e3b64baec893e133d83d40bdfc1e07",
     "subs": [["'invite_code', NEW.invite_code,", "", 2],
              ["coalesce(sp.metadata, '{}'::jsonb) || jsonb_build_object(", "(coalesce(sp.metadata, '{}'::jsonb) - 'invite_code') || jsonb_build_object(", 1]]}
  ]$plan$;
  v_item jsonb; v_sub jsonb; v_fn regprocedure; v_def text; v_new text; v_frag text; v_found int;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_plan) LOOP
    v_fn := (v_item->>'fn')::regprocedure;
    v_def := pg_get_functiondef(v_fn);
    IF md5(v_def) <> v_item->>'md5' THEN
      RAISE EXCEPTION 'Refusing to apply over drift: % expected md5 %, found %', v_fn, v_item->>'md5', md5(v_def);
    END IF;
    v_new := v_def;
    FOR v_sub IN SELECT * FROM jsonb_array_elements(v_item->'subs') LOOP
      v_frag := v_sub->>0;
      v_found := (length(v_new) - length(replace(v_new, v_frag, ''))) / length(v_frag);
      IF v_found <> (v_sub->>2)::int THEN
        RAISE EXCEPTION '%: fragment "%" found % time(s), reviewed %', v_fn, v_frag, v_found, v_sub->>2;
      END IF;
      v_new := replace(v_new, v_frag, v_sub->>1);
    END LOOP;
    IF strpos(v_new, 'NEW.invite_code') <> 0 THEN
      RAISE EXCEPTION '%: the edited body still copies the invite code', v_fn;
    END IF;
    EXECUTE v_new;
  END LOOP;
END
$migration$;

-- The copies already written. Nothing reads metadata.invite_code: the host
-- reads the code from their own commander_home_groups row.
UPDATE public.social_pages
   SET metadata = metadata - 'invite_code'
 WHERE metadata ? 'invite_code';

DO $post$
DECLARE v_left int; v_fns int;
BEGIN
  SELECT count(*) INTO v_left FROM public.social_pages WHERE metadata ? 'invite_code';
  SELECT count(*) INTO v_fns FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prosrc ILIKE '%social_pages%' AND p.prosrc LIKE '%NEW.invite_code%';
  IF v_left <> 0 OR v_fns <> 0 THEN
    RAISE EXCEPTION 'post: % page(s) still carry an invite code, % function(s) still copy it', v_left, v_fns;
  END IF;
END
$post$;

COMMIT;
