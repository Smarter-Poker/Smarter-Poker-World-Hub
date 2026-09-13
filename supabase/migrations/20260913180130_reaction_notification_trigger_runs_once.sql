-- One admitted reaction invokes one notification handler. No row cleanup.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE public.social_interactions IN SHARE ROW EXCLUSIVE MODE;
DO $preflight$
BEGIN
 IF md5(pg_get_functiondef('public.fn_notify_post_like()'::regprocedure)) <> 'b23bbee40aba1044acf5a5f5f02680d0'
 OR (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.social_interactions'::regclass
   AND tgenabled='O' AND tgfoid='public.fn_notify_post_like()'::regprocedure
   AND ((tgname='trg_notify_post_like' AND pg_get_triggerdef(oid)='CREATE TRIGGER trg_notify_post_like AFTER INSERT ON public.social_interactions FOR EACH ROW EXECUTE FUNCTION fn_notify_post_like()')
     OR (tgname='trg_notify_interaction_like' AND pg_get_triggerdef(oid)='CREATE TRIGGER trg_notify_interaction_like AFTER INSERT ON public.social_interactions FOR EACH ROW WHEN ((new.interaction_type = ANY (ARRAY[''like''::text, ''love''::text, ''haha''::text, ''wow''::text, ''sad''::text, ''angry''::text]))) EXECUTE FUNCTION fn_notify_post_like()'))) <> 2
 OR (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.social_interactions'::regclass AND tgfoid='public.fn_notify_post_like()'::regprocedure) <> 2 THEN
  RAISE EXCEPTION 'Reaction notification trigger definitions drifted; review before installation';
 END IF;
END;
$preflight$;
DROP TRIGGER trg_notify_post_like ON public.social_interactions;
COMMENT ON TRIGGER trg_notify_interaction_like ON public.social_interactions IS
 'The sole reaction notification trigger. The duplicate legacy trigger was removed after native reproduction of two notifications for one admitted reaction.';
COMMIT;
