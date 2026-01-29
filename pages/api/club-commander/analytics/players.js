/**
 * Player Stats API
 * Reference: IMPLEMENTATION_PHASES.md - Phase 5
 * GET /api/club-commander/analytics/players - Get player stats for venue
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
      loyalty_tier,
      sort_by = 'total_hours',
      sort_order = 'desc',
      search,
      limit = 50,
      offset = 0
    } = req.query;

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
      return res.status(403).json({ error: 'You are not authorized to view player stats' });
    }

    let query = supabase
      .from('captain_player_stats')
      .select(`
        *,
        profiles:player_id (id, display_name, avatar_url, email)
      `, { count: 'exact' })
      .eq('venue_id', parseInt(venue_id));

    if (loyalty_tier) {
      query = query.eq('loyalty_tier', loyalty_tier);
    }

    // Sort options
    const validSortFields = ['total_hours', 'total_visits', 'last_visit', 'total_buyin', 'loyalty_points'];
    const sortField = validSortFields.includes(sort_by) ? sort_by : 'total_hours';
    query = query.order(sortField, { ascending: sort_order === 'asc' });

    query = query.range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    const { data, error, count } = await query;

    if (error) throw error;

    // Filter by search if provided (post-query since we need to search profile names)
    let filteredData = data;
    if (search) {
      const searchLower = search.toLowerCase();
      filteredData = data.filter(p =>
        p.profiles?.display_name?.toLowerCase().includes(searchLower) ||
        p.profiles?.email?.toLowerCase().includes(searchLower)
      );
    }

    // Calculate tier breakdown
    const tierBreakdown = {
      bronze: 0,
      silver: 0,
      gold: 0,
      platinum: 0,
      diamond: 0
    };
    data.forEach(p => {
      if (p.loyalty_tier && tierBreakdown[p.loyalty_tier] !== undefined) {
        tierBreakdown[p.loyalty_tier]++;
      }
    });

    return res.status(200).json({
      players: filteredData,
      total: count,
      tier_breakdown: tierBreakdown,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Get player stats error:', error);
    return res.status(500).json({ error: error.message });
  }
}
