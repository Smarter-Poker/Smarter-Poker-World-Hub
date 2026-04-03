INSERT INTO tour_source_registry (
    tour_code,
    tour_name,
    tour_type,
    priority,
    official_website,
    is_active
) VALUES 
('NAPT', 'North American Poker Tour (NAPT)', 'major', 2, 'https://www.pokerstarslive.com/napt/', true),
('CPPT', 'Card Player Poker Tour (CPPT)', 'circuit', 3, 'https://www.cardplayerpokertour.com/', true)
ON CONFLICT (tour_code) DO UPDATE SET 
    tour_name = EXCLUDED.tour_name,
    tour_type = EXCLUDED.tour_type,
    priority = EXCLUDED.priority,
    official_website = EXCLUDED.official_website,
    is_active = EXCLUDED.is_active;
