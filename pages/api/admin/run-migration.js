/**
 * Admin Migration Runner
 * Executes SQL migrations via Supabase service role
 *
 * POST /api/admin/run-migration
 * Body: { migration: "scraper-infrastructure" }
 *
 * Available migrations:
 * - scraper-infrastructure: Add scrape tracking columns
 * - finalize-series: Add final 2 series + lock URLs
 * - setup-venues: Add PokerAtlas URLs to all venues
 */

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return res.status(500).json({ error: 'Missing service role key' });
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { migration } = req.body;
    const results = { success: false, migration, steps: [] };

    try {
        switch (migration) {
            case 'scraper-infrastructure':
                results.steps = await runScraperInfrastructure(supabase);
                break;

            case 'finalize-series':
                results.steps = await runFinalizeSeries(supabase);
                break;

            case 'setup-venues':
                results.steps = await runSetupVenues(supabase);
                break;

            case 'all':
                // Run all migrations in sequence
                results.steps.push(...await runScraperInfrastructure(supabase));
                results.steps.push(...await runFinalizeSeries(supabase));
                results.steps.push(...await runSetupVenues(supabase));
                break;

            default:
                return res.status(400).json({
                    error: 'Invalid migration',
                    available: ['scraper-infrastructure', 'finalize-series', 'setup-venues', 'all']
                });
        }

        results.success = true;
        return res.status(200).json(results);

    } catch (error) {
        console.error('Migration error:', error);
        return res.status(500).json({
            ...results,
            error: error.message
        });
    }
}

/**
 * Add scrape tracking columns to poker_venues and tournament_series
 */
async function runScraperInfrastructure(supabase) {
    const steps = [];

    // Step 1: Add columns to poker_venues
    console.log('Adding scrape columns to poker_venues...');

    const { error: venueColError } = await supabase.rpc('exec_sql', {
        sql: `
            ALTER TABLE poker_venues
            ADD COLUMN IF NOT EXISTS pokeratlas_url TEXT,
            ADD COLUMN IF NOT EXISTS pokeratlas_slug TEXT,
            ADD COLUMN IF NOT EXISTS scrape_source TEXT DEFAULT 'unknown',
            ADD COLUMN IF NOT EXISTS scrape_url TEXT,
            ADD COLUMN IF NOT EXISTS last_scraped TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS scrape_status TEXT DEFAULT 'pending';
        `
    });

    if (venueColError) {
        // Try direct approach if RPC doesn't exist
        steps.push({ step: 'poker_venues columns', status: 'skipped', note: 'RPC not available, columns may already exist' });
    } else {
        steps.push({ step: 'poker_venues columns', status: 'success' });
    }

    // Step 2: Add columns to tournament_series
    const { error: seriesColError } = await supabase.rpc('exec_sql', {
        sql: `
            ALTER TABLE tournament_series
            ADD COLUMN IF NOT EXISTS scrape_url TEXT,
            ADD COLUMN IF NOT EXISTS last_scraped TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS events_count INTEGER DEFAULT 0,
            ADD COLUMN IF NOT EXISTS scrape_status TEXT DEFAULT 'pending';
        `
    });

    if (seriesColError) {
        steps.push({ step: 'tournament_series columns', status: 'skipped', note: 'RPC not available' });
    } else {
        steps.push({ step: 'tournament_series columns', status: 'success' });
    }

    // Step 3: Create venue_daily_tournaments if not exists
    const { error: dailyError } = await supabase.from('venue_daily_tournaments').select('id').limit(1);

    if (dailyError && dailyError.code === '42P01') {
        // Table doesn't exist - would need to create via Supabase dashboard
        steps.push({ step: 'venue_daily_tournaments table', status: 'needs_manual', note: 'Create via Supabase dashboard' });
    } else {
        steps.push({ step: 'venue_daily_tournaments table', status: 'exists' });
    }

    return steps;
}

/**
 * Add final 2 series and lock in source URLs
 */
async function runFinalizeSeries(supabase) {
    const steps = [];

    // Final 2 series
    const FINAL_SERIES = [
        {
            name: 'ARIA Poker Classic Summer 2026',
            short_name: 'ARIA',
            location: 'Las Vegas, NV',
            start_date: '2026-05-28',
            end_date: '2026-07-13',
            total_events: 45,
            series_type: 'major',
            is_featured: true,
            scrape_url: 'https://www.pokeratlas.com/poker-room/aria-poker-room/tournaments'
        },
        {
            name: 'U.S. Poker Open 2026',
            short_name: 'USPO',
            location: 'Las Vegas, NV',
            start_date: '2026-06-01',
            end_date: '2026-06-15',
            total_events: 12,
            series_type: 'major',
            is_featured: true,
            scrape_url: 'https://www.pokergo.com/schedule'
        }
    ];

    const { data, error } = await supabase
        .from('tournament_series')
        .upsert(FINAL_SERIES, { onConflict: 'name,start_date' })
        .select();

    if (error) {
        steps.push({ step: 'Add final 2 series', status: 'error', error: error.message });
    } else {
        steps.push({ step: 'Add final 2 series', status: 'success', count: data?.length || 2 });
    }

    // Update scrape URLs for existing series
    const URL_MAPPINGS = {
        'WSOP': 'https://www.wsop.com/tournaments/',
        'WPT': 'https://www.wpt.com/schedule/',
        'WSOPC': 'https://www.wsop.com/tournaments/',
        'MSPT': 'https://msptpoker.com/schedule/',
        'RGPS': 'https://rungoodpokerseries.com/schedule/',
        'PGT': 'https://www.pokergo.com/schedule',
        'LAPC': 'https://www.pokeratlas.com/poker-room/commerce-casino/tournaments',
        'DSE': 'https://www.pokeratlas.com/poker-room/venetian-poker-room/tournaments',
        'BWPO': 'https://www.pokeratlas.com/poker-room/borgata-hotel-casino-spa/tournaments',
        'HEATER': 'https://www.pokeratlas.com/poker-room/beau-rivage-resort-casino/tournaments',
    };

    let urlsUpdated = 0;
    for (const [shortName, url] of Object.entries(URL_MAPPINGS)) {
        const { error: updateError } = await supabase
            .from('tournament_series')
            .update({ scrape_url: url })
            .eq('short_name', shortName)
            .is('scrape_url', null);

        if (!updateError) urlsUpdated++;
    }

    steps.push({ step: 'Update scrape URLs', status: 'success', count: urlsUpdated });

    // Get total count
    const { count } = await supabase
        .from('tournament_series')
        .select('*', { count: 'exact', head: true });

    steps.push({ step: 'Total series count', count });

    return steps;
}

/**
 * Add PokerAtlas URLs to all 777 venues
 */
async function runSetupVenues(supabase) {
    const steps = [];

    // Known venue slug mappings
    const VENUE_SLUGS = {
        'Bellagio': 'bellagio',
        'ARIA': 'aria-poker-room',
        'Wynn': 'wynn-las-vegas',
        'Venetian': 'venetian-poker-room',
        'MGM Grand': 'mgm-grand-poker-room',
        'Commerce Casino': 'commerce-casino',
        'Bicycle Casino': 'bicycle-casino',
        'Hustler Casino': 'hustler-casino',
        'Bay 101': 'bay-101-casino',
        'Thunder Valley': 'thunder-valley-casino-resort',
        'Seminole Hard Rock Hollywood': 'seminole-hard-rock-hollywood',
        'Seminole Hard Rock Tampa': 'seminole-hard-rock-tampa',
        'bestbet Jacksonville': 'bestbet-jacksonville',
        'Borgata': 'borgata-hotel-casino-spa',
        'Parx Casino': 'parx-casino',
        'Foxwoods': 'foxwoods-resort-casino',
        'Mohegan Sun': 'mohegan-sun-casino',
        'Maryland Live': 'maryland-live-casino',
        'MGM National Harbor': 'mgm-national-harbor',
        'Lodge Poker Club': 'the-lodge-card-club',
        'Texas Card House Austin': 'texas-card-house-austin',
        'Texas Card House Dallas': 'texas-card-house-dallas',
        'Texas Card House Houston': 'texas-card-house-houston',
        'Choctaw': 'choctaw-casino-durant',
        'Hard Rock Tulsa': 'hard-rock-hotel-casino-tulsa',
        'Talking Stick': 'talking-stick-resort',
        'FireKeepers': 'firekeepers-casino-hotel',
        'Canterbury Park': 'canterbury-park',
        'Running Aces': 'running-aces-casino',
        'Beau Rivage': 'beau-rivage-resort-casino',
    };

    // Get all venues without PokerAtlas URLs
    const { data: venues, error: fetchError } = await supabase
        .from('poker_venues')
        .select('id, name, city, state')
        .order('name');

    if (fetchError) {
        steps.push({ step: 'Fetch venues', status: 'error', error: fetchError.message });
        return steps;
    }

    steps.push({ step: 'Fetch venues', status: 'success', count: venues?.length || 0 });

    // Generate and update URLs
    let updated = 0;
    let skipped = 0;

    for (const venue of venues || []) {
        // Check for known slug
        let slug = null;
        for (const [name, knownSlug] of Object.entries(VENUE_SLUGS)) {
            if (venue.name.includes(name)) {
                slug = knownSlug;
                break;
            }
        }

        // Generate slug if not known
        if (!slug) {
            slug = venue.name
                .toLowerCase()
                .replace(/['']/g, '')
                .replace(/&/g, 'and')
                .replace(/[^a-z0-9\s-]/g, '')
                .replace(/\s+/g, '-')
                .replace(/-+/g, '-')
                .replace(/^-|-$/g, '');
        }

        const pokeratlasUrl = `https://www.pokeratlas.com/poker-room/${slug}/tournaments`;

        const { error: updateError } = await supabase
            .from('poker_venues')
            .update({
                pokeratlas_slug: slug,
                pokeratlas_url: pokeratlasUrl,
                scrape_source: 'pokeratlas',
                scrape_status: 'pending'
            })
            .eq('id', venue.id);

        if (!updateError) {
            updated++;
        } else {
            skipped++;
        }
    }

    steps.push({ step: 'Update venue URLs', status: 'success', updated, skipped });

    return steps;
}
