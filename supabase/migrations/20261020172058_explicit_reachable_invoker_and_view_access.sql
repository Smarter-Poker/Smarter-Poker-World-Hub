-- TIER: 2. Declare narrow existing caller rights without default ACL reliance.
-- Evidence: scripts/ci/reviewed-invoker-access.json. Actual installed invoker
-- RPCs/triggers and fresh Hub/Arena/Commander callers were traced. This is an
-- incremental correction after the reviewed legacy caller grants. Existing
-- RLS, column privacy, business guards, functions and rows stay unchanged.
-- Views retain security_invoker=true and need existing underlying permissions.
-- No browser notification INSERT is granted; mention notification authorization
-- is a separate qualified trigger repair. No blanket browser read is added.
-- Twenty-three existing relations already hold these rights in the saved catalog.
-- audit_logs/club_transactions are absent there: their historical declarations
-- receive conditional reset-only access, never recreation or production data.
-- Rollback: a NEW migration may remove only a right proved absent beforehand;
-- never revoke a preexisting production privilege as a synthetic rollback.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='15s';
DO $pre$
DECLARE r record;
BEGIN
 FOR r IN SELECT * FROM (VALUES
  ('audit_logs','r'),
  ('bus_event_log','r'),
  ('club_chat','r'),
  ('club_transactions','r'),
  ('commander_home_group_follows','r'),
  ('commander_home_groups','r'),
  ('conversations','r'),
  ('data_audit_log','r'),
  ('mentions','r'),
  ('messages','r'),
  ('messenger_participants','r'),
  ('poker_goals','r'),
  ('poker_series','r'),
  ('poker_venues','r'),
  ('sandbox_coach_accuracy','v'),
  ('sandbox_coach_results','r'),
  ('social_post_comments','r'),
  ('table_chat','r'),
  ('unified_events_calendar','v'),
  ('union_leave_requests','r'),
  ('video_library_health','v'),
  ('video_library_videos','r'),
  ('video_playlist_items','r'),
  ('video_playlists','r'),
  ('wallets','r')
 ) AS expected(tbl,kind) LOOP
  IF r.tbl IN ('audit_logs','club_transactions') AND to_regclass('public.'||r.tbl) IS NULL THEN CONTINUE; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname=r.tbl AND c.relkind::text=r.kind
    AND pg_get_userbyid(c.relowner)='postgres'
    AND (r.kind='v' OR c.relrowsecurity)) THEN
   RAISE EXCEPTION 'Expected postgres-owned public.% with reviewed relation kind/RLS',r.tbl;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=('public.'||r.tbl)::regclass
    AND a.attnum>0 AND NOT a.attisdropped AND a.attacl IS NOT NULL) THEN
   RAISE EXCEPTION 'Column ACL on public.% requires independent column review',r.tbl;
  END IF;
  IF r.tbl IN ('audit_logs','club_transactions') AND NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=('public.'||r.tbl)::regclass AND attname='club_id' AND atttypid='uuid'::regtype AND attnum>0 AND NOT attisdropped) THEN RAISE EXCEPTION 'Expected optional table %.club_id UUID',r.tbl; END IF;
  IF r.kind='v' AND NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=('public.'||r.tbl)::regclass
    AND 'security_invoker=true'=ANY(c.reloptions)) THEN
   RAISE EXCEPTION 'Expected security-invoker view public.%',r.tbl;
  END IF;
 END LOOP;
END $pre$;
DO $optional$ BEGIN IF to_regclass('public.audit_logs') IS NOT NULL THEN GRANT DELETE,SELECT ON TABLE public.audit_logs TO service_role; END IF; END $optional$;
GRANT SELECT,UPDATE ON TABLE public.bus_event_log TO service_role;
GRANT UPDATE ON TABLE public.club_chat TO service_role;
DO $optional$ BEGIN IF to_regclass('public.club_transactions') IS NOT NULL THEN GRANT DELETE,SELECT ON TABLE public.club_transactions TO service_role; END IF; END $optional$;
GRANT SELECT ON TABLE public.commander_home_group_follows TO service_role;
GRANT SELECT,UPDATE ON TABLE public.commander_home_groups TO service_role;
GRANT INSERT,SELECT,UPDATE ON TABLE public.conversations TO service_role;
GRANT INSERT ON TABLE public.data_audit_log TO service_role;
GRANT INSERT ON TABLE public.mentions TO authenticated;
GRANT SELECT ON TABLE public.messages TO service_role;
GRANT DELETE,INSERT,SELECT ON TABLE public.messenger_participants TO service_role;
GRANT INSERT,SELECT,UPDATE ON TABLE public.poker_goals TO authenticated;
GRANT SELECT ON TABLE public.poker_series TO service_role;
GRANT SELECT ON TABLE public.poker_venues TO service_role;
GRANT SELECT ON TABLE public.sandbox_coach_accuracy TO service_role;
GRANT SELECT ON TABLE public.sandbox_coach_results TO service_role;
GRANT SELECT,UPDATE ON TABLE public.social_post_comments TO service_role;
GRANT UPDATE ON TABLE public.table_chat TO service_role;
GRANT SELECT ON TABLE public.unified_events_calendar TO service_role;
GRANT DELETE ON TABLE public.union_leave_requests TO service_role;
GRANT SELECT ON TABLE public.video_library_health TO service_role;
GRANT SELECT ON TABLE public.video_library_videos TO service_role;
GRANT INSERT,UPDATE ON TABLE public.video_playlist_items TO authenticated;
GRANT UPDATE ON TABLE public.video_playlists TO authenticated;
GRANT INSERT,UPDATE ON TABLE public.wallets TO service_role;
GRANT SELECT ON TABLE public.commander_home_groups TO authenticated;
DO $post$
DECLARE r record; op text;
BEGIN
 FOR r IN SELECT * FROM (VALUES
  ('audit_logs','service_role',ARRAY['DELETE','SELECT']),
  ('bus_event_log','service_role',ARRAY['SELECT','UPDATE']),
  ('club_chat','service_role',ARRAY['UPDATE']),
  ('club_transactions','service_role',ARRAY['DELETE','SELECT']),
  ('commander_home_group_follows','service_role',ARRAY['SELECT']),
  ('commander_home_groups','service_role',ARRAY['SELECT','UPDATE']),
  ('conversations','service_role',ARRAY['INSERT','SELECT','UPDATE']),
  ('data_audit_log','service_role',ARRAY['INSERT']),
  ('mentions','authenticated',ARRAY['INSERT']),
  ('messages','service_role',ARRAY['SELECT']),
  ('messenger_participants','service_role',ARRAY['DELETE','INSERT','SELECT']),
  ('poker_goals','authenticated',ARRAY['INSERT','SELECT','UPDATE']),
  ('poker_series','service_role',ARRAY['SELECT']),
  ('poker_venues','service_role',ARRAY['SELECT']),
  ('sandbox_coach_accuracy','service_role',ARRAY['SELECT']),
  ('sandbox_coach_results','service_role',ARRAY['SELECT']),
  ('social_post_comments','service_role',ARRAY['SELECT','UPDATE']),
  ('table_chat','service_role',ARRAY['UPDATE']),
  ('unified_events_calendar','service_role',ARRAY['SELECT']),
  ('union_leave_requests','service_role',ARRAY['DELETE']),
  ('video_library_health','service_role',ARRAY['SELECT']),
  ('video_library_videos','service_role',ARRAY['SELECT']),
  ('video_playlist_items','authenticated',ARRAY['INSERT','UPDATE']),
  ('video_playlists','authenticated',ARRAY['UPDATE']),
  ('wallets','service_role',ARRAY['INSERT','UPDATE']),
  ('commander_home_groups','authenticated',ARRAY['SELECT'])
 ) AS expected(tbl,role_name,operations) LOOP
  IF r.tbl IN ('audit_logs','club_transactions') AND to_regclass('public.'||r.tbl) IS NULL THEN CONTINUE; END IF;
  FOREACH op IN ARRAY r.operations LOOP
   IF NOT has_table_privilege(r.role_name,'public.'||r.tbl,op) THEN
    RAISE EXCEPTION 'Missing explicit invoker privilege %.% %',r.role_name,r.tbl,op;
   END IF;
  END LOOP;
 END LOOP;
END $post$;
COMMIT;
