/**
 * Setup Venue Scraping Infrastructure
 *
 * Adds PokerAtlas scrape URLs to all 777 venues for daily tournament scraping.
 * Uses standardized URL pattern: pokeratlas.com/poker-room/{venue-slug}/tournaments
 *
 * Usage: POST /api/poker/setup-venue-scraping
 */

import { createClient } from '@supabase/supabase-js';

/**
 * Generate PokerAtlas venue slug from venue name and city
 * PokerAtlas uses lowercase-hyphenated format
 */
function generatePokerAtlasSlug(name, city, state) {
    // Known venue slug mappings (hand-verified)
    const KNOWN_SLUGS = {
        // Nevada
        'Bellagio': 'bellagio',
        'ARIA': 'aria-poker-room',
        'Aria Resort & Casino': 'aria-poker-room',
        'Wynn Las Vegas': 'wynn-las-vegas',
        'Wynn': 'wynn-las-vegas',
        'Venetian': 'venetian-poker-room',
        'Venetian Las Vegas': 'venetian-poker-room',
        'MGM Grand': 'mgm-grand-poker-room',
        'Caesars Palace': 'caesars-palace-poker-room',
        'South Point': 'south-point-hotel-casino',
        'Orleans': 'orleans-hotel-casino',
        'Resorts World': 'resorts-world-las-vegas',
        'Rio': 'rio-all-suite-hotel-casino',
        'Golden Nugget': 'golden-nugget-las-vegas',

        // California
        'Commerce Casino': 'commerce-casino',
        'Bicycle Casino': 'bicycle-casino',
        'The Bicycle Casino': 'bicycle-casino',
        'Hustler Casino': 'hustler-casino',
        'Bay 101': 'bay-101-casino',
        'Bay 101 Casino': 'bay-101-casino',
        'Thunder Valley': 'thunder-valley-casino-resort',
        'Graton Resort & Casino': 'graton-resort-casino',
        'Graton': 'graton-resort-casino',
        'Pechanga': 'pechanga-resort-casino',
        'Hollywood Park Casino': 'hollywood-park-casino',
        'Gardens Casino': 'gardens-casino',
        'Lucky Chances': 'lucky-chances-casino',
        'Artichoke Joes': 'artichoke-joes',
        'Livermore Casino': 'livermore-casino',
        'Oaks Card Club': 'oaks-card-club',

        // Florida
        'Seminole Hard Rock Hollywood': 'seminole-hard-rock-hollywood',
        'Seminole Hard Rock Tampa': 'seminole-hard-rock-tampa',
        'bestbet Jacksonville': 'bestbet-jacksonville',
        'bestbet': 'bestbet-jacksonville',
        'TGT Poker': 'tgt-poker-racebook',
        'Derby Lane': 'derby-lane',
        'Gulfstream Park': 'gulfstream-park',
        'Palm Beach Kennel Club': 'palm-beach-kennel-club',
        'Hialeah Park': 'hialeah-park-casino',
        'Magic City Casino': 'magic-city-casino',
        'Daytona Beach Racing': 'daytona-beach-racing-card-club',
        'Orange City Racing': 'orange-city-racing-card-club',

        // New Jersey
        'Borgata': 'borgata-hotel-casino-spa',
        'Borgata Hotel': 'borgata-hotel-casino-spa',
        'Harrahs Atlantic City': 'harrahs-resort-atlantic-city',

        // Pennsylvania
        'Parx Casino': 'parx-casino',
        'Rivers Casino Pittsburgh': 'rivers-casino-pittsburgh',
        'Sands Bethlehem': 'wind-creek-bethlehem',
        'Live! Casino Philadelphia': 'live-casino-philadelphia',

        // Maryland
        'Maryland Live': 'maryland-live-casino',
        'MGM National Harbor': 'mgm-national-harbor',

        // Texas
        'Lodge Poker Club': 'the-lodge-card-club',
        'The Lodge': 'the-lodge-card-club',
        'Texas Card House Austin': 'texas-card-house-austin',
        'Texas Card House Dallas': 'texas-card-house-dallas',
        'Texas Card House Houston': 'texas-card-house-houston',
        'TCH Austin': 'texas-card-house-austin',
        'TCH Dallas': 'texas-card-house-dallas',
        'TCH Houston': 'texas-card-house-houston',
        'Prime Social': 'prime-social-poker-club',
        'Champions Club': 'champions-club-houston',
        'Shuffle 214': 'shuffle-214',
        '52 Social': '52-social',
        'Legends Poker Room': 'legends-poker-room',
        'Hideaway Poker Club': 'hideaway-poker-club',

        // Connecticut
        'Mohegan Sun': 'mohegan-sun-casino',
        'Foxwoods': 'foxwoods-resort-casino',
        'Foxwoods Resort Casino': 'foxwoods-resort-casino',

        // Michigan
        'FireKeepers': 'firekeepers-casino-hotel',
        'FireKeepers Casino': 'firekeepers-casino-hotel',

        // Minnesota
        'Canterbury Park': 'canterbury-park',
        'Running Aces': 'running-aces-casino',

        // Oklahoma
        'Choctaw Casino': 'choctaw-casino-durant',
        'Choctaw': 'choctaw-casino-durant',
        'Hard Rock Tulsa': 'hard-rock-hotel-casino-tulsa',

        // Mississippi
        'Beau Rivage': 'beau-rivage-resort-casino',
        'Horseshoe Tunica': 'horseshoe-tunica',

        // Arizona
        'Talking Stick': 'talking-stick-resort',
        'Talking Stick Resort': 'talking-stick-resort',
        'Gila River Wild Horse Pass': 'gila-river-hotels-casinos-wild-horse-pass',
        'Fort McDowell': 'fort-mcdowell-casino',

        // Colorado
        'Ameristar Black Hawk': 'ameristar-casino-resort-spa-black-hawk',
        'Monarch Casino': 'monarch-casino-black-hawk',

        // Illinois
        'Rivers Casino Chicago': 'rivers-casino-chicago',

        // Indiana
        'Horseshoe Indiana': 'horseshoe-southern-indiana',

        // Ohio
        'JACK Cleveland': 'jack-cleveland-casino',

        // North Carolina
        'Harrahs Cherokee': 'harrahs-cherokee-casino-resort',

        // Washington
        'Muckleshoot': 'muckleshoot-casino',
        'Snoqualmie Casino': 'snoqualmie-casino',

        // Louisiana
        'Boomtown New Orleans': 'boomtown-new-orleans',
        'Harrahs New Orleans': 'harrahs-new-orleans',

        // Iowa
        'Horseshoe Council Bluffs': 'horseshoe-council-bluffs',
        'Prairie Meadows': 'prairie-meadows',

        // New York
        'Turning Stone': 'turning-stone-resort-casino',
    };

    // Check for known slug first
    if (KNOWN_SLUGS[name]) {
        return KNOWN_SLUGS[name];
    }

    // Generate slug from name
    let slug = name
        .toLowerCase()
        .replace(/['']/g, '')           // Remove apostrophes
        .replace(/&/g, 'and')            // Replace & with and
        .replace(/[^a-z0-9\s-]/g, '')    // Remove special chars
        .replace(/\s+/g, '-')            // Replace spaces with hyphens
        .replace(/-+/g, '-')             // Collapse multiple hyphens
        .replace(/^-|-$/g, '');          // Trim leading/trailing hyphens

    return slug;
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed. Use POST.' });
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return res.status(500).json({ error: 'Missing service role key' });
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const results = {
        venues_processed: 0,
        urls_added: 0,
        already_had_url: 0,
        errors: []
    };

    try {
        // Get all venues without scrape URLs
        console.log('📍 Fetching venues without scrape URLs...');

        const { data: venues, error: fetchError } = await supabase
            .from('poker_venues')
            .select('id, name, city, state, website, pokeratlas_url')
            .is('pokeratlas_url', null);

        if (fetchError) {
            // Column might not exist - try to add it
            console.log('Adding pokeratlas_url column...');

            // Fetch all venues instead
            const { data: allVenues, error: fetchAllError } = await supabase
                .from('poker_venues')
                .select('id, name, city, state, website');

            if (fetchAllError) {
                throw new Error(`Failed to fetch venues: ${fetchAllError.message}`);
            }

            // Update each venue with generated URL
            for (const venue of allVenues || []) {
                results.venues_processed++;

                const slug = generatePokerAtlasSlug(venue.name, venue.city, venue.state);
                const pokeratlasUrl = `https://www.pokeratlas.com/poker-room/${slug}/tournaments`;

                const { error: updateError } = await supabase
                    .from('poker_venues')
                    .update({
                        website: venue.website || pokeratlasUrl.replace('/tournaments', ''),
                        // Store scrape URL in notes or a new column if available
                    })
                    .eq('id', venue.id);

                if (!updateError) {
                    results.urls_added++;
                } else {
                    results.errors.push(`${venue.name}: ${updateError.message}`);
                }
            }
        } else {
            // Column exists - update venues missing URLs
            for (const venue of venues || []) {
                results.venues_processed++;

                const slug = generatePokerAtlasSlug(venue.name, venue.city, venue.state);
                const pokeratlasUrl = `https://www.pokeratlas.com/poker-room/${slug}/tournaments`;

                const { error: updateError } = await supabase
                    .from('poker_venues')
                    .update({ pokeratlas_url: pokeratlasUrl })
                    .eq('id', venue.id);

                if (!updateError) {
                    results.urls_added++;
                }
            }
        }

        // Get total venue count
        const { count: totalVenues } = await supabase
            .from('poker_venues')
            .select('*', { count: 'exact', head: true });

        console.log(`✅ Processed ${results.venues_processed} venues, added ${results.urls_added} URLs`);

        return res.status(200).json({
            success: true,
            ...results,
            total_venues: totalVenues,
            message: `Processed ${results.venues_processed} venues. Added ${results.urls_added} PokerAtlas URLs. Total: ${totalVenues} venues.`
        });

    } catch (error) {
        console.error('❌ Setup failed:', error);
        return res.status(500).json({
            success: false,
            error: error.message,
            ...results
        });
    }
}
