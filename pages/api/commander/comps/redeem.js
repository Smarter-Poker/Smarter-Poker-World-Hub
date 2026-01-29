/**
 * Comp Redemption API
 * Reference: IMPLEMENTATION_PHASES.md - Phase 5
 * POST /api/commander/comps/redeem - Redeem player comps
 * GET /api/commander/comps/redeem - List redemptions
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method === 'POST') {
    return redeemComps(req, res);
  }

  if (req.method === 'GET') {
    return listRedemptions(req, res);
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: 'Method not allowed' });
}

async function redeemComps(req, res) {
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
      player_id,
      amount,
      redemption_type,
      description
    } = req.body;

    if (!venue_id || !player_id || !amount || !redemption_type) {
      return res.status(400).json({
        error: 'Venue ID, player ID, amount, and redemption type are required'
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

    if (!staff) {
      return res.status(403).json({ error: 'Staff access required to process redemptions' });
    }

    // Use the database function to redeem
    const { data, error } = await supabase.rpc('redeem_comps', {
      p_venue_id: parseInt(venue_id),
      p_player_id: player_id,
      p_amount: parseFloat(amount),
      p_redemption_type: redemption_type,
      p_description: description || `${redemption_type} redemption`,
      p_staff_id: staff.id
    });

    if (error) {
      // Handle specific error messages from the function
      if (error.message.includes('Insufficient')) {
        return res.status(400).json({ error: error.message });
      }
      if (error.message.includes('frozen')) {
        return res.status(403).json({ error: 'Player comp balance is frozen' });
      }
      throw error;
    }

    // Get the redemption details
    const { data: redemption } = await supabase
      .from('commander_comp_redemptions')
      .select(`
        *,
        profiles:player_id (id, display_name, avatar_url),
        commander_staff:processed_by (id, display_name)
      `)
      .eq('id', data)
      .single();

    // Get updated balance
    const { data: balance } = await supabase
      .from('commander_comp_balances')
      .select('*')
      .eq('venue_id', parseInt(venue_id))
      .eq('player_id', player_id)
      .single();

    return res.status(200).json({
      redemption,
      balance,
      message: `$${amount.toFixed(2)} comps redeemed successfully`
    });
  } catch (error) {
    console.error('Redeem comps error:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function listRedemptions(req, res) {
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
      player_id,
      status,
      redemption_type,
      limit = 50,
      offset = 0
    } = req.query;

    let query = supabase
      .from('commander_comp_redemptions')
      .select(`
        *,
        profiles:player_id (id, display_name, avatar_url),
        commander_staff:processed_by (id, display_name)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (venue_id) {
      // Check if staff
      const { data: staff } = await supabase
        .from('commander_staff')
        .select('id, role')
        .eq('venue_id', parseInt(venue_id))
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single();

      if (staff) {
        query = query.eq('venue_id', parseInt(venue_id));
        if (player_id) {
          query = query.eq('player_id', player_id);
        }
      } else {
        query = query.eq('venue_id', parseInt(venue_id)).eq('player_id', user.id);
      }
    } else {
      query = query.eq('player_id', user.id);
    }

    if (status) {
      query = query.eq('status', status);
    }

    if (redemption_type) {
      query = query.eq('redemption_type', redemption_type);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    return res.status(200).json({
      redemptions: data,
      total: count,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('List redemptions error:', error);
    return res.status(500).json({ error: error.message });
  }
}
