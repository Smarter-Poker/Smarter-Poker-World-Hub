-- TIER: 2. Restore the intended system moderation execution boundary.
-- The applied 20260424011938 audit-coverage source defined this trigger as
-- SECURITY DEFINER; current source body is intact but runs as INVOKER, so a
-- reporter cannot read the host moderation queue or hide content at threshold.
-- Keep the original threshold, content branches, audit and notification body;
-- add canonical trigger/actor checks and no browser moderation grants.
-- Admit either old INVOKER or old DEFINER attributes only with the exact same
-- captured old body/owner/binding; new-body replays still refuse by source hash.
-- Rollback: restore captured INVOKER definition in a new migration; that
-- restores the known permission failure. No committed report/content undo.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='15s';
DO $pre$
DECLARE t text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('public.fn_home_auto_hide_on_report_threshold()')
   AND p.proowner='postgres'::regrole AND p.prorettype='trigger'::regtype
   AND md5(p.prosrc)='289da1c1dae3dfc4921cd6344623c4aa') THEN
   RAISE EXCEPTION 'Home report moderation source/owner drift'; END IF;
 FOREACH t IN ARRAY ARRAY['commander_home_content_reports','commander_home_posts','commander_home_post_comments','commander_home_game_reviews','commander_home_games','commander_home_audit_log'] LOOP
   IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('public.'||t)
     AND relkind='r' AND relowner='postgres'::regrole AND relrowsecurity) THEN
     RAISE EXCEPTION 'Expected postgres-owned RLS public.%',t; END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.commander_home_content_reports'::regclass
   AND tgname='trg_home_auto_hide_on_report_threshold' AND tgtype=5 AND tgenabled='O'
   AND tgfoid='public.fn_home_auto_hide_on_report_threshold()'::regprocedure AND NOT tgisinternal)
   OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgfoid='public.fn_home_auto_hide_on_report_threshold()'::regprocedure
     AND (tgrelid<>'public.commander_home_content_reports'::regclass OR tgname<>'trg_home_auto_hide_on_report_threshold')) THEN
   RAISE EXCEPTION 'Expected only canonical enabled report moderation trigger'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
   WHERE t.tgrelid='public.commander_home_content_reports'::regclass
     AND t.tgname='trg_enforce_home_content_report_insert' AND t.tgtype=7 AND t.tgenabled='O'
     AND p.oid='public.fn_enforce_home_content_report_insert()'::regprocedure
     AND p.proowner='postgres'::regrole AND p.prosecdef
     AND md5(p.prosrc)='2a982ec9ce975061703e0091b8e230de') THEN
   RAISE EXCEPTION 'Report target/pending-state INSERT guard drift'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
   WHERE p.oid='public.fn_home_auto_hide_on_report_threshold()'::regprocedure
     AND a.grantee NOT IN (0,'postgres'::regrole::oid,'service_role'::regrole::oid,'anon'::regrole::oid,'authenticated'::regrole::oid)) THEN
   RAISE EXCEPTION 'Unknown report moderation function grantee'; END IF;
END $pre$;
CREATE OR REPLACE FUNCTION public.fn_home_auto_hide_on_report_threshold()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_trusted_writer boolean;
  v_threshold int;
  v_open_count int;
  v_author_id uuid;
  v_group_id uuid;
BEGIN
  IF TG_RELID <> 'public.commander_home_content_reports'::regclass
     OR TG_NAME <> 'trg_home_auto_hide_on_report_threshold'
     OR TG_OP <> 'INSERT' OR TG_WHEN <> 'AFTER' OR TG_LEVEL <> 'ROW' THEN
    RAISE EXCEPTION 'Report moderation requires its canonical INSERT trigger' USING ERRCODE='42501';
  END IF;
  -- Do not trust SECURITY DEFINER current_user or session_user alone.
  v_trusted_writer := current_setting('role',true)='service_role'
    OR (current_setting('role',true)='none' AND session_user='postgres');
  IF NOT v_trusted_writer AND (
      current_setting('role',true) IS DISTINCT FROM 'authenticated'
      OR auth.uid() IS NULL OR NEW.reporter_id IS DISTINCT FROM auth.uid()
      OR NEW.status IS DISTINCT FROM 'pending') THEN
    RAISE EXCEPTION 'Report actor must match the authenticated caller and pending state' USING ERRCODE='42501';
  END IF;
  IF TG_OP <> 'INSERT' OR NEW.status NOT IN ('pending','hidden_pending_review') THEN
    RETURN NEW;
  END IF;

  SELECT value::int INTO v_threshold FROM public.platform_policies
   WHERE key = 'home_games.moderation.auto_hide_threshold';
  IF v_threshold IS NULL THEN v_threshold := 3; END IF;

  SELECT COUNT(*) INTO v_open_count FROM public.commander_home_content_reports
   WHERE reported_type = NEW.reported_type AND reported_id = NEW.reported_id
     AND status IN ('pending','hidden_pending_review');

  IF v_open_count < v_threshold THEN RETURN NEW; END IF;

  -- Resolve group + author
  CASE NEW.reported_type
    WHEN 'post' THEN
      UPDATE public.commander_home_posts
         SET is_hidden = true, hidden_at = COALESCE(hidden_at, now()),
             hidden_reason = COALESCE(hidden_reason, 'auto_hide_threshold_reached')
       WHERE id = NEW.reported_id AND is_hidden = false
      RETURNING author_id, group_id INTO v_author_id, v_group_id;
    WHEN 'comment' THEN
      WITH updated AS (
        UPDATE public.commander_home_post_comments
           SET is_hidden = true, hidden_at = COALESCE(hidden_at, now()),
               hidden_reason = COALESCE(hidden_reason, 'auto_hide_threshold_reached')
         WHERE id = NEW.reported_id AND is_hidden = false
        RETURNING author_id, post_id)
      SELECT u.author_id, p.group_id INTO v_author_id, v_group_id
        FROM updated u JOIN public.commander_home_posts p ON p.id = u.post_id;
    WHEN 'review' THEN
      WITH updated AS (
        UPDATE public.commander_home_game_reviews
           SET is_hidden = true, hidden_at = COALESCE(hidden_at, now()),
               hidden_reason = COALESCE(hidden_reason, 'auto_hide_threshold_reached')
         WHERE id = NEW.reported_id AND is_hidden = false
        RETURNING reviewer_id, game_id)
      SELECT u.reviewer_id, g.group_id INTO v_author_id, v_group_id
        FROM updated u JOIN public.commander_home_games g ON g.id = u.game_id;
    ELSE RETURN NEW;
  END CASE;

  UPDATE public.commander_home_content_reports
     SET status = 'hidden_pending_review',
         content_hidden_at = COALESCE(content_hidden_at, now())
   WHERE reported_type = NEW.reported_type AND reported_id = NEW.reported_id
     AND status = 'pending';

  IF v_author_id IS NOT NULL THEN
    PERFORM public.fn_emit_home_notification(
      p_user_id => v_author_id, p_type => 'moderation_auto_hide',
      p_title => 'Your content was hidden pending review',
      p_message => 'Multiple users reported your ' || NEW.reported_type ||
                   '. It is temporarily hidden while a moderator reviews. ' ||
                   'If the reports are dismissed, it will be restored.',
      p_link => NULL,
      p_data => jsonb_build_object('reported_type', NEW.reported_type,
                                   'reported_id', NEW.reported_id),
      p_pref_column => NULL);
  END IF;

  -- ★ NEW: audit log - actor_id NULL = system action
  IF v_group_id IS NOT NULL THEN
    INSERT INTO public.commander_home_audit_log
      (group_id, actor_id, target_type, target_id, action, metadata)
    VALUES (
      v_group_id, NULL, NEW.reported_type, NEW.reported_id,
      'moderation.auto_hide_threshold',
      jsonb_build_object('threshold', v_threshold,
                         'open_reports', v_open_count,
                         'report_id', NEW.id));
  END IF;

  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_home_auto_hide_on_report_threshold() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_home_auto_hide_on_report_threshold() TO service_role;
DO $post$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid='public.fn_home_auto_hide_on_report_threshold()'::regprocedure
   AND prosecdef AND proowner='postgres'::regrole AND proconfig=ARRAY['search_path=public, extensions'])
   OR has_function_privilege('anon','public.fn_home_auto_hide_on_report_threshold()','EXECUTE')
   OR has_function_privilege('authenticated','public.fn_home_auto_hide_on_report_threshold()','EXECUTE')
   OR NOT has_function_privilege('service_role','public.fn_home_auto_hide_on_report_threshold()','EXECUTE') THEN
   RAISE EXCEPTION 'Report moderation execution boundary incomplete'; END IF;
END $post$;
COMMIT;
