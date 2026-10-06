-- Authoritative Messenger invoice-attention reader.
--
-- An unread message is not the same thing as an unpaid/open accounting
-- document. The client must never infer payment work from message text or
-- metadata, so this reader joins the immutable delivery receipt to the live
-- settlement invoice and returns an attention flag only from that server
-- status. It is service-role-only because the Pages API first authenticates
-- the actor, then supplies that verified user id.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $preflight$
BEGIN
  IF to_regclass('public.accounting_conversations') IS NULL
     OR to_regclass('public.accounting_invoice_deliveries') IS NULL
     OR to_regclass('public.settlement_invoices') IS NULL
     OR to_regclass('public.social_messages') IS NULL
     OR to_regclass('public.club_members') IS NULL THEN
    RAISE EXCEPTION 'Messenger invoice attention requires the private accounting delivery schema';
  END IF;
END
$preflight$;

CREATE OR REPLACE FUNCTION public.fn_messenger_private_invoice_attention(
  p_user_id uuid,
  p_conversation_ids uuid[]
)
RETURNS TABLE(conversation_id uuid, requires_action boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF p_user_id IS NULL
     OR p_conversation_ids IS NULL
     OR cardinality(p_conversation_ids) = 0
     OR cardinality(p_conversation_ids) > 100 THEN
    RAISE EXCEPTION 'Invalid Messenger invoice attention request' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT ac.conversation_id,
         COALESCE(bool_or(
           COALESCE(d.delivery_mode, 'immediate') <> 'weekly_detail'
           AND i.status IN ('pending', 'generated', 'overdue')
         ), false) AS requires_action
    FROM public.accounting_conversations ac
    LEFT JOIN public.social_messages m
      ON m.conversation_id = ac.conversation_id
    LEFT JOIN public.accounting_invoice_deliveries d
      ON d.message_id = m.id
     AND d.recipient_id = p_user_id
    LEFT JOIN public.settlement_invoices i
      ON i.id = d.invoice_id
   WHERE ac.conversation_id = ANY(p_conversation_ids)
     AND ac.recipient_id = p_user_id
     AND EXISTS (
       SELECT 1
         FROM public.club_members cm
        WHERE cm.club_id = ac.scope_id
          AND cm.user_id = p_user_id
          AND cm.is_active
          AND cm.membership_lifecycle_status = 'active'
          AND cm.status IN ('active', 'approved')
     )
   GROUP BY ac.conversation_id;
END
$function$;

ALTER FUNCTION public.fn_messenger_private_invoice_attention(uuid, uuid[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fn_messenger_private_invoice_attention(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_messenger_private_invoice_attention(uuid, uuid[]) TO service_role;

DO $postflight$
BEGIN
  IF NOT has_function_privilege('service_role', 'public.fn_messenger_private_invoice_attention(uuid,uuid[])', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_messenger_private_invoice_attention(uuid,uuid[])', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_messenger_private_invoice_attention(uuid,uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'Messenger invoice attention reader grants are incorrect';
  END IF;
  IF (SELECT prosecdef FROM pg_proc
      WHERE oid = 'public.fn_messenger_private_invoice_attention(uuid,uuid[])'::regprocedure) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Messenger invoice attention reader must be SECURITY DEFINER';
  END IF;
END
$postflight$;

COMMIT;
