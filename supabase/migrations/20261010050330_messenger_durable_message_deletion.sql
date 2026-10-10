-- TIER 3: durable, account-owned Delete For Me; no source messages or financial history removed.
-- Existing readers retain their exact authorization/projection. Only a tombstone exclusion is added before LIMIT.
-- Rollback restores captured prior definitions, then removes the new service-owned tombstone objects.
BEGIN;
DO $$
BEGIN
 IF to_regclass('public.messenger_hidden_messages') IS NOT NULL THEN RAISE EXCEPTION 'Tombstones already installed'; END IF;
 IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='fn_get_user_conversations')<>1 OR (SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='fn_get_user_conversations')<>'fa1308dbcf66271f05e6d917d1deda91' THEN RAISE EXCEPTION 'Changed source: fn_get_user_conversations'; END IF;
 IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='fn_messenger_continuity_visible')<>1 OR (SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='fn_messenger_continuity_visible')<>'db9e4b38dbeea459ea2efefddd498dac' THEN RAISE EXCEPTION 'Changed source: fn_messenger_continuity_visible'; END IF;
 IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='fn_messenger_message_page')<>1 OR (SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='fn_messenger_message_page')<>'8afbd780d369b747910c4575f4893fb9' THEN RAISE EXCEPTION 'Changed source: fn_messenger_message_page'; END IF;
 IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='fn_messenger_search_messages')<>1 OR (SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='fn_messenger_search_messages')<>'7ce56edaec474d492485f3695b5ffa44' THEN RAISE EXCEPTION 'Changed source: fn_messenger_search_messages'; END IF;
END $$;
CREATE TABLE public.messenger_hidden_messages (
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 message_id uuid NOT NULL REFERENCES public.social_messages(id) ON DELETE CASCADE,
 hidden_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,message_id)
);
CREATE INDEX messenger_hidden_messages_message_idx ON public.messenger_hidden_messages(message_id);
ALTER TABLE public.messenger_hidden_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.messenger_hidden_messages FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.messenger_hidden_messages TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.messenger_hidden_messages TO service_role;
CREATE POLICY messenger_hidden_messages_own_read ON public.messenger_hidden_messages FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));
CREATE FUNCTION public.fn_messenger_hide_message(p_message_id uuid,p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE v_conversation uuid;
BEGIN
 IF NOT public.fn_caller_is_engine() OR p_user_id IS NULL OR p_message_id IS NULL THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 SELECT conversation_id INTO v_conversation FROM public.social_messages WHERE id=p_message_id;
 IF v_conversation IS NULL OR NOT public.fn_messenger_continuity_allowed(p_user_id,v_conversation) THEN RETURN jsonb_build_object('success',false); END IF;
 IF EXISTS(SELECT 1 FROM public.messenger_hidden_messages WHERE user_id=p_user_id AND message_id=p_message_id) THEN RETURN jsonb_build_object('success',true,'message_id',p_message_id); END IF;
 INSERT INTO public.messenger_hidden_messages(user_id,message_id)
 SELECT p_user_id,m.id FROM public.fn_messenger_continuity_visible(p_user_id,v_conversation) m WHERE m.id=p_message_id
 ON CONFLICT(user_id,message_id) DO NOTHING;
 IF NOT EXISTS(SELECT 1 FROM public.messenger_hidden_messages WHERE user_id=p_user_id AND message_id=p_message_id) THEN RETURN jsonb_build_object('success',false); END IF;
 RETURN jsonb_build_object('success',true,'message_id',p_message_id);
END $$;
REVOKE ALL ON FUNCTION public.fn_messenger_hide_message(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_messenger_hide_message(uuid,uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.fn_get_user_conversations(p_user_id uuid, p_context_entity_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(conversation_id uuid, title text, is_group boolean, last_message_at timestamp with time zone, unread_count bigint, other_user_id uuid, other_user_username text, other_user_avatar text, context_entity_id uuid, context_entity_type text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    -- Defence in depth. A caller presenting an end-user JWT may only ask for
    -- their own conversations. A caller with no JWT at all is the API route
    -- holding the service-role key, which has already verified identity from
    -- the bearer token before it gets here.
    IF NOT public.fn_caller_is_engine() AND (auth.uid() IS NULL OR ( auth.uid() IS DISTINCT FROM p_user_id)) THEN
        RAISE EXCEPTION 'fn_get_user_conversations: not authorized to read another user''s inbox';
    END IF;

    RETURN QUERY
    SELECT
        c.id AS conversation_id,
        COALESCE(c.group_name, NULL) AS title,
        c.is_group,
        c.last_message_at,
        (
            SELECT COUNT(*)
              FROM social_messages m
             WHERE m.conversation_id = c.id
               AND m.sender_id != p_user_id
               AND COALESCE(m.is_deleted, false) = false
    AND NOT EXISTS(SELECT 1 FROM public.messenger_hidden_messages hidden WHERE hidden.user_id=p_user_id AND hidden.message_id=m.id)
               AND (p.last_read_at IS NULL OR m.created_at > p.last_read_at)
        ) AS unread_count,
        ou.id AS other_user_id,
        COALESCE(ou.display_name, ou.username) AS other_user_username,
        ou.avatar_url AS other_user_avatar,
        p.context_entity_id,
        p.context_entity_type
    FROM social_conversations c
    JOIN social_conversation_participants p
      ON p.conversation_id = c.id AND p.user_id = p_user_id
    LEFT JOIN social_conversation_participants op
      ON op.conversation_id = c.id AND op.user_id <> p_user_id
    LEFT JOIN profiles ou ON ou.id = op.user_id
    WHERE p.context_entity_id IS NOT DISTINCT FROM p_context_entity_id
    ORDER BY c.last_message_at DESC NULLS LAST;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_messenger_continuity_visible(p_user_id uuid, p_conversation_id uuid)
 RETURNS TABLE(id uuid, created_at timestamp with time zone, sender_id uuid)
 LANGUAGE sql
 STABLE
AS $function$
  -- SECURITY INVOKER, fully qualified and intentionally no SET clause: this
  -- table expression must inline so anchor/cursor predicates reach indexes
  -- before the private per-message visibility checks. Only service may call.
  SELECT m.id,m.created_at,m.sender_id FROM public.social_messages m
  LEFT JOIN public.accounting_invoice_deliveries d ON d.message_id=m.id
  WHERE m.conversation_id=p_conversation_id AND NOT COALESCE(m.is_deleted,false)
    AND NOT EXISTS(SELECT 1 FROM public.messenger_hidden_messages hidden WHERE hidden.user_id=p_user_id AND hidden.message_id=m.id)
    AND COALESCE(d.delivery_mode,'immediate')<>'weekly_detail'
    AND (public.fn_messenger_message_visible_to(m.id,p_user_id)
      OR public.fn_accounting_correction_legacy_identity(m.id,p_user_id) IS NOT NULL);
$function$;

CREATE OR REPLACE FUNCTION public.fn_messenger_message_page(p_user_id uuid, p_conversation_id uuid, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, conversation_id uuid, sender_id uuid, content text, message_type text, media_metadata jsonb, created_at timestamp with time zone, updated_at timestamp with time zone, is_deleted boolean, is_edited boolean, profiles jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
 IF p_limit IS NULL OR p_limit<1 OR p_limit>200 OR (p_before_id IS NOT NULL AND p_before IS NULL) THEN
   RAISE EXCEPTION 'invalid_message_page' USING ERRCODE='22023'; END IF;
 IF (NOT public.fn_caller_is_engine() AND (auth.uid() IS NULL OR auth.uid()<>p_user_id))
 OR NOT EXISTS(SELECT 1 FROM public.social_conversation_participants p WHERE p.user_id=p_user_id AND p.conversation_id=p_conversation_id) THEN
   RAISE EXCEPTION 'message_page_not_authorised' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT m.id,m.conversation_id,m.sender_id,CASE WHEN legacy.identity IS NOT NULL THEN 'Correction receipt unavailable.' WHEN i.invoice_type='credit_limit_change' THEN 'This records a credit-capacity change. No chips were transferred and no payment is due.' ELSE m.content END,
   CASE WHEN m.message_type='invoice' AND i.id IS NULL THEN 'text' ELSE m.message_type END,
   (CASE WHEN legacy.identity IS NOT NULL THEN legacy.identity
 WHEN i.invoice_type='credit_limit_change' THEN jsonb_build_object(
  'kind','accounting_invoice','accounting_verified',true,'invoice_id',i.id,'invoice_type',i.invoice_type,
  'club_id',i.club_id,'source_ledger_id',NULL,'amount',round(i.net_amount,2)::text,
  'status','generated','chips_transferred',false,'due_at',NULL,'transferred_at',NULL,
  'cashier_verified',false,'correction_verified',false,'credit_change_verified',true,
  'credit_change',public.fn_accounting_credit_change_contract_v1(i.id)) ELSE
 ((COALESCE(m.media_metadata,'{}') #- '{lines,private_bank_ledger_ids}'::text[] #- '{lines,source_ledger_ids}'::text[])-ARRAY['cashier','cashier_verified','correction','correction_verified','correction_unverified','invoice_identity_verified','credit_change','credit_change_verified'])
 ||CASE WHEN i.id IS NULL THEN jsonb_build_object('accounting_verified',false,'cashier_verified',false,'correction_verified',false,'credit_change_verified',false)
 ELSE jsonb_build_object('accounting_verified',true,'invoice_id',i.id,'issued_status',m.media_metadata->'status',
  'status',i.status,'chips_transferred',i.chips_transferred,'invoice_type',i.invoice_type,'source_ledger_id',i.source_ledger_id,'club_id',i.club_id,
  'cashier_verified',i.invoice_type='cashier_cashout','correction_verified',i.invoice_type='accounting_correction')
 ||CASE WHEN i.invoice_type='cashier_cashout' THEN jsonb_build_object('amount',round(i.net_amount,2)::text,'cashier',public.fn_cashier_invoice_contract(i.id))
 WHEN i.invoice_type='accounting_correction' THEN jsonb_build_object('amount',round(i.net_amount,2)::text,'due_at',i.due_at,'transferred_at',i.transferred_at,
  'union_id',(SELECT c.union_id FROM public.accounting_correction_documents c WHERE c.invoice_id=i.id),
  'correction',public.fn_accounting_correction_contract(i.id)) ELSE '{}'::jsonb END END END)
 ||CASE WHEN i.id IS NOT NULL THEN jsonb_build_object('conversation_id',m.conversation_id,'conversationId',m.conversation_id) ELSE '{}'::jsonb END,
   m.created_at,m.updated_at,m.is_deleted,m.is_edited,
   jsonb_build_object('id',pr.id,'username',pr.username,'avatar_url',pr.avatar_url,'is_vip',pr.is_vip)
 FROM public.social_messages m
 LEFT JOIN public.accounting_invoice_deliveries d ON d.message_id=m.id
 LEFT JOIN public.settlement_invoices i ON i.id=d.invoice_id
 LEFT JOIN LATERAL(SELECT public.fn_accounting_correction_legacy_identity(m.id,p_user_id) AS identity) legacy ON true
 LEFT JOIN public.profiles pr ON pr.id=m.sender_id
 WHERE m.conversation_id=p_conversation_id AND COALESCE(m.is_deleted,false)=false
    AND NOT EXISTS(SELECT 1 FROM public.messenger_hidden_messages hidden WHERE hidden.user_id=p_user_id AND hidden.message_id=m.id)
   AND COALESCE(d.delivery_mode,'immediate')<>'weekly_detail'
     AND (public.fn_messenger_message_visible_to(m.id,p_user_id) OR legacy.identity IS NOT NULL)
   AND (p_before IS NULL OR m.created_at<p_before OR (p_before_id IS NOT NULL AND m.created_at=p_before AND m.id<p_before_id))
 ORDER BY m.created_at DESC,m.id DESC LIMIT p_limit;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_messenger_search_messages(p_user_id uuid, p_conversation_ids uuid[], p_query text, p_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, conversation_id uuid, sender_id uuid, content text, created_at timestamp with time zone, message_type text, media_metadata jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
 IF p_limit IS NULL OR p_limit<1 OR p_limit>100 OR p_conversation_ids IS NULL OR
    cardinality(p_conversation_ids)>500 OR cardinality(p_conversation_ids)<1 OR
    p_query IS NULL OR length(btrim(p_query))<2 OR length(p_query)>500 THEN
   RAISE EXCEPTION 'invalid_message_search' USING ERRCODE='22023'; END IF;
 IF (NOT public.fn_caller_is_engine() AND (auth.uid() IS NULL OR auth.uid()<>p_user_id)) OR
    EXISTS(SELECT 1 FROM unnest(p_conversation_ids) AS requested(conversation_id)
      WHERE NOT EXISTS(SELECT 1 FROM public.social_conversation_participants p
        WHERE p.user_id=p_user_id AND p.conversation_id=requested.conversation_id)) THEN
   RAISE EXCEPTION 'message_search_not_authorised' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT m.id,m.conversation_id,m.sender_id,CASE WHEN legacy.identity IS NOT NULL THEN 'Correction receipt unavailable.' WHEN i.invoice_type='credit_limit_change' THEN 'This records a credit-capacity change. No chips were transferred and no payment is due.' ELSE m.content END,m.created_at,
   CASE WHEN m.message_type='invoice' AND i.id IS NULL THEN 'text' ELSE m.message_type END,
   (CASE WHEN legacy.identity IS NOT NULL THEN legacy.identity
 WHEN i.invoice_type='credit_limit_change' THEN jsonb_build_object(
  'kind','accounting_invoice','accounting_verified',true,'invoice_id',i.id,'invoice_type',i.invoice_type,
  'club_id',i.club_id,'source_ledger_id',NULL,'amount',round(i.net_amount,2)::text,
  'status','generated','chips_transferred',false,'due_at',NULL,'transferred_at',NULL,
  'cashier_verified',false,'correction_verified',false,'credit_change_verified',true,
  'credit_change',public.fn_accounting_credit_change_contract_v1(i.id)) ELSE
 ((COALESCE(m.media_metadata,'{}') #- '{lines,private_bank_ledger_ids}'::text[] #- '{lines,source_ledger_ids}'::text[])-ARRAY['cashier','cashier_verified','correction','correction_verified','correction_unverified','invoice_identity_verified','credit_change','credit_change_verified'])
 ||CASE WHEN i.id IS NULL THEN jsonb_build_object('accounting_verified',false,'cashier_verified',false,'correction_verified',false,'credit_change_verified',false)
 ELSE jsonb_build_object('accounting_verified',true,'invoice_id',i.id,'issued_status',m.media_metadata->'status',
  'status',i.status,'chips_transferred',i.chips_transferred,'invoice_type',i.invoice_type,'source_ledger_id',i.source_ledger_id,'club_id',i.club_id,
  'cashier_verified',i.invoice_type='cashier_cashout','correction_verified',i.invoice_type='accounting_correction')
 ||CASE WHEN i.invoice_type='cashier_cashout' THEN jsonb_build_object('amount',round(i.net_amount,2)::text,'cashier',public.fn_cashier_invoice_contract(i.id))
 WHEN i.invoice_type='accounting_correction' THEN jsonb_build_object('amount',round(i.net_amount,2)::text,'due_at',i.due_at,'transferred_at',i.transferred_at,
  'union_id',(SELECT c.union_id FROM public.accounting_correction_documents c WHERE c.invoice_id=i.id),
  'correction',public.fn_accounting_correction_contract(i.id)) ELSE '{}'::jsonb END END END)
 ||CASE WHEN i.id IS NOT NULL THEN jsonb_build_object('conversation_id',m.conversation_id,'conversationId',m.conversation_id) ELSE '{}'::jsonb END
 FROM public.social_messages m
 LEFT JOIN public.accounting_invoice_deliveries d ON d.message_id=m.id
 LEFT JOIN public.settlement_invoices i ON i.id=d.invoice_id
 LEFT JOIN LATERAL(SELECT public.fn_accounting_correction_legacy_identity(m.id,p_user_id) AS identity) legacy ON true
 WHERE m.conversation_id=ANY(p_conversation_ids) AND COALESCE(m.is_deleted,false)=false
    AND NOT EXISTS(SELECT 1 FROM public.messenger_hidden_messages hidden WHERE hidden.user_id=p_user_id AND hidden.message_id=m.id)
   AND COALESCE(d.delivery_mode,'immediate')<>'weekly_detail'
     AND (public.fn_messenger_message_visible_to(m.id,p_user_id) OR legacy.identity IS NOT NULL)
   AND strpos(lower(CASE WHEN legacy.identity IS NOT NULL THEN 'Correction receipt unavailable.' WHEN i.invoice_type='credit_limit_change' THEN 'This records a credit-capacity change. No chips were transferred and no payment is due.' ELSE m.content END),lower(btrim(p_query)))>0
 ORDER BY m.created_at DESC,m.id DESC LIMIT p_limit;
END $function$;

DO $$
BEGIN
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.messenger_hidden_messages'::regclass) OR has_table_privilege('anon','public.messenger_hidden_messages','SELECT') OR has_table_privilege('authenticated','public.messenger_hidden_messages','INSERT') OR has_function_privilege('authenticated','public.fn_messenger_hide_message(uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Tombstone grants unsafe'; END IF;
END $$;
COMMIT;
-- ROLLBACK (apply as a new migration; retain installed history):
-- BEGIN;
-- CREATE OR REPLACE FUNCTION public.fn_get_user_conversations(p_user_id uuid, p_context_entity_id uuid DEFAULT NULL::uuid)
--  RETURNS TABLE(conversation_id uuid, title text, is_group boolean, last_message_at timestamp with time zone, unread_count bigint, other_user_id uuid, other_user_username text, other_user_avatar text, context_entity_id uuid, context_entity_type text)
--  LANGUAGE plpgsql
--  STABLE SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
-- BEGIN
--     -- Defence in depth. A caller presenting an end-user JWT may only ask for
--     -- their own conversations. A caller with no JWT at all is the API route
--     -- holding the service-role key, which has already verified identity from
--     -- the bearer token before it gets here.
--     IF NOT public.fn_caller_is_engine() AND (auth.uid() IS NULL OR ( auth.uid() IS DISTINCT FROM p_user_id)) THEN
--         RAISE EXCEPTION 'fn_get_user_conversations: not authorized to read another user''s inbox';
--     END IF;
-- 
--     RETURN QUERY
--     SELECT
--         c.id AS conversation_id,
--         COALESCE(c.group_name, NULL) AS title,
--         c.is_group,
--         c.last_message_at,
--         (
--             SELECT COUNT(*)
--               FROM social_messages m
--              WHERE m.conversation_id = c.id
--                AND m.sender_id != p_user_id
--                AND COALESCE(m.is_deleted, false) = false
--                AND (p.last_read_at IS NULL OR m.created_at > p.last_read_at)
--         ) AS unread_count,
--         ou.id AS other_user_id,
--         COALESCE(ou.display_name, ou.username) AS other_user_username,
--         ou.avatar_url AS other_user_avatar,
--         p.context_entity_id,
--         p.context_entity_type
--     FROM social_conversations c
--     JOIN social_conversation_participants p
--       ON p.conversation_id = c.id AND p.user_id = p_user_id
--     LEFT JOIN social_conversation_participants op
--       ON op.conversation_id = c.id AND op.user_id <> p_user_id
--     LEFT JOIN profiles ou ON ou.id = op.user_id
--     WHERE p.context_entity_id IS NOT DISTINCT FROM p_context_entity_id
--     ORDER BY c.last_message_at DESC NULLS LAST;
-- END;
-- $function$;
-- 
-- CREATE OR REPLACE FUNCTION public.fn_messenger_continuity_visible(p_user_id uuid, p_conversation_id uuid)
--  RETURNS TABLE(id uuid, created_at timestamp with time zone, sender_id uuid)
--  LANGUAGE sql
--  STABLE
-- AS $function$
--   -- SECURITY INVOKER, fully qualified and intentionally no SET clause: this
--   -- table expression must inline so anchor/cursor predicates reach indexes
--   -- before the private per-message visibility checks. Only service may call.
--   SELECT m.id,m.created_at,m.sender_id FROM public.social_messages m
--   LEFT JOIN public.accounting_invoice_deliveries d ON d.message_id=m.id
--   WHERE m.conversation_id=p_conversation_id AND NOT COALESCE(m.is_deleted,false)
--     AND COALESCE(d.delivery_mode,'immediate')<>'weekly_detail'
--     AND (public.fn_messenger_message_visible_to(m.id,p_user_id)
--       OR public.fn_accounting_correction_legacy_identity(m.id,p_user_id) IS NOT NULL);
-- $function$;
-- 
-- CREATE OR REPLACE FUNCTION public.fn_messenger_message_page(p_user_id uuid, p_conversation_id uuid, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 50)
--  RETURNS TABLE(id uuid, conversation_id uuid, sender_id uuid, content text, message_type text, media_metadata jsonb, created_at timestamp with time zone, updated_at timestamp with time zone, is_deleted boolean, is_edited boolean, profiles jsonb)
--  LANGUAGE plpgsql
--  STABLE SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
-- BEGIN
--  IF p_limit IS NULL OR p_limit<1 OR p_limit>200 OR (p_before_id IS NOT NULL AND p_before IS NULL) THEN
--    RAISE EXCEPTION 'invalid_message_page' USING ERRCODE='22023'; END IF;
--  IF (NOT public.fn_caller_is_engine() AND (auth.uid() IS NULL OR auth.uid()<>p_user_id))
--  OR NOT EXISTS(SELECT 1 FROM public.social_conversation_participants p WHERE p.user_id=p_user_id AND p.conversation_id=p_conversation_id) THEN
--    RAISE EXCEPTION 'message_page_not_authorised' USING ERRCODE='42501'; END IF;
--  RETURN QUERY SELECT m.id,m.conversation_id,m.sender_id,CASE WHEN legacy.identity IS NOT NULL THEN 'Correction receipt unavailable.' WHEN i.invoice_type='credit_limit_change' THEN 'This records a credit-capacity change. No chips were transferred and no payment is due.' ELSE m.content END,
--    CASE WHEN m.message_type='invoice' AND i.id IS NULL THEN 'text' ELSE m.message_type END,
--    (CASE WHEN legacy.identity IS NOT NULL THEN legacy.identity
--  WHEN i.invoice_type='credit_limit_change' THEN jsonb_build_object(
--   'kind','accounting_invoice','accounting_verified',true,'invoice_id',i.id,'invoice_type',i.invoice_type,
--   'club_id',i.club_id,'source_ledger_id',NULL,'amount',round(i.net_amount,2)::text,
--   'status','generated','chips_transferred',false,'due_at',NULL,'transferred_at',NULL,
--   'cashier_verified',false,'correction_verified',false,'credit_change_verified',true,
--   'credit_change',public.fn_accounting_credit_change_contract_v1(i.id)) ELSE
--  ((COALESCE(m.media_metadata,'{}') #- '{lines,private_bank_ledger_ids}'::text[] #- '{lines,source_ledger_ids}'::text[])-ARRAY['cashier','cashier_verified','correction','correction_verified','correction_unverified','invoice_identity_verified','credit_change','credit_change_verified'])
--  ||CASE WHEN i.id IS NULL THEN jsonb_build_object('accounting_verified',false,'cashier_verified',false,'correction_verified',false,'credit_change_verified',false)
--  ELSE jsonb_build_object('accounting_verified',true,'invoice_id',i.id,'issued_status',m.media_metadata->'status',
--   'status',i.status,'chips_transferred',i.chips_transferred,'invoice_type',i.invoice_type,'source_ledger_id',i.source_ledger_id,'club_id',i.club_id,
--   'cashier_verified',i.invoice_type='cashier_cashout','correction_verified',i.invoice_type='accounting_correction')
--  ||CASE WHEN i.invoice_type='cashier_cashout' THEN jsonb_build_object('amount',round(i.net_amount,2)::text,'cashier',public.fn_cashier_invoice_contract(i.id))
--  WHEN i.invoice_type='accounting_correction' THEN jsonb_build_object('amount',round(i.net_amount,2)::text,'due_at',i.due_at,'transferred_at',i.transferred_at,
--   'union_id',(SELECT c.union_id FROM public.accounting_correction_documents c WHERE c.invoice_id=i.id),
--   'correction',public.fn_accounting_correction_contract(i.id)) ELSE '{}'::jsonb END END END)
--  ||CASE WHEN i.id IS NOT NULL THEN jsonb_build_object('conversation_id',m.conversation_id,'conversationId',m.conversation_id) ELSE '{}'::jsonb END,
--    m.created_at,m.updated_at,m.is_deleted,m.is_edited,
--    jsonb_build_object('id',pr.id,'username',pr.username,'avatar_url',pr.avatar_url,'is_vip',pr.is_vip)
--  FROM public.social_messages m
--  LEFT JOIN public.accounting_invoice_deliveries d ON d.message_id=m.id
--  LEFT JOIN public.settlement_invoices i ON i.id=d.invoice_id
--  LEFT JOIN LATERAL(SELECT public.fn_accounting_correction_legacy_identity(m.id,p_user_id) AS identity) legacy ON true
--  LEFT JOIN public.profiles pr ON pr.id=m.sender_id
--  WHERE m.conversation_id=p_conversation_id AND COALESCE(m.is_deleted,false)=false
--    AND COALESCE(d.delivery_mode,'immediate')<>'weekly_detail'
--      AND (public.fn_messenger_message_visible_to(m.id,p_user_id) OR legacy.identity IS NOT NULL)
--    AND (p_before IS NULL OR m.created_at<p_before OR (p_before_id IS NOT NULL AND m.created_at=p_before AND m.id<p_before_id))
--  ORDER BY m.created_at DESC,m.id DESC LIMIT p_limit;
-- END $function$;
-- 
-- CREATE OR REPLACE FUNCTION public.fn_messenger_search_messages(p_user_id uuid, p_conversation_ids uuid[], p_query text, p_limit integer DEFAULT 50)
--  RETURNS TABLE(id uuid, conversation_id uuid, sender_id uuid, content text, created_at timestamp with time zone, message_type text, media_metadata jsonb)
--  LANGUAGE plpgsql
--  STABLE SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
-- BEGIN
--  IF p_limit IS NULL OR p_limit<1 OR p_limit>100 OR p_conversation_ids IS NULL OR
--     cardinality(p_conversation_ids)>500 OR cardinality(p_conversation_ids)<1 OR
--     p_query IS NULL OR length(btrim(p_query))<2 OR length(p_query)>500 THEN
--    RAISE EXCEPTION 'invalid_message_search' USING ERRCODE='22023'; END IF;
--  IF (NOT public.fn_caller_is_engine() AND (auth.uid() IS NULL OR auth.uid()<>p_user_id)) OR
--     EXISTS(SELECT 1 FROM unnest(p_conversation_ids) AS requested(conversation_id)
--       WHERE NOT EXISTS(SELECT 1 FROM public.social_conversation_participants p
--         WHERE p.user_id=p_user_id AND p.conversation_id=requested.conversation_id)) THEN
--    RAISE EXCEPTION 'message_search_not_authorised' USING ERRCODE='42501'; END IF;
--  RETURN QUERY SELECT m.id,m.conversation_id,m.sender_id,CASE WHEN legacy.identity IS NOT NULL THEN 'Correction receipt unavailable.' WHEN i.invoice_type='credit_limit_change' THEN 'This records a credit-capacity change. No chips were transferred and no payment is due.' ELSE m.content END,m.created_at,
--    CASE WHEN m.message_type='invoice' AND i.id IS NULL THEN 'text' ELSE m.message_type END,
--    (CASE WHEN legacy.identity IS NOT NULL THEN legacy.identity
--  WHEN i.invoice_type='credit_limit_change' THEN jsonb_build_object(
--   'kind','accounting_invoice','accounting_verified',true,'invoice_id',i.id,'invoice_type',i.invoice_type,
--   'club_id',i.club_id,'source_ledger_id',NULL,'amount',round(i.net_amount,2)::text,
--   'status','generated','chips_transferred',false,'due_at',NULL,'transferred_at',NULL,
--   'cashier_verified',false,'correction_verified',false,'credit_change_verified',true,
--   'credit_change',public.fn_accounting_credit_change_contract_v1(i.id)) ELSE
--  ((COALESCE(m.media_metadata,'{}') #- '{lines,private_bank_ledger_ids}'::text[] #- '{lines,source_ledger_ids}'::text[])-ARRAY['cashier','cashier_verified','correction','correction_verified','correction_unverified','invoice_identity_verified','credit_change','credit_change_verified'])
--  ||CASE WHEN i.id IS NULL THEN jsonb_build_object('accounting_verified',false,'cashier_verified',false,'correction_verified',false,'credit_change_verified',false)
--  ELSE jsonb_build_object('accounting_verified',true,'invoice_id',i.id,'issued_status',m.media_metadata->'status',
--   'status',i.status,'chips_transferred',i.chips_transferred,'invoice_type',i.invoice_type,'source_ledger_id',i.source_ledger_id,'club_id',i.club_id,
--   'cashier_verified',i.invoice_type='cashier_cashout','correction_verified',i.invoice_type='accounting_correction')
--  ||CASE WHEN i.invoice_type='cashier_cashout' THEN jsonb_build_object('amount',round(i.net_amount,2)::text,'cashier',public.fn_cashier_invoice_contract(i.id))
--  WHEN i.invoice_type='accounting_correction' THEN jsonb_build_object('amount',round(i.net_amount,2)::text,'due_at',i.due_at,'transferred_at',i.transferred_at,
--   'union_id',(SELECT c.union_id FROM public.accounting_correction_documents c WHERE c.invoice_id=i.id),
--   'correction',public.fn_accounting_correction_contract(i.id)) ELSE '{}'::jsonb END END END)
--  ||CASE WHEN i.id IS NOT NULL THEN jsonb_build_object('conversation_id',m.conversation_id,'conversationId',m.conversation_id) ELSE '{}'::jsonb END
--  FROM public.social_messages m
--  LEFT JOIN public.accounting_invoice_deliveries d ON d.message_id=m.id
--  LEFT JOIN public.settlement_invoices i ON i.id=d.invoice_id
--  LEFT JOIN LATERAL(SELECT public.fn_accounting_correction_legacy_identity(m.id,p_user_id) AS identity) legacy ON true
--  WHERE m.conversation_id=ANY(p_conversation_ids) AND COALESCE(m.is_deleted,false)=false
--    AND COALESCE(d.delivery_mode,'immediate')<>'weekly_detail'
--      AND (public.fn_messenger_message_visible_to(m.id,p_user_id) OR legacy.identity IS NOT NULL)
--    AND strpos(lower(CASE WHEN legacy.identity IS NOT NULL THEN 'Correction receipt unavailable.' WHEN i.invoice_type='credit_limit_change' THEN 'This records a credit-capacity change. No chips were transferred and no payment is due.' ELSE m.content END),lower(btrim(p_query)))>0
--  ORDER BY m.created_at DESC,m.id DESC LIMIT p_limit;
-- END $function$;
-- 
-- DROP FUNCTION public.fn_messenger_hide_message(uuid,uuid);
-- DROP TABLE public.messenger_hidden_messages;
-- COMMIT;

