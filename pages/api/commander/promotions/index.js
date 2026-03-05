/**
 * Promotions API
 * Reference: IMPLEMENTATION_PHASES.md - Phase 5
 * GET /api/commander/promotions - List promotions
 * POST /api/commander/promotions - Create promotion
 */
import { createClient } from '@supabase/supabase-js';
import { guardWriteStaff } from '../../../../src/lib/commander/auth';
import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

  const _g = await guardWriteStaff(req, res); if (!_g) return;

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
      status = 'all',
      promotion_type,
      limit = 50,
      offset = 0
    } = req.query;

    // Resolve integer venue_id: prefer query param if it's a valid integer,
    // otherwise look up from the authenticated user's staff record
    let resolvedVenueId = venue_id;
    if (!resolvedVenueId || isNaN(parseInt(resolvedVenueId))) {
      // Auto-resolve from auth
      const authHeader = req.headers.authorization;
      if (authHeader) {
        const token = authHeader.replace('Bearer ', '');
        const { data: { user } } = await supabase.auth.getUser(token);
        if (user) {
          const { data: staff } = await supabase
            .from('commander_staff')
            .select('venue_id')
            .eq('user_id', user.id)
            .eq('is_active', true)
            .single();
          if (staff) resolvedVenueId = staff.venue_id;
        }
      }
    }

    let query = supabase
      .from('commander_promotions')
      .select(`
        *,
        poker_venues:venue_id (id, name, city, state),
        commander_staff:created_by (id, role)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (resolvedVenueId) {
      query = query.eq('venue_id', resolvedVenueId)
          .limit(100);
    }

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    if (promotion_type) {
      query = query.eq('promotion_type', promotion_type);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    // Auto-expire: batch-update any active promos past their end_date
    const now = new Date().toISOString().split('T')[0];
    const expiredIds = (data || []).filter(p => p.status === 'active' && p.end_date && p.end_date < now).map(p => p.id);
    if (expiredIds.length > 0) {
      await supabase.from('commander_promotions')
        .update({ status: 'expired', updated_at: new Date().toISOString() })
        .in('id', expiredIds);
      // Reflect in response data
      data.forEach(p => { if (expiredIds.includes(p.id)) p.status = 'expired'; });
    }

    return res.status(200).json({
      success: true,
      data: {
        promotions: data,
        total: count,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    console.error('List promotions error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    });
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
      .from('commander_staff')
      .select('id, role')
      .eq('venue_id', venue_id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (!staff) {
      return res.status(403).json({ error: 'You are not authorized to create promotions for this venue' });
    }

    if (!['owner', 'manager'].includes(staff.role)) {
      return res.status(403).json({ error: 'Owner or Manager role required to create promotions' });
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
      .from('commander_promotions')
      .insert({
        venue_id: venue_id,
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

    // Push notification: broadcast to realtime channel so display pages auto-update
    try {
      const channel = supabase.channel('promotions-push');
      await channel.send({
        type: 'broadcast',
        event: 'new_promotion',
        payload: { id: promotion.id, name: promotion.name, venue_id, promotion_type }
      });
      supabase.removeChannel(channel);
    } catch (broadcastErr) {
      console.warn('Broadcast notification failed (non-critical):', broadcastErr.message);
    }

    return res.status(201).json({ promotion });
  } catch (error) {
    console.error('Create promotion error:', error);
    return res.status(500).json({ error: error.message });
  }
}
