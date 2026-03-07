/**
 * Update Chips API
 * PUT /api/commander/tournaments/[id]/entries/[entryId]/chips
 * Updates a player's current chip count
 * Used by TD for chip count updates at breaks or manual corrections
 */
import { createClient } from '../../../../../../../src/lib/supabaseServerClient';
import { guardWriteStaff } from '../../../../../../../src/lib/commander/auth';
import { applyRateLimit, LIMITS } from '../../../../../../../src/lib/apiRateLimit';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

  const _g = await guardWriteStaff(req, res); if (!_g) return;

  if (req.method !== 'PUT') {
    res.setHeader('Allow', ['PUT']);
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { id: tournamentId, entryId } = req.query;
  if (!tournamentId || !entryId) {
    return res.status(400).json({ success: false, error: 'Tournament ID and Entry ID required' });
  }

  try {
    // Staff is already validated by guardWriteStaff at the handler level

    const { data: tournament } = await supabase
      .from('commander_tournaments')
      .select('id, venue_id')
      .eq('id', tournamentId)
      .single();
    if (!tournament) return res.status(404).json({ success: false, error: 'Tournament not found' });


    const { chips } = req.body;
    if (chips === undefined || chips < 0) {
      return res.status(400).json({ success: false, error: 'Valid chip count required (>= 0)' });
    }

    const { data: entry } = await supabase
      .from('commander_tournament_entries')
      .select('id, player_name, current_chips, status, metadata')
      .eq('id', entryId)
      .eq('tournament_id', tournamentId)
      .single();
    if (!entry) return res.status(404).json({ success: false, error: 'Entry not found' });

    const previousChips = entry.current_chips || 0;

    const { data: updated, error: uErr } = await supabase
      .from('commander_tournament_entries')
      .update({
        current_chips: chips,
        metadata: {
          ...(entry.metadata || {}),
          chip_updated_at: new Date().toISOString(),
          previous_chips: previousChips,
          updated_by: _g.id || null
        }
      })
      .eq('id', entryId)
      .select()
      .single();

    if (uErr) return res.status(500).json({ success: false, error: 'Failed to update chips' });

    return res.status(200).json({
      success: true,
      data: {
        entry_id: entryId,
        player_name: entry.player_name,
        previous_chips: previousChips,
        current_chips: chips
      }
    });
  } catch (err) {
    console.error('Update chips error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
