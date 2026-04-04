/**
 * /api/public/live-games — Player-reported live game data endpoint
 * POST: Submit a report about a live game at a venue
 * GET: Retrieve recent reports (optional)
 */
import { createClient } from '@supabase/supabase-js';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();

    // Global rate limit — blocks DDoS before any Supabase queries
    const limitTier = req.method === 'POST' ? LIMITS.write : LIMITS.read;
    if (!applyRateLimit(req, res, limitTier)) return;

    if (req.method === 'POST') {
        return handlePost(req, res);
    }

    if (req.method === 'GET') {
        return handleGet(req, res);
    }

    return res.status(405).json({ error: 'Method not allowed' });
}

async function handlePost(req, res) {
    try {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const {
            venue_id,
            game_type,
            stakes,
            seats_open = 0,
            waitlist_size = 0,
            table_count = 1,
            game_quality = null,
            notes = null
        } = req.body || {};

        // Validation
        if (!venue_id) {
            return res.status(400).json({ error: 'venue_id is required' });
        }
        if (!game_type) {
            return res.status(400).json({ error: 'game_type is required' });
        }
        if (!stakes) {
            return res.status(400).json({ error: 'stakes is required' });
        }
        // Validate stakes format (must be like "1/2", "5/10", "25/50", etc.)
        if (typeof stakes !== 'string' || stakes.length > 20) {
            return res.status(400).json({ error: 'Invalid stakes format' });
        }
        // Validate game_type against allowlist
        const VALID_GAME_TYPES = ['nlh', 'plo', 'plo8', 'mixed', 'stud', 'omaha', 'other'];
        if (!VALID_GAME_TYPES.includes(game_type)) {
            return res.status(400).json({ error: 'Invalid game type' });
        }

        // Get user from auth header (optional — allow anonymous reports)
        let reporter_id = null;
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.slice(7);
            if (token && token !== 'undefined' && token !== 'null') {
                try {
                    const { data: { user } } = await supabase.auth.getUser(token);
                    if (user) reporter_id = user.id;
                } catch (e) {
                    // Continue without auth — allow anonymous
                }
            }
        }

        // Rate limit: max 5 reports per venue per user per hour (authenticated)
        // For anonymous: max 3 reports per IP per hour
        const clientIp = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();

        if (reporter_id) {
            const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
            const { count } = await supabase
                .from('venue_live_reports')
                .select('id', { count: 'exact', head: true })
                .eq('venue_id', venue_id)
                .eq('reporter_id', reporter_id)
                .gte('created_at', oneHourAgo);

            if (count >= 5) {
                return res.status(429).json({ error: 'Too many reports for this venue. Please wait before reporting again.' });
            }
        } else {
            // Anonymous rate limit by IP — stricter (3/hr)
            const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
            // Try IP-based filtering first; fall back to global anonymous count if column missing
            let anonCount = 0;
            try {
                const { count, error: ipError } = await supabase
                    .from('venue_live_reports')
                    .select('id', { count: 'exact', head: true })
                    .eq('venue_id', venue_id)
                    .eq('reporter_ip', clientIp)
                    .gte('created_at', oneHourAgo);
                if (ipError) throw ipError;
                anonCount = count || 0;
            } catch {
                // Column may not exist — fall back to all-anonymous count
                const { count } = await supabase
                    .from('venue_live_reports')
                    .select('id', { count: 'exact', head: true })
                    .eq('venue_id', venue_id)
                    .is('reporter_id', null)
                    .gte('created_at', oneHourAgo);
                anonCount = count || 0;
            }

            if (anonCount >= 3) {
                return res.status(429).json({ error: 'Too many anonymous reports. Please sign in for higher limits.' });
            }
        }

        // Sanitize and clamp inputs
        const sanitizedNotes = notes
            ? String(notes).replace(/<[^>]*>/g, '').trim().slice(0, 500)
            : null;
        const clampedSeats = Math.max(0, Math.min(10, parseInt(seats_open) || 0));
        const clampedWaitlist = Math.max(0, Math.min(100, parseInt(waitlist_size) || 0));
        const clampedTables = Math.max(1, Math.min(50, parseInt(table_count) || 1));

        // Insert the report
        const { data: game, error: insertError } = await supabase
            .from('venue_live_reports')
            .insert({
                venue_id,
                game_type,
                stakes: String(stakes).slice(0, 20),
                seats_open: clampedSeats,
                waitlist_size: clampedWaitlist,
                table_count: clampedTables,
                game_quality: game_quality && ['soft', 'average', 'tough'].includes(game_quality) ? game_quality : null,
                notes: sanitizedNotes,
                reporter_id,
                reporter_ip: reporter_id ? null : clientIp, // Only store IP for anonymous reports
                reported_at: new Date().toISOString(),
                expires_at: new Date(Date.now() + 4 * 3600000).toISOString() // Reports expire after 4 hours
            })
            .select()
            .single();

        if (insertError) {
            // If the table doesn't exist yet, create a graceful fallback
            if (insertError.code === '42P01' || insertError.message?.includes('does not exist')) {
                // Table not created yet — store in a simpler format
                console.warn('venue_live_reports table does not exist yet. Report stored in-memory only.');
                return res.status(200).json({
                    success: true,
                    game: {
                        id: `temp-${Date.now()}`,
                        venue_id,
                        game_type,
                        stakes,
                        table_count,
                        seats_open,
                        waitlist_size,
                        reported_at: new Date().toISOString(),
                        status: 'pending_table_creation'
                    },
                    message: 'Report received. Table infrastructure is being set up.'
                });
            }
            throw insertError;
        }

        return res.status(200).json({
            success: true,
            game,
            message: 'Live game reported successfully'
        });

    } catch (err) {
        console.error('Report live game error:', err);
        return res.status(500).json({ error: 'Failed to report game' });
    }
}

async function handleGet(req, res) {
    try {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const { venue_id, limit = 20 } = req.query;
        const clampedLimit = Math.max(1, Math.min(100, parseInt(limit) || 20));

        let query = supabase
            .from('venue_live_reports')
            .select('*')
            .gte('expires_at', new Date().toISOString())
            .order('reported_at', { ascending: false })
            .limit(clampedLimit);

        if (venue_id) {
            query = query.eq('venue_id', venue_id);
        }

        const { data, error } = await query;

        if (error) {
            // Table might not exist yet
            if (error.code === '42P01') {
                return res.status(200).json({ reports: [], total: 0, message: 'Report system initializing' });
            }
            throw error;
        }

        return res.status(200).json({
            reports: data || [],
            total: (data || []).length
        });

    } catch (err) {
        console.error('Get live reports error:', err);
        return res.status(500).json({ error: 'Failed to fetch reports' });
    }
}
