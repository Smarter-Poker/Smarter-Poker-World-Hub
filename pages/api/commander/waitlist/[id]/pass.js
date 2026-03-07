/**
 * Pass on Waitlist API
 * POST /api/commander/waitlist/:id/pass
 */
import { createClient } from '../../../../../src/lib/supabaseServerClient';
import { guardWriteStaff } from '../../../../../src/lib/commander/auth';
import { applyRateLimit, LIMITS } from '../../../../../src/lib/apiRateLimit';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

  const staff = await guardWriteStaff(req, res); if (!staff) return;

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Only POST allowed' }
    });
  }

  const { id } = req.query;

  try {
    // Get current entry
    const { data: entry, error: getError } = await supabase
      .from('commander_waitlist')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (getError || !entry) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Waitlist entry not found' }
      });
    }

    // Track pass count for informational purposes
    const maxPasses = 3;
    const currentPassCount = entry.pass_count || 0;

    // Move player to bottom of list: get max position for same game at this venue
    let newPosition = (entry.position || 0) + 1;
    try {
      const { data: maxEntry } = await supabase
        .from('commander_waitlist')
        .select('position')
        .eq('venue_id', entry.venue_id)
        .eq('game_type', entry.game_type)
        .eq('stakes', entry.stakes)
        .in('status', ['waiting', 'called'])
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (maxEntry?.position) newPosition = maxEntry.position + 1;
    } catch { /* use fallback */ }

    // Set status back to waiting, move to bottom position
    const { data: updated, error } = await supabase
      .from('commander_waitlist')
      .update({
        last_called_at: new Date().toISOString(),
        status: 'waiting',
        pass_count: (entry.pass_count || 0) + 1,
        position: newPosition
      })
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) throw error;

    return res.status(200).json({
      success: true,
      data: {
        entry: updated,
        passes_remaining: maxPasses - currentPassCount
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
