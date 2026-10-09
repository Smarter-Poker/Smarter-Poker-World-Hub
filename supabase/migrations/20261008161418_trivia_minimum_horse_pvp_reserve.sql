-- TIER: 3; AUTHOR: Codex; AFFECTS: Trivia treasury issuance journal only
-- WHY: Installed horse PvP admission requires 25000 available diamonds. Genuine
-- canaries left 20008, so the minimum shortfall is 4992. The owner assigned
-- completion of launch blockers. This does not enable any competitive gate.
-- No human/horse wallet, settled history, ceiling, floor or rules are changed.
-- PROOF: Exact funding and duplicate call passed in a rolled-back production
-- transaction; original balances 20008/-20000 and zero persisted probe journals
-- were read back. Evidence: trivia-program-20260929/evidence/p9-12/PROGRESS.md.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $reserve$
DECLARE a jsonb; b jsonb; j uuid;
approval jsonb := '{"approved_by":"Codex /root under owner launch-completion instruction","reason":"Meet the installed 25000-diamond horse PvP reserve from the verified 20008 balance; minimum 4992 top-up only.","evidence":"trivia-program-20260929/evidence/p9-12/PROGRESS.md; PR2231 genuine funded canaries"}';
BEGIN
PERFORM 1 FROM public.trivia_ledger_accounts WHERE account_code IN ('treasury:trivia','issuance:treasury_funding') ORDER BY account_code FOR UPDATE NOWAIT;
IF (SELECT balance FROM public.trivia_ledger_accounts WHERE account_code='treasury:trivia') IS DISTINCT FROM 20008 OR (SELECT balance FROM public.trivia_ledger_accounts WHERE account_code='issuance:treasury_funding') IS DISTINCT FROM -20000 THEN RAISE EXCEPTION 'reserve prestate changed'; END IF;
IF (SELECT min_balance FROM public.trivia_ledger_accounts WHERE account_code='treasury:trivia') IS DISTINCT FROM 0 OR NOT public.trivia_competitive_global_ledger_clean_v1() OR EXISTS (SELECT 1 FROM (SELECT DISTINCT ON(gate_key) enabled FROM public.trivia_competitive_cutover_certificates ORDER BY gate_key,certificate_version DESC) gates WHERE enabled) THEN RAISE EXCEPTION 'reserve funding requires dormant gates, original floor and clean ledger'; END IF;
a:=public.trivia_ledger_treasury_fund('trivia-launch-reserve-20261008-minimum-25000',4992,'platform_issuance',approval);
b:=public.trivia_ledger_treasury_fund('trivia-launch-reserve-20261008-minimum-25000',4992,'platform_issuance',approval);
IF NOT COALESCE((a->>'success')::boolean,false) OR NOT COALESCE((b->>'success')::boolean,false) THEN RAISE EXCEPTION 'funding or replay failed: %, %',a,b; END IF;
SELECT id INTO j FROM public.trivia_ledger_journals WHERE idempotency_key='trivia-launch-reserve-20261008-minimum-25000';
IF (SELECT balance FROM public.trivia_ledger_accounts WHERE account_code='treasury:trivia') IS DISTINCT FROM 25000 OR (SELECT balance FROM public.trivia_ledger_accounts WHERE account_code='issuance:treasury_funding') IS DISTINCT FROM -24992 OR (SELECT count(*) FROM public.trivia_ledger_lines WHERE journal_id=j)<>2 OR (SELECT sum(amount) FROM public.trivia_ledger_lines WHERE journal_id=j)<>0 OR EXISTS(SELECT 1 FROM public.trivia_ledger_lines WHERE journal_id=j AND (user_id IS NOT NULL OR account_kind='player_wallet')) THEN RAISE EXCEPTION 'reserve proof failed'; END IF;
END $reserve$;
COMMIT;
-- FORWARD ROLLBACK: unused funding only; retain all immutable history.
-- BEGIN;
-- SET LOCAL lock_timeout='5s';
-- SET LOCAL statement_timeout='30s';
-- DO $undo$
-- DECLARE r jsonb; j uuid;
-- BEGIN
-- PERFORM 1 FROM public.trivia_ledger_accounts WHERE account_code IN ('treasury:trivia','issuance:treasury_funding') ORDER BY account_code FOR UPDATE NOWAIT;
-- IF (SELECT balance FROM public.trivia_ledger_accounts WHERE account_code='treasury:trivia') IS DISTINCT FROM 25000 OR (SELECT balance FROM public.trivia_ledger_accounts WHERE account_code='issuance:treasury_funding') IS DISTINCT FROM -24992 THEN RAISE EXCEPTION 'reserve changed after funding; investigate rather than reverse used funds'; END IF;
-- SELECT id INTO j FROM public.trivia_ledger_journals WHERE idempotency_key='trivia-launch-reserve-20261008-minimum-25000';
-- IF j IS NULL OR EXISTS(SELECT 1 FROM public.trivia_ledger_lines WHERE journal_id=j AND (user_id IS NOT NULL OR account_kind='player_wallet')) THEN RAISE EXCEPTION 'only treasury issuance may be reversed'; END IF;
-- r:=public.trivia_ledger_reverse('trivia-launch-reserve-20261008-reverse',j,'{"approved_by":"Codex /root under owner launch-completion instruction","reason":"Reverse only the unused minimum reserve top-up through balanced journal legs.","evidence":"trivia-program-20260929/evidence/p9-12/PROGRESS.md"}'::jsonb);
-- IF NOT COALESCE((r->>'success')::boolean,false) OR (SELECT balance FROM public.trivia_ledger_accounts WHERE account_code='treasury:trivia') IS DISTINCT FROM 20008 OR (SELECT balance FROM public.trivia_ledger_accounts WHERE account_code='issuance:treasury_funding') IS DISTINCT FROM -20000 THEN RAISE EXCEPTION 'reserve reversal failed: %',r; END IF;
-- END $undo$;
-- COMMIT;
