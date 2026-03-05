/**
 * Tournament Templates API
 * GET /api/commander/tournaments/templates - List templates for venue
 * POST /api/commander/tournaments/templates - Create template (or save from existing tournament)
 */
import { createClient } from '@supabase/supabase-js';
import { guardWriteStaff } from '../../../../src/lib/commander/auth';
import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

    const _g = await guardWriteStaff(req, res); if (!_g) return;

    if (req.method === 'GET') return listTemplates(req, res);
    if (req.method === 'POST') return createTemplate(req, res, _g);

    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ success: false, error: { code: 'METHOD_NOT_ALLOWED' } });
}

async function listTemplates(req, res) {
    try {
        const { venue_id } = req.query;
        if (!venue_id) return res.status(400).json({ success: false, error: { message: 'venue_id required' } });

        const { data, error } = await supabase
            .from('commander_tournament_templates')
            .select('*')
            .eq('venue_id', venue_id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        return res.status(200).json({ success: true, data: { templates: data || [] } });
    } catch (error) {
        console.error('List templates error:', error);
        return res.status(500).json({ success: false, error: { message: error.message } });
    }
}

async function createTemplate(req, res, staff) {
    try {
        if (!staff || staff === true) {
            return res.status(401).json({ success: false, error: { message: 'Staff auth required' } });
        }

        const {
            venue_id, name, tournament_type, buyin_amount, buyin_fee,
            starting_chips, blind_structure, break_schedule, payout_structure,
            late_registration_levels, allows_rebuys, rebuy_amount, rebuy_chips,
            max_rebuys, rebuy_end_level, allows_addon, addon_amount, addon_chips,
            max_entries, settings, leaderboard_id,
            // "Save from tournament" mode
            from_tournament_id
        } = req.body;

        // If saving from existing tournament, fetch its data
        if (from_tournament_id) {
            const { data: tournament, error: tErr } = await supabase
                .from('commander_tournaments')
                .select('*')
                .eq('id', from_tournament_id)
                .single();

            if (tErr || !tournament) {
                return res.status(404).json({ success: false, error: { message: 'Tournament not found' } });
            }

            const { data: template, error } = await supabase
                .from('commander_tournament_templates')
                .insert({
                    venue_id: tournament.venue_id,
                    name: name || `${tournament.name} Template`,
                    tournament_type: tournament.tournament_type,
                    buyin_amount: tournament.buyin_amount,
                    buyin_fee: tournament.buyin_fee,
                    starting_chips: tournament.starting_chips,
                    blind_structure: tournament.blind_structure,
                    break_schedule: tournament.break_schedule,
                    payout_structure: tournament.payout_structure,
                    late_registration_levels: tournament.late_registration_levels,
                    allows_rebuys: tournament.allows_rebuys,
                    rebuy_amount: tournament.rebuy_amount,
                    rebuy_chips: tournament.rebuy_chips,
                    max_rebuys: tournament.max_rebuys,
                    rebuy_end_level: tournament.rebuy_end_level,
                    allows_addon: tournament.allows_addon,
                    addon_amount: tournament.addon_amount,
                    addon_chips: tournament.addon_chips,
                    max_entries: tournament.max_entries,
                    settings: tournament.settings,
                    leaderboard_id: tournament.leaderboard_id
                })
                .select()
                .single();

            if (error) throw error;
            return res.status(201).json({ success: true, data: { template } });
        }

        // Manual creation
        if (!venue_id || !name) {
            return res.status(400).json({ success: false, error: { message: 'venue_id and name required' } });
        }

        const { data: template, error } = await supabase
            .from('commander_tournament_templates')
            .insert({
                venue_id, name, tournament_type, buyin_amount, buyin_fee,
                starting_chips, blind_structure, break_schedule, payout_structure,
                late_registration_levels, allows_rebuys, rebuy_amount, rebuy_chips,
                max_rebuys, rebuy_end_level, allows_addon, addon_amount, addon_chips,
                max_entries, settings, leaderboard_id
            })
            .select()
            .single();

        if (error) throw error;

        return res.status(201).json({ success: true, data: { template } });
    } catch (error) {
        console.error('Create template error:', error);
        return res.status(500).json({ success: false, error: { message: error.message } });
    }
}
