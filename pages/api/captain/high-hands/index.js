/**
 * High Hands API
 * Reference: IMPLEMENTATION_PHASES.md - Phase 5
 * GET /api/captain/high-hands - List high hands for venue
 * POST /api/captain/high-hands - Record new high hand
 */
import { createClient } from '@supabase/supabase-js';
import { awardXP } from '../../../../src/lib/captain/xp';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return listHighHands(req, res);
  }

  if (req.method === 'POST') {
    return createHighHand(req, res);
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: 'Method not allowed' });
}

async function listHighHands(req, res) {
  try {
    const {
      venue_id,
      promotion_id,
      date,
      limit = 50,
      offset = 0
    } = req.query;

    if (!venue_id) {
      return res.status(400).json({ error: 'Venue ID required' });
    }

    let query = supabase
      .from('captain_high_hands')
      .select(`
        *,
        profiles:player_id (id, display_name, avatar_url),
        captain_promotions:promotion_id (id, name),
        verifier:verified_by (id, display_name)
      `, { count: 'exact' })
      .eq('venue_id', parseInt(venue_id))
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (promotion_id) {
      query = query.eq('promotion_id', promotion_id);
    }

    if (date) {
      query = query.gte('created_at', `${date}T00:00:00`).lt('created_at', `${date}T23:59:59`);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    // Get current high hand (highest rank today)
    const today = new Date().toISOString().split('T')[0];
    const { data: currentHigh } = await supabase
      .from('captain_high_hands')
      .select(`
        *,
        profiles:player_id (id, display_name, avatar_url)
      `)
      .eq('venue_id', parseInt(venue_id))
      .gte('created_at', `${today}T00:00:00`)
      .not('verified_at', 'is', null)
      .order('hand_rank', { ascending: false })
      .limit(1)
      .single();

    return res.status(200).json({
      high_hands: data,
      current_high: currentHigh || null,
      total: count,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('List high hands error:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function createHighHand(req, res) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization required' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const {
      venue_id,
      promotion_id,
      player_id,
      player_name,
      hand_description,
      hand_cards,
      board_cards,
      hand_rank,
      game_id,
      table_number,
      prize_amount,
      auto_verify = false
    } = req.body;

    if (!venue_id || !hand_description) {
      return res.status(400).json({ error: 'venue_id and hand_description required' });
    }

    if (!player_id && !player_name) {
      return res.status(400).json({ error: 'player_id or player_name required' });
    }

    // Check if user is staff at this venue
    const { data: staff } = await supabase
      .from('captain_staff')
      .select('id, role')
      .eq('venue_id', parseInt(venue_id))
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (!staff) {
      return res.status(403).json({ error: 'You are not authorized to record high hands' });
    }

    const insertData = {
      venue_id: parseInt(venue_id),
      promotion_id: promotion_id || null,
      player_id: player_id || null,
      player_name: player_name || null,
      hand_description,
      hand_cards: hand_cards || null,
      board_cards: board_cards || null,
      hand_rank: hand_rank || null,
      game_id: game_id || null,
      table_number: table_number || null,
      prize_amount: prize_amount || null
    };

    if (auto_verify) {
      insertData.verified_by = staff.id;
      insertData.verified_at = new Date().toISOString();
    }

    const { data: highHand, error } = await supabase
      .from('captain_high_hands')
      .insert(insertData)
      .select(`
        *,
        profiles:player_id (id, display_name, avatar_url)
      `)
      .single();

    if (error) throw error;

    // Award XP if verified and has player_id
    if (auto_verify && player_id && prize_amount) {
      await awardXP(player_id, 'high_hand', {
        venue_id: parseInt(venue_id),
        hand_description,
        prize_amount
      });
    }

    return res.status(201).json({ high_hand: highHand });
  } catch (error) {
    console.error('Create high hand error:', error);
    return res.status(500).json({ error: error.message });
  }
}
