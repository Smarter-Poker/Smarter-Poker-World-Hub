import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

function setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-user-id');
}

export default async function handler(req, res) {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        if (req.method === 'GET') {
            return await handleGet(req, res);
        }

        if (req.method === 'POST') {
            return await handlePost(req, res);
        }

        return res.status(405).json({ success: false, error: 'Method not allowed' });
    } catch (error) {
        console.error('[Tournament Results API] Unhandled error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------
async function handleGet(req, res) {
    const { series_id, tour_code, player_name, latest, limit } = req.query;

    // --- Results for a specific series (+ leaderboard) ---------------------
    if (series_id) {
        const { data, error } = await supabase
            .from('tournament_results')
            .select('*')
            .eq('series_id', series_id)
            .order('event_date', { ascending: true });

        if (error) {
            console.error('[Tournament Results API] GET series_id error:', error);
            return res.status(500).json({ success: false, error: error.message });
        }

        const leaderboard = computeLeaderboard(data);

        return res.status(200).json({ success: true, data: { results: data, leaderboard } });
    }

    // --- Results for a specific tour --------------------------------------
    if (tour_code) {
        const { data, error } = await supabase
            .from('tournament_results')
            .select('*')
            .eq('tour_code', tour_code)
            .order('event_date', { ascending: false });

        if (error) {
            console.error('[Tournament Results API] GET tour_code error:', error);
            return res.status(500).json({ success: false, error: error.message });
        }

        return res.status(200).json({ success: true, data });
    }

    // --- Search by player name (case-insensitive partial match) ------------
    if (player_name) {
        const searchTerm = player_name.toLowerCase();

        // 1. Match against winner_name using ilike
        const { data: winnerRows, error: winnerError } = await supabase
            .from('tournament_results')
            .select('*')
            .ilike('winner_name', `%${searchTerm}%`)
            .order('event_date', { ascending: false });

        if (winnerError) {
            console.error('[Tournament Results API] GET player_name (winner) error:', winnerError);
            return res.status(500).json({ success: false, error: winnerError.message });
        }

        // 2. Match inside results_json – cast JSONB to text and search with ilike
        const { data: jsonRows, error: jsonError } = await supabase
            .from('tournament_results')
            .select('*')
            .filter('results_json::text', 'ilike', `%${searchTerm}%`)
            .order('event_date', { ascending: false });

        if (jsonError) {
            console.error('[Tournament Results API] GET player_name (json) error:', jsonError);
            // Fall back to winner-only results if the json query fails
            return res.status(200).json({ success: true, data: winnerRows });
        }

        // Merge & deduplicate by id
        const merged = deduplicateById([...winnerRows, ...(jsonRows || [])]);

        return res.status(200).json({ success: true, data: merged });
    }

    // --- Latest results across all ----------------------------------------
    if (latest === 'true') {
        const rowLimit = Math.min(parseInt(limit, 10) || 20, 100);

        const { data, error } = await supabase
            .from('tournament_results')
            .select('*')
            .order('event_date', { ascending: false })
            .limit(rowLimit);

        if (error) {
            console.error('[Tournament Results API] GET latest error:', error);
            return res.status(500).json({ success: false, error: error.message });
        }

        return res.status(200).json({ success: true, data });
    }

    // No recognised query parameter
    return res.status(400).json({
        success: false,
        error: 'Missing query parameter. Provide series_id, tour_code, player_name, or latest=true',
    });
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------
async function handlePost(req, res) {
    const {
        series_id,
        tour_code,
        event_name,
        event_number,
        event_date,
        buy_in,
        prize_pool,
        total_entries,
        winner_name,
        winner_prize,
        results,
    } = req.body;

    // Basic validation
    if (!series_id || !event_name || !event_date || buy_in == null || !winner_name || winner_prize == null) {
        return res.status(400).json({
            success: false,
            error: 'Missing required fields: series_id, event_name, event_date, buy_in, winner_name, winner_prize',
        });
    }

    const row = {
        series_id,
        tour_code: tour_code || null,
        event_name,
        event_number: event_number != null ? parseInt(event_number, 10) : null,
        event_date,
        buy_in: parseFloat(buy_in),
        prize_pool: prize_pool != null ? parseFloat(prize_pool) : null,
        total_entries: total_entries != null ? parseInt(total_entries, 10) : null,
        winner_name,
        winner_prize: parseFloat(winner_prize),
        results_json: results || [],
    };

    const { data, error } = await supabase
        .from('tournament_results')
        .insert([row])
        .select();

    if (error) {
        console.error('[Tournament Results API] POST error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }

    return res.status(201).json({ success: true, data: data[0] });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Aggregate player results across all events in a series to produce a
 * leaderboard sorted by total earnings (descending).
 */
function computeLeaderboard(rows) {
    const playerMap = {}; // key: lowercased player name -> { name, totalEarnings, cashes, wins }

    for (const row of rows) {
        // Count the winner
        addToLeaderboard(playerMap, row.winner_name, parseFloat(row.winner_prize) || 0, true);

        // Walk individual results stored in results_json
        if (Array.isArray(row.results_json)) {
            for (const entry of row.results_json) {
                const name = entry.player_name;
                if (!name) continue;
                const prize = parseFloat(entry.prize) || 0;
                const isWinner = entry.place === 1 || entry.place === '1';
                // Avoid double-counting the winner if they also appear in results_json
                if (name.toLowerCase() === row.winner_name.toLowerCase()) continue;
                addToLeaderboard(playerMap, name, prize, isWinner);
            }
        }
    }

    return Object.values(playerMap)
        .sort((a, b) => b.totalEarnings - a.totalEarnings);
}

function addToLeaderboard(map, name, prize, isWin) {
    const key = name.toLowerCase();
    if (!map[key]) {
        map[key] = { name, totalEarnings: 0, cashes: 0, wins: 0 };
    }
    map[key].totalEarnings += prize;
    map[key].cashes += 1;
    if (isWin) {
        map[key].wins += 1;
    }
}

function deduplicateById(rows) {
    const seen = new Set();
    const unique = [];
    for (const row of rows) {
        if (!seen.has(row.id)) {
            seen.add(row.id);
            unique.push(row);
        }
    }
    return unique;
}
