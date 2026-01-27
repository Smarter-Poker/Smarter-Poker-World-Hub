/**
 * Union Venues API
 * GET /api/captain/unions/[id]/venues - List venues in union
 * POST /api/captain/unions/[id]/venues - Add venue to union
 * DELETE /api/captain/unions/[id]/venues?venue_id=X - Remove venue from union
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Union ID required' }
    });
  }

  // Auth check
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({
      success: false,
      error: { code: 'AUTH_REQUIRED', message: 'Authorization required' }
    });
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Invalid token' }
    });
  }

  // Check ownership
  const { data: union } = await supabase
    .from('captain_unions')
    .select('owner_id')
    .eq('id', id)
    .single();

  if (!union) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Union not found' }
    });
  }

  if (union.owner_id !== user.id) {
    return res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Only the owner can manage venues' }
    });
  }

  if (req.method === 'GET') {
    return getVenues(req, res, id);
  }

  if (req.method === 'POST') {
    return addVenue(req, res, id);
  }

  if (req.method === 'DELETE') {
    return removeVenue(req, res, id);
  }

  res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
  return res.status(405).json({
    success: false,
    error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
  });
}

async function getVenues(req, res, unionId) {
  try {
    const { data: venues, error } = await supabase
      .from('captain_union_venues')
      .select(`
        *,
        poker_venues:venue_id (
          id, name, city, state, address,
          captain_games (id, status),
          captain_waitlist (id, status)
        )
      `)
      .eq('union_id', unionId)
      .order('joined_at', { ascending: false });

    if (error) {
      console.error('Get union venues error:', error);
      return res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Failed to fetch venues' }
      });
    }

    // Add computed stats
    const venuesWithStats = venues?.map(v => ({
      ...v,
      active_games: v.poker_venues?.captain_games?.filter(g => g.status === 'active').length || 0,
      waiting_players: v.poker_venues?.captain_waitlist?.filter(w => w.status === 'waiting').length || 0
    }));

    return res.status(200).json({
      success: true,
      data: { venues: venuesWithStats || [] }
    });
  } catch (error) {
    console.error('Union venues API error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
  }
}

async function addVenue(req, res, unionId) {
  try {
    const { venue_id, tier, revenue_share } = req.body;

    if (!venue_id) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Venue ID required' }
      });
    }

    // Check if venue exists
    const { data: venue } = await supabase
      .from('poker_venues')
      .select('id, name')
      .eq('id', venue_id)
      .single();

    if (!venue) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Venue not found' }
      });
    }

    // Check if already in this or another union
    const { data: existing } = await supabase
      .from('captain_union_venues')
      .select('id, union_id')
      .eq('venue_id', venue_id)
      .single();

    if (existing) {
      if (existing.union_id === unionId) {
        return res.status(400).json({
          success: false,
          error: { code: 'ALREADY_EXISTS', message: 'Venue is already in this union' }
        });
      }
      return res.status(400).json({
        success: false,
        error: { code: 'CONFLICT', message: 'Venue belongs to another union' }
      });
    }

    const { data: unionVenue, error } = await supabase
      .from('captain_union_venues')
      .insert({
        union_id: unionId,
        venue_id: venue_id,
        tier: tier || 'standard',
        revenue_share: revenue_share || null,
        status: 'active'
      })
      .select(`
        *,
        poker_venues:venue_id (id, name, city, state)
      `)
      .single();

    if (error) {
      console.error('Add union venue error:', error);
      return res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Failed to add venue' }
      });
    }

    return res.status(201).json({
      success: true,
      data: { venue: unionVenue }
    });
  } catch (error) {
    console.error('Add venue API error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
  }
}

async function removeVenue(req, res, unionId) {
  try {
    const { venue_id } = req.query;

    if (!venue_id) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Venue ID required' }
      });
    }

    const { error } = await supabase
      .from('captain_union_venues')
      .delete()
      .eq('union_id', unionId)
      .eq('venue_id', venue_id);

    if (error) {
      console.error('Remove union venue error:', error);
      return res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Failed to remove venue' }
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Venue removed from union'
    });
  } catch (error) {
    console.error('Remove venue API error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
  }
}
