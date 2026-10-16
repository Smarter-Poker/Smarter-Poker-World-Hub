-- TIER: 3. AUTHOR: Codex. AFFECTS: new club notice board only.
-- WHY: Club Messenger needs an administrator-maintained, member-readable board.
-- Payout statuses describe posted notices; this never moves money or settles invoices.
-- Rollback: revoke API execution and remove publication membership, retaining tables
-- and audit history. Do not drop posted records to undo a client release.
BEGIN;
DO $$ BEGIN
 IF to_regclass('public.club_members') IS NULL OR to_regclass('public.clubs') IS NULL
 THEN RAISE EXCEPTION 'Club membership schema required'; END IF;
 IF to_regclass('public.club_notice_board') IS NOT NULL THEN
 RAISE EXCEPTION 'Notice board already exists; inspect installation instead of replaying'; END IF;
END $$;
CREATE TABLE public.club_notice_board (
 id uuid PRIMARY KEY,
 club_id uuid NOT NULL REFERENCES public.clubs(id),
 author_id uuid NOT NULL,
 content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 4000),
 status text NOT NULL CHECK (status IN ('notice','pending_payout','paid')),
 is_pinned boolean NOT NULL DEFAULT false,
 is_deleted boolean NOT NULL DEFAULT false,
 version bigint NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK (NOT is_pinned OR (status='pending_payout' AND NOT is_deleted))
);
CREATE INDEX club_notice_board_history ON public.club_notice_board(club_id,created_at DESC,id DESC) WHERE NOT is_deleted;
CREATE INDEX club_notice_board_pins ON public.club_notice_board(club_id,created_at DESC,id DESC) WHERE is_pinned AND status='pending_payout' AND NOT is_deleted;
CREATE TABLE public.club_notice_board_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 notice_id uuid NOT NULL REFERENCES public.club_notice_board(id),
 actor_id uuid NOT NULL,
 action text NOT NULL,
 before_row jsonb,
 after_row jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX club_notice_board_audit_notice ON public.club_notice_board_audit(notice_id);
ALTER TABLE public.club_notice_board ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_notice_board_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.club_notice_board,public.club_notice_board_audit FROM anon,authenticated;
GRANT SELECT ON public.club_notice_board TO authenticated;

CREATE FUNCTION public.fn_club_notice_access(p_club_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
 SELECT EXISTS(SELECT 1 FROM public.club_members WHERE club_id=p_club_id
 AND user_id=auth.uid() AND is_active AND membership_lifecycle_status='active'
 AND status IN ('active','approved'));
$$;
REVOKE ALL ON FUNCTION public.fn_club_notice_access(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_club_notice_access(uuid) TO authenticated;
CREATE POLICY club_notice_member_read ON public.club_notice_board FOR SELECT TO authenticated
 USING (public.fn_club_notice_access(club_id));

-- Only the JWT-verifying API may supply p_actor. Membership is checked again
-- within this transaction and locked against concurrent membership revocation.
CREATE FUNCTION public.fn_club_notice_board(p_actor uuid,p_club uuid,p_action text,p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE
 v_role text; v_old public.club_notice_board; v_new public.club_notice_board;
 v_id uuid; v_before timestamptz; v_before_id uuid; v_rows jsonb; v_pins jsonb;
 v_status text; v_content text; v_pin boolean;
BEGIN
 SELECT role INTO v_role FROM public.club_members WHERE club_id=p_club AND user_id=p_actor
 AND is_active AND membership_lifecycle_status='active' AND status IN ('active','approved') FOR SHARE;
 IF v_role IS NULL THEN RAISE EXCEPTION 'Active Club Membership Required' USING ERRCODE='42501'; END IF;
 IF p_action='read' THEN
  IF (p_payload->>'before') IS NULL <> ((p_payload->>'beforeId') IS NULL) THEN
   RAISE EXCEPTION 'Both Cursor Fields Required' USING ERRCODE='22023'; END IF;
  v_before := (p_payload->>'before')::timestamptz; v_before_id := (p_payload->>'beforeId')::uuid;
  SELECT coalesce(jsonb_agg(to_jsonb(n) ORDER BY n.created_at,n.id),'[]'::jsonb) INTO v_rows FROM (
   SELECT * FROM public.club_notice_board WHERE club_id=p_club AND NOT is_deleted
   AND (v_before IS NULL OR (created_at,id)<(v_before,v_before_id))
   ORDER BY created_at DESC,id DESC LIMIT 51
  ) n;
  SELECT coalesce(jsonb_agg(to_jsonb(n) ORDER BY n.created_at,n.id),'[]'::jsonb) INTO v_pins FROM (
   SELECT * FROM public.club_notice_board WHERE club_id=p_club AND NOT is_deleted
   AND is_pinned AND status='pending_payout' ORDER BY created_at,id
  ) n;
  RETURN jsonb_build_object('rows',v_rows,'pinned',v_pins,'canManage',v_role IN ('owner','admin'));
 END IF;
 IF v_role NOT IN ('owner','admin') THEN RAISE EXCEPTION 'Club Admin Or Owner Required' USING ERRCODE='42501'; END IF;
 IF p_action NOT IN ('create','update','delete') OR p_action IS NULL THEN
 RAISE EXCEPTION 'Invalid Board Action' USING ERRCODE='22023'; END IF;
 -- Serialize club writes, including the bounded pinned panel.
 PERFORM 1 FROM public.clubs WHERE id=p_club FOR UPDATE;
 v_id := (p_payload->>'id')::uuid;
 IF v_id IS NULL THEN RAISE EXCEPTION 'Entry ID Required' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_old FROM public.club_notice_board WHERE id=v_id FOR UPDATE;
 IF p_action='create' AND v_old.id IS NOT NULL THEN
  IF v_old.club_id=p_club AND v_old.author_id=p_actor AND v_old.version=1
   AND v_old.content=p_payload->>'content' AND v_old.status=p_payload->>'status'
   AND v_old.is_pinned=coalesce((p_payload->>'is_pinned')::boolean,false)
  THEN RETURN to_jsonb(v_old); END IF;
  RAISE EXCEPTION 'Entry Already Exists' USING ERRCODE='40001';
 END IF;
 IF p_action<>'create' THEN
  IF v_old.id IS NULL OR v_old.club_id<>p_club OR v_old.is_deleted THEN
   RAISE EXCEPTION 'Entry Unavailable' USING ERRCODE='P0002'; END IF;
  IF (p_payload->>'version')::bigint IS DISTINCT FROM v_old.version THEN
   RAISE EXCEPTION 'Entry Changed. Refresh And Try Again.' USING ERRCODE='40001'; END IF;
 END IF;
 IF p_action='delete' THEN
  UPDATE public.club_notice_board SET is_deleted=true,is_pinned=false,content='Removed',
   version=version+1,updated_at=clock_timestamp() WHERE id=v_id RETURNING * INTO v_new;
 ELSE
  v_content := btrim(coalesce(p_payload->>'content',v_old.content));
  v_status := coalesce(p_payload->>'status',v_old.status);
  v_pin := coalesce((p_payload->>'is_pinned')::boolean,v_old.is_pinned,false);
  IF v_content IS NULL OR char_length(v_content) NOT BETWEEN 1 AND 4000
   OR v_status IS NULL OR v_status NOT IN ('notice','pending_payout','paid') THEN
   RAISE EXCEPTION 'Invalid Board Entry' USING ERRCODE='22023'; END IF;
  IF v_status<>'pending_payout' THEN v_pin:=false; END IF;
  IF v_pin AND (SELECT count(*) FROM public.club_notice_board WHERE club_id=p_club
    AND is_pinned AND NOT is_deleted AND id<>v_id)>=20 THEN
   RAISE EXCEPTION 'Unpin A Request Before Pinning Another (Maximum 20)' USING ERRCODE='22023'; END IF;
  IF p_action='create' THEN
   INSERT INTO public.club_notice_board(id,club_id,author_id,content,status,is_pinned)
    VALUES(v_id,p_club,p_actor,v_content,v_status,v_pin) RETURNING * INTO v_new;
  ELSE
   UPDATE public.club_notice_board SET content=v_content,status=v_status,is_pinned=v_pin,
    version=version+1,updated_at=clock_timestamp() WHERE id=v_id RETURNING * INTO v_new;
  END IF;
 END IF;
 INSERT INTO public.club_notice_board_audit(notice_id,actor_id,action,before_row,after_row)
 VALUES(v_id,p_actor,p_action,CASE WHEN v_old.id IS NULL THEN NULL ELSE to_jsonb(v_old) END,to_jsonb(v_new));
 RETURN to_jsonb(v_new);
END $$;
REVOKE ALL ON FUNCTION public.fn_club_notice_board(uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_club_notice_board(uuid,uuid,text,jsonb) TO service_role;
-- Tombstone updates retain the club key for authorized realtime removal.
ALTER PUBLICATION supabase_realtime ADD TABLE public.club_notice_board;
DO $$ BEGIN
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.club_notice_board'::regclass)
 OR has_table_privilege('authenticated','public.club_notice_board','UPDATE')
 OR has_function_privilege('authenticated','public.fn_club_notice_board(uuid,uuid,text,jsonb)','EXECUTE')
 THEN RAISE EXCEPTION 'Notice Board Authorization Assertion Failed'; END IF;
END $$;
COMMIT;
-- ROLLBACK (new migration, retain source data):
-- BEGIN;
-- REVOKE EXECUTE ON FUNCTION public.fn_club_notice_board(uuid,uuid,text,jsonb) FROM service_role;
-- ALTER PUBLICATION supabase_realtime DROP TABLE public.club_notice_board;
-- COMMIT;
