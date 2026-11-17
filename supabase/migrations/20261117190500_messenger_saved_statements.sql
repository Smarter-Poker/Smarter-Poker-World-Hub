-- TIER 2: read saved weekly statements through their original recipient.
-- No calculation, settlement, wallet mutation or retrospective hierarchy change.
-- The statement payload is the closed-week snapshot, never a current-tree report.
BEGIN;
DO $$ BEGIN
 IF to_regclass('smarter_private.weekly_agent_statements') IS NULL
 OR to_regclass('public.messenger_hidden_messages') IS NULL THEN
  RAISE EXCEPTION 'Saved statement or deletion authority missing';
 END IF;
END $$;

-- A sender cannot retract another recipient's financial history. Delete-for-me
-- remains the existing recipient-owned tombstone and never mutates this source.
CREATE FUNCTION public.fn_saved_statement_message_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-ARRAY['read_at','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['read_at','updated_at'])
 THEN RAISE EXCEPTION 'Saved statements may only be deleted for yourself' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fn_saved_statement_message_immutable() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER saved_statement_message_immutable BEFORE UPDATE OR DELETE ON public.social_messages
FOR EACH ROW WHEN (OLD.media_metadata->>'kind'='weekly_agent_transaction_summary')
EXECUTE FUNCTION public.fn_saved_statement_message_immutable();

CREATE FUNCTION public.fn_messenger_saved_statements(
 p_user_id uuid, p_club_id uuid, p_before timestamptz DEFAULT NULL, p_limit integer DEFAULT 20
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=public,extensions AS $$
DECLARE result jsonb;
BEGIN
 IF p_user_id IS NULL OR p_club_id IS NULL
 OR (NOT public.fn_caller_is_engine() AND auth.uid() IS DISTINCT FROM p_user_id)
 THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF p_limit IS NULL OR p_limit<1 OR p_limit>50 OR (p_before IS NOT NULL AND NOT isfinite(p_before))
 THEN RAISE EXCEPTION 'Invalid statement page' USING ERRCODE='22023'; END IF;
 WITH documents AS (
  SELECT s.period_end, m.id message_id, m.conversation_id, 'agent'::text scope,
    c.name club_name, s.statement payload, m.created_at
  FROM smarter_private.weekly_agent_statements s
  JOIN public.social_messages m ON m.id=s.message_id
  JOIN public.clubs c ON c.id=s.club_id
  WHERE s.agent_user_id=p_user_id AND s.club_id=p_club_id
    AND (p_before IS NULL OR s.period_end<p_before)
    AND public.fn_messenger_message_visible_to(m.id,p_user_id)
    AND NOT EXISTS(SELECT FROM public.messenger_hidden_messages h WHERE h.user_id=p_user_id AND h.message_id=m.id)
  UNION ALL
  SELECT (i.breakdown->>'period_end')::timestamptz, m.id, m.conversation_id, 'club',
    c.name, (i.breakdown - ARRAY['source_ledger_ids','private_bank_ledger_ids','standalone_bank_ledger_ids','standalone_bank_mint_ids']) || jsonb_build_object('poker_net',wd.player_net,'poker_net_source',wd.player_net_source), m.created_at
  FROM public.settlement_invoices i
  JOIN public.accounting_invoice_deliveries d ON d.invoice_id=i.id AND d.recipient_id=p_user_id
  JOIN public.social_messages m ON m.id=d.message_id
  JOIN public.clubs c ON c.id=i.club_id
  LEFT JOIN smarter_private.weekly_club_rakeback_documents wd ON wd.club_id=i.club_id AND wd.period_end=(i.breakdown->>'period_end')::timestamptz
  WHERE i.club_id=p_club_id AND i.invoice_type='club_weekly_accounting' AND d.delivery_mode='immediate'
    AND (p_before IS NULL OR (i.breakdown->>'period_end')::timestamptz<p_before)
    AND public.fn_messenger_message_visible_to(m.id,p_user_id)
    AND NOT EXISTS(SELECT FROM public.messenger_hidden_messages h WHERE h.user_id=p_user_id AND h.message_id=m.id)
 ), weeks AS (
  SELECT DISTINCT period_end FROM documents ORDER BY period_end DESC LIMIT p_limit
 )
 SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.period_end DESC,d.scope,d.message_id),'[]'::jsonb)
 INTO result FROM documents d JOIN weeks w USING(period_end);
 RETURN jsonb_build_object('success',true,'documents',result);
END $$;
REVOKE ALL ON FUNCTION public.fn_messenger_saved_statements(uuid,uuid,timestamptz,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_messenger_saved_statements(uuid,uuid,timestamptz,integer) TO service_role;
DO $$ BEGIN
 IF to_regprocedure('public.fn_messenger_saved_statements(uuid,uuid,timestamptz,integer)') IS NULL THEN
 RAISE EXCEPTION 'Statement reader missing'; END IF;
END $$;
COMMIT;
-- ROLLBACK: DROP FUNCTION public.fn_messenger_saved_statements(uuid,uuid,timestamptz,integer);

-- ROLLBACK: DROP TRIGGER saved_statement_message_immutable ON public.social_messages;
-- DROP FUNCTION public.fn_saved_statement_message_immutable();
