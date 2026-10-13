-- TIER: 3; AUTHOR: Codex; IRREVERSIBLE: no.
-- AFFECTS: canonical source aliases, channel follows, upload notification receipts,
-- one caller-bound setter and one first-eligible catalog event trigger.
-- WHY: Mobile Phase 5 needs durable channel follow/opt-out and real new-upload
-- alerts. Profile preferences cannot store these keys; no channel producer exists.
-- HOW: registry identity, owner-only reads/RPC, transactional unique receipts,
-- existing notifications -> push mirror. No historical backfill or new schedule.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF to_regclass('public.video_library_channel_follows') IS NOT NULL THEN RAISE EXCEPTION 'channel follows already installed; replay refused'; END IF;
 IF to_regclass('public.content_sources') IS NULL OR to_regclass('public.video_library_public_catalog') IS NULL
 OR to_regclass('public.notifications') IS NULL OR to_regprocedure('public.fn_mirror_notification_to_push_outbox()') IS NULL
 THEN RAISE EXCEPTION 'canonical channel/catalog/notification prerequisites missing'; END IF;
END $$;

CREATE TABLE public.video_library_channel_aliases (
 source_key text PRIMARY KEY CHECK(length(source_key) BETWEEN 1 AND 160),
 source_id uuid NOT NULL REFERENCES public.content_sources(id) ON DELETE CASCADE
);
ALTER TABLE public.video_library_channel_aliases ENABLE ROW LEVEL SECURITY;
CREATE INDEX video_library_channel_aliases_source_idx ON public.video_library_channel_aliases(source_id);
REVOKE ALL ON public.video_library_channel_aliases FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.video_library_channel_aliases TO service_role;
CREATE POLICY video_library_channel_aliases_service_read ON public.video_library_channel_aliases FOR SELECT TO service_role USING(true);
INSERT INTO public.video_library_channel_aliases(source_key,source_id)
 SELECT id::text,id FROM public.content_sources WHERE kind='youtube_channel' AND provider='youtube' AND ingestion_mode='creator_uploads';
INSERT INTO public.video_library_channel_aliases(source_key,source_id)
 SELECT provider_source_id,id FROM public.content_sources WHERE kind='youtube_channel' AND provider='youtube' AND ingestion_mode='creator_uploads'
 AND provider_source_id ~ '^UC[A-Za-z0-9_-]{22}$';
DO $$ DECLARE a record; matched uuid; n integer; BEGIN
 FOR a IN SELECT * FROM (VALUES
 ('HCL','Hustler Casino Live'),('LODGE','The Lodge'),('TRITON','Triton Poker'),('LATB','Bally Poker Live'),
 ('TCH','TCH Live'),('POKERGO','PokerGO'),('WPT','World Poker Tour'),('EPT','European Poker Tour'),('WSOP','World Series of Poker'),('BRAD_OWEN','Brad Owen'),
 ('NEEME','Andrew Neeme'),('RAMPAGE','Rampage Poker'),('MARIANO','Mariano'),('WOLFGANG','Wolfgang Poker'),
 ('JOHNNIE','Johnnie Vibes'),('JLITTLE','Jonathan Little Poker'),('POLK','Doug Polk Poker'),('BART','Bart Hanson'),
 ('UPSWING','Upswing Poker'),('NEGREANU','Daniel Negreanu'),('HELLMUTH','Phil Hellmuth'),('IVEY','Phil Ivey'),
 ('DWAN','Tom Dwan'),('GARRETT','Garrett Adelstein')) AS aliases(source_key,source_name)
 LOOP
  SELECT count(*),(array_agg(id))[1] INTO n,matched FROM public.content_sources
   WHERE kind='youtube_channel' AND provider='youtube' AND ingestion_mode='creator_uploads' AND name=a.source_name;
  IF n<>1 THEN RAISE EXCEPTION 'canonical alias % has % registry matches',a.source_key,n; END IF;
  INSERT INTO public.video_library_channel_aliases VALUES(a.source_key,matched);
 END LOOP;
END $$;

CREATE TABLE public.video_library_channel_follows (
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 source_id uuid NOT NULL REFERENCES public.content_sources(id) ON DELETE CASCADE,
 notifications_enabled boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,source_id)
);
CREATE INDEX video_library_channel_follows_source_idx ON public.video_library_channel_follows(source_id,user_id);
ALTER TABLE public.video_library_channel_follows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.video_library_channel_follows FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.video_library_channel_follows TO authenticated,service_role;
CREATE POLICY video_library_channel_follows_owner_read ON public.video_library_channel_follows FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));
CREATE TABLE public.video_library_upload_notification_receipts (
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 video_id uuid REFERENCES public.video_library_videos(id) ON DELETE SET NULL,
 youtube_video_id text NOT NULL CHECK(youtube_video_id ~ '^[A-Za-z0-9_-]{11}$'),
 source_id uuid NOT NULL REFERENCES public.content_sources(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,youtube_video_id)
);
ALTER TABLE public.video_library_upload_notification_receipts ENABLE ROW LEVEL SECURITY;
CREATE INDEX video_library_upload_receipts_video_idx ON public.video_library_upload_notification_receipts(video_id);
CREATE INDEX video_library_upload_receipts_source_idx ON public.video_library_upload_notification_receipts(source_id);
REVOKE ALL ON public.video_library_upload_notification_receipts FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.video_library_upload_notification_receipts TO service_role;
CREATE POLICY video_library_upload_receipts_service_read ON public.video_library_upload_notification_receipts FOR SELECT TO service_role USING(true);

CREATE FUNCTION public.set_video_library_channel_follow(p_expected_user_id uuid,p_source_id uuid,p_following boolean,p_notifications_enabled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE u uuid:=auth.uid(); BEGIN
 IF u IS NULL OR u IS DISTINCT FROM p_expected_user_id THEN RAISE EXCEPTION 'Unauthorized: owner mismatch' USING ERRCODE='42501'; END IF;
 IF p_following IS NULL OR p_notifications_enabled IS NULL THEN RAISE EXCEPTION 'follow choices must be boolean'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.content_sources WHERE id=p_source_id AND kind='youtube_channel' AND provider='youtube'
  AND ingestion_mode='creator_uploads' AND lifecycle_status IN ('active','paused')) THEN RAISE EXCEPTION 'channel not found'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(u::text||':'||p_source_id::text,0));
 IF p_following THEN
  INSERT INTO public.video_library_channel_follows(user_id,source_id,notifications_enabled) VALUES(u,p_source_id,p_notifications_enabled)
  ON CONFLICT(user_id,source_id) DO UPDATE SET notifications_enabled=EXCLUDED.notifications_enabled,updated_at=now();
 ELSE DELETE FROM public.video_library_channel_follows WHERE user_id=u AND source_id=p_source_id;
 END IF;
 RETURN jsonb_build_object('following',p_following,'notificationsEnabled',p_following AND p_notifications_enabled);
END $$;
REVOKE ALL ON FUNCTION public.set_video_library_channel_follow(uuid,uuid,boolean,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.set_video_library_channel_follow(uuid,uuid,boolean,boolean) TO authenticated;

CREATE FUNCTION public.fn_notify_video_library_channel_upload()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE sid uuid; follower record; claimed integer; source_name text; BEGIN
 -- The existing public view owns availability, moderation, takedowns and rights.
 IF NOT EXISTS(SELECT 1 FROM public.video_library_public_catalog WHERE youtube_video_id=NEW.youtube_video_id) THEN RETURN NEW; END IF;
 IF NEW.youtube_video_id = ANY(ARRAY['-rjQT0JOhGA','185vMNh9ECc','4441ee7htt0','524_3UypGkU','5wTToeCyu6I','9PrLmIWU0mU','CbXDixknmeM','fzNt4SdBGuQ','jdiDizWlIz0','JVJrPh0s1JQ','KQRZs6ytdWc','LA4z0Hi0Jf8','oINUSqHq_ck','OYgw9TiNqZY','pFbHkHhJO4Y','pIZW-gmcKio','slTxYV5S5n0','TXarmUgk02Q','RpU9bwH-2WI','FqiS7LaQSsg','vWVwhXeILoX','c0RqYhgRxH0','iDPJ3tHK6rA','D1lPQFCDRLg','bZqKGJz2HoE','fQ9Lklp6AuA','hA7c3HHFRUE','n0fHHMfvWck','GH5sEqf5p9Y','aVGVP7Oj8Jg','dbCLX6WbyJg','kiAPXh4jRHo']) THEN RETURN NEW; END IF;
 IF NEW.title IS NULL OR NEW.title !~ '[[:alnum:]]' OR NEW.title ~* '^(test(ing)?[[:space:].!,\-]*){1,4}$'
 OR (NEW.type IN ('cash','tournament') AND NEW.title ~* 'black[[:space:]]?jack|roulette|baccarat|\mcraps\M')
 OR (NEW.source_id='6bfb1441-98ed-41d6-929f-e147626dbffa' AND NEW.title !~* 'poker') THEN RETURN NEW; END IF;
 SELECT source_id INTO sid FROM public.video_library_channel_aliases WHERE source_key=NEW.source_id;
 IF sid IS NULL AND NEW.source_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
  SELECT id INTO sid FROM public.content_sources WHERE id=NEW.source_id::uuid AND kind='youtube_channel'
   AND provider='youtube' AND ingestion_mode='creator_uploads';
 END IF;
 IF sid IS NULL AND NEW.provider_channel_id IS NOT NULL THEN SELECT source_id INTO sid FROM public.video_library_channel_aliases WHERE source_key=NEW.provider_channel_id; END IF;
 IF sid IS NULL THEN RETURN NEW; END IF;
 SELECT name INTO source_name FROM public.content_sources WHERE id=sid;
 FOR follower IN SELECT * FROM public.video_library_channel_follows WHERE source_id=sid AND notifications_enabled
  AND created_at<=COALESCE(NEW.published_at,NEW.scraped_at) FOR SHARE
 LOOP
  INSERT INTO public.video_library_upload_notification_receipts(user_id,video_id,youtube_video_id,source_id) VALUES(follower.user_id,NEW.id,NEW.youtube_video_id,sid)
   ON CONFLICT(user_id,youtube_video_id) DO NOTHING;
  GET DIAGNOSTICS claimed=ROW_COUNT;
  IF claimed=1 THEN
   -- Deliberately unmarked: the installed DB notification producer bridge owns
   -- push routing, preferences, staleness, caps, and platform recipient policy.
   INSERT INTO public.notifications(user_id,type,title,message,link,action_url,data)
   VALUES(follower.user_id,'video_library_upload','New Video From '||source_name,'The Channel Published A New Verified Video.',
    '/hub/video-library/watch/'||NEW.youtube_video_id,'/hub/video-library/watch/'||NEW.youtube_video_id,
    jsonb_build_object('source_id',sid,'video_id',NEW.youtube_video_id,'channel_url','/hub/video-library/channels/'||sid::text));
  END IF;
 END LOOP;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fn_notify_video_library_channel_upload() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER zz_video_library_channel_upload AFTER INSERT OR UPDATE OF availability_status,embeddable,availability_checked_at,moderation_state,taken_down_at
 ON public.video_library_videos FOR EACH ROW EXECUTE FUNCTION public.fn_notify_video_library_channel_upload();

DO $$ BEGIN
 IF (SELECT count(*) FROM pg_trigger WHERE tgname='zz_video_library_channel_upload' AND tgenabled='O')<>1 THEN RAISE EXCEPTION 'upload notification trigger not enabled'; END IF;
 IF has_function_privilege('anon','public.set_video_library_channel_follow(uuid,uuid,boolean,boolean)','EXECUTE') THEN RAISE EXCEPTION 'anonymous follow mutation granted'; END IF;
 IF has_table_privilege('authenticated','public.video_library_channel_follows','INSERT') THEN RAISE EXCEPTION 'direct follow mutation granted'; END IF;
 IF (SELECT count(*) FROM pg_class WHERE oid IN ('public.video_library_channel_aliases'::regclass,'public.video_library_channel_follows'::regclass,'public.video_library_upload_notification_receipts'::regclass) AND relrowsecurity)<>3 THEN RAISE EXCEPTION 'channel RLS missing'; END IF;
 IF (SELECT count(*) FROM pg_proc WHERE oid IN ('public.set_video_library_channel_follow(uuid,uuid,boolean,boolean)'::regprocedure,'public.fn_notify_video_library_channel_upload()'::regprocedure) AND prosecdef AND proconfig @> ARRAY['search_path=public, extensions'])<>2 THEN RAISE EXCEPTION 'channel function hardening missing'; END IF;
 IF (SELECT count(*) FROM public.video_library_channel_aliases WHERE source_key='HCL')<>1 THEN RAISE EXCEPTION 'HCL identity missing'; END IF;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
-- ROLLBACK via a NEW migration only. Existing delivered notifications are not replayed/deleted.
-- BEGIN;
-- DROP TRIGGER zz_video_library_channel_upload ON public.video_library_videos;
-- DROP FUNCTION public.fn_notify_video_library_channel_upload();
-- DROP FUNCTION public.set_video_library_channel_follow(uuid,uuid,boolean,boolean);
-- DROP TABLE public.video_library_upload_notification_receipts;
-- DROP TABLE public.video_library_channel_follows;
-- DROP TABLE public.video_library_channel_aliases;
-- COMMIT;
