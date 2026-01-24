/**
 * Promotion Awards API
 * Reference: IMPLEMENTATION_PHASES.md - Phase 5
 * GET /api/captain/promotions/[id]/awards - List awards for promotion
 * POST /api/captain/promotions/[id]/awards - Create award
 */
import { createClient } from '@supabase/supabase-js';
import { awardXP } from '../../../../../src/lib/captain/xp';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const { id: promotionId } = req.query;

  if (!promotionId) {
    return res.status(400).json({ error: 'Promotion ID required' });
  }

  if (req.method === 'GET') {
    return listAwards(req, res, promotionId);
  }

  if (req.method === 'POST') {
    return createAward(req, res, promotionId);
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: 'Method not allowed' });
}

async function listAwards(req, res, promotionId) {
  try {
    const { status, limit = 50, offset = 0 } = req.query;

    let query = supabase
      .from('captain_promotion_awards')
      .select(`
        *,
        profiles:player_id (id, display_name, avatar_url),
        captain_promotions:promotion_id (id, name, promotion_type),
        captain_staff:approved_by (id, display_name)
      `, { count: 'exact' })
      .eq('promotion_id', promotionId)
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    return res.status(200).json({
      awards: data,
      total: count,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('List awards error:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function createAward(req, res, promotionId) {
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

    // Get promotion
    const { data: promotion } = await supabase
      .from('captain_promotions')
      .select('id, venue_id, name, promotion_type, prize_type, prize_value')
      .eq('id', promotionId)
      .single();

    if (!promotion) {
      return res.status(404).json({ error: 'Promotion not found' });
    }

    // Check if user is staff at this venue
    const { data: staff } = await supabase
      .from('captain_staff')
      .select('id, role')
      .eq('venue_id', promotion.venue_id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (!staff) {
      return res.status(403).json({ error: 'You are not authorized to create awards' });
    }

    const {
      player_id,
      player_name,
      prize_value = promotion.prize_value,
      prize_description,
      session_id,
      table_id,
      game_details,
      notes,
      auto_approve = false
    } = req.body;

    if (!player_name && !player_id) {
      return res.status(400).json({ error: 'Player name or ID required' });
    }

    if (!prize_value) {
      return res.status(400).json({ error: 'Prize value required' });
    }

    const status = auto_approve ? 'approved' : 'pending';

    const { data: award, error } = await supabase
      .from('captain_promotion_awards')
      .insert({
        promotion_id: promotionId,
        venue_id: promotion.venue_id,
        player_id,
        player_name: player_name || null,
        award_type: promotion.promotion_type,
        prize_value,
        prize_description: prize_description || `${promotion.name} winner`,
        session_id,
        table_id,
        game_details,
        status,
        approved_by: auto_approve ? staff.id : null,
        approved_at: auto_approve ? new Date().toISOString() : null,
        notes
      })
      .select(`
        *,
        profiles:player_id (id, display_name, avatar_url)
      `)
      .single();

    if (error) throw error;

    // Award XP to player if they have a profile
    if (player_id) {
      await awardXP(player_id, 'promotion_win', {
        promotion_name: promotion.name,
        prize_value
      });
    }

    return res.status(201).json({ award });
  } catch (error) {
    console.error('Create award error:', error);
    return res.status(500).json({ error: error.message });
  }
}
