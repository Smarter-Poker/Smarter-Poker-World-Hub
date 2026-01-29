/**
 * Comp Balances API
 * Reference: IMPLEMENTATION_PHASES.md - Phase 5
 * GET /api/commander/comps/balances - List player balances (staff) or get own balance
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

    const { venue_id, player_id, sort_by = 'current_balance', limit = 50, offset = 0 } = req.query;

    // If no venue_id, return user's balances across all venues
    if (!venue_id) {
      const { data: balances, error } = await supabase
        .from('commander_comp_balances')
        .select(`
          *,
          poker_venues:venue_id (id, name, city, state)
        `)
        .eq('player_id', user.id)
        .order('current_balance', { ascending: false });

      if (error) throw error;

      // Calculate totals
      const totalBalance = balances?.reduce((sum, b) => sum + parseFloat(b.current_balance || 0), 0) || 0;
      const totalLifetime = balances?.reduce((sum, b) => sum + parseFloat(b.lifetime_earned || 0), 0) || 0;

      // Get total hours from sessions
      const { data: sessions } = await supabase
        .from('commander_player_sessions')
        .select('total_time_minutes')
        .eq('player_id', user.id);

      const totalHours = sessions?.reduce((sum, s) => sum + ((s.total_time_minutes || 0) / 60), 0) || 0;

      return res.status(200).json({
        success: true,
        data: {
          balances,
          balance: Math.round(totalBalance * 100) / 100,
          lifetime_earned: Math.round(totalLifetime * 100) / 100,
          total_hours: Math.round(totalHours * 10) / 10
        }
      });
    }

    // Check if user is staff at this venue
    const { data: staff } = await supabase
      .from('commander_staff')
      .select('id, role')
      .eq('venue_id', parseInt(venue_id))
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    // If staff, can view all balances
    if (staff) {
      let query = supabase
        .from('commander_comp_balances')
        .select(`
          *,
          profiles:player_id (id, display_name, avatar_url, email)
        `, { count: 'exact' })
        .eq('venue_id', parseInt(venue_id));

      if (player_id) {
        query = query.eq('player_id', player_id);
      }

      const validSortFields = ['current_balance', 'lifetime_earned', 'lifetime_redeemed', 'last_earned_at'];
      const sortField = validSortFields.includes(sort_by) ? sort_by : 'current_balance';
      query = query.order(sortField, { ascending: false });

      query = query.range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

      const { data, error, count } = await query;

      if (error) throw error;

      // Calculate totals
      const { data: totals } = await supabase
        .from('commander_comp_balances')
        .select('current_balance, lifetime_earned, lifetime_redeemed')
        .eq('venue_id', parseInt(venue_id));

      const summary = totals?.reduce((acc, b) => ({
        total_outstanding: acc.total_outstanding + parseFloat(b.current_balance || 0),
        total_earned: acc.total_earned + parseFloat(b.lifetime_earned || 0),
        total_redeemed: acc.total_redeemed + parseFloat(b.lifetime_redeemed || 0)
      }), { total_outstanding: 0, total_earned: 0, total_redeemed: 0 });

      return res.status(200).json({
        balances: data,
        total: count,
        summary,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
    }

    // Non-staff can only see their own balance
    const { data: balance, error } = await supabase
      .from('commander_comp_balances')
      .select(`
        *,
        poker_venues:venue_id (id, name, city, state)
      `)
      .eq('venue_id', parseInt(venue_id))
      .eq('player_id', user.id)
      .single();

    if (error && error.code !== 'PGRST116') throw error;

    return res.status(200).json({
      balance: balance || {
        current_balance: 0,
        lifetime_earned: 0,
        lifetime_redeemed: 0
      }
    });
  } catch (error) {
    console.error('Get comp balances error:', error);
    return res.status(500).json({ error: error.message });
  }
}
