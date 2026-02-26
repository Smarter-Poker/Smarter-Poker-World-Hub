/**
 * Freerolls API
 * GET  /api/commander/freerolls - List freerolls for a venue
 * POST /api/commander/freerolls - Create a new freeroll
 */
import { createClient } from '@supabase/supabase-js';
import { guardWriteStaff } from '../../../../src/lib/commander/auth';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

function getVenueIdFromSession(req) {
    try {
        const session = JSON.parse(req.headers['x-staff-session'] || '{}');
        return session.venue_id ? parseInt(session.venue_id) : null;
    } catch { return null; }
}

export default async function handler(req, res) {
    const guard = await guardWriteStaff(req, res);
    if (!guard) return;

    if (req.method === 'POST') return createFreeroll(req, res, guard);
    if (req.method !== 'GET') {
        return res.status(405).json({
            success: false,
            error: { code: 'METHOD_NOT_ALLOWED', message: 'GET and POST allowed' }
        });
    }

    return listFreerolls(req, res);
}

async function listFreerolls(req, res) {
    try {
        const venueId = getVenueIdFromSession(req);
        const { status, limit = 50 } = req.query;

        let query = supabase
            .from('commander_freerolls')
            .select('*')
            .order('scheduled_date', { ascending: false, nullsFirst: false })
            .limit(parseInt(limit));

        if (venueId) {
            query = query.eq('venue_id', venueId);
        }

        if (status) {
            query = query.eq('status', status);
        }

        const { data: freerolls, error } = await query;

        if (error) {
            console.error('Freerolls fetch error:', error);
            throw error;
        }

        // Get qualification counts per freeroll
        const freerollIds = (freerolls || []).map(f => f.id);
        let qualCounts = {};

        if (freerollIds.length > 0) {
            const { data: quals } = await supabase
                .from('commander_freeroll_qualifications')
                .select('freeroll_id, is_qualified')
                .in('freeroll_id', freerollIds);

            (quals || []).forEach(q => {
                if (!qualCounts[q.freeroll_id]) {
                    qualCounts[q.freeroll_id] = { total: 0, qualified: 0 };
                }
                qualCounts[q.freeroll_id].total++;
                if (q.is_qualified) qualCounts[q.freeroll_id].qualified++;
            });
        }

        const enriched = (freerolls || []).map(fr => ({
            ...fr,
            total_tracked: qualCounts[fr.id]?.total || 0,
            qualified_count: qualCounts[fr.id]?.qualified || 0,
        }));

        return res.status(200).json({
            success: true,
            data: { freerolls: enriched }
        });

    } catch (error) {
        console.error('Freerolls error:', error);
        return res.status(500).json({
            success: false,
            error: { code: 'SERVER_ERROR', message: 'Failed to fetch freerolls' }
        });
    }
}

async function createFreeroll(req, res, guard) {
    const venueId = guard.venue_id || getVenueIdFromSession(req);
    const {
        name, description, qualification_type, qualification_threshold,
        qualification_period, qualification_game_types, qualification_min_stakes,
        qualification_rules_text, scheduled_date, prize_pool, prize_description,
        max_qualifiers, status
    } = req.body;

    if (!name) {
        return res.status(400).json({
            success: false,
            error: { code: 'MISSING_FIELDS', message: 'Freeroll name required' }
        });
    }

    try {
        const { data: freeroll, error } = await supabase
            .from('commander_freerolls')
            .insert({
                venue_id: venueId,
                name: name.trim(),
                description: description?.trim() || null,
                qualification_type: qualification_type || 'cash_hours',
                qualification_threshold: qualification_threshold || 0,
                qualification_period: qualification_period || 'weekly',
                qualification_game_types: qualification_game_types || ['nlhe'],
                qualification_min_stakes: qualification_min_stakes || null,
                qualification_rules_text: qualification_rules_text || null,
                scheduled_date: scheduled_date || null,
                prize_pool: prize_pool ? parseFloat(prize_pool) : 0,
                prize_description: prize_description || null,
                max_qualifiers: max_qualifiers ? parseInt(max_qualifiers) : null,
                status: status || 'upcoming',
                created_by: guard.id || null,
            })
            .select()
            .single();

        if (error) throw error;

        return res.status(201).json({ success: true, data: { freeroll } });
    } catch (error) {
        console.error('Create freeroll error:', error);
        return res.status(500).json({
            success: false,
            error: { code: 'SERVER_ERROR', message: error.message }
        });
    }
}
