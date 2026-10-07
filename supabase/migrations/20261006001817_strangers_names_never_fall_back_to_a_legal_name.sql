-- 20261006001817_strangers_names_never_fall_back_to_a_legal_name.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:         2 (definer function bodies, by asserted substitution)
-- AUTHOR:       Claude, Diamond Arena Phase 10 line 2 follow-through
-- AFFECTS:      15 SECURITY DEFINER functions (home games, messenger)
-- IRREVERSIBLE: no (the old bodies are pinned by md5 below; the reverse
--               substitution restores them)
--
-- WHY:
--   Ruling 25 (docs/DIAMOND-RULINGS.md in Club Arena, 2026-09-30): a
--   person's money, real identity and whereabouts are readable only by that
--   person and platform staff. Migration 20260930234500 revoked SELECT on
--   profiles.full_name (and sixteen other columns) from anon and
--   authenticated, which closed every browser read. A SECURITY DEFINER
--   function is not reached by that revoke, and these fifteen still answer
--   a signed-in caller with SOMEBODY ELSE's legal name whenever that person
--   has no display_name: `COALESCE(display_name, full_name, username)`.
--   Measured 2026-10-06: 329 of 1,946 profiles have a legal name and no
--   display name, so a home-game roster, seat map, feed, host dashboard,
--   ban-appeal queue, public group page (reviewer names), friends' activity,
--   members CSV export and the messenger inbox printed those 329 real
--   names to other members. Two (assign_home_game_seat,
--   claim_home_game_seat) also persisted the name into
--   commander_home_seats.player_name; a read on 2026-10-06 found no stored
--   row holding a legal name, so there is nothing to backfill.
--
--   Not changed, reviewed: fn_get_home_games_onboarding_status_admin and
--   list_home_ban_appeals_admin are platform-admin gated (FORBIDDEN for
--   anyone else); fn_list_my_post_targets names the caller's own profile;
--   get_unified_user_profile already masks full_name for non-self.
--
-- HOW:
--   For each function: refuse unless the live body's md5 is the reviewed
--   one (or the change is already present), replace each reviewed fragment
--   exactly the expected number of times, so that full_name is dropped and
--   the public username takes its place, EXECUTE the edited definition
--   (CREATE OR REPLACE keeps signature, owner, grants and settings), and
--   assert the new body no longer names full_name at all and matches the
--   computed post-image. Nothing else in any body changes.
--
-- Never apply between :50 and :03 UTC (the break window refuses DDL).
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '60s';

DO $migration$
DECLARE
  -- signature, reviewed md5 of pg_get_functiondef, then (old, new, count) triples
  v_plan constant jsonb := $plan$[
    {"fn": "public.assign_home_game_seat(uuid,integer,uuid,text,uuid)", "md5": "c07ba12172f3e23f592abb8f4037f94c",
     "subs": [["display_name, full_name, username", "display_name, username", 1]]},
    {"fn": "public.claim_home_game_seat(uuid,integer,uuid)", "md5": "a2e1265bbb648d02eb7ac122608719ce",
     "subs": [["display_name, full_name, username", "display_name, username", 1]]},
    {"fn": "public.export_home_group_members_csv(uuid,uuid)", "md5": "d0d60b2ca5ff0978e16eb9c9f511dde4",
     "subs": [["p.display_name, p.full_name, ''", "p.display_name, p.username, ''", 1]]},
    {"fn": "public.fn_get_user_conversations(uuid,uuid)", "md5": "d8f051def39d166b1aff87b5812865af",
     "subs": [["ou.display_name, ou.username, ou.full_name)", "ou.display_name, ou.username)", 1]]},
    {"fn": "public.fn_home_list_seats(uuid)", "md5": "369948912193af66c922187b88efab90",
     "subs": [["p.display_name, p.full_name, p.username", "p.display_name, p.username", 2]]},
    {"fn": "public.get_friends_home_activity(uuid,integer)", "md5": "7a6b97fdc5110443a52023646b5de120",
     "subs": [["p.display_name, p.full_name, p.username", "p.display_name, p.username", 1]]},
    {"fn": "public.get_home_game_seat_map(uuid,uuid)", "md5": "bf6f9732d4b92be45083b41880d2480f",
     "subs": [["p.display_name, p.full_name, p.username", "p.display_name, p.username", 1]]},
    {"fn": "public.get_home_group_feed(uuid,uuid,integer,timestamp with time zone)", "md5": "9c9d664b39645939774d503d5c79804b",
     "subs": [["pr.display_name, pr.full_name, '", "pr.display_name, pr.username, '", 4]]},
    {"fn": "public.get_home_group_member_engagement(uuid,uuid)", "md5": "7237120863f80d5a345053863ad7f08c",
     "subs": [["p.display_name, p.full_name, p.username", "p.display_name, p.username", 1]]},
    {"fn": "public.get_home_group_public_detail(text,uuid,integer)", "md5": "4b1ad0e8950726cfdd9ff609ae50292f",
     "subs": [["p.display_name, p.full_name, p.username", "p.display_name, p.username", 1]]},
    {"fn": "public.get_home_group_roster(uuid,uuid)", "md5": "d6b4f32511540bb130203b33042082c1",
     "subs": [["p.display_name, p.full_name, p.username", "p.display_name, p.username", 1]]},
    {"fn": "public.get_host_dashboard(uuid,uuid,integer)", "md5": "6c8f090212a1d6783c50e39a8be3cf57",
     "subs": [["p.display_name, p.full_name, p.username", "p.display_name, p.username", 3]]},
    {"fn": "public.get_live_home_game_state(uuid,uuid)", "md5": "0ab44afa3e77f26eb276f9f066c5cbf6",
     "subs": [["p.display_name, p.full_name, '", "p.display_name, p.username, '", 6]]},
    {"fn": "public.list_home_ban_appeals_for_host(uuid,text,integer,integer)", "md5": "a7a848449ecc6df1b6b92dc8aa2ebaef",
     "subs": [["p.display_name, p.full_name, p.username", "p.display_name, p.username", 1]]},
    {"fn": "public.rsvp_to_home_game(uuid,text,uuid,integer,text)", "md5": "51b4fbe68053bda183a8962095caaef8",
     "subs": [["p.display_name, p.full_name, p.avatar_url", "p.display_name, p.avatar_url", 1],
              ["v_host_profile.full_name, v_host_profile.username)", "v_host_profile.username)", 1]]}
  ]$plan$;
  v_item jsonb;
  v_sub jsonb;
  v_fn regprocedure;
  v_def text;
  v_new text;
  v_old_frag text;
  v_found int;
  v_done int := 0;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_plan) LOOP
    v_fn := (v_item->>'fn')::regprocedure;
    v_def := pg_get_functiondef(v_fn);

    IF md5(v_def) <> v_item->>'md5' THEN
      IF strpos(v_def, 'full_name') = 0 THEN
        RAISE NOTICE '% already names no legal name; skipped', v_fn;
        CONTINUE;
      END IF;
      RAISE EXCEPTION 'Refusing to apply over drift: % expected md5 %, found %',
        v_fn, v_item->>'md5', md5(v_def);
    END IF;

    v_new := v_def;
    FOR v_sub IN SELECT * FROM jsonb_array_elements(v_item->'subs') LOOP
      v_old_frag := v_sub->>0;
      v_found := (length(v_new) - length(replace(v_new, v_old_frag, ''))) / length(v_old_frag);
      IF v_found <> (v_sub->>2)::int THEN
        RAISE EXCEPTION '%: fragment "%" found % time(s), reviewed %', v_fn, v_old_frag, v_found, v_sub->>2;
      END IF;
      v_new := replace(v_new, v_old_frag, v_sub->>1);
    END LOOP;

    IF strpos(v_new, 'full_name') <> 0 THEN
      RAISE EXCEPTION '%: the edited body still names full_name', v_fn;
    END IF;

    EXECUTE v_new;

    IF md5(pg_get_functiondef(v_fn)) <> md5(v_new) THEN
      RAISE EXCEPTION '%: post-image mismatch (expected %, found %)',
        v_fn, md5(v_new), md5(pg_get_functiondef(v_fn));
    END IF;
    v_done := v_done + 1;
  END LOOP;

  RAISE NOTICE 'strangers_names_never_fall_back_to_a_legal_name: % function(s) replaced', v_done;
END
$migration$;

-- POST-APPLY: none of the fifteen names full_name, and each still exists
-- with its grants (CREATE OR REPLACE does not touch the ACL).
DO $post$
DECLARE v_bad text;
BEGIN
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_bad
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname IN ('assign_home_game_seat','claim_home_game_seat','export_home_group_members_csv',
                       'fn_get_user_conversations','fn_home_list_seats','get_friends_home_activity',
                       'get_home_game_seat_map','get_home_group_feed','get_home_group_member_engagement',
                       'get_home_group_public_detail','get_home_group_roster','get_host_dashboard',
                       'get_live_home_game_state','list_home_ban_appeals_for_host','rsvp_to_home_game')
     AND (p.prosrc ~* '\mfull_name\M' OR NOT has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'post-apply: still names full_name or lost its grant: %', v_bad;
  END IF;
END
$post$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK: run the same loop with each pair's old and new swapped,
-- against the post-image md5s, as a new *_revert_* migration.
-- ═══════════════════════════════════════════════════════════════════════
