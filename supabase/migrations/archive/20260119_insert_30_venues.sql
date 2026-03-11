-- ONE-TIME SEED SCRIPT
-- Execute this directly in Supabase SQL Editor
-- Inserts 30 venues + 77 tournaments

-- ===== VENUES =====
INSERT INTO poker_venues (name, venue_type, address, city, state, country, phone, website, games_offered, stakes_cash, poker_tables, hours_weekday, hours_weekend, lat, lng, is_featured, is_active)
VALUES
  ('Bellagio Poker Room', 'casino', '3600 S Las Vegas Blvd', 'Las Vegas', 'NV', 'US', '(702) 693-7111', 'https://bellagio.mgmresorts.com', ARRAY['NLH', 'PLO', 'Mixed'], ARRAY['1/3', '2/5', '5/10', '10/20'], 40, '24/7', '24/7', 36.1126, -115.1767, true, true),
  ('Aria Resort & Casino', 'casino', '3730 S Las Vegas Blvd', 'Las Vegas', 'NV', 'US', '(702) 590-7111', 'https://aria.mgmresorts.com', ARRAY['NLH', 'PLO', 'Mixed'], ARRAY['1/3', '2/5', '5/10'], 24, '24/7', '24/7', 36.1069, -115.1765, true, true),
  ('Wynn Las Vegas', 'casino', '3131 S Las Vegas Blvd', 'Las Vegas', 'NV', 'US', '(702) 770-7000', 'https://wynnlasvegas.com', ARRAY['NLH', 'PLO', 'Mixed'], ARRAY['1/3', '2/5', '5/10'], 27, '24/7', '24/7', 36.1277, -115.1654, true, true),
  ('Venetian Las Vegas', 'casino', '3355 S Las Vegas Blvd', 'Las Vegas', 'NV', 'US', '(702) 414-1000', 'https://venetianlasvegas.com', ARRAY['NLH', 'PLO', 'Mixed'], ARRAY['1/2', '2/5', '5/10'], 50, '24/7', '24/7', 36.1212, -115.1697, true, true),
  ('MGM Grand Poker Room', 'casino', '3799 S Las Vegas Blvd', 'Las Vegas', 'NV', 'US', '(702) 891-7777', 'https://mgmgrand.mgmresorts.com', ARRAY['NLH', 'PLO'], ARRAY['1/2', '2/5', '5/10'], 23, '24/7', '24/7', 36.1024, -115.1695, true, true),
  ('Commerce Casino', 'card_room', '6131 E Telegraph Rd', 'Los Angeles', 'CA', 'US', '(323) 721-2100', 'https://commercecasino.com', ARRAY['NLH', 'PLO', 'Mixed'], ARRAY['1/2', '2/3', '3/5', '5/10'], 240, '24/7', '24/7', 34.0098, -118.1553, true, true),
  ('The Bicycle Casino', 'card_room', '7301 Eastern Ave', 'Bell Gardens', 'CA', 'US', '(562) 806-4646', 'https://thebike.com', ARRAY['NLH', 'PLO', 'Mixed'], ARRAY['1/2', '2/3', '3/5'], 185, '24/7', '24/7', 33.9655, -118.1553, true, true),
  ('Hustler Casino', 'card_room', '1000 W Redondo Beach Blvd', 'Gardena', 'CA', 'US', '(310) 719-9800', 'https://hustlercasinolive.com', ARRAY['NLH', 'PLO', 'Mixed'], ARRAY['1/3', '2/5', '5/10'], 50, '24/7', '24/7', 33.8897, -118.3090, true, true),
  ('Bay 101 Casino', 'card_room', '1801 Bering Dr', 'San Jose', 'CA', 'US', '(408) 451-8888', 'https://bay101.com', ARRAY['NLH', 'PLO'], ARRAY['1/2', '2/3', '3/5'], 50, '24/7', '24/7', 37.3688, -121.9178, true, true),
  ('Thunder Valley Casino', 'casino', '1200 Athens Ave', 'Lincoln', 'CA', 'US', '(916) 408-7777', 'https://thundervalleyresort.com', ARRAY['NLH', 'PLO'], ARRAY['1/2', '2/5'], 20, '24/7', '24/7', 38.8916, -121.2897, false, true),
  ('Seminole Hard Rock Hollywood', 'casino', '1 Seminole Way', 'Hollywood', 'FL', 'US', '(866) 502-7529', 'https://seminolehardrockhollywood.com', ARRAY['NLH', 'PLO', 'Mixed'], ARRAY['1/2', '2/5', '5/10'], 45, '24/7', '24/7', 26.0515, -80.2098, true, true),
  ('Seminole Hard Rock Tampa', 'casino', '5223 Orient Rd', 'Tampa', 'FL', 'US', '(813) 627-7625', 'https://seminolehardrocktampa.com', ARRAY['NLH', 'PLO'], ARRAY['1/2', '2/5', '5/10'], 46, '24/7', '24/7', 27.9881, -82.3885, true, true),
  ('bestbet Jacksonville', 'card_room', '1825 Cassat Ave', 'Jacksonville', 'FL', 'US', '(904) 646-0002', 'https://bestbetjax.com', ARRAY['NLH', 'PLO'], ARRAY['1/2', '2/5'], 70, '24/7', '24/7', 30.3077, -81.7154, true, true),
  ('TGT Poker & Racebook', 'card_room', '5010 W Hillsborough Ave', 'Tampa', 'FL', 'US', '(813) 932-4313', 'https://tgtpoker.com', ARRAY['NLH', 'PLO'], ARRAY['1/2', '2/5'], 30, '24/7', '24/7', 27.9881, -82.5026, false, true),
  ('Borgata Hotel Casino & Spa', 'casino', '1 Borgata Way', 'Atlantic City', 'NJ', 'US', '(609) 317-1000', 'https://theborgata.com', ARRAY['NLH', 'PLO', 'Mixed'], ARRAY['1/2', '2/5', '5/10'], 85, '24/7', '24/7', 39.3784, -74.4357, true, true),
  ('Harrahs Pompano Beach', 'casino', '777 Harrahs Rincon Way', 'Pompano Beach', 'FL', 'US', '(954) 946-5000', 'https://harrahspompano.com', ARRAY['NLH', 'PLO'], ARRAY['1/2', '2/5'], 20, '24/7', '24/7', 26.2379, -80.1248, false, true),
  ('Parx Casino', 'casino', '2999 Street Rd', 'Bensalem', 'PA', 'US', '(215) 639-9000', 'https://parxcasino.com', ARRAY['NLH', 'PLO'], ARRAY['1/2', '2/5', '5/10'], 80, '24/7', '24/7', 40.1045, -74.9595, true, true),
  ('Live! Casino Philadelphia', 'casino', '900 Packer Ave', 'Philadelphia', 'PA', 'US', '(215) 297-0200', 'https://livecasinophiladelphia.com', ARRAY['NLH', 'PLO'], ARRAY['1/2', '2/5'], 28, '24/7', '24/7', 39.9075, -75.1536, false, true),
  ('Maryland Live! Casino at Arundel Mills', 'casino', '7002 Arundel Mills Cir', 'Hanover', 'MD', 'US', '(443) 842-7000', 'https://marylandlivecasino.com', ARRAY['NLH', 'PLO'], ARRAY['1/2', '2/5', '5/10'], 52, '24/7', '24/7', 39.1567, -76.7297, true, true),
  ('MGM National Harbor', 'casino', '101 MGM National Ave', 'Oxon Hill', 'MD', 'US', '(844) 646-6847', 'https://mgmnationalharbor.com', ARRAY['NLH', 'PLO'], ARRAY['1/3', '2/5', '5/10'], 27, '24/7', '24/7', 38.7822, -77.0174, false, true),
  ('Lodge Card Club Austin', 'poker_club', '2601 E Gattis School Rd', 'Round Rock', 'TX', 'US', '(512) 717-7529', 'https://thelodgepokerclub.com', ARRAY['NLH', 'PLO', 'Mixed'], ARRAY['1/2', '2/5', '5/10'], 30, '24/7', '24/7', 30.5089, -97.6503, true, true),
  ('Texas Card House Houston', 'poker_club', '5959 W Sam Houston Pkwy N', 'Houston', 'TX', 'US', '(832) 742-3335', 'https://texascardhouse.com', ARRAY['NLH', 'PLO'], ARRAY['1/2', '2/5', '5/10'], 50, '24/7', '24/7', 29.9167, -95.5797, true, true),
  ('Champions Club', 'poker_club', '11920 Westheimer Rd', 'Houston', 'TX', 'US', '(281) 759-5626', 'https://championsclubpoker.com', ARRAY['NLH', 'PLO'], ARRAY['1/2', '2/5'], 25, '24/7', '24/7', 29.7357, -95.5797, false, true),
  ('Foxwoods Resort Casino', 'casino', '350 Trolley Line Blvd', 'Mashantucket', 'CT', 'US', '(800) 369-9663', 'https://foxwoods.com', ARRAY['NLH', 'PLO', 'Mixed'], ARRAY['1/2', '2/5', '5/10'], 114, '24/7', '24/7', 41.4597, -71.9756, true, true),
  ('Mohegan Sun', 'casino', '1 Mohegan Sun Blvd', 'Uncasville', 'CT', 'US', '(888) 226-7711', 'https://mohegansun.com', ARRAY['NLH', 'PLO'], ARRAY['1/2', '2/5', '5/10'], 42, '24/7', '24/7', 41.4833, -72.0939, true, true),
  ('FireKeepers Casino', 'casino', '11177 Michigan Ave', 'Battle Creek', 'MI', 'US', '(877) 352-8777', 'https://firekeeperscasino.com', ARRAY['NLH', 'PLO'], ARRAY['1/2', '2/5'], 14, '24/7', '24/7', 42.2987, -85.1797, false, true),
  ('Choctaw Casino Durant', 'casino', '4216 US-69', 'Durant', 'OK', 'US', '(580) 920-0160', 'https://choctawcasinos.com', ARRAY['NLH', 'PLO'], ARRAY['1/2', '2/5'], 30, '24/7', '24/7', 33.9242, -96.3897, false, true),
  ('Hard Rock Tulsa', 'casino', '777 W Cherokee St', 'Catoosa', 'OK', 'US', '(918) 384-7625', 'https://hardrockcasinotulsa.com', ARRAY['NLH', 'PLO'], ARRAY['1/2', '2/5'], 20, '24/7', '24/7', 36.1897, -95.7297, false, true),
  ('Beau Rivage Resort & Casino', 'casino', '875 Beach Blvd', 'Biloxi', 'MS', 'US', '(228) 386-7111', 'https://beaurivage.mgmresorts.com', ARRAY['NLH', 'PLO'], ARRAY['1/2', '2/5'], 18, '24/7', '24/7', 30.3897, -88.8897, false, true),
  ('Horseshoe Casino Tunica', 'casino', '1021 Casino Center Dr', 'Robinsonville', 'MS', 'US', '(800) 303-7463', 'https://caesars.com/horseshoe-tunica', ARRAY['NLH', 'PLO'], ARRAY['1/2', '2/5'], 15, '24/7', '24/7', 34.8597, -90.2897, false, true)
ON CONFLICT (name, city, state) DO NOTHING;

-- Verify venues inserted
SELECT COUNT(*) as total_venues FROM poker_venues;
