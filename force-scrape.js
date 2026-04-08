import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { fetchAndExtract } from './src/lib/tourHtmlExtractor.js';
import { extractPdfSchedule } from './src/lib/tourPdfExtractor.js';

const SUPABASE_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const sourcesPath = path.join(process.cwd(), 'data', 'tour-scrape-sources.json');
const sources = JSON.parse(fs.readFileSync(sourcesPath, 'utf8'));

// Canonical stop names expected by the UI
const STOP_MAP = {
    'WSOP': 'WSOP — Horseshoe / Paris Las Vegas',
    'WPT': 'WPT World Championship',
    'WSOPC': 'WSOP Circuit — Live Poker',
    'MSPT': 'MSPT Poker Tour',
    'RGPS': 'RunGood Poker Series',
    'PGT': 'PokerGO Tour Schedule'
};

async function processSource(tourCode, config) {
    console.log(`\n===> Start [${tourCode}]`);
    let bestEvents = [];
    let usedSource = '';
    
    // Prioritize PDF for high fidelity, then HTML
    const sortedSources = Object.entries(config.sources).sort((a, b) => {
        if (a[1].method.includes('pdf')) return -1;
        if (b[1].method.includes('pdf')) return 1;
        return 0;
    });

    for (const [sname, src] of sortedSources) {
        if (!src.url) continue;
        console.log(`  -> Trying ${sname} (${src.method}): ${src.url}`);
        
        try {
            let events = [];
            if (src.method === 'pdf_direct') {
                const res = await extractPdfSchedule(src.url, { tourCode, seriesName: STOP_MAP[tourCode] || config.tour_name });
                events = res.events || [];
            } else if (src.method === 'html_extract') {
                const res = await fetchAndExtract(src.url, tourCode, sname, {
                    openaiApiKey: process.env.OPENAI_API_KEY,
                    minExpected: 3,
                    headers: { 'User-Agent': 'Mozilla/5.0' }
                });
                events = res.events || [];
            }
            
            if (events && Array.isArray(events) && events.length > bestEvents.length) {
                bestEvents = events;
                usedSource = sname;
                if (events.length > 50) break; // Found a high-fidelity schedule
            }
        } catch (e) {
            console.log(`  ❌ Failed: ${e.message}`);
        }
    }
    
    console.log(`  ✅ Best result for ${tourCode}: ${bestEvents.length} events from ${usedSource}`);
    
    if (bestEvents.length > 0) {
        const stopName = STOP_MAP[tourCode] || config.tour_name;
        
        // 1. Create the Anchor Stop in tour_stop_events if missing
        const { data: existingStop } = await supabase.from('tour_stop_events').select('id').eq('tour_code', tourCode).eq('stop_name', stopName).maybeSingle();
        
        if (!existingStop) {
            console.log(`  ⚓ Creating anchor stop in tour_stop_events: ${stopName}`);
            await supabase.from('tour_stop_events').insert({
                tour_code: tourCode,
                stop_name: stopName,
                stop_venue: stopName.split(' — ')[1] || stopName,
                stop_city: tourCode === 'WSOP' ? 'Las Vegas' : 'Unknown',
                stop_state: tourCode === 'WSOP' ? 'NV' : null,
                stop_start_date: bestEvents[0]?.start_date || '2026-05-26',
                stop_end_date: bestEvents[bestEvents.length-1]?.start_date || '2026-07-15',
                data_quality: 'anchor_manual'
            });
        }

        // 2. Upload "Rich" details
        const records = bestEvents.map((e, index) => ({
            tour_code: tourCode,
            series_name: stopName,
            event_name: e.event_name || e.name || `Event ${index+1}`,
            buy_in: e.buy_in || 0,
            guaranteed: e.guaranteed || e.guarantee || null,
            starting_chips: e.starting_chips || null,
            levels: e.blind_levels_min || null,
            start_date: e.start_date || null,
            start_time: e.start_time || null,
            game_type: e.game_type || 'NLH',
            event_type: e.event_type || 'side_event',
            source: 'force_fidelity_v2',
            scraped_at: new Date().toISOString()
        }));
        
        const { error } = await supabase.from('tour_event_details').upsert(records, {
            onConflict: 'tour_code,event_name,buy_in',
            ignoreDuplicates: false
        });
        
        if (error) {
            console.error(`  ❌ DB Insert Error for ${tourCode}:`, error.message);
        } else {
            console.log(`  🚀 100% SUCCESS: DB Uploaded ${bestEvents.length} events for ${tourCode}`);
        }
    }
}

async function run() {
    process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
    const activeTours = ['WSOP', 'WPT', 'WSOPC', 'PGT', 'RGPS'];
    for (const [tourCode, config] of Object.entries(sources.tours)) {
        if (!activeTours.includes(tourCode)) continue;
        await processSource(tourCode, config);
    }
    console.log('\n====> FIDELITY RESTORATION COMPLETE.');
    process.exit(0);
}
run();
