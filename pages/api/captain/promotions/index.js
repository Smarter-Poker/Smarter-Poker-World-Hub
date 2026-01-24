/**
 * Promotions API
 * Reference: IMPLEMENTATION_PHASES.md - Phase 5
 * GET /api/captain/promotions - List promotions
 * POST /api/captain/promotions - Create promotion
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return listPromotions(req, res);
  }

  if (req.method === 'POST') {
    return createPromotion(req, res);
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: 'Method not allowed' });
}

async function listPromotions(req, res) {
  try {
    const {
      venue_id,
      status = 'active',
      promotion_type,
      limit = 50,
      offset = 0
    } = req.query;

    let query = supabase
      .from('captain_promotions')
      .select(`
        *,
        poker_venues:venue_id (id, name, city, state),
        captain_staff:created_by (id, display_name)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (venue_id) {
      query = query.eq('venue_id', parseInt(venue_id));
    }

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    if (promotion_type) {
      query = query.eq('promotion_type', promotion_type);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    return res.status(200).json({
      promotions: data,
      total: count,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('List promotions error:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function createPromotion(req, res) {
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

    const { venue_id } = req.body;

    if (!venue_id) {
      return res.status(400).json({ error: 'Venue ID required' });
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
      return res.status(403).json({ error: 'You are not authorized to create promotions for this venue' });
    }

    const {
      name,
      description,
      promotion_type,
      prize_type = 'cash',
      prize_value,
      prize_description,
      start_date,
      end_date,
      days_of_week,
      start_time,
      end_time,
      is_recurring = false,
      min_stakes,
      min_hours_played,
      min_buyin,
      game_types,
      qualifying_hands,
      status = 'draft',
      is_featured = false,
      image_url,
      terms_conditions,
      settings = {}
    } = req.body;

    if (!name || !promotion_type) {
      return res.status(400).json({ error: 'Name and promotion type are required' });
    }

    const { data: promotion, error } = await supabase
      .from('captain_promotions')
      .insert({
        venue_id: parseInt(venue_id),
        name,
        description,
        promotion_type,
        prize_type,
        prize_value,
        prize_description,
        start_date,
        end_date,
        days_of_week,
        start_time,
        end_time,
        is_recurring,
        min_stakes,
        min_hours_played,
        min_buyin,
        game_types,
        qualifying_hands,
        status,
        is_featured,
        image_url,
        terms_conditions,
        settings,
        created_by: staff.id
      })
      .select(`
        *,
        poker_venues:venue_id (id, name)
      `)
      .single();

    if (error) throw error;

    return res.status(201).json({ promotion });
  } catch (error) {
    console.error('Create promotion error:', error);
    return res.status(500).json({ error: error.message });
  }
}
