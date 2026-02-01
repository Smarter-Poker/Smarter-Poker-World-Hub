/**
 * High Hand Detail API
 * Reference: IMPLEMENTATION_PHASES.md - Phase 5
 * GET /api/commander/high-hands/:id - Get high hand details
 * PUT /api/commander/high-hands/:id - Update/verify high hand
 * DELETE /api/commander/high-hands/:id - Delete high hand
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: 'High hand ID required' });
  }

  if (req.method === 'GET') {
    return getHighHand(req, res, id);
  }

  if (req.method === 'PUT') {
    return updateHighHand(req, res, id);
  }

  if (req.method === 'DELETE') {
    return deleteHighHand(req, res, id);
  }

  res.setHeader('Allow', ['GET', 'PUT', 'DELETE']);
  return res.status(405).json({ error: 'Method not allowed' });
}

async function getHighHand(req, res, id) {
  try {
    const { data: highHand, error } = await supabase
      .from('commander_high_hands')
      .select(`
        *,
        profiles:player_id (id, display_name, avatar_url),
        commander_promotions:promotion_id (id, name, prize_type, prize_value),
        verifier:verified_by (id, display_name),
        commander_games:game_id (id, game_type, stakes)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;

    if (!highHand) {
      return res.status(404).json({ error: 'High hand not found' });
    }

    return res.status(200).json({ high_hand: highHand });
  } catch (error) {
    console.error('Get high hand error:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function updateHighHand(req, res, id) {
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

    // Get existing high hand
    const { data: existing, error: getError } = await supabase
      .from('commander_high_hands')
      .select('*')
      .eq('id', id)
      .single();

    if (getError || !existing) {
      return res.status(404).json({ error: 'High hand not found' });
    }

    // Check if user is staff at this venue
    const { data: staff } = await supabase
      .from('commander_staff')
      .select('id, role')
      .eq('venue_id', existing.venue_id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (!staff) {
      return res.status(403).json({ error: 'You are not authorized to update high hands' });
    }

    const {
      action,
      player_id,
      player_name,
      hand_description,
      hand_cards,
      board_cards,
      hand_rank,
      prize_amount
    } = req.body;

    let updates = {};

    if (action === 'verify') {
      if (existing.verified_at) {
        return res.status(400).json({ error: 'High hand already verified' });
      }
      updates = {
        verified_by: staff.id,
        verified_at: new Date().toISOString()
      };
      if (prize_amount !== undefined) {
        updates.prize_amount = prize_amount;
      }
    } else {
      // Regular update
      if (player_id !== undefined) updates.player_id = player_id;
      if (player_name !== undefined) updates.player_name = player_name;
      if (hand_description !== undefined) updates.hand_description = hand_description;
      if (hand_cards !== undefined) updates.hand_cards = hand_cards;
      if (board_cards !== undefined) updates.board_cards = board_cards;
      if (hand_rank !== undefined) updates.hand_rank = hand_rank;
      if (prize_amount !== undefined) updates.prize_amount = prize_amount;
    }

    const { data: highHand, error } = await supabase
      .from('commander_high_hands')
      .update(updates)
      .eq('id', id)
      .select(`
        *,
        profiles:player_id (id, display_name, avatar_url),
        verifier:verified_by (id, display_name)
      `)
      .single();

    if (error) throw error;

    // Award XP if this was a verification and player has ID
    if (action === 'verify' && (highHand.player_id || existing.player_id)) {
      const playerId = highHand.player_id || existing.player_id;
      // XP system removed
    }

    return res.status(200).json({ high_hand: highHand });
  } catch (error) {
    console.error('Update high hand error:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function deleteHighHand(req, res, id) {
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

    // Get existing high hand
    const { data: existing, error: getError } = await supabase
      .from('commander_high_hands')
      .select('venue_id, verified_at')
      .eq('id', id)
      .single();

    if (getError || !existing) {
      return res.status(404).json({ error: 'High hand not found' });
    }

    // Check if user is manager/owner at this venue
    const { data: staff } = await supabase
      .from('commander_staff')
      .select('id, role')
      .eq('venue_id', existing.venue_id)
      .eq('user_id', user.id)
      .in('role', ['owner', 'manager'])
      .eq('is_active', true)
      .single();

    if (!staff) {
      return res.status(403).json({ error: 'Only managers can delete high hands' });
    }

    // Prevent deleting verified high hands
    if (existing.verified_at) {
      return res.status(400).json({ error: 'Cannot delete verified high hands' });
    }

    const { error } = await supabase
      .from('commander_high_hands')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return res.status(200).json({ success: true, message: 'High hand deleted' });
  } catch (error) {
    console.error('Delete high hand error:', error);
    return res.status(500).json({ error: error.message });
  }
}
