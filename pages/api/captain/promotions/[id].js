/**
 * Single Promotion API
 * Reference: IMPLEMENTATION_PHASES.md - Phase 5
 * GET /api/captain/promotions/[id] - Get promotion details
 * PUT /api/captain/promotions/[id] - Update promotion
 * DELETE /api/captain/promotions/[id] - Delete promotion
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: 'Promotion ID required' });
  }

  if (req.method === 'GET') {
    return getPromotion(req, res, id);
  }

  if (req.method === 'PUT') {
    return updatePromotion(req, res, id);
  }

  if (req.method === 'DELETE') {
    return deletePromotion(req, res, id);
  }

  res.setHeader('Allow', ['GET', 'PUT', 'DELETE']);
  return res.status(405).json({ error: 'Method not allowed' });
}

async function getPromotion(req, res, id) {
  try {
    const { data: promotion, error } = await supabase
      .from('captain_promotions')
      .select(`
        *,
        poker_venues:venue_id (id, name, city, state, address),
        captain_staff:created_by (id, display_name)
      `)
      .eq('id', id)
      .single();

    if (error || !promotion) {
      return res.status(404).json({ error: 'Promotion not found' });
    }

    // Get recent awards
    const { data: recentAwards } = await supabase
      .from('captain_promotion_awards')
      .select(`
        id,
        player_name,
        prize_value,
        prize_description,
        status,
        created_at,
        profiles:player_id (id, display_name, avatar_url)
      `)
      .eq('promotion_id', id)
      .order('created_at', { ascending: false })
      .limit(10);

    return res.status(200).json({
      promotion,
      recent_awards: recentAwards || []
    });
  } catch (error) {
    console.error('Get promotion error:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function updatePromotion(req, res, id) {
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

    // Get promotion to check venue
    const { data: existing } = await supabase
      .from('captain_promotions')
      .select('venue_id')
      .eq('id', id)
      .single();

    if (!existing) {
      return res.status(404).json({ error: 'Promotion not found' });
    }

    // Check if user is staff at this venue
    const { data: staff } = await supabase
      .from('captain_staff')
      .select('id, role')
      .eq('venue_id', existing.venue_id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (!staff) {
      return res.status(403).json({ error: 'You are not authorized to update this promotion' });
    }

    const updates = {};
    const allowedFields = [
      'name', 'description', 'promotion_type', 'prize_type', 'prize_value',
      'prize_description', 'start_date', 'end_date', 'days_of_week',
      'start_time', 'end_time', 'is_recurring', 'min_stakes', 'min_hours_played',
      'min_buyin', 'game_types', 'qualifying_hands', 'status', 'is_featured',
      'image_url', 'terms_conditions', 'settings'
    ];

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    updates.updated_at = new Date().toISOString();

    const { data: promotion, error } = await supabase
      .from('captain_promotions')
      .update(updates)
      .eq('id', id)
      .select(`
        *,
        poker_venues:venue_id (id, name)
      `)
      .single();

    if (error) throw error;

    return res.status(200).json({ promotion });
  } catch (error) {
    console.error('Update promotion error:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function deletePromotion(req, res, id) {
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

    // Get promotion to check venue
    const { data: existing } = await supabase
      .from('captain_promotions')
      .select('venue_id')
      .eq('id', id)
      .single();

    if (!existing) {
      return res.status(404).json({ error: 'Promotion not found' });
    }

    // Check if user is owner/manager at this venue
    const { data: staff } = await supabase
      .from('captain_staff')
      .select('id, role')
      .eq('venue_id', existing.venue_id)
      .eq('user_id', user.id)
      .in('role', ['owner', 'manager'])
      .eq('is_active', true)
      .single();

    if (!staff) {
      return res.status(403).json({ error: 'Only owners and managers can delete promotions' });
    }

    const { error } = await supabase
      .from('captain_promotions')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return res.status(200).json({ success: true, message: 'Promotion deleted' });
  } catch (error) {
    console.error('Delete promotion error:', error);
    return res.status(500).json({ error: error.message });
  }
}
