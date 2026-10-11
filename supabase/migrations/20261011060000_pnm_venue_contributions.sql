-- TIER: 3. AUTHOR: Codex. AFFECTS: PNM venue contributions, permissions and audits.
-- WHY: Two legacy claim stores disagreed with schedule permissions; writes lacked
-- durable acknowledgments, revision checks and atomic evidence/audit trails.
-- Fresh installed catalogue: phase4-installed-metadata-20261011.json, 05:11 UTC.
-- Existing service-only claim/schedule policies are retained, not broadened.
-- No historical contribution, venue, ownership or schedule row is rewritten.
-- IRREVERSIBLE: durable history is retained; the rollback disables new writes.
-- The maintained installer supplies one outer transaction for this SQL and
-- its migration-ledger receipt. Do not add independently committed checkpoints.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $$
BEGIN
  IF to_regclass('public.pnm_contribution_operations') IS NOT NULL THEN
    RAISE EXCEPTION 'contribution migration already present';
  END IF;
  IF md5(pg_get_functiondef('public.approve_venue_claim(uuid,uuid,text)'::regprocedure))
       <> 'c076ef0bfe060824c788a2115b769522' THEN
    RAISE EXCEPTION 'installed legacy approval function changed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.poker_venues'::regclass
      AND tgname='trg_venue_claim_wiring' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'venue ownership wiring missing';
  END IF;
  IF md5(pg_get_functiondef('public.trg_fn_venue_claim_wiring()'::regprocedure))<>'983a19940d8e37911c22d66f8f80dbf1'
    OR md5(pg_get_functiondef('public.fn_ensure_social_page_for_venue(integer)'::regprocedure))<>'3a5ae71c8da37990824731ce12dc3f9c'
    OR md5(pg_get_functiondef('public.resolve_venue_location_integrity(integer,timestamptz,text,text,text,double precision,double precision,text,uuid,text,text)'::regprocedure))<>'d8393cd4043f5ebbe9193f6299ac9c0c' THEN
    RAISE EXCEPTION 'installed ownership/location consumers changed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='venue_managers' AND policyname='venue_managers_read'
      AND roles=ARRAY['public']::name[] AND cmd='SELECT' AND qual='true') THEN
    RAISE EXCEPTION 'installed manager read policy changed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
      AND table_name='poker_venues' AND column_name='location_integrity_revision') THEN
    RAISE EXCEPTION 'venue revision missing';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND ((tablename='venue_claims' AND policyname='venue_claims_read')
        OR (tablename='venue_game_schedules' AND policyname IN ('vgs_insert_policy','vgs_update_policy')))
      AND roles<>ARRAY['service_role']::name[]) THEN
    RAISE EXCEPTION 'installed service-only contribution policies changed';
  END IF;
END $$;

CREATE TABLE public.pnm_contribution_operations (
  request_id uuid PRIMARY KEY,
  actor_id uuid NOT NULL,
  kind text NOT NULL,
  venue_id integer NOT NULL,
  payload jsonb NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.pnm_contribution_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES public.pnm_contribution_operations(request_id)
    DEFERRABLE INITIALLY DEFERRED,
  actor_id uuid NOT NULL,
  venue_id integer NOT NULL,
  kind text NOT NULL,
  target_id text NOT NULL,
  source_url text NOT NULL,
  reason text NOT NULL,
  before_record jsonb,
  after_record jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.pnm_venue_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id integer NOT NULL REFERENCES public.poker_venues(id),
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  category text NOT NULL CHECK (category IN ('details','location','closure','schedule')),
  proposal jsonb NOT NULL CHECK (jsonb_typeof(proposal)='object'),
  source_url text NOT NULL,
  notes text,
  expected_revision timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','applied','rejected')),
  reviewed_by uuid REFERENCES public.profiles(id),
  review_reason text,
  review_source_url text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX pnm_venue_corrections_user ON public.pnm_venue_corrections(user_id,created_at DESC);
CREATE INDEX pnm_venue_corrections_queue ON public.pnm_venue_corrections(status,created_at,id);
CREATE INDEX pnm_contribution_audit_venue ON public.pnm_contribution_audit(venue_id,created_at DESC);
ALTER TABLE public.venue_claims ADD COLUMN submitted_source_url text;
ALTER TABLE public.venue_game_schedules ADD COLUMN source_url text;

ALTER TABLE public.pnm_contribution_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pnm_contribution_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pnm_venue_corrections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pnm_contribution_operations,public.pnm_contribution_audit,
  public.pnm_venue_corrections FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.pnm_contribution_operations,public.pnm_venue_corrections TO authenticated;
GRANT ALL ON public.pnm_contribution_operations,public.pnm_contribution_audit,
  public.pnm_venue_corrections TO service_role;
REVOKE TRUNCATE ON public.pnm_contribution_operations,public.pnm_contribution_audit FROM service_role;
GRANT USAGE,SELECT ON SEQUENCE public.pnm_contribution_audit_id_seq TO service_role;
CREATE POLICY pnm_operation_own_read ON public.pnm_contribution_operations FOR SELECT
  TO authenticated USING (actor_id=(SELECT auth.uid()));
CREATE POLICY pnm_correction_own_read ON public.pnm_venue_corrections FOR SELECT
  TO authenticated USING (user_id=(SELECT auth.uid()));
-- Do not expose verification codes/contact rows via unrestricted SELECT.
CREATE POLICY pnm_claim_own_read ON public.venue_claims FOR SELECT TO authenticated
  USING (user_id=(SELECT auth.uid()));
GRANT SELECT ON public.venue_claims TO authenticated;
DROP POLICY venue_managers_read ON public.venue_managers;
CREATE POLICY venue_managers_read ON public.venue_managers FOR SELECT TO authenticated
  USING (user_id=(SELECT auth.uid()));
DROP POLICY vgs_select_policy ON public.venue_game_schedules;
CREATE POLICY vgs_select_policy ON public.venue_game_schedules FOR SELECT TO PUBLIC
  USING (is_active IS TRUE);
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.venue_claims,
  public.page_claims,public.venue_managers,public.venue_game_schedules FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.approve_venue_claim(uuid,uuid,text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.pnm_contribution_immutable() RETURNS trigger LANGUAGE plpgsql
SET search_path=public,extensions AS $$ BEGIN
  RAISE EXCEPTION 'contribution evidence is append-only' USING ERRCODE='42501';
END $$;
CREATE TRIGGER pnm_operation_immutable BEFORE UPDATE OR DELETE ON public.pnm_contribution_operations
  FOR EACH ROW EXECUTE FUNCTION public.pnm_contribution_immutable();
CREATE TRIGGER pnm_audit_immutable BEFORE UPDATE OR DELETE ON public.pnm_contribution_audit
  FOR EACH ROW EXECUTE FUNCTION public.pnm_contribution_immutable();

-- Helpers are private even to authenticated users. No caller-supplied actor may
-- enter participant RPCs; staff RPCs are service-only and check the actor's role.
CREATE FUNCTION public.pnm_contribution_replay(p_id uuid,p_actor uuid,p_kind text,
  p_venue integer,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,extensions AS $$
DECLARE v public.pnm_contribution_operations%ROWTYPE;
BEGIN
  IF p_id IS NULL OR p_actor IS NULL OR p_venue IS NULL OR p_venue<1
      OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object'
      OR octet_length(p_payload::text)>24000 THEN
    RAISE EXCEPTION 'invalid contribution request' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text,4284));
  SELECT * INTO v FROM public.pnm_contribution_operations WHERE request_id=p_id;
  IF FOUND THEN
    IF v.actor_id IS DISTINCT FROM p_actor OR v.kind IS DISTINCT FROM p_kind
        OR v.venue_id IS DISTINCT FROM p_venue OR v.payload IS DISTINCT FROM p_payload THEN
      RAISE EXCEPTION 'PNM_CONFLICT: request identity reused with different input' USING ERRCODE='40001';
    END IF;
    RETURN v.result;
  END IF;
  RETURN NULL;
END $$;
CREATE FUNCTION public.pnm_contribution_evidence(p_source text,p_reason text,p_review boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SET search_path=public,extensions AS $$ BEGIN
  IF p_source IS NULL OR p_source !~ '^https?://[^[:space:]/]+[^[:space:]]*$'
      OR char_length(p_source)>2000 OR p_source ~ '[[:cntrl:]]'
      OR p_source ~ '^https?://[^/]*@' THEN
    RAISE EXCEPTION 'valid source URL required' USING ERRCODE='22023';
  END IF;
  IF char_length(coalesce(p_reason,''))>2000
      OR (p_review AND char_length(trim(coalesce(p_reason,'')))<12) THEN
    RAISE EXCEPTION 'review reason required (12 to 2000 characters)' USING ERRCODE='22023';
  END IF;
END $$;
CREATE FUNCTION public.pnm_contribution_staff(p_actor uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=p_actor
      AND role::text IN ('admin','superadmin','god')) THEN
    RAISE EXCEPTION 'platform staff required' USING ERRCODE='42501';
  END IF;
END $$;
CREATE FUNCTION public.pnm_contribution_permissions(p_actor uuid,p_venue integer) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE v_all boolean:=false; v_result jsonb; v_has_manager boolean;
BEGIN
  IF p_actor IS NULL THEN RETURN '{}'::jsonb; END IF;
  v_all:=EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role::text IN ('admin','superadmin','god'));
  SELECT EXISTS(SELECT 1 FROM public.venue_managers WHERE user_id=p_actor AND venue_id=p_venue) INTO v_has_manager;
  -- An explicit manager denial/revocation must not be defeated by a legacy claim.
  IF NOT v_has_manager THEN
    v_all:=v_all OR EXISTS(SELECT 1 FROM public.venue_claims WHERE user_id=p_actor
      AND venue_id=p_venue AND status='approved') OR EXISTS(SELECT 1 FROM public.page_claims
      WHERE user_id=p_actor AND page_type='venue' AND page_id=p_venue::text AND status='approved');
  END IF;
  SELECT jsonb_build_object(
    'can_edit_info',v_all OR coalesce(bool_or(can_edit_info) FILTER(WHERE is_active IS TRUE),false),
    'can_edit_hours',v_all OR coalesce(bool_or(can_edit_hours) FILTER(WHERE is_active IS TRUE),false),
    'can_edit_games',v_all OR coalesce(bool_or(can_edit_games) FILTER(WHERE is_active IS TRUE),false),
    'can_post_updates',v_all OR coalesce(bool_or(can_post_updates) FILTER(WHERE is_active IS TRUE),false),
    'can_respond_reviews',v_all OR coalesce(bool_or(can_respond_reviews) FILTER(WHERE is_active IS TRUE),false),
    'can_manage_promotions',v_all OR coalesce(bool_or(can_manage_promotions) FILTER(WHERE is_active IS TRUE),false),
    'can_view_analytics',v_all OR coalesce(bool_or(can_view_analytics) FILTER(WHERE is_active IS TRUE),false),
    'can_invite_staff',v_all OR coalesce(bool_or(can_invite_staff) FILTER(WHERE is_active IS TRUE),false))
    INTO v_result FROM public.venue_managers WHERE venue_id=p_venue AND user_id=p_actor;
  RETURN v_result;
END $$;
CREATE FUNCTION public.pnm_contribution_record(p_id uuid,p_actor uuid,p_kind text,p_venue integer,
  p_payload jsonb,p_result jsonb,p_target text,p_before jsonb,p_after jsonb,p_source text,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$ BEGIN
  INSERT INTO public.pnm_contribution_operations(request_id,actor_id,kind,venue_id,payload,result)
    VALUES(p_id,p_actor,p_kind,p_venue,p_payload,p_result);
  INSERT INTO public.pnm_contribution_audit(request_id,actor_id,kind,venue_id,target_id,
    before_record,after_record,source_url,reason)
    VALUES(p_id,p_actor,p_kind,p_venue,p_target,p_before,p_after,p_source,coalesce(p_reason,''));
  RETURN p_result;
END $$;

CREATE FUNCTION public.pnm_contribution_operation(p_request_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
  SELECT result FROM public.pnm_contribution_operations
  WHERE request_id=p_request_id AND actor_id=(SELECT auth.uid());
$$;
CREATE FUNCTION public.pnm_venue_contribution_access(p_venue_id integer) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE v public.poker_venues%ROWTYPE; v_claim jsonb; v_legacy jsonb; v_corrections jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='42501'; END IF;
  SELECT * INTO v FROM public.poker_venues WHERE id=p_venue_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'venue not found' USING ERRCODE='P0002'; END IF;
  SELECT to_jsonb(c)-'verification_code'-'admin_notes'-'verified_by' INTO v_claim
    FROM public.venue_claims c WHERE venue_id=p_venue_id AND user_id=auth.uid()
    ORDER BY created_at DESC NULLS LAST,id DESC LIMIT 1;
  SELECT to_jsonb(c) INTO v_legacy FROM public.page_claims c WHERE page_type='venue'
    AND page_id=p_venue_id::text AND user_id=auth.uid() ORDER BY created_at DESC NULLS LAST,id DESC LIMIT 1;
  SELECT coalesce(jsonb_agg(x.item ORDER BY x.created_at DESC,x.id DESC),'[]'::jsonb) INTO v_corrections
    FROM (SELECT to_jsonb(c) item,c.created_at,c.id FROM public.pnm_venue_corrections c
      WHERE venue_id=p_venue_id AND user_id=auth.uid() ORDER BY created_at DESC,id DESC LIMIT 30) x;
  RETURN jsonb_build_object('venue_id',p_venue_id,'is_claimed',coalesce(v.is_claimed,false),
    'revision',v.location_integrity_revision,'claim',v_claim,'legacy_claim',v_legacy,
    'permissions',public.pnm_contribution_permissions(auth.uid(),p_venue_id),'corrections',v_corrections);
END $$;

CREATE FUNCTION public.pnm_submit_venue_claim(p_request_id uuid,p_venue_id integer,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE v_actor uuid:=auth.uid(); v_replay jsonb; v_claim public.venue_claims%ROWTYPE;
  v_venue public.poker_venues%ROWTYPE; v_role text:=p_payload->>'role'; v_result jsonb;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='42501'; END IF;
  v_replay:=public.pnm_contribution_replay(p_request_id,v_actor,'claim_submit',p_venue_id,p_payload);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  PERFORM public.pnm_contribution_evidence(p_payload->>'source_url',p_payload->>'notes');
  IF v_role IS NULL OR v_role NOT IN ('owner','manager','staff')
      OR char_length(trim(coalesce(p_payload->>'contact_name',''))) NOT BETWEEN 2 AND 120
      OR char_length(coalesce(p_payload->>'contact_email',''))>254
      OR coalesce(p_payload->>'contact_email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      OR char_length(coalesce(p_payload->>'contact_phone',''))>40 THEN
    RAISE EXCEPTION 'invalid claimant details' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_venue FROM public.poker_venues WHERE id=p_venue_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'venue not found' USING ERRCODE='P0002'; END IF;
  IF v_venue.canonical_venue_id IS NOT NULL OR v_venue.is_suppressed IS TRUE THEN
    RAISE EXCEPTION 'canonical public venue required' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_claim FROM public.venue_claims WHERE venue_id=p_venue_id AND user_id=v_actor
    AND status IN ('pending','under_review','approved') ORDER BY created_at DESC,id DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.venue_claims(venue_id,user_id,status,verification_method,claimant_name,
      claimant_title,claimant_email,claimant_phone,claimant_notes,submitted_source_url)
      VALUES(p_venue_id,v_actor,'under_review','evidence_review',trim(p_payload->>'contact_name'),
      v_role,lower(trim(p_payload->>'contact_email')),nullif(trim(p_payload->>'contact_phone'),''),
      nullif(trim(p_payload->>'notes'),''),p_payload->>'source_url') RETURNING * INTO v_claim;
  END IF;
  v_result:=jsonb_build_object('operation_id',p_request_id,'kind','claim_submit','venue_id',p_venue_id,
    'status',v_claim.status,'claim',to_jsonb(v_claim)-'verification_code'-'admin_notes'-'verified_by');
  RETURN public.pnm_contribution_record(p_request_id,v_actor,'claim_submit',p_venue_id,p_payload,
    v_result,v_claim.id::text,NULL,to_jsonb(v_claim),p_payload->>'source_url',p_payload->>'notes');
END $$;

CREATE FUNCTION public.pnm_review_venue_claim(p_request_id uuid,p_actor_id uuid,p_claim_id uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE v_before public.venue_claims%ROWTYPE; v_after public.venue_claims%ROWTYPE;
  v_venue public.poker_venues%ROWTYPE; v_replay jsonb; v_result jsonb; v_venue_id integer;
  v_action text:=p_payload->>'action'; v_role text; v_remaining uuid;
BEGIN
  PERFORM public.pnm_contribution_staff(p_actor_id);
  SELECT venue_id INTO v_venue_id FROM public.venue_claims WHERE id=p_claim_id;
  IF NOT FOUND THEN
    SELECT venue_id INTO v_venue_id FROM public.pnm_contribution_operations
      WHERE request_id=p_request_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'claim not found' USING ERRCODE='P0002'; END IF;
  END IF;
  v_replay:=public.pnm_contribution_replay(p_request_id,p_actor_id,'claim_review',v_venue_id,
    p_payload||jsonb_build_object('claim_id',p_claim_id));
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  PERFORM public.pnm_contribution_evidence(p_payload->>'source_url',p_payload->>'reason',true);
  SELECT * INTO v_venue FROM public.poker_venues WHERE id=v_venue_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'venue not found' USING ERRCODE='P0002'; END IF;
  SELECT * INTO v_before FROM public.venue_claims WHERE id=p_claim_id FOR UPDATE;
  IF p_payload->>'expected_updated_at' IS NULL
      OR v_before.updated_at IS DISTINCT FROM (p_payload->>'expected_updated_at')::timestamptz THEN
    RAISE EXCEPTION 'claim revision changed' USING ERRCODE='40001';
  END IF;
  IF p_actor_id=v_before.user_id THEN RAISE EXCEPTION 'independent reviewer required' USING ERRCODE='42501'; END IF;
  IF v_action NOT IN ('approve','reject','revoke') OR v_action IS NULL THEN
    RAISE EXCEPTION 'invalid review action' USING ERRCODE='22023';
  END IF;
  IF (v_action IN ('approve','reject') AND coalesce(v_before.status,'') NOT IN ('pending','under_review'))
      OR (v_action='revoke' AND coalesce(v_before.status,'')<>'approved') THEN
    RAISE EXCEPTION 'claim is not actionable' USING ERRCODE='40001';
  END IF;
  v_role:=CASE WHEN v_before.claimant_title IN ('owner','manager','staff') THEN v_before.claimant_title ELSE 'owner' END;
  IF v_action='approve' THEN
    IF v_role='owner' AND v_venue.claimed_by IS NOT NULL AND v_venue.claimed_by<>v_before.user_id THEN
      RAISE EXCEPTION 'venue already claimed by another owner' USING ERRCODE='40001';
    END IF;
    UPDATE public.venue_claims SET status='approved',verified_at=clock_timestamp(),verified_by=p_actor_id,
      admin_notes=p_payload->>'reason',updated_at=clock_timestamp() WHERE id=p_claim_id RETURNING * INTO v_after;
    IF v_role='owner' THEN
      UPDATE public.poker_venues SET is_claimed=true,claimed_by=v_before.user_id,
        claimed_at=coalesce(claimed_at,clock_timestamp()) WHERE id=v_venue_id;
    -- The preserved trigger catches errors; do not acknowledge success unless its
    -- actual Commander/social consumer post-image exists and has the new owner.
    IF NOT EXISTS(SELECT 1 FROM public.poker_venues WHERE id=v_venue_id AND commander_enabled IS TRUE)
      OR NOT EXISTS(SELECT 1 FROM public.social_pages WHERE linked_entity_type='venue'
          AND linked_entity_id=v_venue_id::text AND owner_id=v_before.user_id) THEN
        RAISE EXCEPTION 'venue ownership consumers were not provisioned' USING ERRCODE='P0001';
      END IF;
    END IF;
    INSERT INTO public.venue_managers(venue_id,user_id,role,can_edit_info,can_edit_hours,can_edit_games,
      can_post_updates,can_respond_reviews,can_manage_promotions,can_view_analytics,can_invite_staff,
      is_active,invited_by,approved_via)
      VALUES(v_venue_id,v_before.user_id,v_role,v_role<>'staff',v_role<>'staff',true,true,
        v_role<>'staff',v_role<>'staff',v_role<>'staff',v_role='owner',true,p_actor_id,p_claim_id);
  ELSIF v_action='reject' THEN
    UPDATE public.venue_claims SET status='rejected',rejection_reason=p_payload->>'reason',
      admin_notes=p_payload->>'reason',updated_at=clock_timestamp() WHERE id=p_claim_id RETURNING * INTO v_after;
  ELSE
    UPDATE public.venue_claims SET status='revoked',rejection_reason=p_payload->>'reason',
      admin_notes=p_payload->>'reason',updated_at=clock_timestamp() WHERE id=p_claim_id RETURNING * INTO v_after;
    UPDATE public.venue_managers SET is_active=false,updated_at=clock_timestamp()
      WHERE venue_id=v_venue_id AND approved_via=p_claim_id AND user_id=v_before.user_id;
    -- Historical independent/manual staff grants are intentionally preserved.
    SELECT user_id INTO v_remaining FROM public.venue_managers WHERE venue_id=v_venue_id
      AND role='owner' AND is_active IS TRUE ORDER BY created_at,id LIMIT 1;
    IF v_role='owner' AND v_venue.claimed_by=v_before.user_id THEN
      UPDATE public.poker_venues SET claimed_by=v_remaining,is_claimed=v_remaining IS NOT NULL,
        claimed_at=CASE WHEN v_remaining IS NOT NULL THEN claimed_at ELSE NULL END WHERE id=v_venue_id;
      UPDATE public.social_pages SET owner_id=v_remaining
        WHERE linked_entity_type='venue' AND linked_entity_id=v_venue_id::text AND owner_id=v_before.user_id;
    END IF;
  END IF;
  INSERT INTO public.venue_verification_log(claim_id,venue_id,action,details,performed_by)
    VALUES(p_claim_id,v_venue_id,'claim_'||v_action,jsonb_build_object('source_url',p_payload->>'source_url',
      'reason',p_payload->>'reason','operation_id',p_request_id),p_actor_id);
  v_result:=jsonb_build_object('operation_id',p_request_id,'kind','claim_review','venue_id',v_venue_id,
    'status',v_after.status,'claim',to_jsonb(v_after)-'verification_code');
  RETURN public.pnm_contribution_record(p_request_id,p_actor_id,'claim_review',v_venue_id,
    p_payload||jsonb_build_object('claim_id',p_claim_id),v_result,p_claim_id::text,
    to_jsonb(v_before),to_jsonb(v_after),p_payload->>'source_url',p_payload->>'reason');
END $$;

CREATE FUNCTION public.pnm_contribution_schedule(p_venue_id integer,p_actor uuid,p_payload jsonb,p_staff boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE v_before public.venue_game_schedules%ROWTYPE; v_after public.venue_game_schedules%ROWTYPE;
  v_action text:=p_payload->>'action'; v_permission jsonb;
BEGIN
  IF NOT p_staff THEN
    v_permission:=public.pnm_contribution_permissions(p_actor,p_venue_id);
    IF coalesce((v_permission->>'can_edit_games')::boolean,false) IS NOT TRUE THEN
      RAISE EXCEPTION 'venue schedule permission required' USING ERRCODE='42501';
    END IF;
  END IF;
  PERFORM public.pnm_contribution_evidence(p_payload->>'source_url',p_payload->>'notes');
  IF v_action IS NULL OR v_action NOT IN ('create','update','delete') THEN
    RAISE EXCEPTION 'invalid schedule action' USING ERRCODE='22023';
  END IF;
  IF v_action<>'create' THEN
    SELECT * INTO v_before FROM public.venue_game_schedules
      WHERE id=(p_payload->>'id')::bigint AND venue_id=p_venue_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'schedule not found' USING ERRCODE='P0002'; END IF;
    IF p_payload->>'expected_updated_at' IS NULL
        OR v_before.updated_at IS DISTINCT FROM (p_payload->>'expected_updated_at')::timestamptz
        OR v_before.is_active IS NOT TRUE THEN
      RAISE EXCEPTION 'schedule revision changed' USING ERRCODE='40001';
    END IF;
  END IF;
  IF v_action<>'delete' AND (p_payload->>'day_of_week' IS NULL
      OR p_payload->>'day_of_week' NOT IN ('monday','tuesday','wednesday','thursday','friday','saturday','sunday')
      OR char_length(trim(coalesce(p_payload->>'game_name',''))) NOT BETWEEN 2 AND 120
      OR (nullif(p_payload->>'start_time','') IS NOT NULL AND p_payload->>'start_time' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
      OR (nullif(p_payload->>'end_time','') IS NOT NULL AND p_payload->>'end_time' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
      OR char_length(coalesce(p_payload->>'notes',''))>2000) THEN
    RAISE EXCEPTION 'invalid schedule details' USING ERRCODE='22023';
  END IF;
  IF v_action='create' THEN
    INSERT INTO public.venue_game_schedules(venue_id,day_of_week,game_name,start_time,end_time,notes,
      updated_by,is_active,source_url,updated_at)
      VALUES(p_venue_id,p_payload->>'day_of_week',trim(p_payload->>'game_name'),
        nullif(p_payload->>'start_time',''),nullif(p_payload->>'end_time',''),
        nullif(trim(p_payload->>'notes'),''),p_actor,true,p_payload->>'source_url',clock_timestamp())
      RETURNING * INTO v_after;
  ELSIF v_action='delete' THEN
    UPDATE public.venue_game_schedules SET is_active=false,updated_by=p_actor,
      source_url=p_payload->>'source_url',updated_at=clock_timestamp() WHERE id=v_before.id RETURNING * INTO v_after;
  ELSE
    UPDATE public.venue_game_schedules SET day_of_week=p_payload->>'day_of_week',
      game_name=trim(p_payload->>'game_name'),start_time=nullif(p_payload->>'start_time',''),
      end_time=nullif(p_payload->>'end_time',''),notes=nullif(trim(p_payload->>'notes'),''),
      updated_by=p_actor,source_url=p_payload->>'source_url',updated_at=clock_timestamp()
      WHERE id=v_before.id RETURNING * INTO v_after;
  END IF;
  RETURN jsonb_build_object('before',CASE WHEN v_before.id IS NULL THEN NULL ELSE to_jsonb(v_before) END,
    'after',to_jsonb(v_after));
END $$;
CREATE FUNCTION public.pnm_mutate_venue_schedule(p_request_id uuid,p_venue_id integer,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE v_actor uuid:=auth.uid(); v_replay jsonb; v_change jsonb; v_result jsonb;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='42501'; END IF;
  v_replay:=public.pnm_contribution_replay(p_request_id,v_actor,'schedule_mutate',p_venue_id,p_payload);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  PERFORM 1 FROM public.poker_venues WHERE id=p_venue_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'venue not found' USING ERRCODE='P0002'; END IF;
  v_change:=public.pnm_contribution_schedule(p_venue_id,v_actor,p_payload);
  v_result:=jsonb_build_object('operation_id',p_request_id,'kind','schedule_mutate','venue_id',p_venue_id,
    'status','saved','schedule',v_change->'after');
  RETURN public.pnm_contribution_record(p_request_id,v_actor,'schedule_mutate',p_venue_id,p_payload,
    v_result,v_change->'after'->>'id',v_change->'before',v_change->'after',p_payload->>'source_url',p_payload->>'notes');
END $$;

-- Installed-column whitelist only. Casts happen in jsonb_populate_record, before
-- any UPDATE; one unknown, invalid or unauthorized field aborts the entire save.
CREATE FUNCTION public.pnm_contribution_venue_patch(p_venue integer,p_actor uuid,p_changes jsonb,
  p_revision timestamptz,p_staff boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,extensions AS $$
DECLARE v_before public.poker_venues%ROWTYPE; v_after public.poker_venues%ROWTYPE;
  v_key text; v_flag text; v_permissions jsonb; v_set text:='';
BEGIN
  IF p_changes IS NULL OR jsonb_typeof(p_changes)<>'object' OR p_changes='{}'::jsonb OR p_revision IS NULL THEN
    RAISE EXCEPTION 'changes and expected venue revision required' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_before FROM public.poker_venues WHERE id=p_venue FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'venue not found' USING ERRCODE='P0002'; END IF;
  v_permissions:=public.pnm_contribution_permissions(p_actor,p_venue);
  FOR v_key IN SELECT jsonb_object_keys(p_changes) LOOP
    v_flag:=CASE
      WHEN v_key IN ('name','phone','website','about','tagline','social_links','profile_photo_url',
        'cover_photo_url','logo_url','zip') THEN 'can_edit_info'
      WHEN v_key IN ('hours','hours_weekday','hours_weekend') THEN 'can_edit_hours'
      WHEN v_key IN ('games_offered','stakes_cash','has_tournaments') THEN 'can_edit_games'
      ELSE NULL END;
    IF v_flag IS NULL THEN RAISE EXCEPTION 'unsupported venue field: %',v_key USING ERRCODE='22023'; END IF;
    IF NOT p_staff AND coalesce((v_permissions->>v_flag)::boolean,false) IS NOT TRUE THEN
      RAISE EXCEPTION 'venue field permission required' USING ERRCODE='42501';
    END IF;
    IF jsonb_typeof(p_changes->v_key)='string' AND char_length(p_changes->>v_key)>4000 THEN
      RAISE EXCEPTION 'venue field too long' USING ERRCODE='22023';
    END IF;
    IF v_key='name' AND (jsonb_typeof(p_changes->v_key)<>'string'
        OR char_length(trim(coalesce(p_changes->>v_key,''))) NOT BETWEEN 2 AND 200) THEN
      RAISE EXCEPTION 'invalid venue name' USING ERRCODE='22023';
    END IF;
    IF v_key IN ('website','profile_photo_url','cover_photo_url','logo_url')
      AND p_changes->v_key<>'null'::jsonb AND nullif(p_changes->>v_key,'') IS NOT NULL THEN
      PERFORM public.pnm_contribution_evidence(p_changes->>v_key,NULL);
    END IF;
    v_set:=v_set||CASE WHEN v_set='' THEN '' ELSE ',' END||format('%I=(jsonb_populate_record(NULL::public.poker_venues,$1)).%I',v_key,v_key);
  END LOOP;
  IF v_before.location_integrity_revision IS DISTINCT FROM p_revision THEN
    RAISE EXCEPTION 'venue revision changed' USING ERRCODE='40001';
  END IF;
  EXECUTE 'UPDATE public.poker_venues SET '||v_set||',location_integrity_revision=clock_timestamp() WHERE id=$2 RETURNING *'
    INTO v_after USING p_changes,p_venue;
  RETURN jsonb_build_object('before',to_jsonb(v_before),'after',to_jsonb(v_after));
END $$;
CREATE FUNCTION public.pnm_mutate_venue_info(p_request_id uuid,p_venue_id integer,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE v_actor uuid:=auth.uid(); v_replay jsonb; v_change jsonb; v_result jsonb;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='42501'; END IF;
  v_replay:=public.pnm_contribution_replay(p_request_id,v_actor,'venue_mutate',p_venue_id,p_payload);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  PERFORM public.pnm_contribution_evidence(p_payload->>'source_url',p_payload->>'notes');
  v_change:=public.pnm_contribution_venue_patch(p_venue_id,v_actor,p_payload->'changes',(p_payload->>'expected_revision')::timestamptz);
  v_result:=jsonb_build_object('operation_id',p_request_id,'kind','venue_mutate','venue_id',p_venue_id,
    'status','saved','venue',v_change->'after');
  RETURN public.pnm_contribution_record(p_request_id,v_actor,'venue_mutate',p_venue_id,p_payload,
    v_result,p_venue_id::text,v_change->'before',v_change->'after',p_payload->>'source_url',p_payload->>'notes');
END $$;

CREATE FUNCTION public.pnm_submit_venue_correction(p_request_id uuid,p_venue_id integer,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE v_actor uuid:=auth.uid(); v_replay jsonb; v_correction public.pnm_venue_corrections%ROWTYPE; v_result jsonb;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='42501'; END IF;
  v_replay:=public.pnm_contribution_replay(p_request_id,v_actor,'correction_submit',p_venue_id,p_payload);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  PERFORM public.pnm_contribution_evidence(p_payload->>'source_url',p_payload->>'notes');
  IF p_payload->>'category' IS NULL OR p_payload->>'category' NOT IN ('details','location','closure','schedule')
      OR jsonb_typeof(p_payload->'proposal') IS DISTINCT FROM 'object'
      OR p_payload->'proposal'='{}'::jsonb OR p_payload->>'expected_revision' IS NULL THEN
    RAISE EXCEPTION 'invalid correction details' USING ERRCODE='22023';
  END IF;
  PERFORM 1 FROM public.poker_venues WHERE id=p_venue_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'venue not found' USING ERRCODE='P0002'; END IF;
  INSERT INTO public.pnm_venue_corrections(venue_id,user_id,category,proposal,source_url,notes,expected_revision)
    VALUES(p_venue_id,v_actor,p_payload->>'category',p_payload->'proposal',p_payload->>'source_url',
      nullif(trim(p_payload->>'notes'),''),(p_payload->>'expected_revision')::timestamptz) RETURNING * INTO v_correction;
  v_result:=jsonb_build_object('operation_id',p_request_id,'kind','correction_submit','venue_id',p_venue_id,
    'status','pending','correction',to_jsonb(v_correction));
  RETURN public.pnm_contribution_record(p_request_id,v_actor,'correction_submit',p_venue_id,p_payload,v_result,
    v_correction.id::text,NULL,to_jsonb(v_correction),p_payload->>'source_url',p_payload->>'notes');
END $$;
CREATE FUNCTION public.pnm_review_venue_correction(p_request_id uuid,p_actor_id uuid,p_correction_id uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE v_before public.pnm_venue_corrections%ROWTYPE; v_after public.pnm_venue_corrections%ROWTYPE;
  v_venue public.poker_venues%ROWTYPE; v_replay jsonb; v_change jsonb; v_result jsonb; v_venue_id integer;
  v_action text:=p_payload->>'action'; v_resolved jsonb;
BEGIN
  PERFORM public.pnm_contribution_staff(p_actor_id);
  SELECT venue_id INTO v_venue_id FROM public.pnm_venue_corrections WHERE id=p_correction_id;
  IF NOT FOUND THEN
    SELECT venue_id INTO v_venue_id FROM public.pnm_contribution_operations WHERE request_id=p_request_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'correction not found' USING ERRCODE='P0002'; END IF;
  END IF;
  v_replay:=public.pnm_contribution_replay(p_request_id,p_actor_id,'correction_review',v_venue_id,
    p_payload||jsonb_build_object('correction_id',p_correction_id));
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  PERFORM public.pnm_contribution_evidence(p_payload->>'source_url',p_payload->>'reason',true);
  SELECT * INTO v_venue FROM public.poker_venues WHERE id=v_venue_id FOR UPDATE;
  SELECT * INTO v_before FROM public.pnm_venue_corrections WHERE id=p_correction_id FOR UPDATE;
  IF v_before.updated_at IS DISTINCT FROM (p_payload->>'expected_updated_at')::timestamptz
      OR v_before.status<>'pending' THEN
    RAISE EXCEPTION 'correction revision changed' USING ERRCODE='40001';
  END IF;
  IF p_actor_id=v_before.user_id THEN RAISE EXCEPTION 'independent reviewer required' USING ERRCODE='42501'; END IF;
  IF v_action IS NULL OR v_action NOT IN ('apply','reject') THEN
    RAISE EXCEPTION 'invalid correction review action' USING ERRCODE='22023';
  END IF;
  IF v_action='apply' THEN
    IF v_venue.location_integrity_revision IS DISTINCT FROM v_before.expected_revision THEN
      RAISE EXCEPTION 'venue revision changed since correction' USING ERRCODE='40001';
    END IF;
    IF v_before.category='details' THEN
      v_change:=public.pnm_contribution_venue_patch(v_venue_id,p_actor_id,v_before.proposal,v_before.expected_revision,true);
    ELSIF v_before.category='location' THEN
      v_resolved:=p_payload->'resolved_location';
      IF jsonb_typeof(v_resolved) IS DISTINCT FROM 'object'
          OR v_resolved->>'integrity_status' IS NULL THEN
        RAISE EXCEPTION 'independent location assessment required' USING ERRCODE='22023';
      END IF;
      PERFORM public.resolve_venue_location_integrity(v_venue_id,v_before.expected_revision,
        v_resolved->>'address',v_resolved->>'city',v_resolved->>'state',
        (v_resolved->>'latitude')::double precision,(v_resolved->>'longitude')::double precision,
        p_payload->>'reason',p_actor_id,v_resolved->>'integrity_status',v_resolved->>'integrity_reason');
      SELECT jsonb_build_object('before',to_jsonb(v_venue),'after',to_jsonb(v)) INTO v_change
        FROM public.poker_venues v WHERE id=v_venue_id;
    ELSIF v_before.category='closure' THEN
      IF jsonb_typeof(v_before.proposal->'is_active') IS DISTINCT FROM 'boolean'
          OR (SELECT count(*) FROM jsonb_object_keys(v_before.proposal))<>1 THEN
        RAISE EXCEPTION 'closure proposal requires explicit is_active boolean' USING ERRCODE='22023';
      END IF;
      UPDATE public.poker_venues SET is_active=(v_before.proposal->>'is_active')::boolean,
        last_verified_at=clock_timestamp(),location_integrity_revision=clock_timestamp() WHERE id=v_venue_id;
      SELECT jsonb_build_object('before',to_jsonb(v_venue),'after',to_jsonb(v)) INTO v_change
        FROM public.poker_venues v WHERE id=v_venue_id;
    ELSE
      v_change:=public.pnm_contribution_schedule(v_venue_id,p_actor_id,
        v_before.proposal||jsonb_build_object('source_url',p_payload->>'source_url'),true);
    END IF;
  END IF;
  UPDATE public.pnm_venue_corrections SET status=CASE WHEN v_action='apply' THEN 'applied' ELSE 'rejected' END,
    reviewed_by=p_actor_id,review_reason=p_payload->>'reason',review_source_url=p_payload->>'source_url',
    reviewed_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=p_correction_id RETURNING * INTO v_after;
  v_result:=jsonb_build_object('operation_id',p_request_id,'kind','correction_review','venue_id',v_venue_id,
    'status',v_after.status,'correction',to_jsonb(v_after));
  RETURN public.pnm_contribution_record(p_request_id,p_actor_id,'correction_review',v_venue_id,
    p_payload||jsonb_build_object('correction_id',p_correction_id),v_result,p_correction_id::text,
    jsonb_build_object('correction',to_jsonb(v_before),'target',v_change->'before'),
    jsonb_build_object('correction',to_jsonb(v_after),'target',v_change->'after'),
    p_payload->>'source_url',p_payload->>'reason');
END $$;

DO $$ DECLARE f record; BEGIN
  FOR f IN SELECT p.oid::regprocedure identity FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('pnm_contribution_immutable','pnm_contribution_replay',
      'pnm_contribution_evidence','pnm_contribution_staff','pnm_contribution_permissions','pnm_contribution_record',
      'pnm_contribution_operation','pnm_contribution_schedule','pnm_contribution_venue_patch',
      'pnm_venue_contribution_access','pnm_submit_venue_claim','pnm_review_venue_claim',
      'pnm_submit_venue_correction','pnm_review_venue_correction','pnm_mutate_venue_schedule','pnm_mutate_venue_info') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.identity);
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.pnm_contribution_operation(uuid),public.pnm_venue_contribution_access(integer),
  public.pnm_submit_venue_claim(uuid,integer,jsonb),public.pnm_submit_venue_correction(uuid,integer,jsonb),
  public.pnm_mutate_venue_schedule(uuid,integer,jsonb),public.pnm_mutate_venue_info(uuid,integer,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pnm_review_venue_claim(uuid,uuid,uuid,jsonb),
  public.pnm_review_venue_correction(uuid,uuid,uuid,jsonb) TO service_role;
DO $$ DECLARE v_count integer; BEGIN
  IF has_function_privilege('authenticated','public.pnm_review_venue_claim(uuid,uuid,uuid,jsonb)','EXECUTE')
    OR has_function_privilege('anon','public.pnm_submit_venue_claim(uuid,integer,jsonb)','EXECUTE')
    OR has_function_privilege('authenticated','public.approve_venue_claim(uuid,uuid,text)','EXECUTE')
    OR has_table_privilege('authenticated','public.venue_game_schedules','UPDATE')
    OR has_table_privilege('service_role','public.pnm_contribution_audit','TRUNCATE')
    OR has_table_privilege('service_role','public.pnm_contribution_operations','TRUNCATE') THEN
    RAISE EXCEPTION 'contribution privilege post-image invalid';
  END IF;
  SELECT count(*) INTO v_count FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('pnm_contribution_replay','pnm_contribution_staff',
      'pnm_contribution_permissions','pnm_contribution_record','pnm_contribution_operation',
      'pnm_contribution_schedule','pnm_contribution_venue_patch','pnm_venue_contribution_access',
      'pnm_submit_venue_claim','pnm_review_venue_claim','pnm_submit_venue_correction',
      'pnm_review_venue_correction','pnm_mutate_venue_schedule','pnm_mutate_venue_info')
      AND p.prosecdef AND p.proconfig=ARRAY['search_path=public, extensions']
      AND pg_get_userbyid(p.proowner)=current_user;
  IF v_count<>14 THEN RAISE EXCEPTION 'contribution RPC owner/search-path post-image invalid'; END IF;
END $$;
NOTIFY pgrst, 'reload schema';

-- ROLLBACK: forward migration only, after stopping the newly delivered callers.
-- Never discard durable evidence or re-enable the MFA-bypassing legacy RPC.
-- Revoke execute on the six participant and two service review RPCs above;
-- retain operations/audits/corrections and nullable source columns permanently.
-- Existing service-side legacy writers remain available. Reverting application
-- callers alone does not undo an approved ownership or committed correction.
-- BEGIN;
-- REVOKE EXECUTE ON FUNCTION public.pnm_submit_venue_claim(uuid,integer,jsonb),
--   public.pnm_submit_venue_correction(uuid,integer,jsonb),public.pnm_mutate_venue_schedule(uuid,integer,jsonb),
--   public.pnm_mutate_venue_info(uuid,integer,jsonb),public.pnm_review_venue_claim(uuid,uuid,uuid,jsonb),
--   public.pnm_review_venue_correction(uuid,uuid,uuid,jsonb) FROM authenticated,service_role;
-- COMMIT;
