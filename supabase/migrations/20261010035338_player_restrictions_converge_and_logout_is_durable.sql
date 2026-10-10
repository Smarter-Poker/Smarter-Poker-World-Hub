-- TIER: 3. P3 authoritative restriction convergence and durable session revocation.
-- No policy toggle, existing balances, restrictions, sessions or games are changed at install.
-- Original transactions roll back on a binding refusal; refunds, exits, deletions,
-- reversals, settlement and reads stay available. Horses use these same writers.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

-- Acquire every existing CREATE TRIGGER target before DDL/event guards run.
-- NOWAIT refuses live writer contention atomically before incidental DDL locks.
-- These are the exact final trigger lock modes, so there is no later upgrade.
LOCK TABLE public.ca_player_restrictions,
  public.chip_transactions,
  public.club_chat,
  public.crew_members,
  public.crews,
  public.diamond_transactions,
  public.friendships,
  public.live_sessions,
  public.message_reactions,
  public.page_followers,
  public.session_chat_messages,
  public.social_comments,
  public.social_follows,
  public.social_interactions,
  public.social_likes,
  public.social_messages,
  public.social_page_comment_likes,
  public.social_page_followers,
  public.social_page_post_likes,
  public.social_page_posts,
  public.social_page_reviews,
  public.social_posts,
  public.social_reels,
  public.social_stories,
  public.table_chat,
  public.tournament_players,
  public.wallet_transactions
  IN SHARE ROW EXCLUSIVE MODE NOWAIT;

DO $pre$ BEGIN
  IF to_regprocedure('public.fn_ca_player_restricted(uuid,text)') IS NULL
     OR to_regprocedure('public.fn_caller_session_is_live()') IS NULL THEN
    RAISE EXCEPTION 'P3 expected existing restriction and session contracts';
  END IF;
END $pre$;

CREATE TABLE public.ca_player_control_operations (
  op_id text PRIMARY KEY CHECK (length(op_id) BETWEEN 1 AND 200),
  actor_id uuid NOT NULL, user_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('restrict','lift','force_logout')),
  payload jsonb NOT NULL, result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ca_player_control_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ca_player_control_operations FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT ON public.ca_player_control_operations TO service_role;

CREATE TABLE public.ca_player_session_revocations (
  user_id uuid PRIMARY KEY,
  revoked_before timestamptz NOT NULL,
  op_id text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ca_player_session_revocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ca_player_session_revocations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ca_player_session_revocations TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.ca_player_session_revocations TO service_role;
CREATE POLICY own_session_revocation ON public.ca_player_session_revocations
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
DO $publication$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ca_player_session_revocations;
  END IF;
END $publication$;

-- Serializes restriction decisions and attempted admissions without locking wallets.
CREATE FUNCTION public.fn_ca_player_control_lock() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text, 731));
  RETURN NEW;
END $f$;
CREATE TRIGGER ca_player_control_decision_lock BEFORE INSERT OR UPDATE
  ON public.ca_player_restrictions FOR EACH ROW EXECUTE FUNCTION public.fn_ca_player_control_lock();

CREATE FUNCTION public.fn_ca_assert_player_action(p_user_id uuid,p_scope text,p_source text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE v_enforced boolean; v_restriction public.ca_player_restrictions;
BEGIN
  IF p_user_id IS NULL THEN RETURN; END IF;
  IF p_scope NOT IN ('account','cash','tournaments','transfers','social') THEN
    RAISE EXCEPTION 'unknown_player_restriction_scope' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text,731));
  SELECT restrictions_enforced INTO v_enforced FROM public.ca_operator_policy WHERE id=true FOR SHARE;
  SELECT * INTO v_restriction FROM public.ca_player_restrictions
    WHERE user_id=p_user_id AND status='active'
      AND (expires_at IS NULL OR expires_at > statement_timestamp())
      AND scope IN ('account',p_scope) ORDER BY applied_at,id LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_enforced IS TRUE THEN
    RAISE EXCEPTION 'PLAYER_RESTRICTED: %',p_scope USING ERRCODE='42501';
  END IF;
  INSERT INTO public.ca_restriction_observations
    (user_id,scope,restriction_id,table_name,op,would_refuse,detail)
    VALUES(p_user_id,p_scope,v_restriction.id,p_source,'ACTION',true,
      jsonb_build_object('reason_code',v_restriction.reason_code,'restriction_scope',v_restriction.scope));
EXCEPTION WHEN insufficient_privilege THEN RAISE;
  WHEN OTHERS THEN
    -- Preserve PHASE4-CONTRACTS section 0: restriction lookup failures fail open.
    -- Session authentication and financial stops have separate fail-closed owners.
    RETURN;
END $f$;

CREATE OR REPLACE FUNCTION public.fn_ca_refuse_restricted_entry() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE v_scope text := coalesce(TG_ARGV[0],'account'); v_tourney uuid;
BEGIN
  IF TG_TABLE_NAME='table_seats' THEN
    SELECT tournament_id INTO v_tourney FROM public.tables WHERE id=NEW.table_id;
    v_scope := CASE WHEN v_tourney IS NULL THEN 'cash' ELSE 'tournaments' END;
  END IF;
  PERFORM public.fn_ca_assert_player_action(NEW.user_id,v_scope,TG_TABLE_NAME);
  RETURN NEW;
EXCEPTION WHEN insufficient_privilege THEN RAISE;
  WHEN OTHERS THEN RETURN NEW;
END $f$;
CREATE TRIGGER zz_restriction_tourney_paid_guard BEFORE UPDATE OF user_id,rebuys,add_on,status
 ON public.tournament_players FOR EACH ROW
 WHEN (NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.rebuys > OLD.rebuys
   OR (NEW.add_on IS TRUE AND OLD.add_on IS DISTINCT FROM TRUE)
   OR (NEW.status='registered' AND OLD.status IN ('eliminated','cancelled','withdrawn')))
 EXECUTE FUNCTION public.fn_ca_refuse_restricted_entry('tournaments');

-- INSERT convergence is deliberately inside each writer's transaction.
-- Updates guard only authored fields; counters/receipts/moderation are not speech.
CREATE FUNCTION public.fn_ca_refuse_restricted_social() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE v_user uuid;
BEGIN
  v_user := (to_jsonb(NEW)->>TG_ARGV[0])::uuid;
  IF TG_OP='UPDATE' AND (to_jsonb(NEW)->>'is_deleted')='true' THEN RETURN NEW; END IF;
  PERFORM public.fn_ca_assert_player_action(v_user,'social',TG_TABLE_NAME);
  RETURN NEW;
END $f$;
CREATE TRIGGER zz_restriction_social_guard BEFORE INSERT ON public.social_posts
 FOR EACH ROW EXECUTE FUNCTION public.fn_ca_refuse_restricted_social('author_id');
CREATE TRIGGER zz_restriction_social_edit_guard BEFORE UPDATE OF content,media_urls,author_id ON public.social_posts
 FOR EACH ROW EXECUTE FUNCTION public.fn_ca_refuse_restricted_social('author_id');
CREATE TRIGGER zz_restriction_social_guard BEFORE INSERT ON public.social_comments
 FOR EACH ROW EXECUTE FUNCTION public.fn_ca_refuse_restricted_social('author_id');
CREATE TRIGGER zz_restriction_social_edit_guard BEFORE UPDATE OF content,media_url,author_id ON public.social_comments
 FOR EACH ROW EXECUTE FUNCTION public.fn_ca_refuse_restricted_social('author_id');
CREATE TRIGGER zz_restriction_social_guard BEFORE INSERT ON public.social_messages
 FOR EACH ROW EXECUTE FUNCTION public.fn_ca_refuse_restricted_social('sender_id');
CREATE TRIGGER zz_restriction_social_edit_guard BEFORE UPDATE OF content,sender_id ON public.social_messages
 FOR EACH ROW EXECUTE FUNCTION public.fn_ca_refuse_restricted_social('sender_id');
CREATE TRIGGER zz_restriction_social_guard BEFORE INSERT ON public.social_page_posts
 FOR EACH ROW EXECUTE FUNCTION public.fn_ca_refuse_restricted_social('author_id');
CREATE TRIGGER zz_restriction_social_edit_guard BEFORE UPDATE OF content,media_urls,author_id ON public.social_page_posts
 FOR EACH ROW EXECUTE FUNCTION public.fn_ca_refuse_restricted_social('author_id');
CREATE TRIGGER zz_restriction_social_guard BEFORE INSERT ON public.social_page_reviews
 FOR EACH ROW EXECUTE FUNCTION public.fn_ca_refuse_restricted_social('reviewer_id');
CREATE TRIGGER zz_restriction_social_edit_guard BEFORE UPDATE OF content,title,overall_rating,reviewer_id ON public.social_page_reviews
 FOR EACH ROW EXECUTE FUNCTION public.fn_ca_refuse_restricted_social('reviewer_id');
CREATE TRIGGER zz_restriction_social_guard BEFORE INSERT ON public.social_interactions
 FOR EACH ROW EXECUTE FUNCTION public.fn_ca_refuse_restricted_social('user_id');
CREATE TRIGGER zz_restriction_social_guard BEFORE INSERT ON public.social_likes
 FOR EACH ROW EXECUTE FUNCTION public.fn_ca_refuse_restricted_social('user_id');
CREATE TRIGGER zz_restriction_social_guard BEFORE INSERT ON public.message_reactions
 FOR EACH ROW EXECUTE FUNCTION public.fn_ca_refuse_restricted_social('user_id');
CREATE TRIGGER zz_restriction_social_edit_guard BEFORE UPDATE OF reaction,user_id ON public.message_reactions
 FOR EACH ROW EXECUTE FUNCTION public.fn_ca_refuse_restricted_social('user_id');
CREATE TRIGGER zz_restriction_social_guard BEFORE INSERT ON public.club_chat
 FOR EACH ROW EXECUTE FUNCTION public.fn_ca_refuse_restricted_social('user_id');
CREATE TRIGGER zz_restriction_social_edit_guard BEFORE UPDATE OF message,user_id ON public.club_chat
 FOR EACH ROW EXECUTE FUNCTION public.fn_ca_refuse_restricted_social('user_id');
CREATE TRIGGER zz_restriction_social_guard BEFORE INSERT ON public.table_chat
 FOR EACH ROW EXECUTE FUNCTION public.fn_ca_refuse_restricted_social('user_id');
CREATE TRIGGER zz_restriction_social_edit_guard BEFORE UPDATE OF message,user_id ON public.table_chat
 FOR EACH ROW EXECUTE FUNCTION public.fn_ca_refuse_restricted_social('user_id');
CREATE TRIGGER zz_restriction_social_guard BEFORE INSERT ON public.friendships
 FOR EACH ROW EXECUTE FUNCTION public.fn_ca_refuse_restricted_social('user_id');

CREATE TRIGGER zz_restriction_social_guard BEFORE INSERT ON public.social_reels
 FOR EACH ROW EXECUTE FUNCTION public.fn_ca_refuse_restricted_social('author_id');
CREATE TRIGGER zz_restriction_social_edit_guard BEFORE UPDATE OF caption,video_url,author_id ON public.social_reels
 FOR EACH ROW EXECUTE FUNCTION public.fn_ca_refuse_restricted_social('author_id');
CREATE TRIGGER zz_restriction_social_guard BEFORE INSERT ON public.social_stories
 FOR EACH ROW EXECUTE FUNCTION public.fn_ca_refuse_restricted_social('author_id');
CREATE TRIGGER zz_restriction_social_edit_guard BEFORE UPDATE OF content,media_url,author_id ON public.social_stories
 FOR EACH ROW EXECUTE FUNCTION public.fn_ca_refuse_restricted_social('author_id');
CREATE TRIGGER zz_restriction_social_guard BEFORE INSERT ON public.social_follows
 FOR EACH ROW EXECUTE FUNCTION public.fn_ca_refuse_restricted_social('follower_id');
CREATE TRIGGER zz_restriction_social_guard BEFORE INSERT ON public.page_followers
 FOR EACH ROW EXECUTE FUNCTION public.fn_ca_refuse_restricted_social('user_id');
CREATE TRIGGER zz_restriction_social_guard BEFORE INSERT ON public.social_page_followers
 FOR EACH ROW EXECUTE FUNCTION public.fn_ca_refuse_restricted_social('user_id');
CREATE TRIGGER zz_restriction_social_guard BEFORE INSERT ON public.social_page_post_likes
 FOR EACH ROW EXECUTE FUNCTION public.fn_ca_refuse_restricted_social('user_id');
CREATE TRIGGER zz_restriction_social_edit_guard BEFORE UPDATE OF reaction_type,user_id ON public.social_page_post_likes
 FOR EACH ROW EXECUTE FUNCTION public.fn_ca_refuse_restricted_social('user_id');
CREATE TRIGGER zz_restriction_social_guard BEFORE INSERT ON public.social_page_comment_likes
 FOR EACH ROW EXECUTE FUNCTION public.fn_ca_refuse_restricted_social('user_id');
CREATE TRIGGER zz_restriction_social_guard BEFORE INSERT ON public.crews
 FOR EACH ROW EXECUTE FUNCTION public.fn_ca_refuse_restricted_social('owner_id');
CREATE TRIGGER zz_restriction_social_edit_guard BEFORE UPDATE OF name,description,owner_id ON public.crews
 FOR EACH ROW EXECUTE FUNCTION public.fn_ca_refuse_restricted_social('owner_id');
CREATE TRIGGER zz_restriction_social_guard BEFORE INSERT ON public.crew_members
 FOR EACH ROW EXECUTE FUNCTION public.fn_ca_refuse_restricted_social('user_id');
CREATE TRIGGER zz_restriction_social_guard BEFORE INSERT ON public.live_sessions
 FOR EACH ROW EXECUTE FUNCTION public.fn_ca_refuse_restricted_social('user_id');
CREATE TRIGGER zz_restriction_social_guard BEFORE INSERT ON public.session_chat_messages
 FOR EACH ROW EXECUTE FUNCTION public.fn_ca_refuse_restricted_social('user_id');
CREATE TRIGGER zz_restriction_social_edit_guard BEFORE UPDATE OF message,user_id ON public.session_chat_messages
 FOR EACH ROW EXECUTE FUNCTION public.fn_ca_refuse_restricted_social('user_id');

CREATE FUNCTION public.fn_ca_refuse_restricted_transfer() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
BEGIN
  IF TG_TABLE_NAME='chip_transactions' THEN
    IF NEW.transaction_type IN ('transfer','peer_transfer','user_transfer') AND NEW.amount>0 THEN
      PERFORM public.fn_ca_assert_player_action(NEW.from_user_id,'transfers',TG_TABLE_NAME);
    END IF;
  ELSIF TG_TABLE_NAME='wallet_transactions' THEN
    IF NEW.type='debit' AND NEW.category='transfer' AND NEW.amount>0 THEN
      PERFORM public.fn_ca_assert_player_action(NEW.user_id,'transfers',TG_TABLE_NAME);
    END IF;
  ELSIF NEW.amount<0 AND NEW.source IN ('wallet_transfer','wallet_diamond_transfer','stream_gift') THEN
    PERFORM public.fn_ca_assert_player_action(NEW.user_id,'transfers',TG_TABLE_NAME);
  END IF;
  RETURN NEW;
END $f$;
CREATE TRIGGER zz_restriction_transfer_guard BEFORE INSERT ON public.chip_transactions
 FOR EACH ROW EXECUTE FUNCTION public.fn_ca_refuse_restricted_transfer();
CREATE TRIGGER zz_restriction_transfer_guard BEFORE INSERT ON public.wallet_transactions
 FOR EACH ROW EXECUTE FUNCTION public.fn_ca_refuse_restricted_transfer();
CREATE TRIGGER zz_restriction_transfer_guard BEFORE INSERT ON public.diamond_transactions
 FOR EACH ROW EXECUTE FUNCTION public.fn_ca_refuse_restricted_transfer();

-- Supplied identity is accepted only from the trusted server, after JWT verification.
CREATE FUNCTION public.fn_ca_player_session_live(p_user_id uuid,p_session_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,auth,public AS $f$
 SELECT NOT EXISTS(SELECT 1 FROM public.ca_player_session_revocations WHERE user_id=p_user_id)
   OR EXISTS(SELECT 1 FROM auth.sessions WHERE id=p_session_id AND user_id=p_user_id
   AND (not_after IS NULL OR not_after>statement_timestamp()));
$f$;

CREATE FUNCTION public.fn_ca_player_force_logout(p_user_id uuid,p_actor uuid,p_op_id text,p_reason text,
 p_request_id text DEFAULT NULL,p_ip text DEFAULT NULL,p_agent text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,auth,pg_temp AS $f$
DECLARE v_previous public.ca_player_control_operations; v_payload jsonb;
 v_enforced boolean; v_result jsonb; v_count int; v_at timestamptz:=clock_timestamp();
BEGIN
 IF p_actor IS NULL OR NOT coalesce((public.fn_ca_operator_permissions(p_actor)->'permissions') ? 'moderation.write',false) THEN
   RAISE EXCEPTION 'moderation.write required' USING ERRCODE='42501';
 END IF;
 IF p_user_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user_id)
   OR p_op_id IS NULL OR length(p_op_id) NOT BETWEEN 1 AND 200
   OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 1 AND 2000 THEN
   RAISE EXCEPTION 'invalid_logout_request' USING ERRCODE='22023';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_op_id,732));
 v_payload:=jsonb_build_object('userId',p_user_id,'reason',btrim(p_reason));
 SELECT * INTO v_previous FROM public.ca_player_control_operations WHERE op_id=p_op_id;
 IF FOUND THEN
   IF v_previous.actor_id<>p_actor OR v_previous.action<>'force_logout' OR v_previous.payload<>v_payload THEN
     RAISE EXCEPTION 'idempotency_payload_mismatch' USING ERRCODE='22023';
   END IF;
   RETURN v_previous.result || jsonb_build_object('replayed',true);
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text,731));
 SELECT restrictions_enforced INTO v_enforced FROM public.ca_operator_policy WHERE id=true FOR SHARE;
 IF v_enforced IS NULL THEN RAISE EXCEPTION 'restriction_policy_unavailable'; END IF;
 v_count:=0;
 IF v_enforced THEN
   -- Delete only this authorized target's current sessions. FK cascades refresh tokens.
   DELETE FROM auth.sessions WHERE user_id=p_user_id AND created_at<=v_at;
   GET DIAGNOSTICS v_count=ROW_COUNT;
   INSERT INTO public.ca_player_session_revocations(user_id,revoked_before,op_id)
     VALUES(p_user_id,v_at,p_op_id) ON CONFLICT(user_id) DO UPDATE
       SET revoked_before=excluded.revoked_before,op_id=excluded.op_id,updated_at=now();
 END IF;
 v_result:=jsonb_build_object('ok',true,'enforced',v_enforced,'revokedSessions',v_count,
   'revokedBefore',CASE WHEN v_enforced THEN v_at END,'opId',p_op_id);
 PERFORM public.fn_log_admin_action(p_actor,'player.force_logout','profile',p_user_id::text,
   v_payload || jsonb_build_object('opId',p_op_id),NULL,v_result,p_ip,p_agent,p_request_id);
 INSERT INTO public.ca_player_control_operations(op_id,actor_id,user_id,action,payload,result)
   VALUES(p_op_id,p_actor,p_user_id,'force_logout',v_payload,v_result);
 RETURN v_result;
END $f$;


-- Idempotent state changes remember the original committed result, including after lift.
CREATE FUNCTION public.fn_ca_player_control_once(p_action text,p_actor uuid,p_op_id text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE v_previous public.ca_player_control_operations; v_result jsonb; v_user uuid;
BEGIN
 IF p_actor IS NULL OR NOT coalesce((public.fn_ca_operator_permissions(p_actor)->'permissions') ? 'moderation.write',false) THEN
   RAISE EXCEPTION 'moderation.write required' USING ERRCODE='42501';
 END IF;
 IF p_action NOT IN ('restrict','lift') OR p_op_id IS NULL OR length(p_op_id) NOT BETWEEN 1 AND 200 THEN
   RAISE EXCEPTION 'invalid_player_control_request' USING ERRCODE='22023';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_op_id,732));
 SELECT * INTO v_previous FROM public.ca_player_control_operations WHERE op_id=p_op_id;
 IF FOUND THEN
   IF v_previous.actor_id<>p_actor OR v_previous.action<>p_action OR v_previous.payload<>p_payload THEN
     RAISE EXCEPTION 'idempotency_payload_mismatch' USING ERRCODE='22023';
   END IF;
   RETURN v_previous.result || jsonb_build_object('replayed',true);
 END IF;
 IF p_action='restrict' THEN
   v_user:=(p_payload->>'userId')::uuid;
   PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text,731));
   v_result:=public.fn_ca_player_restrict(v_user,p_payload->>'scope',p_payload->>'reasonCode',
     p_payload->>'note',(p_payload->>'expiresAt')::timestamptz,p_actor,(p_payload->>'approvalId')::uuid);
 ELSE
   SELECT user_id INTO v_user FROM public.ca_player_restrictions WHERE id=(p_payload->>'restrictionId')::uuid;
   IF v_user IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
   PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text,731));
   v_result:=public.fn_ca_player_lift_restriction((p_payload->>'restrictionId')::uuid,p_actor,p_payload->>'note');
 END IF;
 IF (v_result->>'ok')::boolean IS TRUE THEN
   INSERT INTO public.ca_player_control_operations(op_id,actor_id,user_id,action,payload,result)
     VALUES(p_op_id,p_actor,v_user,p_action,p_payload,v_result);
 END IF;
 RETURN v_result;
END $f$;


-- The existing original request hook covers tables AND SECURITY DEFINER RPCs.
-- Preserve all engine actor/lease/fencing logic; do not replace the configured hook.
DO $hook$
DECLARE v_def text; v_needle text := $needle$  v_request_role := btrim(COALESCE(auth.role(), ''));$needle$;
 v_insertion text := $patch$
  -- P3 targeted revocation: no blanket restriction on legacy/sessionless accounts.
  IF v_request_role='authenticated' THEN
    IF EXISTS(SELECT 1 FROM public.ca_player_session_revocations WHERE user_id=auth.uid()) THEN
      IF NOT public.fn_ca_player_session_live(auth.uid(),NULLIF(v_claims->>'session_id','')::uuid) THEN
        RAISE EXCEPTION 'SESSION_REVOKED: sign in again' USING ERRCODE='PT401';
      END IF;
    END IF;
  END IF;
$patch$;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_db_role_setting s JOIN pg_roles r ON r.oid=s.setrole
   WHERE r.rolname='authenticator' AND 'pgrst.db_pre_request=smarter_private.fn_smarter_data_api_pre_request'=ANY(s.setconfig)) THEN
   RAISE EXCEPTION 'P3 expected existing configured original data API hook';
 END IF;
 SELECT pg_get_functiondef('smarter_private.fn_smarter_data_api_pre_request()'::regprocedure) INTO v_def;
 IF md5(v_def)<>'6027b488b1c77d03642b3d384f275d6a' THEN
   RAISE EXCEPTION 'P3 original data API hook source changed; requalify the exact hook';
 END IF;
 IF length(v_def)-length(replace(v_def,v_needle,'')) <> length(v_needle)
   OR position('TOURNAMENT_MANAGER_FENCED' IN v_def)=0
   OR position('fenced-manager-time-bank-receipt' IN v_def)=0 THEN
   RAISE EXCEPTION 'P3 refuses to patch an unrecognized data API hook';
 END IF;
 EXECUTE replace(v_def,v_needle,v_needle||chr(10)||v_insertion);
END $hook$;

DO $acl$ DECLARE r record; BEGIN
 FOR r IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN
    ('fn_ca_player_control_once','fn_ca_player_control_lock','fn_ca_assert_player_action','fn_ca_refuse_restricted_entry',
     'fn_ca_refuse_restricted_social','fn_ca_refuse_restricted_transfer','fn_ca_player_session_live','fn_ca_player_force_logout')
 LOOP
   EXECUTE format('ALTER FUNCTION %s OWNER TO postgres',r.signature);
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',r.signature);
   EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',r.signature);
 END LOOP;
END $acl$;
DO $post$ BEGIN
 IF has_function_privilege('authenticated','public.fn_ca_player_force_logout(uuid,uuid,text,text,text,text,text)','EXECUTE')
 OR has_function_privilege('anon','public.fn_ca_player_session_live(uuid,uuid)','EXECUTE') THEN
   RAISE EXCEPTION 'P3 privileged RPC exposure';
 END IF;
 IF (SELECT count(*) FROM pg_trigger WHERE tgname='zz_restriction_social_guard' AND NOT tgisinternal)<>22 THEN
   RAISE EXCEPTION 'P3 social convergence trigger inventory drift';
 END IF;
END $post$;
COMMIT;
/*
EXECUTABLE ROLLBACK TEMPLATE — run only as a new protected qualified migration.
Committed revocations remain immutable; sign-in creates a new session. Keep both
ledger tables and session helper/hook until all affected stale JWTs have expired.
BEGIN;
SET LOCAL lock_timeout='3s';
DO $rollback$
DECLARE r record;
BEGIN
 FOR r IN SELECT tgname, tgrelid::regclass AS relation FROM pg_trigger
 WHERE NOT tgisinternal AND tgname IN ('zz_restriction_social_guard',
 'zz_restriction_social_edit_guard','zz_restriction_transfer_guard',
 'zz_restriction_tourney_paid_guard','ca_player_control_decision_lock') LOOP
   EXECUTE format('DROP TRIGGER %I ON %s',r.tgname,r.relation);
 END LOOP;
END $rollback$;
create or replace function public.fn_ca_refuse_restricted_entry()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_scope    text := coalesce(tg_argv[0], 'account');
  v_user     uuid;
  v_enforced boolean := false;
  v_tourney  uuid;
  v_row      public.ca_player_restrictions;
begin
  begin
    v_user := new.user_id;
    if v_user is null then
      return new;
    end if;

    -- THE HOT PATH, and the only thing that runs for a player nobody has
    -- restricted: one probe of the partial index
    -- ca_player_restrictions_active_by_user, which on a platform with no
    -- restrictions is a handful of pages. Everything below it - the
    -- table lookup, the policy read, the observation write - happens
    -- only for a player who genuinely carries a live restriction.
    if not exists (
      select 1 from public.ca_player_restrictions r
       where r.user_id = v_user
         and r.status = 'active'
         and (r.expires_at is null or r.expires_at > now())
    ) then
      return new;
    end if;

    -- THE SCOPE THIS WRITE ACTUALLY BELONGS TO. table_seats carries both
    -- cash and tournament seats and 97.8% of its rows are tournament
    -- ones, so the trigger argument is a DEFAULT, not an answer.
    if tg_table_name = 'table_seats' then
      select t.tournament_id into v_tourney
        from public.tables t where t.id = new.table_id;
      v_scope := case when v_tourney is not null then 'tournaments' else 'cash' end;
    end if;

    if not public.fn_ca_player_restricted(v_user, v_scope) then
      return new;
    end if;

    select restrictions_enforced into v_enforced
      from public.ca_operator_policy limit 1;
    v_enforced := coalesce(v_enforced, false);

    v_row := public.fn_ca_player_restriction_for(v_user, v_scope);

    if not v_enforced then
      insert into public.ca_restriction_observations
        (user_id, scope, restriction_id, table_name, op, would_refuse, detail)
      values (
        v_user, v_scope, v_row.id, tg_table_name, tg_op, true,
        jsonb_build_object(
          'reason_code', v_row.reason_code,
          'restriction_scope', v_row.scope,
          'applied_at', v_row.applied_at,
          'expires_at', v_row.expires_at,
          -- Which of the two ways in this was, so the evidence says
          -- whether the revive path is being used at all.
          'seating_op', tg_op,
          'tournament_id', v_tourney));
      return new;
    end if;

    raise exception
      'PLAYER_RESTRICTED: this account is restricted (%) and cannot % on %.',
      v_row.reason_code, tg_op, tg_table_name
      using errcode = '42501',
            hint = 'An operator applied this restriction. It can be lifted from the Players tab in the operator console.';

  exception
    when insufficient_privilege then
      raise;
    when others then
      return new;
  end;
end;
$$;

DROP FUNCTION public.fn_ca_refuse_restricted_social();
DROP FUNCTION public.fn_ca_refuse_restricted_transfer();
DROP FUNCTION public.fn_ca_player_control_lock();
DROP FUNCTION public.fn_ca_assert_player_action(uuid,text,text);
DROP FUNCTION public.fn_ca_player_control_once(text,uuid,text,jsonb);
DROP FUNCTION public.fn_ca_player_force_logout(uuid,uuid,text,text,text,text,text);
COMMIT;
*/
