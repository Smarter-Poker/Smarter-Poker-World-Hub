/**
 * Freeroll Qualifications API
 * GET    /api/commander/freerolls/[id]/qualifications - List qualifications
 * POST   /api/commander/freerolls/[id]/qualifications - Add / update a player
 * DELETE /api/commander/freerolls/[id]/qualifications - Remove a player (pass ?player_id=)
 */
import { createClient } from '@supabase/supabase-js';
import { guardWriteStaff } from '../../../../../src/lib/commander/auth';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    const guard = await guardWriteStaff(req, res);
    if (!guard) return;

    const freerollId = req.query.id;
    if (!freerollId) {
        return res.status(400).json({
            success: false,
            error: { code: 'MISSING_ID', message: 'Freeroll ID required' }
        });
    }

    if (req.method === 'GET') return listQualifications(req, res, freerollId);
    if (req.method === 'POST') return upsertQualification(req, res, freerollId);
    if (req.method === 'DELETE') return removeQualification(req, res, freerollId);

    return res.status(405).json({
        success: false,
        error: { code: 'METHOD_NOT_ALLOWED', message: 'GET, POST, DELETE allowed' }
    });
}

async function listQualifications(req, res, freerollId) {
    try {
        const { data: quals, error } = await supabase
            .from('commander_freeroll_qualifications')
            .select('*')
            .eq('freeroll_id', freerollId)
            .order('is_qualified', { ascending: false })
            .order('hours_logged', { ascending: false })
            .order('points_earned', { ascending: false });

        if (error) throw error;

        return res.status(200).json({
            success: true,
            data: { qualifications: quals || [] }
        });
    } catch (error) {
        console.error('Qualifications fetch error:', error);
        return res.status(500).json({
            success: false,
            error: { code: 'SERVER_ERROR', message: 'Failed to fetch qualifications' }
        });
    }
}

async function upsertQualification(req, res, freerollId) {
    const {
        player_id, player_name, hours_logged, points_earned,
        custom_value, is_qualified, manually_added, notes
    } = req.body;

    if (!player_id && !player_name) {
        return res.status(400).json({
            success: false,
            error: { code: 'MISSING_FIELDS', message: 'player_id or player_name required' }
        });
    }

    try {
        // First check the freeroll to auto-qualify based on threshold
        const { data: freeroll } = await supabase
            .from('commander_freerolls')
            .select('qualification_type, qualification_threshold')
            .eq('id', freerollId)
            .single();

        let autoQualified = is_qualified || false;
        const threshold = freeroll?.qualification_threshold || 0;

        if (freeroll && threshold > 0) {
            if (freeroll.qualification_type === 'cash_hours' && (hours_logged || 0) >= threshold) {
                autoQualified = true;
            }
            if (freeroll.qualification_type === 'tournament_points' && (points_earned || 0) >= threshold) {
                autoQualified = true;
            }
        }

        if (manually_added) autoQualified = true;

        const payload = {
            freeroll_id: freerollId,
            player_id: player_id || null,
            player_name: player_name || null,
            hours_logged: hours_logged ?? 0,
            points_earned: points_earned ?? 0,
            custom_value: custom_value || null,
            is_qualified: autoQualified,
            qualified_at: autoQualified ? new Date().toISOString() : null,
            manually_added: manually_added || false,
            notes: notes || null,
            updated_at: new Date().toISOString(),
        };

        // Upsert based on freeroll_id + player_id
        const { data: qual, error } = await supabase
            .from('commander_freeroll_qualifications')
            .upsert(payload, {
                onConflict: 'freeroll_id,player_id',
                ignoreDuplicates: false,
            })
            .select()
            .single();

        if (error) throw error;

        return res.status(200).json({ success: true, data: { qualification: qual } });
    } catch (error) {
        console.error('Upsert qualification error:', error);
        return res.status(500).json({
            success: false,
            error: { code: 'SERVER_ERROR', message: error.message }
        });
    }
}

async function removeQualification(req, res, freerollId) {
    const playerId = req.query.player_id || req.body?.player_id;

    if (!playerId) {
        return res.status(400).json({
            success: false,
            error: { code: 'MISSING_FIELDS', message: 'player_id required' }
        });
    }

    try {
        const { error } = await supabase
            .from('commander_freeroll_qualifications')
            .delete()
            .eq('freeroll_id', freerollId)
            .eq('player_id', playerId);

        if (error) throw error;

        return res.status(200).json({ success: true });
    } catch (error) {
        console.error('Remove qualification error:', error);
        return res.status(500).json({
            success: false,
            error: { code: 'SERVER_ERROR', message: error.message }
        });
    }
}
