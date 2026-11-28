\set ON_ERROR_STOP 1
INSERT INTO auth.users VALUES ('11111111-1111-1111-1111-111111111111'),('22222222-2222-2222-2222-222222222222'),('33333333-3333-3333-3333-333333333333');
INSERT INTO public.profiles(id, settings) VALUES ('11111111-1111-1111-1111-111111111111','{"theme":"dark"}'),('22222222-2222-2222-2222-222222222222','{}'),('33333333-3333-3333-3333-333333333333','{}');
INSERT INTO public.bankroll_locations(id,user_id,name) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','A');
INSERT INTO public.bankroll_segments(user_id, segment_type, initial_deposit) VALUES ('11111111-1111-1111-1111-111111111111','poker',1000.10),('11111111-1111-1111-1111-111111111111','life',999);
INSERT INTO public.bankroll_ledger(id,user_id,category,location_id,entry_date,start_time,end_time,gross_in,gross_out,is_revision) VALUES
 ('00000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','poker_cash','aaaaaaaa-0000-0000-0000-000000000001','2026-10-01','2026-10-01T21:00:00Z','2026-10-01T03:00:00Z',200,450.25,false),
 ('00000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','poker_mtt',null,'2026-10-05',null,null,100,0,false),
 ('00000000-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','slots',null,'2026-11-02','2026-11-02T10:00:00Z','2026-11-02T11:30:00Z',300,50,false),
 ('00000000-0000-0000-0000-000000000004','11111111-1111-1111-1111-111111111111','expense',null,'2026-11-03',null,null,-40,0,false),
 ('00000000-0000-0000-0000-000000000005','11111111-1111-1111-1111-111111111111','deposit',null,'2026-11-04',null,null,0,500,false),
 ('00000000-0000-0000-0000-000000000006','11111111-1111-1111-1111-111111111111','withdrawal',null,'2026-11-05',null,null,120,0,false),
 ('00000000-0000-0000-0000-000000000007','11111111-1111-1111-1111-111111111111','poker_cash',null,'2026-11-06',null,null,5,10,null),
 ('00000000-0000-0000-0000-000000000009','22222222-2222-2222-2222-222222222222','poker_cash',null,'2026-11-06',null,null,0,99999,false);
INSERT INTO public.bankroll_ledger(id,user_id,category,entry_date,gross_in,gross_out,is_revision,original_entry_id) VALUES
 ('00000000-0000-0000-0000-000000000008','11111111-1111-1111-1111-111111111111','poker_cash','2026-10-01',0,777,true,'00000000-0000-0000-0000-000000000001');
INSERT INTO public.staking_arrangements(id,user_id,backer_name,backer_email) VALUES ('bbbbbbbb-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Backer','b@x');
INSERT INTO public.staking_sessions(arrangement_id,ledger_entry_id,gross_result,player_share,backer_share,makeup_before,makeup_after) VALUES
 ('bbbbbbbb-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',-100,0,0,0,100),
 ('bbbbbbbb-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',250.25,75.13,75.12,0,0);

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111', false);
\echo == totals all time
SELECT jsonb_pretty(public.fn_bankroll_totals());
\echo == totals Nov
SELECT public.fn_bankroll_totals('2026-11-01','2026-11-30',null)->'period';
\echo == totals at location
SELECT public.fn_bankroll_totals(null,null,'aaaaaaaa-0000-0000-0000-000000000001')->'period'->>'results_cents';
\echo == settings key
SELECT public.fn_profile_settings_set_key('tokeTracker','{"downTimerAlerts":false}');
DO $$ BEGIN PERFORM public.fn_profile_settings_set_key('bad key','1'); RAISE EXCEPTION 'should fail'; EXCEPTION WHEN SQLSTATE '22023' THEN RAISE NOTICE 'bad key refused ok'; END $$;
\echo == staking update/delete as owner
UPDATE public.staking_sessions SET player_share = player_share WHERE ledger_entry_id='00000000-0000-0000-0000-000000000001';
\echo == history
UPDATE public.bankroll_ledger SET notes = 'edited' WHERE id='00000000-0000-0000-0000-000000000003';
UPDATE public.bankroll_ledger SET notes = 'edited' WHERE id='00000000-0000-0000-0000-000000000003';
DELETE FROM public.bankroll_ledger WHERE id='00000000-0000-0000-0000-000000000004';
SELECT op, entry_id, old_row->>'notes' o, new_row->>'notes' n FROM public.bankroll_ledger_changes ORDER BY id;
DO $$ BEGIN INSERT INTO public.bankroll_ledger_changes(entry_id,user_id,op,old_row) VALUES (gen_random_uuid(),auth.uid(),'DELETE','{}'); RAISE EXCEPTION 'insert allowed!'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'client insert refused ok'; END $$;
\echo restore deleted
INSERT INTO public.bankroll_ledger(id,user_id,category,entry_date,gross_in,gross_out,is_revision) SELECT r.id,r.user_id,r.category,r.entry_date,r.gross_in,r.gross_out,r.is_revision FROM jsonb_populate_record(NULL::public.bankroll_ledger, (SELECT old_row FROM public.bankroll_ledger_changes WHERE op='DELETE')) r;
SELECT count(*) AS restored FROM public.bankroll_ledger WHERE id='00000000-0000-0000-0000-000000000004';
\echo == share links
INSERT INTO public.staking_share_links(arrangement_id) VALUES ('bbbbbbbb-0000-0000-0000-000000000001');
SELECT set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222', false);
SELECT count(*) AS other_user_sees_links FROM public.staking_share_links;
SELECT count(*) AS other_user_sees_changes FROM public.bankroll_ledger_changes;
DO $$ BEGIN INSERT INTO public.staking_share_links(arrangement_id) VALUES ('bbbbbbbb-0000-0000-0000-000000000001'); RAISE EXCEPTION 'foreign link allowed!'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'link for others deal refused ok'; END $$;
RESET ROLE;
SET ROLE anon;
SELECT set_config('request.jwt.claim.sub','', false);
\echo == statement as anon
SELECT * FROM public.fn_staking_statement((SELECT token FROM (SELECT 1) x, LATERAL (SELECT NULL::uuid token) y));
RESET ROLE;
SELECT token AS tok FROM public.staking_share_links \gset
SET ROLE anon;
SELECT * FROM public.fn_staking_statement(:'tok');
DO $$ BEGIN PERFORM public.fn_bankroll_totals(); RAISE EXCEPTION 'anon ran totals!'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'anon totals refused ok'; END $$;
DO $$ BEGIN PERFORM * FROM public.staking_share_links; RAISE EXCEPTION 'anon read links!'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'anon links refused ok'; END $$;
RESET ROLE;
UPDATE public.staking_share_links SET revoked_at = now();
SET ROLE anon;
SELECT count(*) AS rows_after_revoke FROM public.fn_staking_statement(:'tok');
RESET ROLE;
UPDATE public.staking_share_links SET revoked_at = NULL, created_at = now() - interval '40 days', expires_at = now() - interval '1 day';
SET ROLE anon;
SELECT count(*) AS rows_after_expiry FROM public.fn_staking_statement(:'tok');
RESET ROLE;
\echo == currency check
DO $$ BEGIN INSERT INTO public.bankroll_ledger(user_id,category,gross_in,gross_out,entry_currency) VALUES ('11111111-1111-1111-1111-111111111111','poker_cash',1,2,'EUR'); RAISE EXCEPTION 'incomplete EUR allowed'; EXCEPTION WHEN check_violation THEN RAISE NOTICE 'incomplete EUR refused ok'; END $$;
INSERT INTO public.bankroll_ledger(user_id,category,gross_in,gross_out,entry_currency,fx_rate_to_usd,original_gross_in,original_gross_out) VALUES ('33333333-3333-3333-3333-333333333333','poker_cash',108.2,216.4,'EUR',1.082,100,200);
\echo == account deletion cascades without breaking
DELETE FROM auth.users WHERE id='11111111-1111-1111-1111-111111111111';
SELECT (SELECT count(*) FROM public.bankroll_ledger_changes) changes_left, (SELECT count(*) FROM public.bankroll_ledger WHERE user_id='11111111-1111-1111-1111-111111111111') ledger_left;
