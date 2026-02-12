/**
 * Tournament Addon API
 * POST /api/commander/tournaments/[id]/entries/[entryId]/addon
 * Processes an add-on for a tournament player
 * Adds chips, sets addon_taken flag (one-time only)
 */
import { createClient } from '@supabase/supabase-js';
import { guardWriteStaff } from '../../../../../../../src/lib/commander/auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const _g = await guardWriteStaff(req, res); if (!_g) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { id: tournamentId, entryId } = req.query;
  if (!tournamentId || !entryId) {
    return res.status(400).json({ success: false, error: 'Tournament ID and Entry ID required' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, error: 'Authorization required' });
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

    const { data: tournament } = await supabase
      .from('commander_tournaments')
      .select('id, venue_id, allows_addon, addon_cost, addon_chips, addon_level')
      .eq('id', tournamentId)
      .single();
    if (!tournament) return res.status(404).json({ success: false, error: 'Tournament not found' });

    const { data: staff } = await supabase
      .from('commander_staff')
      .select('id')
      .eq('venue_id', tournament.venue_id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();
    if (!staff) return res.status(403).json({ success: false, error: 'Staff access required' });

    if (!tournament.allows_addon) {
      return res.status(400).json({ success: false, error: 'Add-ons not allowed in this tournament' });
    }

    const { data: entry } = await supabase
      .from('commander_tournament_entries')
      .select('*')
      .eq('id', entryId)
      .eq('tournament_id', tournamentId)
      .single();
    if (!entry) return res.status(404).json({ success: false, error: 'Entry not found' });

    if (!['active', 'seated'].includes(entry.status)) {
      return res.status(400).json({ success: false, error: 'Player must be active to take add-on' });
    }

    if (entry.addon_taken) {
      return res.status(400).json({ success: false, error: 'Player has already taken their add-on' });
    }

    const addonChips = tournament.addon_chips || tournament.starting_chips || 10000;
    const newChips = (entry.current_chips || 0) + addonChips;

    const { data: updated, error: uErr } = await supabase
      .from('commander_tournament_entries')
      .update({
        current_chips: newChips,
        addon_taken: true,
        metadata: {
          ...(entry.metadata || {}),
          addon_at: new Date().toISOString()
        }
      })
      .eq('id', entryId)
      .select()
      .single();

    if (uErr) return res.status(500).json({ success: false, error: 'Failed to process add-on' });

    return res.status(200).json({
      success: true,
      data: {
        entry_id: entryId,
        player_name: entry.player_name,
        chips_added: addonChips,
        total_chips: newChips,
        cost: tournament.addon_cost || 0
      }
    });
  } catch (err) {
    console.error('Addon error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
