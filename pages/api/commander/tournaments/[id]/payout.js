/**
 * Tournament Payout API
 * POST /api/commander/tournaments/:id/payout
 * GET /api/commander/tournaments/:id/payout
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const { id } = req.query;

  if (req.method === 'POST') {
    return handlePayout(req, res, id);
  } else if (req.method === 'GET') {
    return handleGetPayouts(req, res, id);
  }

  return res.status(405).json({
    success: false,
    error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
  });
}

async function handlePayout(req, res, tournamentId) {
  const { player_id, place, amount, paid_by } = req.body;

  if (!player_id || !place || !amount) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_FIELDS', message: 'player_id, place, and amount required' }
    });
  }

  try {
    // Update entry with payout
    const { data: entry, error } = await supabase
      .from('commander_tournament_entries')
      .update({
        finish_place: place,
        payout_amount: amount,
        payout_status: 'paid',
        paid_at: new Date().toISOString(),
        paid_by
      })
      .eq('tournament_id', tournamentId)
      .eq('player_id', player_id)
      .select()
      .single();

    if (error) throw error;

    // Check if this is a taxable event (>$5000)
    if (amount >= 5000) {
      await supabase
        .from('commander_tax_events')
        .insert({
          venue_id: entry.venue_id,
          player_id,
          event_type: 'tournament_win',
          gross_amount: amount,
          buy_in: entry.buy_in_amount,
          net_amount: amount - (entry.buy_in_amount || 0),
          withholding_required: amount >= 5000
        });
    }

    return res.status(200).json({
      success: true,
      data: { entry }
    });
  } catch (error) {
    console.error('Payout error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to record payout' }
    });
  }
}

async function handleGetPayouts(req, res, tournamentId) {
  try {
    const { data: payouts, error } = await supabase
      .from('commander_tournament_entries')
      .select(`
        *,
        profiles (id, display_name, avatar_url)
      `)
      .eq('tournament_id', tournamentId)
      .not('payout_amount', 'is', null)
      .order('finish_place', { ascending: true });

    if (error) throw error;

    return res.status(200).json({
      success: true,
      data: { payouts: payouts || [] }
    });
  } catch (error) {
    console.error('Get payouts error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to fetch payouts' }
    });
  }
}
