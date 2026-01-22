/**
 * Finalize Tournament Series API
 *
 * 1. Adds the final 2 series (ARIA Poker Classic + U.S. Poker Open)
 * 2. Locks in all source URLs for daily scraping
 *
 * Usage: POST /api/poker/finalize-series
 */

import { createClient } from '@supabase/supabase-js';

// Final 2 tournament series to complete the 40
const FINAL_SERIES = [
    {
        name: 'ARIA Poker Classic Summer 2026',
        short_name: 'ARIA',
        venue_name: 'ARIA Resort & Casino',
        location: 'Las Vegas, NV',
        start_date: '2026-05-28',
        end_date: '2026-07-13',
        main_event_buyin: 5000,
        main_event_guaranteed: 2000000,
        total_events: 45,
        series_type: 'major',
        is_featured: true,
        website: 'https://aria.mgmresorts.com/en/casino/poker.html',
        scrape_url: 'https://www.pokeratlas.com/poker-room/aria-poker-room/tournaments'
    },
    {
        name: 'U.S. Poker Open 2026',
        short_name: 'USPO',
        venue_name: 'PokerGO Studio at ARIA',
        location: 'Las Vegas, NV',
        start_date: '2026-06-01',
        end_date: '2026-06-15',
        main_event_buyin: 25000,
        main_event_guaranteed: 1000000,
        total_events: 12,
        series_type: 'major',
        is_featured: true,
        website: 'https://www.pokergo.com',
        scrape_url: 'https://www.pokergo.com/schedule'
    }
];

// Complete source URL mapping for all 40 tournament brands
const SERIES_SCRAPE_URLS = {
    // === MAJOR TOURS ===
    'WSOP': 'https://www.wsop.com/tournaments/',
    'World Series of Poker': 'https://www.wsop.com/tournaments/',
    'WSOP Circuit': 'https://www.wsop.com/tournaments/',
    'WPT': 'https://www.wpt.com/schedule/',
    'World Poker Tour': 'https://www.wpt.com/schedule/',
    'WPT Prime': 'https://www.wpt.com/schedule/',
    'PokerGO': 'https://www.pokergo.com/schedule',
    'PokerGO Tour': 'https://www.pokergo.com/schedule',
    'PokerGO Cup': 'https://www.pokergo.com/schedule',

    // === REGIONAL TOURS ===
    'MSPT': 'https://msptpoker.com/schedule/',
    'Mid-States Poker Tour': 'https://msptpoker.com/schedule/',
    'RGPS': 'https://rungoodpokerseries.com/schedule/',
    'RunGood': 'https://rungoodpokerseries.com/schedule/',
    'RunGood Poker Series': 'https://rungoodpokerseries.com/schedule/',
    'Roughrider': 'https://roughriderpokertour.com/schedule/',
    'Bar Poker Open': 'https://barpokeropen.com/events/',
    'BPO': 'https://barpokeropen.com/events/',
    'FPN': 'https://freepokernetwork.com/events/',
    'LIPS': 'https://www.lipspoker.com/schedule/',
    'Card Player Cruises': 'https://www.cardplayercruises.com/cruises/',
    'PokerStars': 'https://www.pokerstarslive.com/napt/',
    'NAPT': 'https://www.pokerstarslive.com/napt/',

    // === LAS VEGAS VENUES ===
    'Wynn': 'https://www.pokeratlas.com/poker-room/wynn-las-vegas/tournaments',
    'Wynn Millions': 'https://www.pokeratlas.com/poker-room/wynn-las-vegas/tournaments',
    'Venetian': 'https://www.pokeratlas.com/poker-room/venetian-poker-room/tournaments',
    'Venetian DeepStack': 'https://www.pokeratlas.com/poker-room/venetian-poker-room/tournaments',
    'ARIA': 'https://www.pokeratlas.com/poker-room/aria-poker-room/tournaments',

    // === REGIONAL VENUES ===
    'Borgata': 'https://www.pokeratlas.com/poker-room/borgata-poker-room/tournaments',
    'Seminole': 'https://www.pokeratlas.com/poker-room/seminole-hard-rock-hollywood/tournaments',
    'SHRPO': 'https://www.pokeratlas.com/poker-room/seminole-hard-rock-hollywood/tournaments',
    'bestbet': 'https://www.pokeratlas.com/poker-room/bestbet-jacksonville/tournaments',
    'LAPC': 'https://www.pokeratlas.com/poker-room/commerce-casino/tournaments',
    'Commerce': 'https://www.pokeratlas.com/poker-room/commerce-casino/tournaments',
    'Bay 101': 'https://www.pokeratlas.com/poker-room/bay-101-casino/tournaments',
    'Thunder Valley': 'https://www.pokeratlas.com/poker-room/thunder-valley-casino-resort/tournaments',
    'FireKeepers': 'https://www.pokeratlas.com/poker-room/firekeepers-casino-hotel/tournaments',
    'Canterbury Park': 'https://www.pokeratlas.com/poker-room/canterbury-park/tournaments',
    'Running Aces': 'https://www.pokeratlas.com/poker-room/running-aces-casino/tournaments',
    'Mohegan Sun': 'https://www.pokeratlas.com/poker-room/mohegan-sun-casino/tournaments',
    'Maryland Live': 'https://www.pokeratlas.com/poker-room/maryland-live/tournaments',
    'MGM National Harbor': 'https://www.pokeratlas.com/poker-room/mgm-national-harbor/tournaments',
    'Beau Rivage': 'https://www.pokeratlas.com/poker-room/beau-rivage-resort-casino/tournaments',
    'Choctaw': 'https://www.pokeratlas.com/poker-room/choctaw-casino-durant/tournaments',
    'Hard Rock Tulsa': 'https://www.pokeratlas.com/poker-room/hard-rock-tulsa/tournaments',
    'Talking Stick': 'https://www.pokeratlas.com/poker-room/talking-stick-resort/tournaments',
    'JACK Cleveland': 'https://www.pokeratlas.com/poker-room/jack-cleveland-casino/tournaments',
    'Parx': 'https://www.pokeratlas.com/poker-room/parx-casino/tournaments',

    // === TEXAS ROOMS ===
    'TCH': 'https://www.pokeratlas.com/poker-room/texas-card-house-dallas/tournaments',
    'Texas Card House': 'https://www.pokeratlas.com/poker-room/texas-card-house-dallas/tournaments',
    'Lodge': 'https://www.pokeratlas.com/poker-room/the-lodge-card-club/tournaments',
    'Champions Club': 'https://www.pokeratlas.com/poker-room/champions-club-houston/tournaments',

    // === DEFUNCT ===
    'HPT': 'DEFUNCT',
};

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
        final_series_added: 0,
        scrape_urls_updated: 0,
        errors: []
    };

    try {
        // STEP 1: Add final 2 series
        console.log('📌 Adding final 2 tournament series...');

        const { data: seriesData, error: seriesError } = await supabase
            .from('tournament_series')
            .upsert(FINAL_SERIES, {
                onConflict: 'name,start_date',
                ignoreDuplicates: false
            })
            .select();

        if (seriesError) {
            results.errors.push(`Series insert failed: ${seriesError.message}`);
        } else {
            results.final_series_added = seriesData?.length || 2;
            console.log(`✅ Added ${results.final_series_added} series`);
        }

        // STEP 2: Update scrape_urls for all existing series
        console.log('🔗 Locking in source URLs for all series...');

        // Get all series
        const { data: allSeries, error: fetchError } = await supabase
            .from('tournament_series')
            .select('id, name, short_name, scrape_url')
            .is('scrape_url', null);

        if (fetchError) {
            results.errors.push(`Fetch series failed: ${fetchError.message}`);
        } else if (allSeries && allSeries.length > 0) {
            // Match and update
            for (const series of allSeries) {
                let matchedUrl = null;

                // Try to match by short_name first, then by name patterns
                for (const [pattern, url] of Object.entries(SERIES_SCRAPE_URLS)) {
                    if (
                        series.short_name?.includes(pattern) ||
                        series.name?.includes(pattern) ||
                        series.short_name === pattern
                    ) {
                        matchedUrl = url;
                        break;
                    }
                }

                if (matchedUrl && matchedUrl !== 'DEFUNCT') {
                    const { error: updateError } = await supabase
                        .from('tournament_series')
                        .update({
                            scrape_url: matchedUrl,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', series.id);

                    if (!updateError) {
                        results.scrape_urls_updated++;
                    }
                }
            }
            console.log(`✅ Updated ${results.scrape_urls_updated} scrape URLs`);
        }

        // STEP 3: Verify total count
        const { count: totalSeries } = await supabase
            .from('tournament_series')
            .select('*', { count: 'exact', head: true });

        return res.status(200).json({
            success: true,
            ...results,
            total_series: totalSeries,
            message: `Finalized ${results.final_series_added} series, updated ${results.scrape_urls_updated} URLs. Total: ${totalSeries} series.`
        });

    } catch (error) {
        console.error('❌ Finalize failed:', error);
        return res.status(500).json({
            success: false,
            error: error.message,
            ...results
        });
    }
}
