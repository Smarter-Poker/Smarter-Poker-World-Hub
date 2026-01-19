-- ===================================================================
-- POKER VENUES - BATCH 2 of 6 (5 Venues - California)
-- Execute AFTER Batch 1 completes successfully
-- ===================================================================

INSERT INTO poker_venues (name, venue_type, address, city, state, country, phone, website, games_offered, stakes_cash, poker_tables, hours_weekday, hours_weekend, lat, lng, is_featured, is_active)
VALUES
  ('Commerce Casino', 'card_room', '6131 E Telegraph Rd', 'Los Angeles', 'CA', 'US', '(323) 721-2100', 'https://commercecasino.com', ARRAY['NLH', 'PLO', 'Mixed'], ARRAY['1/2', '2/3', '3/5', '5/10'], 240, '24/7', '24/7', 34.0098, -118.1553, true, true),
  ('The Bicycle Casino', 'card_room', '7301 Eastern Ave', 'Bell Gardens', 'CA', 'US', '(562) 806-4646', 'https://thebike.com', ARRAY['NLH', 'PLO', 'Mixed'], ARRAY['1/2', '2/3', '3/5'], 185, '24/7', '24/7', 33.9655, -118.1553, true, true),
  ('Hustler Casino', 'card_room', '1000 W Redondo Beach Blvd', 'Gardena', 'CA', 'US', '(310) 719-9800', 'https://hustlercasinolive.com', ARRAY['NLH', 'PLO', 'Mixed'], ARRAY['1/3', '2/5', '5/10'], 50, '24/7', '24/7', 33.8897, -118.3090, true, true),
  ('Bay 101 Casino', 'card_room', '1801 Bering Dr', 'San Jose', 'CA', 'US', '(408) 451-8888', 'https://bay101.com', ARRAY['NLH', 'PLO'], ARRAY['1/2', '2/3', '3/5'], 50, '24/7', '24/7', 37.3688, -121.9178, true, true),
  ('Thunder Valley Casino', 'casino', '1200 Athens Ave', 'Lincoln', 'CA', 'US', '(916) 408-7777', 'https://thundervalleyresort.com', ARRAY['NLH', 'PLO'], ARRAY['1/2', '2/5'], 20, '24/7', '24/7', 38.8916, -121.2897, false, true)
ON CONFLICT (name, city, state) DO NOTHING;

SELECT COUNT(*) FROM poker_venues;
