/**
 * Pass on Waitlist API
 * POST /api/commander/waitlist/:id/pass
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Only POST allowed' }
    });
  }

  const { id } = req.query;
  const { pass_count = 1 } = req.body;

  try {
    // Get current entry
    const { data: entry, error: getError } = await supabase
      .from('commander_waitlist')
      .select('*')
      .eq('id', id)
      .single();

    if (getError || !entry) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Waitlist entry not found' }
      });
    }

    const newPassCount = (entry.pass_count || 0) + pass_count;
    const maxPasses = 3;

    // Remove from waitlist if too many passes
    if (newPassCount >= maxPasses) {
      // Move to history
      await supabase
        .from('commander_waitlist_history')
        .insert({
          waitlist_id: entry.id,
          venue_id: entry.venue_id,
          player_id: entry.player_id,
          game_type: entry.game_type,
          stakes: entry.stakes,
          action: 'removed',
          reason: 'max_passes_exceeded',
          action_time: new Date().toISOString()
        });

      // Delete entry
      await supabase
        .from('commander_waitlist')
        .delete()
        .eq('id', id);

      return res.status(200).json({
        success: true,
        data: {
          removed: true,
          message: 'Removed from waitlist after maximum passes'
        }
      });
    }

    // Update pass count and move to back of list
    const { data: updated, error } = await supabase
      .from('commander_waitlist')
      .update({
        pass_count: newPassCount,
        last_called: new Date().toISOString(),
        status: 'waiting'
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return res.status(200).json({
      success: true,
      data: {
        entry: updated,
        passes_remaining: maxPasses - newPassCount
      }
    });
  } catch (error) {
    console.error('Pass error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to record pass' }
    });
  }
}
