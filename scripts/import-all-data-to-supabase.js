#!/usr/bin/env node
/**
 * Automated Supabase Data Import Script
 * Imports all 483 venues and 115 tournament series
 *
 * Usage: node scripts/import-all-data-to-supabase.js
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

require('dotenv').config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('ERROR: Missing Supabase credentials in .env.local');
    console.error('Required: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function executeSqlFile(filePath, description) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`IMPORTING: ${description}`);
    console.log(`File: ${filePath}`);
    console.log('='.repeat(60));

    if (!fs.existsSync(filePath)) {
        console.error(`ERROR: File not found: ${filePath}`);
        return false;
    }

    const sql = fs.readFileSync(filePath, 'utf8');

    try {
        const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

        if (error) {
            // If RPC doesn't exist, try direct REST API
            console.log('RPC not available, using direct SQL execution...');

            const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': SUPABASE_SERVICE_KEY,
                    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
                },
                body: JSON.stringify({ sql_query: sql })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${await response.text()}`);
            }
        }

        console.log(`SUCCESS: ${description} imported successfully!`);
        return true;

    } catch (error) {
        console.error(`ERROR executing SQL: ${error.message}`);
        console.log('\nTrying alternative method with pg...');
        return await executeSqlWithPg(sql, description);
    }
}

async function executeSqlWithPg(sql, description) {
    try {
        // Parse the connection string from Supabase URL
        const dbUrl = SUPABASE_URL.replace('https://', '').split('.')[0];
        const connectionString = `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD || SUPABASE_SERVICE_KEY}@db.${dbUrl}.supabase.co:5432/postgres`;

        // Try using the Supabase Management API
        const response = await fetch(`${SUPABASE_URL}/rest/v1/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_SERVICE_KEY,
                'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
                'Prefer': 'return=representation'
            }
        });

        console.log('Alternative method not available. Please run SQL manually.');
        console.log('\nCopy the SQL from:');
        console.log(`  ${path.resolve(sql.slice(0, 100).includes('venue') ?
            'supabase/imports/import-484-venues.sql' :
            'supabase/imports/import-115-series.sql')}`);
        return false;

    } catch (err) {
        console.error('Alternative method failed:', err.message);
        return false;
    }
}

async function importViaInserts() {
    console.log('\n' + '='.repeat(60));
    console.log('DIRECT DATA IMPORT VIA SUPABASE CLIENT');
    console.log('='.repeat(60));

    // Import Tournament Series
    console.log('\n[1/2] Importing 115 Tournament Series...');

    const seriesData = [
        { name: '2026 Uncork Series', short_name: null, location: 'Thunder Valley Casino Resort - Lincoln CA', start_date: '2026-12-31', end_date: '2026-01-12', website: 'https://www.cardplayer.com/poker-tournaments/1622347-2026-uncork-series', series_type: 'regional', is_featured: false },
        { name: '2026 WSOP Circuit – Las Vegas (Winter)', short_name: 'WSOPC', location: 'Planet Hollywood - Las Vegas NV', start_date: '2026-01-01', end_date: '2026-01-12', website: 'https://www.wsop.com/circuit', series_type: 'circuit', is_featured: false },
        { name: '2026 New Year Tournament', short_name: null, location: "Ocean's Eleven Casino - Oceanside CA", start_date: '2026-01-01', end_date: '2026-01-01', website: 'https://www.cardplayer.com/poker-tournaments/1628443-2026-new-year-tournament', series_type: 'regional', is_featured: false },
        { name: '2026 Hollywood Poker Open', short_name: null, location: 'Hollywood Casino at Kansas Speedway - Kansas City KS', start_date: '2026-01-02', end_date: '2026-01-04', website: 'https://www.cardplayer.com/poker-tournaments/1627300-2026-hollywood-poker-open', series_type: 'regional', is_featured: false },
        { name: '2026 Winter Flames of Fortune Tournament', short_name: null, location: 'FireKeepers Casino - Battle Creek MI', start_date: '2026-01-03', end_date: '2026-01-18', website: 'https://firekeeperscasino.com/tournaments', series_type: 'regional', is_featured: false },
        { name: '2026 Winter Poker Open', short_name: null, location: 'Borgata Hotel Casino - Atlantic City NJ', start_date: '2026-01-03', end_date: '2026-01-18', website: 'https://borgata.mgmresorts.com/poker', series_type: 'regional', is_featured: false },
        { name: '2026 Wynn Signature Series', short_name: null, location: 'Wynn Las Vegas - Las Vegas NV', start_date: '2026-01-05', end_date: '2026-01-19', website: 'https://wynnlasvegas.com/poker', series_type: 'regional', is_featured: false },
        { name: '2026 PGT Last Chance Series', short_name: 'PGT', location: 'ARIA PokerGO Studio - Las Vegas NV', start_date: '2026-01-05', end_date: '2026-01-10', website: 'https://pokergo.com/tour', series_type: 'major', is_featured: true },
        { name: "2026 January's Even Bigger One", short_name: null, location: 'Texas Card House Dallas - Dallas TX', start_date: '2026-01-05', end_date: '2026-01-05', website: 'https://texascardhouse.com/tournaments', series_type: 'regional', is_featured: false },
        { name: '2026 WPT Lucky Hearts Poker Open', short_name: 'WPT', location: 'Seminole Hard Rock Hollywood - Hollywood FL', start_date: '2026-01-06', end_date: '2026-01-20', website: 'https://worldpokertour.com/event/wpt-lucky-hearts-poker-open', series_type: 'major', is_featured: true },
        { name: '2026 WSOP Circuit – Choctaw (Winter)', short_name: 'WSOPC', location: 'Choctaw Casino Resort - Durant OK', start_date: '2026-01-07', end_date: '2026-01-19', website: 'https://www.wsop.com/circuit', series_type: 'circuit', is_featured: false },
        { name: '2026 L.A. Poker Classic', short_name: null, location: 'Commerce Casino - Commerce CA', start_date: '2026-01-07', end_date: '2026-03-01', website: 'https://commercecasino.com/lapc', series_type: 'regional', is_featured: false },
        { name: '2026 Grand Poker Series Winter Classic', short_name: null, location: 'Golden Nugget - Las Vegas NV', start_date: '2026-01-07', end_date: '2026-01-15', website: 'https://goldennugget.com/las-vegas/poker-tournaments', series_type: 'regional', is_featured: false },
        { name: '2026 MSPT Golden State Poker Championship', short_name: 'MSPT', location: 'Sycuan Casino - El Cajon CA', start_date: '2026-01-08', end_date: '2026-01-19', website: 'https://msptpoker.com', series_type: 'circuit', is_featured: false },
        { name: '2026 Winter Poker Meltdown', short_name: null, location: 'Turning Stone Resort - Verona NY', start_date: '2026-01-09', end_date: '2026-01-11', website: 'https://turningstone.com', series_type: 'regional', is_featured: false },
        { name: '2026 MSPT Colorado Showdown Series', short_name: 'MSPT', location: "Bally's Black Hawk - Black Hawk CO", start_date: '2026-01-14', end_date: '2026-01-25', website: 'https://msptpoker.com', series_type: 'circuit', is_featured: false },
        { name: '2026 Houston Trailblazer', short_name: null, location: 'Texas Card House Houston - Houston TX', start_date: '2026-01-14', end_date: '2026-02-02', website: 'https://texascardhouse.com/tournaments', series_type: 'regional', is_featured: false },
        { name: '2026 WSOP Circuit – Thunder Valley', short_name: 'WSOPC', location: 'Thunder Valley Casino Resort - Lincoln CA', start_date: '2026-01-15', end_date: '2026-01-26', website: 'https://www.wsop.com/circuit', series_type: 'circuit', is_featured: false },
        { name: "Mid-Atlantic Poker Open '26", short_name: null, location: 'Live! Casino Maryland - Hanover MD', start_date: '2026-01-19', end_date: '2026-02-02', website: 'https://maryland.livecasinohotel.com/mapo', series_type: 'regional', is_featured: false },
        { name: 'DeepStack Showdown (Jan/Feb) 2026', short_name: 'DSE', location: 'Venetian Las Vegas - Las Vegas NV', start_date: '2026-01-19', end_date: '2026-02-08', website: 'https://venetianlasvegas.com/deepstack-showdown', series_type: 'regional', is_featured: false },
        { name: 'RUNGOOD Poker Series at The Lodge', short_name: 'RGPS', location: 'Lodge Card Club - Round Rock TX', start_date: '2026-01-19', end_date: '2026-02-01', website: 'https://rungood.com', series_type: 'circuit', is_featured: false },
        { name: "Jan '26 $200K GTD Multi Flight Final 50", short_name: null, location: "Harrah's Pompano - Pompano Beach FL", start_date: '2026-01-20', end_date: '2026-01-25', website: 'https://pokeratlas.com', series_type: 'regional', is_featured: false },
        { name: 'RGPS Passport Season Tulsa', short_name: 'RGPS', location: 'Hard Rock Tulsa - Catoosa OK', start_date: '2026-01-20', end_date: '2026-01-25', website: 'https://rungood.com', series_type: 'circuit', is_featured: false },
        { name: 'Resolution Run $75000 GTD', short_name: null, location: 'OcalaBets - Ocala FL', start_date: '2026-01-20', end_date: '2026-01-25', website: 'https://pokeratlas.com', series_type: 'regional', is_featured: false },
        { name: '2026 Winter Poker Open (Tampa)', short_name: null, location: 'Hard Rock Tampa - Tampa FL', start_date: '2026-01-21', end_date: '2026-02-02', website: 'https://seminolehardrocktampa.com', series_type: 'regional', is_featured: false },
        { name: '2026 Big Stack Avalanche', short_name: null, location: 'Running Aces - Forest Lake MN', start_date: '2026-01-21', end_date: '2026-01-25', website: 'https://runningacesharness.com', series_type: 'regional', is_featured: false },
        { name: "$25K Multi-Flight - Jan '26", short_name: null, location: 'Hard Rock Bristol - Bristol VA', start_date: '2026-01-21', end_date: '2026-01-25', website: 'https://pokeratlas.com', series_type: 'regional', is_featured: false },
        { name: '2025-26 WSOP Circuit Tunica (Winter)', short_name: 'WSOPC', location: 'Horseshoe Tunica - Robinsonville MS', start_date: '2026-01-22', end_date: '2026-02-02', website: 'https://www.wsop.com/circuit', series_type: 'circuit', is_featured: false },
        { name: 'Elite Poker Lounge 2 Year Anniversary 15K GTD', short_name: null, location: 'Elite Poker Lounge - McAllen TX', start_date: '2026-01-22', end_date: '2026-01-25', website: 'https://pokeratlas.com', series_type: 'regional', is_featured: false },
        { name: "$50K Gtd Quarterly Multi-Flight - Jan '26", short_name: null, location: 'Hard Rock Cincinnati - Cincinnati OH', start_date: '2026-01-23', end_date: '2026-01-25', website: 'https://pokeratlas.com', series_type: 'regional', is_featured: false },
        { name: 'Portland Meadows Mixed Game Festival', short_name: null, location: 'Portland Meadows - Portland OR', start_date: '2026-01-23', end_date: '2026-01-25', website: 'https://pokeratlas.com', series_type: 'regional', is_featured: false },
        { name: 'Weekend Multi-Flight', short_name: null, location: 'Horseshoe Indianapolis - Shelbyville IN', start_date: '2026-01-23', end_date: '2026-01-25', website: 'https://pokeratlas.com', series_type: 'regional', is_featured: false },
        { name: "MSPT '26 Diamond Poker Championship", short_name: 'MSPT', location: 'Talking Stick Resort - Scottsdale AZ', start_date: '2026-01-24', end_date: '2026-02-01', website: 'https://msptpoker.com', series_type: 'circuit', is_featured: false },
        { name: 'PGT Kickoff', short_name: 'PGT', location: 'ARIA - Las Vegas NV', start_date: '2026-01-26', end_date: '2026-01-31', website: 'https://pokergo.com/tour', series_type: 'major', is_featured: true },
        { name: "$100K Bankroll Booster - Jan '26", short_name: null, location: 'Live! Casino Philadelphia - Philadelphia PA', start_date: '2026-01-28', end_date: '2026-02-01', website: 'https://pokeratlas.com', series_type: 'regional', is_featured: false },
        { name: "The Pure Grind Series: Super Seat Re-Up Edition - Jan '26", short_name: null, location: 'Borgata - Atlantic City NJ', start_date: '2026-01-28', end_date: '2026-02-01', website: 'https://pokeratlas.com', series_type: 'regional', is_featured: false },
        { name: '2026 Daytona Beach Winter Deep Stack', short_name: null, location: 'Daytona Beach Racing - Daytona Beach FL', start_date: '2026-01-28', end_date: '2026-02-01', website: 'https://pokeratlas.com', series_type: 'regional', is_featured: false },
        { name: '2025-26 WSOP Circuit Pompano', short_name: 'WSOPC', location: "Harrah's Pompano - Pompano Beach FL", start_date: '2026-01-29', end_date: '2026-02-09', website: 'https://www.wsop.com/circuit', series_type: 'circuit', is_featured: false },
        { name: "The Titan - Jan '26", short_name: null, location: 'CCG Poker - Tinley Park IL', start_date: '2026-01-30', end_date: '2026-02-01', website: 'https://pokeratlas.com', series_type: 'regional', is_featured: false },
        { name: 'Southern Poker Shuffle Winter Series', short_name: null, location: 'Caesars Virginia - Danville VA', start_date: '2026-02-01', end_date: '2026-02-07', website: 'https://pokeratlas.com', series_type: 'regional', is_featured: false },
        { name: '2026 PGT Mixed Games', short_name: 'PGT', location: 'ARIA - Las Vegas NV', start_date: '2026-02-03', end_date: '2026-02-11', website: 'https://pokergo.com/tour', series_type: 'major', is_featured: true },
        { name: 'Cheap & Deep NLH', short_name: null, location: 'Canterbury Park - Shakopee MN', start_date: '2026-02-03', end_date: '2026-02-07', website: 'https://canterburypark.com', series_type: 'regional', is_featured: false },
        { name: '2026 Winter Poker Open Champions Club', short_name: null, location: 'Champions Club - Houston TX', start_date: '2026-02-04', end_date: '2026-02-17', website: 'https://pokeratlas.com', series_type: 'regional', is_featured: false },
        { name: 'Escalator X Series', short_name: null, location: 'Seminole Hard Rock Hollywood - Ft Lauderdale FL', start_date: '2026-02-04', end_date: '2026-03-08', website: 'https://seminolehardrockhollywood.com', series_type: 'regional', is_featured: false },
        { name: "Winter Chill '26", short_name: null, location: 'Mohegan Sun - Uncasville CT', start_date: '2026-02-05', end_date: '2026-02-07', website: 'https://mohegansun.com', series_type: 'regional', is_featured: false },
        { name: 'Blizzard on the Beach 2026', short_name: null, location: 'bestbet Jacksonville - Jacksonville FL', start_date: '2026-02-05', end_date: '2026-02-16', website: 'https://bestbetjax.com', series_type: 'regional', is_featured: false },
        { name: 'DSE I WPT Venetian LV Spring Festival', short_name: 'WPT', location: 'Venetian Las Vegas - Las Vegas NV', start_date: '2026-02-09', end_date: '2026-02-24', website: 'https://venetianlasvegas.com', series_type: 'major', is_featured: true },
        { name: "MSPT '26 Ohio State Poker Championship", short_name: 'MSPT', location: 'JACK Cleveland - Cleveland OH', start_date: '2026-02-10', end_date: '2026-02-16', website: 'https://msptpoker.com', series_type: 'circuit', is_featured: false },
        { name: "Potomac Winter Poker Open '26", short_name: null, location: 'MGM National Harbor - Oxon Hill MD', start_date: '2026-02-11', end_date: '2026-02-23', website: 'https://mgmnationalharbor.com', series_type: 'regional', is_featured: false },
        { name: 'MIDWINTER POKER CLASSIC 2026', short_name: null, location: 'Desert Bluffs Poker - Kennewick WA', start_date: '2026-02-11', end_date: '2026-02-16', website: 'https://pokeratlas.com', series_type: 'regional', is_featured: false },
        { name: 'PGT Super High Roller Bowl Mixed Games', short_name: 'PGT', location: 'ARIA - Las Vegas NV', start_date: '2026-02-12', end_date: '2026-02-14', website: 'https://pokergo.com/tour', series_type: 'major', is_featured: true },
        { name: "Presidents' Day Tournament", short_name: null, location: 'Graton Casino - Rohnert Park CA', start_date: '2026-02-12', end_date: '2026-02-16', website: 'https://gratonresortcasino.com', series_type: 'regional', is_featured: false },
        { name: '2025-26 WSOP Circuit Cherokee (Winter)', short_name: 'WSOPC', location: "Harrah's Cherokee - Cherokee NC", start_date: '2026-02-12', end_date: '2026-02-23', website: 'https://www.wsop.com/circuit', series_type: 'circuit', is_featured: false },
        { name: '$100K GTD Spades Baytown', short_name: null, location: 'Spades Poker House - Baytown TX', start_date: '2026-02-13', end_date: '2026-02-21', website: 'https://pokeratlas.com', series_type: 'regional', is_featured: false },
        { name: 'Trailblazer Tour Season 2', short_name: null, location: 'Texas Card House Dallas - Dallas TX', start_date: '2026-02-15', end_date: '2026-03-02', website: 'https://texascardhouse.com', series_type: 'regional', is_featured: false },
        { name: '2026 Wynn Millions', short_name: null, location: 'Wynn Las Vegas - Las Vegas NV', start_date: '2026-02-16', end_date: '2026-03-22', website: 'https://wynnlasvegas.com/wynn-millions', series_type: 'regional', is_featured: false },
        { name: "MSPT '26 Club Poker Championship", short_name: 'MSPT', location: 'Potawatomi Casino - Milwaukee WI', start_date: '2026-02-17', end_date: '2026-02-22', website: 'https://msptpoker.com', series_type: 'circuit', is_featured: false },
        { name: 'RGPS Passport Season San Diego', short_name: 'RGPS', location: 'Jamul Casino - Jamul CA', start_date: '2026-02-17', end_date: '2026-02-22', website: 'https://rungood.com', series_type: 'circuit', is_featured: false },
        { name: 'Winter Main Event', short_name: null, location: 'Casino Niagara - Niagara Falls ON', start_date: '2026-02-17', end_date: '2026-02-20', website: 'https://pokeratlas.com', series_type: 'regional', is_featured: false },
        { name: 'February 30K GTD', short_name: null, location: 'Downstream Casino - Quapaw OK', start_date: '2026-02-19', end_date: '2026-02-22', website: 'https://pokeratlas.com', series_type: 'regional', is_featured: false },
        { name: '2025-26 WSOP Circuit Baltimore/DC', short_name: 'WSOPC', location: 'Horseshoe Baltimore - Baltimore MD', start_date: '2026-02-19', end_date: '2026-03-02', website: 'https://www.wsop.com/circuit', series_type: 'circuit', is_featured: false },
        { name: 'Parx BigStax XXXVII', short_name: null, location: 'Parx Casino - Bensalem PA', start_date: '2026-02-19', end_date: '2026-03-08', website: 'https://parxcasino.com', series_type: 'regional', is_featured: false },
        { name: "Roughrider Poker Tour '26 - Signature Poker Series", short_name: null, location: 'Sky Dancer Casino - Belcourt ND', start_date: '2026-02-19', end_date: '2026-02-22', website: 'https://roughriderpokertour.com', series_type: 'regional', is_featured: false },
        { name: '2026 Colorado Winter Poker Championship', short_name: null, location: 'Monarch Black Hawk - Black Hawk CO', start_date: '2026-02-19', end_date: '2026-03-15', website: 'https://monarchblackhawk.com', series_type: 'regional', is_featured: false },
        { name: 'Rising Star 2026', short_name: null, location: 'Casino M8trix - San Jose CA', start_date: '2026-02-20', end_date: '2026-03-02', website: 'https://pokeratlas.com', series_type: 'regional', is_featured: false },
        { name: '2026 Lone Butte Seniors', short_name: null, location: 'Gila River Lone Butte - Chandler AZ', start_date: '2026-02-20', end_date: '2026-02-22', website: 'https://pokeratlas.com', series_type: 'regional', is_featured: false },
        { name: 'RGPS Passport Season Reno', short_name: 'RGPS', location: 'Atlantis Casino - Reno NV', start_date: '2026-02-24', end_date: '2026-03-01', website: 'https://rungood.com', series_type: 'circuit', is_featured: false },
        { name: '2026 Winter Poker Fest', short_name: null, location: 'Canterbury Park - Shakopee MN', start_date: '2026-02-25', end_date: '2026-03-08', website: 'https://canterburypark.com', series_type: 'regional', is_featured: false },
        { name: '2026 Ark-La-Tex Series', short_name: null, location: 'Horseshoe Bossier City - Bossier City LA', start_date: '2026-02-26', end_date: '2026-03-08', website: 'https://pokeratlas.com', series_type: 'regional', is_featured: false },
        { name: '2025-26 WSOP Circuit Chicagoland (Winter)', short_name: 'WSOPC', location: 'Horseshoe Hammond - Hammond IN', start_date: '2026-02-26', end_date: '2026-03-09', website: 'https://www.wsop.com/circuit', series_type: 'circuit', is_featured: false },
        { name: '2026 Barrel Series', short_name: null, location: 'The Mint - Franklin KY', start_date: '2026-02-26', end_date: '2026-03-09', website: 'https://pokeratlas.com', series_type: 'regional', is_featured: false },
        { name: 'Spring Break Power Week 2026', short_name: null, location: 'Playground Poker - Kahnawake QC', start_date: '2026-02-26', end_date: '2026-03-08', website: 'https://playgroundpoker.ca', series_type: 'regional', is_featured: false },
        { name: 'RGPS Passport Season Tunica', short_name: 'RGPS', location: 'Horseshoe Tunica - Robinsonville MS', start_date: '2026-03-03', end_date: '2026-03-08', website: 'https://rungood.com', series_type: 'circuit', is_featured: false },
        { name: '2026 Tampa Poker Classic', short_name: null, location: 'Hard Rock Tampa - Tampa FL', start_date: '2026-03-04', end_date: '2026-03-16', website: 'https://seminolehardrocktampa.com', series_type: 'regional', is_featured: false },
        { name: '2025-26 WSOP Circuit Tulsa', short_name: 'WSOPC', location: 'Hard Rock Tulsa - Catoosa OK', start_date: '2026-03-05', end_date: '2026-03-16', website: 'https://www.wsop.com/circuit', series_type: 'circuit', is_featured: false },
        { name: 'RGPS Passport Season Bay Area', short_name: 'RGPS', location: 'Graton Casino - Rohnert Park CA', start_date: '2026-03-05', end_date: '2026-03-16', website: 'https://rungood.com', series_type: 'circuit', is_featured: false },
        { name: 'Roughrider Poker Tour Grand River Poker Series', short_name: null, location: 'Grand River Casino - Mobridge SD', start_date: '2026-03-05', end_date: '2026-03-08', website: 'https://roughriderpokertour.com', series_type: 'regional', is_featured: false },
        { name: 'RGPS Passport Season Atlantic City', short_name: 'RGPS', location: 'Borgata - Atlantic City NJ', start_date: '2026-03-05', end_date: '2026-03-16', website: 'https://rungood.com', series_type: 'circuit', is_featured: false },
        { name: 'RGPS Passport Season Iowa', short_name: 'RGPS', location: 'Horseshoe Council Bluffs - Council Bluffs IA', start_date: '2026-03-10', end_date: '2026-03-15', website: 'https://rungood.com', series_type: 'circuit', is_featured: false },
        { name: "MSPT '26 Grand Falls - Spring", short_name: 'MSPT', location: 'Grand Falls Casino - Larchwood IA', start_date: '2026-03-11', end_date: '2026-03-15', website: 'https://msptpoker.com', series_type: 'circuit', is_featured: false },
        { name: '2026 Great Lakes Poker Classic', short_name: null, location: 'FireKeepers Casino - Battle Creek MI', start_date: '2026-03-11', end_date: '2026-03-22', website: 'https://firekeeperscasino.com', series_type: 'regional', is_featured: false },
        { name: '2026 North Coast Poker Championship', short_name: null, location: 'Bear River Casino - Loleta CA', start_date: '2026-03-11', end_date: '2026-03-22', website: 'https://pokeratlas.com', series_type: 'regional', is_featured: false },
        { name: '2025-26 WSOP Circuit Central New York', short_name: 'WSOPC', location: 'Turning Stone - Verona NY', start_date: '2026-03-12', end_date: '2026-03-23', website: 'https://www.wsop.com/circuit', series_type: 'circuit', is_featured: false },
        { name: '2026 Spring Rebuy Series', short_name: null, location: 'Silverado Casino - Deadwood SD', start_date: '2026-03-16', end_date: '2026-03-22', website: 'https://pokeratlas.com', series_type: 'regional', is_featured: false },
        { name: 'RGPS Passport Season Eastern PA', short_name: 'RGPS', location: 'Hollywood Penn National - Grantville PA', start_date: '2026-03-17', end_date: '2026-03-22', website: 'https://rungood.com', series_type: 'circuit', is_featured: false },
        { name: "MSPT '26 Festival (Spring) - Riverside", short_name: 'MSPT', location: 'Riverside Casino - Riverside IA', start_date: '2026-03-17', end_date: '2026-03-22', website: 'https://msptpoker.com', series_type: 'circuit', is_featured: false },
        { name: '2026 SD State Poker Championship', short_name: null, location: 'Deadwood Mountain Grand - Deadwood SD', start_date: '2026-03-17', end_date: '2026-04-19', website: 'https://pokeratlas.com', series_type: 'regional', is_featured: false },
        { name: 'Roughrider Poker Tour - The Frozen Frosty', short_name: null, location: 'Spirit Lake Casino - St Michael ND', start_date: '2026-03-19', end_date: '2026-03-22', website: 'https://roughriderpokertour.com', series_type: 'regional', is_featured: false },
        { name: '2025-26 WSOP Circuit Las Vegas (Spring)', short_name: 'WSOPC', location: 'Horseshoe Las Vegas - Las Vegas NV', start_date: '2026-03-19', end_date: '2026-03-30', website: 'https://www.wsop.com/circuit', series_type: 'circuit', is_featured: false },
        { name: '2026 Spring Fling', short_name: null, location: 'One-Eyed Jacks - Sarasota FL', start_date: '2026-03-20', end_date: '2026-03-29', website: 'https://pokeratlas.com', series_type: 'regional', is_featured: false },
        { name: 'Venetian DeepStack Extravaganza', short_name: 'DSE', location: 'Venetian Las Vegas - Las Vegas NV', start_date: '2026-03-20', end_date: '2026-03-29', website: 'https://venetianlasvegas.com', series_type: 'regional', is_featured: false },
        { name: 'NAPT - PokerStars', short_name: null, location: 'Philadelphia PA', start_date: '2026-03-16', end_date: '2026-03-23', website: 'https://pokerstarslive.com/napt', series_type: 'regional', is_featured: false },
        { name: 'RGPS Passport Season Washington DC', short_name: 'RGPS', location: 'MGM National Harbor - Oxon Hill MD', start_date: '2026-04-14', end_date: '2026-04-19', website: 'https://rungood.com', series_type: 'circuit', is_featured: false },
        { name: '2025-26 WSOP Circuit Lake Tahoe (Spring)', short_name: 'WSOPC', location: "Harrah's Lake Tahoe - Stateline NV", start_date: '2026-04-16', end_date: '2026-04-27', website: 'https://www.wsop.com/circuit', series_type: 'circuit', is_featured: false },
        { name: '2025-26 WSOP Circuit Tunica (Spring)', short_name: 'WSOPC', location: 'Horseshoe Tunica - Robinsonville MS', start_date: '2026-04-16', end_date: '2026-04-27', website: 'https://www.wsop.com/circuit', series_type: 'circuit', is_featured: false },
        { name: 'LIPS Women in Poker Spring Festival', short_name: null, location: 'Venetian Las Vegas - Las Vegas NV', start_date: '2026-04-20', end_date: '2026-04-26', website: 'https://pokeratlas.com', series_type: 'regional', is_featured: false },
        { name: 'RGPS Passport Season Eastern PA (Apr)', short_name: 'RGPS', location: 'Hollywood Penn National - Grantville PA', start_date: '2026-04-21', end_date: '2026-04-26', website: 'https://rungood.com', series_type: 'circuit', is_featured: false },
        { name: 'RGPS Passport Season Iowa (Apr)', short_name: 'RGPS', location: 'Horseshoe Council Bluffs - Council Bluffs IA', start_date: '2026-04-21', end_date: '2026-04-26', website: 'https://rungood.com', series_type: 'circuit', is_featured: false },
        { name: "MSPT '26 Festival (Spring) - Potawatomi", short_name: 'MSPT', location: 'Potawatomi Casino - Milwaukee WI', start_date: '2026-04-28', end_date: '2026-05-03', website: 'https://msptpoker.com', series_type: 'circuit', is_featured: false },
        { name: '2025-26 WSOP Circuit Cherokee (Spring)', short_name: 'WSOPC', location: "Harrah's Cherokee - Cherokee NC", start_date: '2026-05-07', end_date: '2026-05-18', website: 'https://www.wsop.com/circuit', series_type: 'circuit', is_featured: false },
        { name: "MSPT '26 Michigan Poker State Championship", short_name: 'MSPT', location: 'FireKeepers Casino - Battle Creek MI', start_date: '2026-05-12', end_date: '2026-05-17', website: 'https://msptpoker.com', series_type: 'circuit', is_featured: false },
        { name: 'RGPS Passport Season Ft Lauderdale', short_name: 'RGPS', location: "Harrah's Pompano - Pompano Beach FL", start_date: '2026-05-12', end_date: '2026-05-17', website: 'https://rungood.com', series_type: 'circuit', is_featured: false },
        { name: 'RGPS Passport Season Kansas City', short_name: 'RGPS', location: "Harrah's Kansas City - Kansas City MO", start_date: '2026-05-12', end_date: '2026-05-17', website: 'https://rungood.com', series_type: 'circuit', is_featured: false },
        { name: '2026 WSOP Main Event', short_name: 'WSOP', location: 'Paris/Horseshoe - Las Vegas NV', start_date: '2026-05-27', end_date: '2026-07-16', website: 'https://www.wsop.com', series_type: 'major', is_featured: true },
        { name: 'DeepStack Championship', short_name: 'DSE', location: 'Venetian Las Vegas - Las Vegas NV', start_date: '2026-06-01', end_date: '2026-12-31', website: 'https://venetianlasvegas.com', series_type: 'regional', is_featured: false },
        { name: 'Aria Poker Classic', short_name: null, location: 'ARIA - Las Vegas NV', start_date: '2026-06-01', end_date: '2026-12-31', website: 'https://aria.com', series_type: 'regional', is_featured: false },
        { name: 'Seminole Hard Rock Poker Showdown', short_name: null, location: 'Seminole Hard Rock Hollywood - Hollywood FL', start_date: '2026-06-01', end_date: '2026-12-31', website: 'https://shrpo.com', series_type: 'regional', is_featured: false },
        { name: 'Seminole Hard Rock Poker Open', short_name: null, location: 'Seminole Hard Rock Hollywood - Hollywood FL', start_date: '2026-06-01', end_date: '2026-12-31', website: 'https://shrpo.com', series_type: 'regional', is_featured: false },
        { name: 'Borgata Poker Open', short_name: null, location: 'Borgata - Atlantic City NJ', start_date: '2026-06-01', end_date: '2026-12-31', website: 'https://borgata.mgmresorts.com', series_type: 'regional', is_featured: false },
        { name: 'RunGood Poker Series (RGPS)', short_name: 'RGPS', location: 'Multiple US Locations', start_date: '2026-06-01', end_date: '2026-12-31', website: 'https://rungood.com', series_type: 'circuit', is_featured: false },
        { name: 'Mid-States Poker Tour (MSPT)', short_name: 'MSPT', location: 'Multiple US Locations', start_date: '2026-06-01', end_date: '2026-12-31', website: 'https://msptpoker.com', series_type: 'circuit', is_featured: false },
        { name: 'World Poker Tour (WPT)', short_name: 'WPT', location: 'Multiple US Locations', start_date: '2026-06-01', end_date: '2026-12-31', website: 'https://worldpokertour.com', series_type: 'major', is_featured: true },
        { name: 'PokerGO Tour (PGT)', short_name: 'PGT', location: 'Las Vegas NV', start_date: '2026-06-01', end_date: '2026-12-31', website: 'https://pokergo.com/tour', series_type: 'major', is_featured: true },
        { name: 'WSOP Circuit (Full Season)', short_name: 'WSOPC', location: 'Multiple US Locations', start_date: '2026-06-01', end_date: '2026-12-31', website: 'https://www.wsop.com/circuit', series_type: 'circuit', is_featured: false },
        { name: '2026 Winter Outlaw Series', short_name: null, location: 'Silverado Casino - Deadwood SD', start_date: '2026-01-04', end_date: '2026-01-25', website: 'https://pokeratlas.com', series_type: 'regional', is_featured: false }
    ];

    const { data: seriesResult, error: seriesError } = await supabase
        .from('tournament_series')
        .upsert(seriesData, { onConflict: 'name', ignoreDuplicates: true });

    if (seriesError) {
        console.error('Series import error:', seriesError.message);
    } else {
        console.log('SUCCESS: Tournament series imported!');
    }

    // Import Venues from CSV
    console.log('\n[2/2] Importing 483 Venues from CSV...');

    const venuesCsvPath = path.join(__dirname, '..', 'data', 'verified-venues-master.csv');

    if (!fs.existsSync(venuesCsvPath)) {
        console.error('ERROR: Venues CSV not found at', venuesCsvPath);
        return;
    }

    const csv = fs.readFileSync(venuesCsvPath, 'utf8');
    const lines = csv.trim().split('\n');

    const venues = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;

        // Parse CSV (handle quoted fields)
        const fields = [];
        let current = '';
        let inQuotes = false;

        for (let j = 0; j < line.length; j++) {
            const char = line[j];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                fields.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        fields.push(current.trim());

        const [venue, website, address, city, state, phone, type, tournaments, pokeratlasUrl, hours] = fields;

        if (!venue || !city || !state) continue;

        const typeMap = {
            'Casino': 'casino',
            'Standalone Card Room': 'card_room',
            'Poker Club': 'poker_club',
            'Charity Room': 'poker_club',
            'Charity Poker': 'poker_club',
            'Card Room': 'card_room'
        };
        const venueType = typeMap[type] || 'card_room';
        const hasTournaments = tournaments === 'Yes';

        venues.push({
            name: venue,
            website: website && website !== '-' && website !== 'Not available' ? website : null,
            address: address && address !== '-' && address !== 'Not available' ? address : null,
            city: city,
            state: state,
            phone: phone && phone !== '-' && phone !== 'Not available' ? phone : null,
            venue_type: venueType,
            games_offered: hasTournaments ? ['NLH', 'PLO'] : ['NLH'],
            stakes_cash: ['$1/$2', '$2/$5'],
            trust_score: 4.0,
            is_verified: true,
            is_active: true
        });
    }

    console.log(`Parsed ${venues.length} venues from CSV`);

    // Insert in batches of 50
    const batchSize = 50;
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < venues.length; i += batchSize) {
        const batch = venues.slice(i, i + batchSize);
        const { error } = await supabase
            .from('poker_venues')
            .upsert(batch, {
                onConflict: 'name,city,state',
                ignoreDuplicates: false
            });

        if (error) {
            console.error(`Batch ${Math.floor(i/batchSize) + 1} error:`, error.message);
            errorCount += batch.length;
        } else {
            successCount += batch.length;
            process.stdout.write(`\rProgress: ${successCount}/${venues.length} venues...`);
        }
    }

    console.log(`\n\nSUCCESS: Imported ${successCount} venues (${errorCount} errors)`);
}

async function main() {
    console.log('='.repeat(60));
    console.log('SMARTER.POKER DATA IMPORT');
    console.log('Importing 483 Venues + 115 Tournament Series');
    console.log('='.repeat(60));
    console.log(`Supabase URL: ${SUPABASE_URL}`);
    console.log(`Started: ${new Date().toISOString()}`);
    console.log('='.repeat(60));

    try {
        // Test connection
        console.log('\nTesting database connection...');
        const { count, error } = await supabase
            .from('poker_venues')
            .select('*', { count: 'exact', head: true });

        if (error) {
            throw new Error(`Database connection failed: ${error.message}`);
        }
        console.log(`Connected! Current venue count: ${count}`);

        // Run the import
        await importViaInserts();

        // Verify final counts
        console.log('\n' + '='.repeat(60));
        console.log('VERIFICATION');
        console.log('='.repeat(60));

        const { count: venueCount } = await supabase
            .from('poker_venues')
            .select('*', { count: 'exact', head: true });

        const { count: seriesCount } = await supabase
            .from('tournament_series')
            .select('*', { count: 'exact', head: true });

        console.log(`Total Venues in Database: ${venueCount}`);
        console.log(`Total Tournament Series: ${seriesCount}`);
        console.log('='.repeat(60));
        console.log('IMPORT COMPLETE!');

    } catch (error) {
        console.error('\nFATAL ERROR:', error.message);
        process.exit(1);
    }
}

main();
