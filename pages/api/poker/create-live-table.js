/**
 * POST /api/poker/create-live-table
 * 
 * Creates a new live poker table and persists config to Supabase poker_tables.
 * Used by the PokerLobby's Create Table dialog.
 * 
 * Body: { name, variant, maxSeats, smallBlind, bigBlind, minBuyIn, maxBuyIn, userId, clubId? }
 * Returns: { tableId, success: true }
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      name,
      variant = 'holdem',
      maxSeats = 9,
      smallBlind = 1,
      bigBlind = 2,
      minBuyIn,
      maxBuyIn,
      userId,
      clubId = null,
    } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }

    // Validate
    const sb = parseInt(smallBlind) || 1;
    const bb = parseInt(bigBlind) || sb * 2;
    const seats = Math.min(Math.max(parseInt(maxSeats) || 9, 2), 10);
    const minBI = parseInt(minBuyIn) || bb * 20;
    const maxBI = parseInt(maxBuyIn) || bb * 100;

    const tableConfig = {
      name: name || `${sb}/${bb} ${variant === 'holdem' ? "NLH" : variant.toUpperCase()}`,
      game_type: variant,
      betting_structure: 'no_limit',
      table_size: seats,
      small_blind: sb,
      big_blind: bb,
      min_buy_in: minBI,
      max_buy_in: maxBI,
      created_by: userId,
      status: 'waiting',
      hand_number: 0,
      hands_played: 0,
      pot_total: 0,
      current_bet: 0,
      dealer_seat: 0,
    };

    let tableId = null;

    // Persist to Supabase poker_tables
    if (supabaseServiceKey) {
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      
      const { data, error } = await supabase
        .from('poker_tables')
        .insert(tableConfig)
        .select('id')
        .single();
      
      if (error) {
        console.warn('[create-live-table] DB insert failed:', error.message);
        tableId = `table_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      } else {
        tableId = data.id;
      }
    } else {
      tableId = `table_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }

    return res.status(200).json({
      success: true,
      tableId,
      config: { ...tableConfig, id: tableId },
    });

  } catch (err) {
    console.error('[create-live-table] Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
