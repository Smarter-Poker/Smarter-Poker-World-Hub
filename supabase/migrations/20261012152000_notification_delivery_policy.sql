-- TIER 2: notification routing only; no game, wallet or accounting changes.
-- Owner request 2026-10-12: platform alerts only to Daniel's two accounts;
-- blinding-off alerts are ephemeral phone pushes, never saved inbox entries.
-- Keeps existing owner operational destination. Historical removed entries
-- are archived privately, never re-enqueued. Rollback: drop these two guards
-- via a new migration; archived rows must not be replayed into the push bridge.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF to_regprocedure('public.fn_notification_delivery_guard()') IS NOT NULL THEN
  RAISE EXCEPTION 'notification delivery policy already installed; replay refused';
 END IF;
 IF (SELECT count(*) FROM auth.users WHERE
  (id='47965354-0e56-43ef-931c-ddaab82af765' AND lower(email)='daniel@bekavactrading.com') OR
  (id='3bb71bfe-f723-427c-aac7-a853ba04a014' AND lower(email)='danbek4545@gmail.com')) <> 2 THEN
  RAISE EXCEPTION 'verified platform alert accounts do not match';
 END IF;
 IF to_regprocedure('public.fn_mirror_notification_to_push_outbox()') IS NULL THEN
  RAISE EXCEPTION 'existing notification push bridge missing';
 END IF;
END $$;

CREATE FUNCTION public.fn_is_platform_operational_alert(p_type text,p_title text,p_data jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=pg_catalog,public AS $$
 SELECT COALESCE(p_type='platform_admin_alert' OR p_data->>'audience'='platform_admin' OR p_type IN ('financial_incident','financial_incident_resolved','financial_attestation',
 'engine_break_failed','engine_break_recovered','guarantee_bank_short','guarantee_bank_recovered','estate_digest')
 OR ((p_type='system' OR p_type IS NULL) AND (p_title IN ('Push Health Alert','Notifications May Not Be Reaching This Device',
 'Push Notifications Are Off','Money Check Failed','Engine Restart Storm','Tables Have Stopped Dealing',
 'Production Alerts Has Stopped Reading','Tournament Schedule Active') OR p_title ~ '^Horse Fleet (Alert|Recovered): '
 OR (p_data->>'component'='club-arena-engine' AND jsonb_typeof(p_data->'alertname')='string'
 AND NULLIF(p_data->>'alertname','') IS NOT NULL))),false);
$$;
CREATE FUNCTION public.fn_is_platform_alert_recipient(p_user uuid)
RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=pg_catalog,public AS $$
 SELECT COALESCE(p_user IN ('47965354-0e56-43ef-931c-ddaab82af765'::uuid,
 '3bb71bfe-f723-427c-aac7-a853ba04a014'::uuid),false);
$$;
CREATE FUNCTION public.fn_notification_delivery_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF public.fn_is_platform_operational_alert(NEW.type,NEW.title,NEW.data)
  AND NOT public.fn_is_platform_alert_recipient(NEW.user_id) THEN RETURN NULL; END IF;
 IF NEW.type='tournament_blinding_off' THEN
  -- Inline producers already own their push. Unmarked DB producers need the
  -- durable outbox here because returning NULL prevents the AFTER bridge.
  IF NEW.data->>'_push' IS NULL AND NEW.user_id IS NOT NULL
   AND NULLIF(btrim(NEW.title),'') IS NOT NULL
   AND COALESCE(NEW.created_at,now())>=now()-interval '30 minutes' THEN
   INSERT INTO public.push_outbox(recipient_user_id,title,body,url,event,tag,status,related_entity_id)
    VALUES(NEW.user_id,left(NEW.title,120),left(COALESCE(NEW.message,NEW.title),500),
     COALESCE(NULLIF(btrim(NEW.link),''),NULLIF(btrim(NEW.action_url),''),'/hub'),NEW.type,
     'tournament_blinding_off:'||COALESCE(NEW.data->>'tableId',NEW.data->>'table_id',NEW.id::text),
     'pending',NEW.id);
  END IF;
  RETURN NULL;
 END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION public.fn_platform_push_recipient_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF public.fn_is_platform_operational_alert(NEW.event,NEW.title,'{}'::jsonb)
  AND NOT public.fn_is_platform_alert_recipient(NEW.recipient_user_id) THEN
  NEW.status:='skipped'; NEW.claimed_at:=NULL;
  NEW.failure_reason:='platform_alert_recipient_not_allowed';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fn_notification_delivery_guard(),public.fn_platform_push_recipient_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER aa_notification_delivery_guard BEFORE INSERT OR UPDATE ON public.notifications
 FOR EACH ROW EXECUTE FUNCTION public.fn_notification_delivery_guard();
CREATE TRIGGER aa_platform_push_recipient_guard BEFORE INSERT OR UPDATE ON public.push_outbox
 FOR EACH ROW EXECUTE FUNCTION public.fn_platform_push_recipient_guard();

CREATE TABLE public.notification_delivery_policy_archive (
 notification_id uuid PRIMARY KEY, original_row jsonb NOT NULL,
 archived_at timestamptz NOT NULL DEFAULT now(), reason text NOT NULL
);
ALTER TABLE public.notification_delivery_policy_archive ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_delivery_policy_archive FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.notification_delivery_policy_archive TO service_role;
INSERT INTO public.notification_delivery_policy_archive(notification_id,original_row,reason)
 SELECT id,to_jsonb(n),CASE WHEN type='tournament_blinding_off' THEN 'push_only' ELSE 'platform_recipient_restricted' END
 FROM public.notifications n WHERE type='tournament_blinding_off' OR
 (public.fn_is_platform_operational_alert(type,title,data) AND NOT public.fn_is_platform_alert_recipient(user_id));
DELETE FROM public.notifications n USING public.notification_delivery_policy_archive a WHERE n.id=a.notification_id;
UPDATE public.push_outbox SET status='skipped',claimed_at=NULL,failure_reason='platform_alert_recipient_not_allowed'
 WHERE status IN ('pending','processing') AND public.fn_is_platform_operational_alert(event,title,'{}'::jsonb)
 AND NOT public.fn_is_platform_alert_recipient(recipient_user_id);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.notifications WHERE type='tournament_blinding_off' OR
  (public.fn_is_platform_operational_alert(type,title,data) AND NOT public.fn_is_platform_alert_recipient(user_id))) THEN
  RAISE EXCEPTION 'notification policy postcondition failed';
 END IF;
 IF (SELECT count(*) FROM pg_trigger WHERE tgname IN ('aa_notification_delivery_guard','aa_platform_push_recipient_guard') AND tgenabled='O')<>2 THEN
  RAISE EXCEPTION 'notification policy guards not enabled';
 END IF;
END $$;
COMMIT;
