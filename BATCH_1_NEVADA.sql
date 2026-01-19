-- ===================================================================
-- POKER VENUES - BATCH 1 of 6 (5 Venues - Nevada)
-- Execute this batch first, then proceed to next batch
-- ===================================================================

INSERT INTO poker_venues (name, venue_type, address, city, state, country, phone, website, games_offered, stakes_cash, poker_tables, hours_weekday, hours_weekend, lat, lng, is_featured, is_active)
VALUES
  ('Bellagio Poker Room', 'casino', '3600 S Las Vegas Blvd', 'Las Vegas', 'NV', 'US', '(702) 693-7111', 'https://bellagio.mgmresorts.com', ARRAY['NLH', 'PLO', 'Mixed'], ARRAY['1/3', '2/5', '5/10', '10/20'], 40, '24/7', '24/7', 36.1126, -115.1767, true, true),
  ('Aria Resort & Casino', 'casino', '3730 S Las Vegas Blvd', 'Las Vegas', 'NV', 'US', '(702) 590-7111', 'https://aria.mgmresorts.com', ARRAY['NLH', 'PLO', 'Mixed'], ARRAY['1/3', '2/5', '5/10'], 24, '24/7', '24/7', 36.1069, -115.1765, true, true),
  ('Wynn Las Vegas', 'casino', '3131 S Las Vegas Blvd', 'Las Vegas', 'NV', 'US', '(702) 770-7000', 'https://wynnlasvegas.com', ARRAY['NLH', 'PLO', 'Mixed'], ARRAY['1/3', '2/5', '5/10'], 27, '24/7', '24/7', 36.1277, -115.1654, true, true),
  ('Venetian Las Vegas', 'casino', '3355 S Las Vegas Blvd', 'Las Vegas', 'NV', 'US', '(702) 414-1000', 'https://venetianlasvegas.com', ARRAY['NLH', 'PLO', 'Mixed'], ARRAY['1/2', '2/5', '5/10'], 50, '24/7', '24/7', 36.1212, -115.1697, true, true),
  ('MGM Grand Poker Room', 'casino', '3799 S Las Vegas Blvd', 'Las Vegas', 'NV', 'US', '(702) 891-7777', 'https://mgmgrand.mgmresorts.com', ARRAY['NLH', 'PLO'], ARRAY['1/2', '2/5', '5/10'], 23, '24/7', '24/7', 36.1024, -115.1695, true, true)
ON CONFLICT (name, city, state) DO NOTHING;

SELECT COUNT(*) FROM poker_venues;
