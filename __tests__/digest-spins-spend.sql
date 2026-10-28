DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; END IF; END $$;
CREATE TABLE profiles(id uuid,username text,is_horse boolean);
CREATE TABLE clubs(id uuid,name text); CREATE TABLE unions(id uuid,name text);
CREATE TABLE wheel_spins(id uuid,user_id uuid,created_at timestamptz,is_fixture boolean,receipt_v2 jsonb,spin_price_diamonds numeric,diamonds_per_chip numeric,outcome_kind text,outcome_amount numeric);
CREATE TABLE wheel_card_awards(id uuid,spin_id uuid,paid_diamonds numeric,picked_at timestamptz);
CREATE TABLE wheel_bonus_awards(spin_id uuid,result jsonb,base_diamonds numeric);
CREATE TABLE diamond_game_round_book(id uuid,payout_chips numeric,bet_diamonds numeric,settled_at timestamptz);
CREATE TABLE chip_ledger(category text,from_type text,to_type text,amount numeric,to_entity_id uuid,to_label text,created_at timestamptz,from_label text);
INSERT INTO profiles VALUES ('00000000-0000-0000-0000-000000000001','Human',false),('00000000-0000-0000-0000-000000000002','Horse',true);
INSERT INTO wheel_spins VALUES
('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','2026-10-27 05:00Z',false,'{"player_cost_diamonds":100}',100,100,'chips',0.25),
('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','2026-10-28 04:59:59Z',false,'{"secondary":{"outcome":{"kind":"chips","amount":2}}}',300,100,'upgrade',600),
('10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','2026-10-28 05:00Z',false,'{}',999,100,'chips',999),
('10000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001','2026-10-27 06:00Z',true,'{}',999,100,'chips',999);
INSERT INTO wheel_bonus_awards VALUES('10000000-0000-0000-0000-000000000001','{"id":"20000000-0000-0000-0000-000000000001"}',100);
INSERT INTO diamond_game_round_book VALUES('20000000-0000-0000-0000-000000000001',0.5,150,'2026-10-28 06:00Z');
INSERT INTO chip_ledger VALUES('promo','bbj_pool','union_wallet',10,NULL,'Internal bank','2026-10-27 12:00Z',NULL),('leaderboard_payout','union_wallet','player_wallet',5,'00000000-0000-0000-0000-000000000001',NULL,'2026-10-27 13:00Z',NULL);
INSERT INTO chip_ledger VALUES('wheel_prize','union_wallet','player_wallet',0.25,'00000000-0000-0000-0000-000000000001',NULL,'2026-10-27 14:00Z','union_wallets.promo_wallet');
