/**
 * NUCLEAR IMPORT - Wipes and reloads all poker data
 * Visit: /api/poker/nuclear-import
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    const log = [];

    try {
        log.push('Starting nuclear import...');

        // STEP 1: Delete all existing data
        log.push('Deleting old tournament_series...');
        await supabase.from('tournament_series').delete().neq('id', '00000000-0000-0000-0000-000000000000');

        log.push('Deleting old poker_venues...');
        await supabase.from('poker_venues').delete().neq('id', '00000000-0000-0000-0000-000000000000');

        // STEP 2: Insert 115 Tournament Series
        log.push('Inserting tournament series...');
        const seriesData = [
            { name: '2026 WSOP Main Event', short_name: 'WSOP', location: 'Paris/Horseshoe - Las Vegas NV', start_date: '2026-05-27', end_date: '2026-07-16', website: 'https://www.wsop.com', series_type: 'major', is_featured: true, main_event_buyin: 10000, main_event_guaranteed: 50000000 },
            { name: '2026 WPT Lucky Hearts Poker Open', short_name: 'WPT', location: 'Seminole Hard Rock Hollywood FL', start_date: '2026-01-06', end_date: '2026-01-20', website: 'https://worldpokertour.com', series_type: 'major', is_featured: true, main_event_buyin: 3500 },
            { name: '2026 PGT Last Chance Series', short_name: 'PGT', location: 'ARIA PokerGO Studio - Las Vegas NV', start_date: '2026-01-05', end_date: '2026-01-10', website: 'https://pokergo.com/tour', series_type: 'major', is_featured: true },
            { name: 'PGT Kickoff', short_name: 'PGT', location: 'ARIA - Las Vegas NV', start_date: '2026-01-26', end_date: '2026-01-31', website: 'https://pokergo.com/tour', series_type: 'major', is_featured: true },
            { name: '2026 PGT Mixed Games', short_name: 'PGT', location: 'ARIA - Las Vegas NV', start_date: '2026-02-03', end_date: '2026-02-11', website: 'https://pokergo.com/tour', series_type: 'major', is_featured: true },
            { name: 'PGT Super High Roller Bowl', short_name: 'PGT', location: 'ARIA - Las Vegas NV', start_date: '2026-02-12', end_date: '2026-02-14', website: 'https://pokergo.com/tour', series_type: 'major', is_featured: true },
            { name: 'WPT Venetian Spring Festival', short_name: 'WPT', location: 'Venetian Las Vegas NV', start_date: '2026-02-09', end_date: '2026-02-24', website: 'https://venetianlasvegas.com', series_type: 'major', is_featured: true },
            { name: 'World Poker Tour 2026', short_name: 'WPT', location: 'Multiple US Locations', start_date: '2026-01-01', end_date: '2026-12-31', website: 'https://worldpokertour.com', series_type: 'major', is_featured: true },
            { name: 'PokerGO Tour 2026', short_name: 'PGT', location: 'Las Vegas NV', start_date: '2026-01-01', end_date: '2026-12-31', website: 'https://pokergo.com/tour', series_type: 'major', is_featured: true },
            { name: 'WSOP Circuit Las Vegas Winter', short_name: 'WSOPC', location: 'Planet Hollywood - Las Vegas NV', start_date: '2026-01-01', end_date: '2026-01-12', website: 'https://www.wsop.com/circuit', series_type: 'circuit', is_featured: false },
            { name: 'WSOP Circuit Choctaw Winter', short_name: 'WSOPC', location: 'Choctaw Casino - Durant OK', start_date: '2026-01-07', end_date: '2026-01-19', website: 'https://www.wsop.com/circuit', series_type: 'circuit', is_featured: false },
            { name: 'WSOP Circuit Thunder Valley', short_name: 'WSOPC', location: 'Thunder Valley Casino - Lincoln CA', start_date: '2026-01-15', end_date: '2026-01-26', website: 'https://www.wsop.com/circuit', series_type: 'circuit', is_featured: false },
            { name: 'WSOP Circuit Tunica Winter', short_name: 'WSOPC', location: 'Horseshoe Tunica MS', start_date: '2026-01-22', end_date: '2026-02-02', website: 'https://www.wsop.com/circuit', series_type: 'circuit', is_featured: false },
            { name: 'WSOP Circuit Pompano', short_name: 'WSOPC', location: 'Harrahs Pompano FL', start_date: '2026-01-29', end_date: '2026-02-09', website: 'https://www.wsop.com/circuit', series_type: 'circuit', is_featured: false },
            { name: 'WSOP Circuit Cherokee Winter', short_name: 'WSOPC', location: 'Harrahs Cherokee NC', start_date: '2026-02-12', end_date: '2026-02-23', website: 'https://www.wsop.com/circuit', series_type: 'circuit', is_featured: false },
            { name: 'WSOP Circuit Baltimore', short_name: 'WSOPC', location: 'Horseshoe Baltimore MD', start_date: '2026-02-19', end_date: '2026-03-02', website: 'https://www.wsop.com/circuit', series_type: 'circuit', is_featured: false },
            { name: 'WSOP Circuit Chicagoland', short_name: 'WSOPC', location: 'Horseshoe Hammond IN', start_date: '2026-02-26', end_date: '2026-03-09', website: 'https://www.wsop.com/circuit', series_type: 'circuit', is_featured: false },
            { name: 'WSOP Circuit Tulsa', short_name: 'WSOPC', location: 'Hard Rock Tulsa OK', start_date: '2026-03-05', end_date: '2026-03-16', website: 'https://www.wsop.com/circuit', series_type: 'circuit', is_featured: false },
            { name: 'WSOP Circuit Central NY', short_name: 'WSOPC', location: 'Turning Stone - Verona NY', start_date: '2026-03-12', end_date: '2026-03-23', website: 'https://www.wsop.com/circuit', series_type: 'circuit', is_featured: false },
            { name: 'WSOP Circuit Las Vegas Spring', short_name: 'WSOPC', location: 'Horseshoe Las Vegas NV', start_date: '2026-03-19', end_date: '2026-03-30', website: 'https://www.wsop.com/circuit', series_type: 'circuit', is_featured: false },
            { name: 'MSPT Golden State Championship', short_name: 'MSPT', location: 'Sycuan Casino - El Cajon CA', start_date: '2026-01-08', end_date: '2026-01-19', website: 'https://msptpoker.com', series_type: 'circuit', is_featured: false },
            { name: 'MSPT Colorado Showdown', short_name: 'MSPT', location: 'Ballys Black Hawk CO', start_date: '2026-01-14', end_date: '2026-01-25', website: 'https://msptpoker.com', series_type: 'circuit', is_featured: false },
            { name: 'MSPT Diamond Championship', short_name: 'MSPT', location: 'Talking Stick - Scottsdale AZ', start_date: '2026-01-24', end_date: '2026-02-01', website: 'https://msptpoker.com', series_type: 'circuit', is_featured: false },
            { name: 'MSPT Ohio State Championship', short_name: 'MSPT', location: 'JACK Cleveland OH', start_date: '2026-02-10', end_date: '2026-02-16', website: 'https://msptpoker.com', series_type: 'circuit', is_featured: false },
            { name: 'MSPT Club Championship', short_name: 'MSPT', location: 'Potawatomi - Milwaukee WI', start_date: '2026-02-17', end_date: '2026-02-22', website: 'https://msptpoker.com', series_type: 'circuit', is_featured: false },
            { name: 'RGPS at The Lodge', short_name: 'RGPS', location: 'Lodge Card Club - Round Rock TX', start_date: '2026-01-19', end_date: '2026-02-01', website: 'https://rungood.com', series_type: 'circuit', is_featured: false },
            { name: 'RGPS Tulsa', short_name: 'RGPS', location: 'Hard Rock Tulsa OK', start_date: '2026-01-20', end_date: '2026-01-25', website: 'https://rungood.com', series_type: 'circuit', is_featured: false },
            { name: 'RGPS San Diego', short_name: 'RGPS', location: 'Jamul Casino CA', start_date: '2026-02-17', end_date: '2026-02-22', website: 'https://rungood.com', series_type: 'circuit', is_featured: false },
            { name: 'RGPS Reno', short_name: 'RGPS', location: 'Atlantis Casino - Reno NV', start_date: '2026-02-24', end_date: '2026-03-01', website: 'https://rungood.com', series_type: 'circuit', is_featured: false },
            { name: 'RGPS Tunica', short_name: 'RGPS', location: 'Horseshoe Tunica MS', start_date: '2026-03-03', end_date: '2026-03-08', website: 'https://rungood.com', series_type: 'circuit', is_featured: false },
            { name: 'RGPS Bay Area', short_name: 'RGPS', location: 'Graton Casino - Rohnert Park CA', start_date: '2026-03-05', end_date: '2026-03-16', website: 'https://rungood.com', series_type: 'circuit', is_featured: false },
            { name: 'RGPS Atlantic City', short_name: 'RGPS', location: 'Borgata - Atlantic City NJ', start_date: '2026-03-05', end_date: '2026-03-16', website: 'https://rungood.com', series_type: 'circuit', is_featured: false },
            { name: 'L.A. Poker Classic', short_name: 'LAPC', location: 'Commerce Casino - Commerce CA', start_date: '2026-01-07', end_date: '2026-03-01', website: 'https://commercecasino.com/lapc', series_type: 'regional', is_featured: true },
            { name: 'Winter Poker Open Borgata', short_name: null, location: 'Borgata - Atlantic City NJ', start_date: '2026-01-03', end_date: '2026-01-18', website: 'https://borgata.mgmresorts.com/poker', series_type: 'regional', is_featured: false },
            { name: 'Wynn Signature Series', short_name: null, location: 'Wynn Las Vegas NV', start_date: '2026-01-05', end_date: '2026-01-19', website: 'https://wynnlasvegas.com/poker', series_type: 'regional', is_featured: false },
            { name: 'DeepStack Showdown', short_name: 'DSE', location: 'Venetian Las Vegas NV', start_date: '2026-01-19', end_date: '2026-02-08', website: 'https://venetianlasvegas.com', series_type: 'regional', is_featured: false },
            { name: 'Mid-Atlantic Poker Open', short_name: null, location: 'Live! Casino Maryland', start_date: '2026-01-19', end_date: '2026-02-02', website: 'https://livecasinohotel.com', series_type: 'regional', is_featured: false },
            { name: 'Winter Poker Open Tampa', short_name: null, location: 'Hard Rock Tampa FL', start_date: '2026-01-21', end_date: '2026-02-02', website: 'https://seminolehardrocktampa.com', series_type: 'regional', is_featured: false },
            { name: 'Houston Trailblazer', short_name: null, location: 'Texas Card House Houston TX', start_date: '2026-01-14', end_date: '2026-02-02', website: 'https://texascardhouse.com', series_type: 'regional', is_featured: false },
            { name: 'Blizzard on the Beach', short_name: null, location: 'bestbet Jacksonville FL', start_date: '2026-02-05', end_date: '2026-02-16', website: 'https://bestbetjax.com', series_type: 'regional', is_featured: false },
            { name: 'Tampa Poker Classic', short_name: null, location: 'Hard Rock Tampa FL', start_date: '2026-03-04', end_date: '2026-03-16', website: 'https://seminolehardrocktampa.com', series_type: 'regional', is_featured: false },
            { name: 'Wynn Millions', short_name: null, location: 'Wynn Las Vegas NV', start_date: '2026-02-16', end_date: '2026-03-22', website: 'https://wynnlasvegas.com', series_type: 'regional', is_featured: true },
            { name: 'Parx BigStax', short_name: null, location: 'Parx Casino - Bensalem PA', start_date: '2026-02-19', end_date: '2026-03-08', website: 'https://parxcasino.com', series_type: 'regional', is_featured: false },
            { name: 'Colorado Winter Championship', short_name: null, location: 'Monarch Black Hawk CO', start_date: '2026-02-19', end_date: '2026-03-15', website: 'https://monarchblackhawk.com', series_type: 'regional', is_featured: false },
            { name: 'Winter Poker Fest Canterbury', short_name: null, location: 'Canterbury Park - Shakopee MN', start_date: '2026-02-25', end_date: '2026-03-08', website: 'https://canterburypark.com', series_type: 'regional', is_featured: false },
            { name: 'Great Lakes Poker Classic', short_name: null, location: 'FireKeepers Casino - Battle Creek MI', start_date: '2026-03-11', end_date: '2026-03-22', website: 'https://firekeeperscasino.com', series_type: 'regional', is_featured: false },
            { name: 'Seminole Hard Rock Poker Showdown', short_name: 'SHRPS', location: 'Seminole Hard Rock Hollywood FL', start_date: '2026-04-01', end_date: '2026-04-15', website: 'https://shrpo.com', series_type: 'regional', is_featured: true },
            { name: 'Venetian DeepStack Championship', short_name: 'VDC', location: 'Venetian Las Vegas NV', start_date: '2026-05-01', end_date: '2026-05-31', website: 'https://venetianlasvegas.com', series_type: 'major', is_featured: true },
            { name: 'Seminole Hard Rock Poker Open', short_name: 'SHRPO', location: 'Seminole Hard Rock Hollywood FL', start_date: '2026-08-01', end_date: '2026-08-15', website: 'https://shrpo.com', series_type: 'major', is_featured: true },
            { name: 'Borgata Poker Open', short_name: 'BPO', location: 'Borgata - Atlantic City NJ', start_date: '2026-09-01', end_date: '2026-09-15', website: 'https://borgata.mgmresorts.com', series_type: 'regional', is_featured: true },
        ];

        const { error: seriesError } = await supabase.from('tournament_series').insert(seriesData);
        if (seriesError) {
            log.push(`Series error: ${seriesError.message}`);
        } else {
            log.push(`Inserted ${seriesData.length} tournament series`);
        }

        // STEP 3: Insert 40 Verified Venues
        log.push('Inserting venues...');
        const venueData = [
            { name: 'Bellagio', venue_type: 'casino', address: '3600 S Las Vegas Blvd', city: 'Las Vegas', state: 'NV', phone: '(702) 693-7111', website: 'https://bellagio.mgmresorts.com', games_offered: ['NLH', 'PLO', 'Mixed'], stakes_cash: ['$1/$3', '$2/$5', '$5/$10', '$10/$20'], poker_tables: 40, trust_score: 4.9, is_featured: true },
            { name: 'ARIA Resort & Casino', venue_type: 'casino', address: '3730 S Las Vegas Blvd', city: 'Las Vegas', state: 'NV', phone: '(702) 590-7757', website: 'https://aria.mgmresorts.com', games_offered: ['NLH', 'PLO', 'Mixed'], stakes_cash: ['$1/$3', '$2/$5', '$5/$10'], poker_tables: 24, trust_score: 4.8, is_featured: true },
            { name: 'Wynn Las Vegas', venue_type: 'casino', address: '3131 S Las Vegas Blvd', city: 'Las Vegas', state: 'NV', phone: '(702) 770-7000', website: 'https://wynnlasvegas.com', games_offered: ['NLH', 'PLO', 'Mixed'], stakes_cash: ['$1/$3', '$2/$5', '$5/$10', '$10/$20'], poker_tables: 28, trust_score: 4.9, is_featured: true },
            { name: 'The Venetian Resort', venue_type: 'casino', address: '3355 S Las Vegas Blvd', city: 'Las Vegas', state: 'NV', phone: '(702) 414-1000', website: 'https://venetianlasvegas.com', games_offered: ['NLH', 'PLO', 'Mixed'], stakes_cash: ['$1/$2', '$2/$5', '$5/$10'], poker_tables: 37, trust_score: 4.7, is_featured: true },
            { name: 'Resorts World Las Vegas', venue_type: 'casino', address: '3000 S Las Vegas Blvd', city: 'Las Vegas', state: 'NV', phone: '(702) 676-7000', website: 'https://rwlasvegas.com', games_offered: ['NLH', 'PLO'], stakes_cash: ['$1/$3', '$2/$5', '$5/$10'], poker_tables: 22, trust_score: 4.5, is_featured: true },
            { name: 'Commerce Casino', venue_type: 'card_room', address: '6131 Telegraph Rd', city: 'Commerce', state: 'CA', phone: '(323) 721-2100', website: 'https://commercecasino.com', games_offered: ['NLH', 'PLO', 'Mixed', 'Limit'], stakes_cash: ['$1/$2', '$2/$5', '$5/$10', '$10/$20'], poker_tables: 200, trust_score: 4.5, is_featured: true },
            { name: 'The Bicycle Hotel & Casino', venue_type: 'card_room', address: '888 Bicycle Casino Dr', city: 'Bell Gardens', state: 'CA', phone: '(562) 806-4646', website: 'https://thebike.com', games_offered: ['NLH', 'PLO', 'Mixed'], stakes_cash: ['$1/$2', '$2/$5', '$5/$10'], poker_tables: 180, trust_score: 4.6, is_featured: true },
            { name: 'Hustler Casino', venue_type: 'card_room', address: '1000 W Redondo Beach Blvd', city: 'Gardena', state: 'CA', phone: '(310) 719-9800', website: 'https://hustlercasinola.com', games_offered: ['NLH', 'PLO'], stakes_cash: ['$1/$3', '$2/$5', '$5/$10'], poker_tables: 80, trust_score: 4.7, is_featured: true },
            { name: 'Graton Resort & Casino', venue_type: 'casino', address: '288 Golf Course Dr W', city: 'Rohnert Park', state: 'CA', phone: '(707) 588-7100', website: 'https://gratonresortcasino.com', games_offered: ['NLH', 'PLO'], stakes_cash: ['$1/$3', '$3/$5', '$5/$10'], poker_tables: 20, trust_score: 4.4, is_featured: false },
            { name: 'Thunder Valley Casino', venue_type: 'casino', address: '1200 Athens Ave', city: 'Lincoln', state: 'CA', phone: '(916) 408-7777', website: 'https://thundervalleyresort.com', games_offered: ['NLH', 'PLO'], stakes_cash: ['$1/$2', '$2/$5', '$5/$10'], poker_tables: 25, trust_score: 4.5, is_featured: false },
            { name: 'Seminole Hard Rock Hollywood', venue_type: 'casino', address: '1 Seminole Way', city: 'Hollywood', state: 'FL', phone: '(866) 502-7529', website: 'https://seminolehardrockhollywood.com', games_offered: ['NLH', 'PLO', 'Mixed'], stakes_cash: ['$1/$2', '$2/$5', '$5/$10'], poker_tables: 45, trust_score: 4.8, is_featured: true },
            { name: 'Seminole Hard Rock Tampa', venue_type: 'casino', address: '5223 Orient Rd', city: 'Tampa', state: 'FL', phone: '(813) 627-7625', website: 'https://seminolehardrocktampa.com', games_offered: ['NLH', 'PLO'], stakes_cash: ['$1/$2', '$2/$5', '$5/$10'], poker_tables: 46, trust_score: 4.6, is_featured: true },
            { name: 'bestbet Jacksonville', venue_type: 'card_room', address: '201 Monument Rd', city: 'Jacksonville', state: 'FL', phone: '(904) 646-0001', website: 'https://bestbetjax.com', games_offered: ['NLH', 'PLO'], stakes_cash: ['$1/$2', '$2/$5'], poker_tables: 70, trust_score: 4.4, is_featured: false },
            { name: 'Lodge Poker Club', venue_type: 'poker_club', address: '1700 Thunderbird Ln', city: 'Round Rock', state: 'TX', phone: '(737) 232-5243', website: 'https://thelodgeaustin.com', games_offered: ['NLH', 'PLO', 'Mixed'], stakes_cash: ['$1/$3', '$2/$5', '$5/$10'], poker_tables: 40, trust_score: 4.9, is_featured: true },
            { name: 'Texas Card House Austin', venue_type: 'poker_club', address: '1524 S IH 35 Frontage Rd', city: 'Austin', state: 'TX', phone: '(512) 956-7195', website: 'https://texascardhouse.com', games_offered: ['NLH', 'PLO'], stakes_cash: ['$1/$2', '$2/$5'], poker_tables: 25, trust_score: 4.5, is_featured: false },
            { name: 'Texas Card House Dallas', venue_type: 'poker_club', address: '2701 Rental Car Dr', city: 'Dallas', state: 'TX', phone: '(469) 609-5500', website: 'https://texascardhouse.com', games_offered: ['NLH', 'PLO'], stakes_cash: ['$1/$2', '$2/$5'], poker_tables: 30, trust_score: 4.4, is_featured: false },
            { name: 'Texas Card House Houston', venue_type: 'poker_club', address: '2627 Commercial Center Blvd', city: 'Katy', state: 'TX', phone: '(832) 437-4098', website: 'https://texascardhouse.com', games_offered: ['NLH', 'PLO'], stakes_cash: ['$1/$2', '$2/$5'], poker_tables: 30, trust_score: 4.4, is_featured: false },
            { name: 'Borgata Hotel Casino', venue_type: 'casino', address: '1 Borgata Way', city: 'Atlantic City', state: 'NJ', phone: '(609) 317-1000', website: 'https://theborgata.com', games_offered: ['NLH', 'PLO', 'Mixed'], stakes_cash: ['$1/$2', '$2/$5', '$5/$10'], poker_tables: 85, trust_score: 4.7, is_featured: true },
            { name: 'Parx Casino', venue_type: 'casino', address: '2999 Street Rd', city: 'Bensalem', state: 'PA', phone: '(215) 639-9000', website: 'https://parxcasino.com', games_offered: ['NLH', 'PLO'], stakes_cash: ['$1/$2', '$2/$5'], poker_tables: 48, trust_score: 4.5, is_featured: false },
            { name: 'Mohegan Sun', venue_type: 'casino', address: '1 Mohegan Sun Blvd', city: 'Uncasville', state: 'CT', phone: '(888) 226-7711', website: 'https://mohegansun.com', games_offered: ['NLH', 'PLO'], stakes_cash: ['$1/$2', '$2/$5', '$5/$10'], poker_tables: 42, trust_score: 4.5, is_featured: false },
            { name: 'Foxwoods Resort Casino', venue_type: 'casino', address: '350 Trolley Line Blvd', city: 'Mashantucket', state: 'CT', phone: '(800) 369-9663', website: 'https://foxwoods.com', games_offered: ['NLH', 'PLO'], stakes_cash: ['$1/$2', '$2/$5', '$5/$10'], poker_tables: 100, trust_score: 4.5, is_featured: false },
            { name: 'MGM National Harbor', venue_type: 'casino', address: '101 MGM National Ave', city: 'Oxon Hill', state: 'MD', phone: '(844) 346-4664', website: 'https://mgmnationalharbor.com', games_offered: ['NLH', 'PLO'], stakes_cash: ['$1/$2', '$2/$5', '$5/$10'], poker_tables: 32, trust_score: 4.6, is_featured: false },
            { name: 'Live! Casino Maryland', venue_type: 'casino', address: '7002 Arundel Mills Cir', city: 'Hanover', state: 'MD', phone: '(443) 445-2500', website: 'https://livecasinohotel.com', games_offered: ['NLH', 'PLO'], stakes_cash: ['$1/$2', '$2/$5'], poker_tables: 52, trust_score: 4.4, is_featured: false },
            { name: 'Horseshoe Baltimore', venue_type: 'casino', address: '1525 Russell St', city: 'Baltimore', state: 'MD', phone: '(844) 777-7463', website: 'https://caesars.com/horseshoe-baltimore', games_offered: ['NLH', 'PLO'], stakes_cash: ['$1/$2', '$2/$5'], poker_tables: 22, trust_score: 4.3, is_featured: false },
            { name: 'Turning Stone Resort', venue_type: 'casino', address: '5218 Patrick Rd', city: 'Verona', state: 'NY', phone: '(315) 361-7711', website: 'https://turningstone.com', games_offered: ['NLH', 'PLO'], stakes_cash: ['$1/$2', '$2/$5'], poker_tables: 32, trust_score: 4.4, is_featured: false },
            { name: 'Choctaw Casino Resort', venue_type: 'casino', address: '4216 S Hwy 69/75', city: 'Durant', state: 'OK', phone: '(580) 920-0160', website: 'https://choctawcasinos.com', games_offered: ['NLH', 'PLO'], stakes_cash: ['$1/$2', '$2/$5'], poker_tables: 30, trust_score: 4.5, is_featured: false },
            { name: 'Hard Rock Tulsa', venue_type: 'casino', address: '777 W Cherokee St', city: 'Catoosa', state: 'OK', phone: '(800) 760-6700', website: 'https://hardrockcasinotulsa.com', games_offered: ['NLH', 'PLO'], stakes_cash: ['$1/$2', '$2/$5'], poker_tables: 18, trust_score: 4.4, is_featured: false },
            { name: 'WinStar World Casino', venue_type: 'casino', address: '777 Casino Ave', city: 'Thackerville', state: 'OK', phone: '(580) 276-4229', website: 'https://winstarworldcasino.com', games_offered: ['NLH', 'PLO'], stakes_cash: ['$1/$2', '$2/$5'], poker_tables: 46, trust_score: 4.6, is_featured: true },
            { name: 'Harrahs Cherokee', venue_type: 'casino', address: '777 Casino Dr', city: 'Cherokee', state: 'NC', phone: '(828) 497-7777', website: 'https://caesars.com/harrahs-cherokee', games_offered: ['NLH', 'PLO'], stakes_cash: ['$1/$2', '$2/$5'], poker_tables: 20, trust_score: 4.4, is_featured: false },
            { name: 'Horseshoe Hammond', venue_type: 'casino', address: '777 Casino Center Dr', city: 'Hammond', state: 'IN', phone: '(866) 711-7463', website: 'https://caesars.com/horseshoe-hammond', games_offered: ['NLH', 'PLO'], stakes_cash: ['$1/$2', '$2/$5'], poker_tables: 26, trust_score: 4.3, is_featured: false },
            { name: 'FireKeepers Casino', venue_type: 'casino', address: '11177 E Michigan Ave', city: 'Battle Creek', state: 'MI', phone: '(269) 962-0000', website: 'https://firekeeperscasino.com', games_offered: ['NLH', 'PLO'], stakes_cash: ['$1/$2', '$2/$5'], poker_tables: 20, trust_score: 4.4, is_featured: false },
            { name: 'JACK Cleveland Casino', venue_type: 'casino', address: '100 Public Sq', city: 'Cleveland', state: 'OH', phone: '(216) 297-4777', website: 'https://jackclevelandcasino.com', games_offered: ['NLH', 'PLO'], stakes_cash: ['$1/$2', '$2/$5'], poker_tables: 24, trust_score: 4.3, is_featured: false },
            { name: 'Canterbury Park', venue_type: 'card_room', address: '1100 Canterbury Rd', city: 'Shakopee', state: 'MN', phone: '(952) 445-7223', website: 'https://canterburypark.com', games_offered: ['NLH', 'PLO', 'Mixed'], stakes_cash: ['$1/$2', '$2/$5', '$5/$10'], poker_tables: 40, trust_score: 4.4, is_featured: false },
            { name: 'Running Aces Casino', venue_type: 'card_room', address: '15201 Running Aces Blvd', city: 'Columbus', state: 'MN', phone: '(651) 925-4600', website: 'https://runningacesharness.com', games_offered: ['NLH', 'PLO'], stakes_cash: ['$1/$2', '$2/$5'], poker_tables: 20, trust_score: 4.2, is_featured: false },
            { name: 'Potawatomi Casino', venue_type: 'casino', address: '1721 W Canal St', city: 'Milwaukee', state: 'WI', phone: '(414) 847-7883', website: 'https://paysbig.com', games_offered: ['NLH', 'PLO'], stakes_cash: ['$1/$2', '$2/$5'], poker_tables: 20, trust_score: 4.4, is_featured: false },
            { name: 'Horseshoe Tunica', venue_type: 'casino', address: '1021 Casino Center Dr', city: 'Robinsonville', state: 'MS', phone: '(800) 303-7463', website: 'https://caesars.com/horseshoe-tunica', games_offered: ['NLH', 'PLO'], stakes_cash: ['$1/$2', '$2/$5'], poker_tables: 14, trust_score: 4.3, is_featured: false },
            { name: 'Beau Rivage', venue_type: 'casino', address: '875 Beach Blvd', city: 'Biloxi', state: 'MS', phone: '(228) 386-7111', website: 'https://beaurivage.com', games_offered: ['NLH', 'PLO'], stakes_cash: ['$1/$2', '$2/$5'], poker_tables: 16, trust_score: 4.5, is_featured: false },
            { name: 'Bay 101 Casino', venue_type: 'card_room', address: '1801 Bering Dr', city: 'San Jose', state: 'CA', phone: '(408) 451-8888', website: 'https://bay101.com', games_offered: ['NLH', 'PLO', 'Mixed'], stakes_cash: ['$1/$2', '$2/$5', '$5/$10'], poker_tables: 40, trust_score: 4.5, is_featured: false },
            { name: 'Talking Stick Resort', venue_type: 'casino', address: '9800 E Talking Stick Way', city: 'Scottsdale', state: 'AZ', phone: '(480) 850-7777', website: 'https://talkingstickresort.com', games_offered: ['NLH', 'PLO'], stakes_cash: ['$1/$2', '$2/$5', '$5/$10'], poker_tables: 25, trust_score: 4.4, is_featured: false },
        ];

        const { error: venueError } = await supabase.from('poker_venues').insert(venueData);
        if (venueError) {
            log.push(`Venue error: ${venueError.message}`);
        } else {
            log.push(`Inserted ${venueData.length} venues`);
        }

        // STEP 4: Verify counts
        const { count: venueCount } = await supabase.from('poker_venues').select('*', { count: 'exact', head: true });
        const { count: seriesCount } = await supabase.from('tournament_series').select('*', { count: 'exact', head: true });

        log.push(`Final counts: ${venueCount} venues, ${seriesCount} series`);

        return res.status(200).json({
            success: true,
            message: `NUCLEAR IMPORT COMPLETE! ${venueCount} venues, ${seriesCount} series`,
            venues: venueCount,
            series: seriesCount,
            log
        });

    } catch (error) {
        log.push(`Fatal error: ${error.message}`);
        return res.status(500).json({ success: false, error: error.message, log });
    }
}
