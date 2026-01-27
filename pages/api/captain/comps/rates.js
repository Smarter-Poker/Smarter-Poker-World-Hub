/**
 * Comp Rates API
 * Reference: IMPLEMENTATION_PHASES.md - Phase 5
 * GET /api/captain/comps/rates - List comp rates for venue
 * POST /api/captain/comps/rates - Create comp rate
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return listRates(req, res);
  }

  if (req.method === 'POST') {
    return createRate(req, res);
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: 'Method not allowed' });
}

async function listRates(req, res) {
  try {
    const { venue_id, active_only = 'true' } = req.query;

    // If no venue_id, return a default rate for display purposes
    if (!venue_id) {
      // Get any default rates for display
      const { data: defaultRates } = await supabase
        .from('captain_comp_rates')
        .select('comp_value')
        .eq('is_default', true)
        .eq('is_active', true)
        .eq('rate_type', 'hourly')
        .limit(1);

      const ratePerHour = defaultRates?.[0]?.comp_value || 1;

      return res.status(200).json({
        success: true,
        data: {
          rates: [],
          rate_per_hour: ratePerHour
        }
      });
    }

    let query = supabase
      .from('captain_comp_rates')
      .select('*')
      .eq('venue_id', parseInt(venue_id))
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });

    if (active_only === 'true') {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Find the default hourly rate
    const defaultRate = data?.find(r => r.is_default && r.rate_type === 'hourly');
    const ratePerHour = defaultRate?.comp_value || 1;

    return res.status(200).json({
      success: true,
      data: {
        rates: data,
        rate_per_hour: ratePerHour
      }
    });
  } catch (error) {
    console.error('List comp rates error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    });
  }
}

async function createRate(req, res) {
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

    // Check if user is manager/owner at this venue
    const { data: staff } = await supabase
      .from('captain_staff')
      .select('id, role')
      .eq('venue_id', parseInt(venue_id))
      .eq('user_id', user.id)
      .in('role', ['owner', 'manager'])
      .eq('is_active', true)
      .single();

    if (!staff) {
      return res.status(403).json({ error: 'Manager or owner role required' });
    }

    const {
      name,
      description,
      rate_type,
      comp_value,
      per_unit = 1,
      unit_label,
      min_stakes,
      game_types,
      min_session_hours,
      weekday_multiplier = 1.0,
      weekend_multiplier = 1.0,
      happy_hour_multiplier = 1.0,
      vip_multiplier = 1.0,
      is_active = true,
      is_default = false
    } = req.body;

    if (!name || !rate_type || !comp_value) {
      return res.status(400).json({ error: 'Name, rate type, and comp value are required' });
    }

    // If setting as default, unset other defaults
    if (is_default) {
      await supabase
        .from('captain_comp_rates')
        .update({ is_default: false })
        .eq('venue_id', parseInt(venue_id))
        .eq('rate_type', rate_type);
    }

    const { data: rate, error } = await supabase
      .from('captain_comp_rates')
      .insert({
        venue_id: parseInt(venue_id),
        name,
        description,
        rate_type,
        comp_value,
        per_unit,
        unit_label,
        min_stakes,
        game_types,
        min_session_hours,
        weekday_multiplier,
        weekend_multiplier,
        happy_hour_multiplier,
        vip_multiplier,
        is_active,
        is_default
      })
      .select()
      .single();

    if (error) throw error;

    return res.status(201).json({ rate });
  } catch (error) {
    console.error('Create comp rate error:', error);
    return res.status(500).json({ error: error.message });
  }
}
