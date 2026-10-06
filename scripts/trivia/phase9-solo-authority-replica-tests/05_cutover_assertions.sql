\set ON_ERROR_STOP on
SELECT set_config('request.jwt.claim.role','service_role',false);

DO $cutover$
DECLARE
    v_result jsonb;
    v_before integer;
    v_refused boolean := false;
BEGIN
    SELECT diamonds INTO v_before FROM public.profiles
     WHERE id='10000000-0000-4000-8000-000000000030';
    v_result := public.trivia_solo_spend(
        '10000000-0000-4000-8000-000000000030',5,'retired generic skip',
        'trivia_lifeline',
        'trivia_lifeline:30000000-0000-4000-8000-000000000001:20000000-0000-4000-8000-000000000001:skip');
    IF v_result->>'error' <> 'paid_skip_requires_session_authority'
       OR (SELECT diamonds FROM public.profiles
            WHERE id='10000000-0000-4000-8000-000000000030') IS DISTINCT FROM v_before
       OR EXISTS (SELECT 1 FROM public.diamond_transactions
                   WHERE user_id='10000000-0000-4000-8000-000000000030') THEN
        RAISE EXCEPTION 'generic lifeline cutover did not fail closed: %',v_result;
    END IF;

    BEGIN
        INSERT INTO public.diamond_transactions(
            user_id,amount,transaction_type,type,description,balance_after,
            reference_id,counterparty,issuance_class)
        VALUES('10000000-0000-4000-8000-000000000030',-5,
            'trivia_lifeline','trivia_lifeline','unscoped insert',95,
            'trivia_lifeline:30000000-0000-4000-8000-000000000001:20000000-0000-4000-8000-000000000002:skip',
            'revenue:trivia_lifeline','spend');
    EXCEPTION WHEN insufficient_privilege THEN
        v_refused := SQLERRM = 'paid_skip_requires_session_authority';
    END;
    IF NOT v_refused OR EXISTS (
        SELECT 1 FROM public.diamond_transactions
         WHERE user_id='10000000-0000-4000-8000-000000000030') THEN
        RAISE EXCEPTION 'ledger trigger did not refuse unscoped lifeline insert';
    END IF;
END
$cutover$;
