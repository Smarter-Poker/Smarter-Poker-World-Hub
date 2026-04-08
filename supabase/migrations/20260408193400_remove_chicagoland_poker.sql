-- Remove duplicate Chicagoland Poker venue as it was renamed/duplicates Windy City Charity Poker

DELETE FROM venue_daily_tournaments 
WHERE venue_name = 'Chicagoland Poker';

DELETE FROM poker_venues 
WHERE name = 'Chicagoland Poker';

DELETE FROM poker_venues 
WHERE website = 'https://chicagopokerclub.net';
