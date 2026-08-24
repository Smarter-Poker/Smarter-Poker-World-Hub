-- MESSENGER IS BROKEN IN PRODUCTION. 286 "permission denied for function
-- fn_get_user_conversations" errors in a single 3-hour window (2026-08-24),
-- every one of them the browser (role `authenticated`, via PostgREST) trying
-- to open its inbox.
--
-- The function is SECURITY DEFINER and was granted only to service_role. Its
-- own body already carries the authorization guard, and its comment states the
-- intent plainly:
--
--   "A caller presenting an end-user JWT may only ask for their own
--    conversations. A caller with no JWT at all is the API route holding the
--    service-role key, which has already verified identity..."
--
--   IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
--       RAISE EXCEPTION '...not authorized to read another user''s inbox';
--
-- So an authenticated caller cannot read anyone else's inbox even with the
-- grant: p_user_id is checked against auth.uid() inside the function. The grant
-- was simply never issued. This restores the intended behaviour and opens no
-- security gap.
--
-- Deliberately NOT granted here: log_wallet_transaction and INSERT on
-- chip_ledger, which fail from the browser in the same window (125 + 124
-- times). Those denials are the security control WORKING -- granting them would
-- let any logged-in user forge financial ledger rows for any user with
-- arbitrary amounts. The authoritative audit row for every real money move is
-- already written server-side, in the same transaction, by the
-- atomic_table_buyin / atomic_table_cashout / atomic_table_rebuy /
-- atomic_table_withdraw / atomic_credit_wallet_and_log / atomic_distribute_rake
-- / atomic_seat_horse / atomic_table_addon RPCs.
--
-- Tier 2. APPLIED TO PRODUCTION via Supabase MCP apply_migration on 2026-08-24
-- before this branch merged (CHECK 17).

GRANT EXECUTE ON FUNCTION public.fn_get_user_conversations(uuid, uuid) TO authenticated;

-- Post-apply assertions
DO $$
BEGIN
  IF NOT has_function_privilege('authenticated','public.fn_get_user_conversations(uuid, uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'authenticated still cannot execute fn_get_user_conversations';
  END IF;
  IF has_function_privilege('authenticated','public.log_wallet_transaction(uuid, text, numeric, text, text, text, uuid, uuid, uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'log_wallet_transaction is executable by authenticated - financial forgery risk';
  END IF;
  IF has_table_privilege('authenticated','public.chip_ledger','INSERT') THEN
    RAISE EXCEPTION 'authenticated can INSERT into chip_ledger - financial forgery risk';
  END IF;
END $$;

-- ROLLBACK:
--   REVOKE EXECUTE ON FUNCTION public.fn_get_user_conversations(uuid, uuid) FROM authenticated;
--   (this re-breaks the messenger inbox for every user)
