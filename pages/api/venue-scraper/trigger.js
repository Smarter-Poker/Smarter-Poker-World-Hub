/**
 * Venue Scraper — Trigger Endpoint
 * 
 * Orchestrates Manus AI to scrape venue websites (Tier 1)
 * and aggregator sites (Tier 2 fallback) for daily tournaments, news, and updates.
 * 
 * PRIORITY ORDER:
 *   1. Venue direct website (most current — venue controls it)
 *   2. Aggregator URL (fallback — often outdated)
 *   3. Live data feeds (future — live wait list data)
 *
 * Called by GitHub Actions every 3 days (Mon/Thu midnight EST)
 * 
 * Auth: ?key=VENUE_SCRAPER_SECRET
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';
import allVenuesData from '../../../public/data/all-venues.json';

// NOTE: Removed edge runtime — this handler uses Node.js Pages Router API (req.query/res.status/etc)
// and cannot run on Vercel Edge Runtime. Keep as Node.js runtime.

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

const VENUE_SCRAPER_SECRET = process.env.VENUE_SCRAPER_SECRET;
const MANUS_API_KEY = (process.env.MANUS_API_KEY || '').trim();
const MANUS_API_URL = process.env.MANUS_API_URL || 'https://api.manus.im/v1';

// How many venues per Manus task (cost optimization)
const BATCH_SIZE = 15;

export default async function handler(req, res) {
    try {
        if (req.method !== 'GET' && req.method !== 'POST') {
            return res.status(405).json({ error: 'GET or POST only' });
        }

        // Auth
        const secretKey = req.query.key || req.headers['x-venue-scraper-key'];
        if (!secretKey || !VENUE_SCRAPER_SECRET || secretKey !== VENUE_SCRAPER_SECRET) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        if (!MANUS_API_KEY) {
            return res.status(500).json({ error: 'MANUS_API_KEY not configured' });
        }

        // ── Load all venues from JSON (the 483-venue master list) ──
        const allVenues = allVenuesData?.venues || [];

        if (allVenues.length === 0) {
            return res.status(200).json({ success: true, message: 'No venues found', count: 0 });
        }

        // ── Tier 1: Venues with direct websites (PRIMARY) ──
        const tier1 = allVenues.filter(v => v.website && v.website.trim().length > 3);
        
        // ── Tier 2: Venues with aggregator URL but NO direct website (FALLBACK) ──
        const tier2 = allVenues.filter(v => 
            (!v.website || v.website.trim().length <= 3) && 
            v.poker_atlas_url && v.poker_atlas_url.trim().length > 5
        );

        // ── Tier 3: Venues with no source (will be addressed by source discovery) ──
        const tier3 = allVenues.filter(v => 
            (!v.website || v.website.trim().length <= 3) && 
            (!v.poker_atlas_url || v.poker_atlas_url.trim().length <= 5)
        );

        console.debug(`[Venue Scraper] Tier 1 (website): ${tier1.length}, Tier 2 (aggregator): ${tier2.length}, Tier 3 (no source): ${tier3.length}`);

        // ── Build Manus tasks in batches ──
        const receiveUrl = `https://smarter.poker/api/venue-scraper/receive`;
        const tasks = [];
        let taskIndex = 0;

        // Batch Tier 1 venues (direct websites)
        for (let i = 0; i < tier1.length; i += BATCH_SIZE) {
            const batch = tier1.slice(i, i + BATCH_SIZE);
            taskIndex++;
            
            const venueList = batch.map(v => {
                const url = v.website.startsWith('http') ? v.website : `https://${v.website}`;
                return `  - Venue ID: ${v.id}, Name: "${v.name}", City: ${v.city}, State: ${v.state}, URL: ${url}`;
            }).join('\n');

            const prompt = `You are a poker venue data extractor. Visit each venue website below and extract their DAILY TOURNAMENT SCHEDULE and any current PROMOTIONS or NEWS.

VENUES TO SCRAPE (Tier 1 — Direct Websites):
${venueList}

For EACH venue, extract:
1. DAILY TOURNAMENTS: day_of_week, start_time, buy_in (number), game_type (NLH/PLO/etc), format (Freezeout/Re-entry/etc), guaranteed (number), notes
2. NEWS/PROMOTIONS: title, content (brief summary), any relevant dates

RULES:
- ONLY extract data that is EXPLICITLY shown on the page. NEVER guess or assume.
- If a venue has no tournament schedule visible, report tournaments as empty array.
- If a venue website is down or unreachable, report status as "failed" and move on.
- Buy-in values must be numbers only (e.g., 120 not "$120").
- Guaranteed values must be numbers only.

When done, POST the results to: ${receiveUrl}
Use header: x-venue-scraper-key: ${VENUE_SCRAPER_SECRET}
Content-Type: application/json

POST body format:
{
  "batch_id": "${taskIndex}",
  "source_tier": "website",
  "venues": [
    {
      "venue_id": 123,
      "status": "success",
      "source_url": "https://venue-website.com",
      "tournaments": [
        { "day_of_week": "Monday", "start_time": "6:15 PM", "buy_in": 120, "game_type": "NLH", "format": "Freezeout", "guaranteed": 5000, "notes": "Re-entry allowed" }
      ],
      "news": [
        { "title": "Spring Series Announced", "content": "10-event series starting April 1", "published_at": null }
      ]
    }
  ]
}`;

            tasks.push({ prompt, batch, tier: 'website', index: taskIndex });
        }

        // Batch Tier 2 venues (aggregator fallback)
        for (let i = 0; i < tier2.length; i += BATCH_SIZE) {
            const batch = tier2.slice(i, i + BATCH_SIZE);
            taskIndex++;

            const venueList = batch.map(v => 
                `  - Venue ID: ${v.id}, Name: "${v.name}", City: ${v.city}, State: ${v.state}, URL: ${v.poker_atlas_url}`
            ).join('\n');

            const prompt = `You are a poker venue data extractor. Visit each aggregator page below and extract the DAILY TOURNAMENT SCHEDULE.

VENUES TO SCRAPE (Tier 2 — Aggregator Fallback):
${venueList}

For EACH venue, extract:
1. DAILY TOURNAMENTS: day_of_week, start_time, buy_in (number), game_type, format, guaranteed (number), notes

RULES:
- ONLY extract data explicitly shown on the page. NEVER guess.
- If tournament schedule is not visible, report empty array.
- Buy-in and guaranteed values must be numbers only.

When done, POST results to: ${receiveUrl}
Header: x-venue-scraper-key: ${VENUE_SCRAPER_SECRET}
Content-Type: application/json

POST body format:
{
  "batch_id": "${taskIndex}",
  "source_tier": "pokeratlas",
  "venues": [
    {
      "venue_id": 123,
      "status": "success",
      "source_url": "https://pokeratlas.com/...",
      "tournaments": [...],
      "news": []
    }
  ]
}`;

            tasks.push({ prompt, batch, tier: 'pokeratlas', index: taskIndex });
        }

        // ── Send tasks to Manus AI ──
        let tasksCreated = 0;
        const errors = [];

        for (const task of tasks) {
            try {
                const manusRes = await fetch(`${MANUS_API_URL}/tasks`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${MANUS_API_KEY}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        prompt: task.prompt,
                        metadata: {
                            type: 'venue_scrape',
                            tier: task.tier,
                            batch_index: task.index,
                            venue_count: task.batch.length,
                            venue_ids: task.batch.map(v => v.id),
                        }
                    }),
                });

                if (manusRes.ok) {
                    tasksCreated++;
                    console.debug(`[Venue Scraper] Created Manus task ${task.index} (${task.tier}): ${task.batch.length} venues`);
                } else {
                    const errText = await manusRes.text();
                    errors.push(`Task ${task.index}: ${manusRes.status} - ${errText}`);
                }

                // Rate limit — 2s between Manus API calls
                await new Promise(r => setTimeout(r, 2000));

            } catch (err) {
                errors.push(`Task ${task.index}: ${err.message}`);
            }
        }

        // ── Log the scrape run ──
        try {
            const { error: err_scraper_runs_w7wdm } = await getSupabase()
              .from('scraper_runs')
              .insert({
                    source: 'venue-scraper-trigger',
                    status: errors.length === 0 ? 'success' : 'partial',
                    stats: {
                        tier1_count: tier1.length,
                        tier2_count: tier2.length,
                        tier3_count: tier3.length,
                        total_tasks: tasks.length,
                        tasks_created: tasksCreated,
                        errors: errors.length,
                    },
                    metadata: { errors: errors.slice(0, 10) },
                    started_at: new Date().toISOString(),
                });
            if (err_scraper_runs_w7wdm) console.warn('[Supabase] Silent mutation failed in scraper_runs:', err_scraper_runs_w7wdm.message);
        } catch (logErr) {
            console.warn('[Venue Scraper] Failed to log run:', logErr.message);
        }

        return res.status(200).json({
            success: true,
            summary: {
                tier1_venues: tier1.length,
                tier2_venues: tier2.length,
                tier3_no_source: tier3.length,
                total_tasks: tasks.length,
                tasks_created: tasksCreated,
                errors: errors.length,
            },
            errors: errors.slice(0, 5),
        });

    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.warn('[Venue Scraper Trigger Error]', err);
        if (!res.headersSent) return res.status(500).json({ error: err.message });
    }
}
