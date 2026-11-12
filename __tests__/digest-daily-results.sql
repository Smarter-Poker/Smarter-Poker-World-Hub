-- Isolated PostgreSQL fixture only.
CREATE TABLE chip_ledger(from_type text,to_type text,from_entity_id uuid,to_entity_id uuid,amount numeric,category text,club_id uuid,tournament_id uuid,status text,created_at timestamptz);
CREATE TABLE bbj_contributions(club_id uuid,amount numeric,created_at timestamptz);
ALTER TABLE profiles ADD COLUMN username text;
ALTER TABLE ca_hand_facts ADD COLUMN players_dealt smallint DEFAULT 2;
CREATE TABLE tournaments(id uuid,club_id uuid);
CREATE TABLE settlement_fixture(id uuid,name text,variant text,ended_at timestamptz,delta numeric);
CREATE FUNCTION fn_tournament_conservation_deltas(timestamptz,timestamptz) RETURNS SETOF settlement_fixture LANGUAGE sql AS $$SELECT * FROM settlement_fixture WHERE ended_at>$1 AND ended_at<$2$$;
-- Existing house fixture contains unrelated incomplete cash facts. Use an independent population.
TRUNCATE ca_hand_facts,rake_attributions,sp_daily_metrics;
INSERT INTO profiles VALUES ('47965354-0e56-43ef-931c-ddaab82af765',false,'kingfish');
INSERT INTO sp_daily_metrics VALUES('2026-11-10','{}');
INSERT INTO ca_hand_facts(hand_id,user_id,played_at,club_id,net,players_dealt) VALUES
('10000000-0000-0000-0000-000000000001','47965354-0e56-43ef-931c-ddaab82af765','2026-11-10 06:00Z','c0000000-0000-0000-0000-000000000001',6,2),
('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000b','2026-11-10 06:00Z','c0000000-0000-0000-0000-000000000001',-10,2);
INSERT INTO bbj_contributions VALUES('c0000000-0000-0000-0000-000000000001',1,'2026-11-10 06:00Z');
INSERT INTO chip_ledger VALUES
('table_stack','union_wallet',NULL,NULL,3,'rake','c0000000-0000-0000-0000-000000000001',NULL,'posted','2026-11-10 06:00Z'),
('player_wallet','prize_liability','47965354-0e56-43ef-931c-ddaab82af765',NULL,20,'tournament_buyin','c0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001','posted','2026-11-10 07:00Z'),
('prize_liability','player_wallet',NULL,'00000000-0000-0000-0000-00000000000b',15,'tournament_prize','c0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001','posted','2026-11-10 08:00Z'),
('prize_liability','union_wallet',NULL,NULL,2,'rake','c0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001','posted','2026-11-10 09:00Z'),
('union_wallet','prize_liability',NULL,NULL,1,'promo_send','c0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001','posted','2026-11-10 09:00Z'),
('escrow','prize_liability',NULL,NULL,4,'ticket_redeem','c0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001','posted','2026-11-10 09:00Z');
-- Dependencies for the actual existing detailed player totals function.
CREATE SCHEMA smarter_private;
CREATE TABLE smarter_private.sp_real_humans(id uuid,username text);
INSERT INTO smarter_private.sp_real_humans VALUES('00000000-0000-0000-0000-00000000000a','human');
ALTER TABLE ca_hand_facts ADD COLUMN table_id uuid, ADD COLUMN game_variant text, ADD COLUMN big_blind numeric;
ALTER TABLE rake_attributions ADD COLUMN created_at timestamptz;
CREATE TABLE hand_history(id uuid,game_variant text,big_blind numeric);
CREATE TABLE tables(id uuid,small_blind numeric);
CREATE TABLE cash_player_session(player_id uuid,variant text,bb numeric,opened_at timestamptz,closed_at timestamptz,final_stack_captured_at timestamptz);
ALTER TABLE tournaments ADD COLUMN name text,ADD COLUMN tournament_type text;
CREATE TABLE club_members(user_id uuid,club_id uuid,chip_balance numeric);
CREATE TABLE user_diamond_balance(user_id uuid,balance numeric);
CREATE TABLE diamond_transactions(user_id uuid,created_at timestamptz,amount numeric);

CREATE TABLE ca_supply_snapshots(taken_at timestamptz,unexplained numeric,basis_version text);
INSERT INTO ca_supply_snapshots SELECT g,0,'posthand-transit-v6' FROM generate_series('2026-11-10 06:05Z'::timestamptz,'2026-11-11 05:05Z'::timestamptz,interval '1 hour') g;
