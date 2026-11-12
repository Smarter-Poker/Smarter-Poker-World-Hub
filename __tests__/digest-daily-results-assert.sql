DO $$ DECLARE r jsonb:=fn_sp_digest_daily_results('2026-11-10'); BEGIN
IF r#>>'{reconciliation,status}'<>'balanced' OR (r#>>'{reconciliation,raw_residual}')::numeric<>-3
 OR (r#>>'{reconciliation,prize_liability_change}')::numeric<>8 OR (r#>>'{reconciliation,other_prize_movements}')::numeric<>-5
 OR (r#>>'{reconciliation,accounted_residual}')::numeric<>0 THEN RAISE EXCEPTION 'bridge mismatch %',r; END IF;
IF (r#>>'{results,cash,humans,net}')::numeric<>6 OR (r#>>'{results,cash,horses,losses}')::numeric<>10
 OR (r#>>'{results,tournament,humans,losses}')::numeric<>20 OR (r#>>'{results,tournament,horses,wins}')::numeric<>15
 OR (r#>>'{kingfish,cash_net}')::numeric<>6 OR (r#>>'{kingfish,tournament_net}')::numeric<>-20 THEN RAISE EXCEPTION 'cohorts/Kingfish mismatch %',r; END IF;
IF r IS DISTINCT FROM fn_sp_digest_daily_results('2026-11-10') THEN RAISE EXCEPTION 'nonrepeatable'; END IF;
END $$;
-- A missing fact must not be filled in as a balancing remainder.
UPDATE ca_hand_facts SET net=net-0.01 WHERE user_id='00000000-0000-0000-0000-00000000000b';
DO $$ DECLARE r jsonb:=fn_sp_digest_daily_results('2026-11-10'); BEGIN
IF r#>>'{reconciliation,status}'<>'discrepancy' OR (r#>>'{reconciliation,cash_residual}')::numeric<>-0.01
 OR (r#>>'{results,cash,horses,net}')::numeric<>-10.01 THEN RAISE EXCEPTION 'drift hidden %',r; END IF;
END $$;
UPDATE ca_hand_facts SET net=net+0.01 WHERE user_id='00000000-0000-0000-0000-00000000000b';
DELETE FROM ca_hand_facts WHERE user_id='47965354-0e56-43ef-931c-ddaab82af765';
DO $$ BEGIN IF fn_sp_digest_daily_results('2026-11-10')#>>'{reconciliation,status}'<>'discrepancy' THEN RAISE EXCEPTION 'missing seat passed'; END IF; END $$;
DO $$ BEGIN IF has_function_privilege('anon','fn_sp_digest_daily_results(date)','EXECUTE') THEN RAISE EXCEPTION 'anon access'; END IF; END $$;
-- Unknown profiles and independent settlement drift remain explicit even if net sums cancel.
INSERT INTO ca_hand_facts(hand_id,user_id,played_at,club_id,net,players_dealt) VALUES
('10000000-0000-0000-0000-000000000001','99999999-0000-0000-0000-000000000001','2026-11-10 06:00Z','c0000000-0000-0000-0000-000000000001',6,2);
DO $$ DECLARE r jsonb:=fn_sp_digest_daily_results('2026-11-10'); BEGIN
IF r#>>'{reconciliation,status}'<>'discrepancy' OR (r#>>'{results,cash,unknown,net}')::numeric<>6 THEN RAISE EXCEPTION 'unknown profile hidden %',r; END IF;
END $$;
DELETE FROM ca_hand_facts WHERE user_id='99999999-0000-0000-0000-000000000001';
INSERT INTO ca_hand_facts(hand_id,user_id,played_at,club_id,net,players_dealt) VALUES
('10000000-0000-0000-0000-000000000001','47965354-0e56-43ef-931c-ddaab82af765','2026-11-10 06:00Z','c0000000-0000-0000-0000-000000000001',6,2);
INSERT INTO tournaments(id,club_id) VALUES('e0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001');
INSERT INTO settlement_fixture VALUES('e0000000-0000-0000-0000-000000000001','event','nlh','2026-11-10 06:00Z',0.01);
DO $$ DECLARE r jsonb:=fn_sp_digest_daily_results('2026-11-10'); BEGIN
IF r#>>'{reconciliation,status}'<>'discrepancy' OR (r#>>'{tournament_settlements,unbalanced}')::int<>1 THEN RAISE EXCEPTION 'settlement mismatch hidden %',r; END IF;
IF fn_sp_digest_daily_results('2026-11-09')#>>'{reconciliation,status}'<>'unverified' THEN RAISE EXCEPTION 'missing day passed'; END IF;
END $$;
