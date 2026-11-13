-- Dan 2026-11-13: a tournament that starts before midnight reconciles on the
-- Chicago day it started. Its after-midnight legs never land on the next day.
TRUNCATE settlement_fixture;
UPDATE ca_supply_snapshots SET unexplained=0;
INSERT INTO ca_supply_snapshots SELECT g,0,'posthand-transit-v6' FROM generate_series('2026-11-10 06:05Z'::timestamptz,'2026-11-11 05:05Z'::timestamptz,interval '1 hour') g
 WHERE NOT EXISTS(SELECT FROM ca_supply_snapshots s WHERE s.taken_at=g);
INSERT INTO sp_daily_metrics VALUES('2026-11-11','{}') ON CONFLICT DO NOTHING;
-- Starts 23:00 Chicago on Nov 10 (05:00Z Nov 11): entries before midnight,
-- rake, prize and the overlay funding after midnight.
INSERT INTO tournaments(id,club_id,started_at) VALUES('e0000000-0000-0000-0000-0000000000f1','c0000000-0000-0000-0000-000000000001','2026-11-11 05:00Z');
INSERT INTO chip_ledger VALUES
('player_wallet','prize_liability','47965354-0e56-43ef-931c-ddaab82af765',NULL,50,'tournament_buyin','c0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-0000000000f1','posted','2026-11-11 04:55Z'),
('player_wallet','prize_liability','00000000-0000-0000-0000-00000000000b',NULL,50,'tournament_buyin','c0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-0000000000f1','posted','2026-11-11 05:30Z'),
('union_wallet','prize_liability',NULL,NULL,7,'promo_send','c0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-0000000000f1','posted','2026-11-11 06:30Z'),
('prize_liability','union_wallet',NULL,NULL,10,'rake','c0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-0000000000f1','posted','2026-11-11 07:00Z'),
('prize_liability','player_wallet',NULL,'00000000-0000-0000-0000-00000000000b',97,'tournament_prize','c0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-0000000000f1','posted','2026-11-11 07:30Z');
INSERT INTO settlement_fixture VALUES('e0000000-0000-0000-0000-0000000000f1','late','nlh','2026-11-11 07:30Z',0);
DO $$ DECLARE r jsonb:=fn_sp_digest_daily_results('2026-11-10'); n jsonb:=fn_sp_digest_daily_results('2026-11-11'); BEGIN
-- Start day carries the whole event: entries 100, rake 10, prize 97, funding 7.
IF (r#>>'{reconciliation,tournament_rake}')::numeric<>12 OR (r#>>'{reconciliation,tournament_net}')::numeric<>(-5-3)
 OR (r#>>'{results,tournament,humans,losses}')::numeric<>70 OR (r#>>'{results,tournament,horses,wins}')::numeric<>62
 OR (r#>>'{reconciliation,accounted_residual}')::numeric<>0 OR r#>>'{reconciliation,status}'<>'balanced'
 OR (r#>>'{tournament_settlements,checked}')::int<>1 THEN RAISE EXCEPTION 'start day did not carry the event %',r; END IF;
-- The next day sees none of it.
IF (n#>>'{reconciliation,tournament_rake}')::numeric<>0 OR (n#>>'{reconciliation,tournament_net}')::numeric<>0
 OR (n#>>'{reconciliation,prize_liability_change}')::numeric<>0 OR (n#>>'{reconciliation,other_prize_movements}')::numeric<>0
 OR (n#>>'{tournament_settlements,checked}')::int<>0 THEN RAISE EXCEPTION 'next day picked up a prior-day tournament %',n; END IF;
END $$;
