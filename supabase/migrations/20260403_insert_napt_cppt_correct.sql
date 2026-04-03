INSERT INTO tour_source_registry (
    tour_code,
    tour_name,
    tour_type,
    official_website,
    schedule_url,
    is_active
) VALUES 
('NAPT', 'North American Poker Tour (NAPT)', 'major', 'https://www.pokerstarslive.com/napt/', 'https://www.pokerstarslive.com/napt/schedule/', true),
('CPPT', 'Card Player Poker Tour (CPPT)', 'circuit', 'https://www.cardplayerpokertour.com/', 'https://www.cardplayerpokertour.com/schedule/', true)
ON CONFLICT (tour_code) DO UPDATE SET 
    tour_name = EXCLUDED.tour_name,
    tour_type = EXCLUDED.tour_type,
    official_website = EXCLUDED.official_website,
    schedule_url = EXCLUDED.schedule_url,
    is_active = EXCLUDED.is_active;
