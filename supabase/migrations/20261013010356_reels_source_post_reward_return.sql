-- TIER: 2 - CREATE OR REPLACE existing trigger; unchanged signature, rewards and privileges.
-- AFFECTS: public.fn_social_post_reward(), trg_reward_social_post on social_posts.
-- WHY: its exception-path RETURN was commented out, so an optional reward error aborts native posts with 2F005.
-- No balances, award amounts, historical records or reward-bus rules are changed.
-- ROLLBACK: use a separate reviewed migration restoring the exact prior body and unchanged INVOKER/ACL;
-- never replay this migration or modify installed history.
BEGIN;
DO $baseline$ BEGIN
 IF md5(pg_get_functiondef('public.fn_social_post_reward()'::regprocedure)) <> '12d3f0751ffd93fa7036e6f852eb4dd8' THEN
  RAISE EXCEPTION 'Social post reward baseline changed or migration already installed; never replay';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid='public.fn_social_post_reward()'::regprocedure AND proowner='postgres'::regrole AND NOT prosecdef AND proacl::text='{postgres=X/postgres,service_role=X/postgres}' AND proconfig=ARRAY['search_path=public, extensions']) THEN
  RAISE EXCEPTION 'Social post reward authority baseline changed';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.social_posts'::regclass AND tgname='trg_reward_social_post' AND tgfoid='public.fn_social_post_reward()'::regprocedure AND tgtype=5 AND tgenabled='O' AND pg_get_triggerdef(oid)='CREATE TRIGGER trg_reward_social_post AFTER INSERT ON public.social_posts FOR EACH ROW WHEN ((new.origin_type IS DISTINCT FROM ''video_library''::text)) EXECUTE FUNCTION fn_social_post_reward()') THEN
  RAISE EXCEPTION 'Social post reward producer trigger baseline changed';
 END IF;
END $baseline$;
CREATE OR REPLACE FUNCTION public.fn_social_post_reward()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,extensions AS $function$
DECLARE v_result jsonb;
BEGIN
    v_result := claim_reward(NEW.author_id, 'social_post_share', jsonb_build_object('post_id', NEW.id));
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Preserve the original optional-reward boundary without escalating authority.
    RETURN NEW;
END;
$function$;
DO $postimage$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid='public.fn_social_post_reward()'::regprocedure AND proowner='postgres'::regrole AND NOT prosecdef AND proacl::text='{postgres=X/postgres,service_role=X/postgres}' AND proconfig=ARRAY['search_path=public, extensions'] AND strpos(prosrc,'EXCEPTION WHEN OTHERS THEN')>0 AND prosrc ~ 'EXCEPTION WHEN OTHERS THEN[\s\S]*RETURN NEW;') THEN
  RAISE EXCEPTION 'Social post reward exception-return post-image did not qualify';
 END IF;
END $postimage$;
COMMIT;
