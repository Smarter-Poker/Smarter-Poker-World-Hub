-- ===================================================================
-- POKER VENUES - BATCH 3 of 6 (5 Venues - Florida + NJ)
-- Execute AFTER Batch 2 completes successfully
-- ===================================================================

INSERT INTO poker_venues (name, venue_type, address, city, state, country, phone, website, games_offered, stakes_cash, poker_tables, hours_weekday, hours_weekend, lat, lng, is_featured, is_active)
VALUES
  ('Seminole Hard Rock Hollywood', 'casino', '1 Seminole Way', 'Hollywood', 'FL', 'US', '(866) 502-7529', 'https://seminolehardrockhollywood.com', ARRAY['NLH', 'PLO', 'Mixed'], ARRAY['1/2', '2/5', '5/10'], 45, '24/7', '24/7', 26.0515, -80.2098, true, true),
  ('Seminole Hard Rock Tampa', 'casino', '5223 Orient Rd', 'Tampa', 'FL', 'US', '(813) 627-7625', 'https://seminolehardrocktampa.com', ARRAY['NLH', 'PLO'], ARRAY['1/2', '2/5', '5/10'], 46, '24/7', '24/7', 27.9881, -82.3885, true, true),
  ('bestbet Jacksonville', 'card_room', '1825 Cassat Ave', 'Jacksonville', 'FL', 'US', '(904) 646-0002', 'https://bestbetjax.com', ARRAY['NLH', 'PLO'], ARRAY['1/2', '2/5'], 70, '24/7', '24/7', 30.3077, -81.7154, true, true),
  ('TGT Poker & Racebook', 'card_room', '5010 W Hillsborough Ave', 'Tampa', 'FL', 'US', '(813) 932-4313', 'https://tgtpoker.com', ARRAY['NLH', 'PLO'], ARRAY['1/2', '2/5'], 30, '24/7', '24/7', 27.9881, -82.5026, false, true),
  ('Borgata Hotel Casino & Spa', 'casino', '1 Borgata Way', 'Atlantic City', 'NJ', 'US', '(609) 317-1000', 'https://theborgata.com', ARRAY['NLH', 'PLO', 'Mixed'], ARRAY['1/2', '2/5', '5/10'], 85, '24/7', '24/7', 39.3784, -74.4357, true, true)
ON CONFLICT (name, city, state) DO NOTHING;

SELECT COUNT(*) FROM poker_venues;
