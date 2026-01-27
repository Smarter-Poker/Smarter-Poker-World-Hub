/**
 * Marketplace Dealers API
 * GET /api/captain/marketplace/dealers - List available freelance dealers
 * POST /api/captain/marketplace/dealers - Register as freelance dealer
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return listDealers(req, res);
  }

  if (req.method === 'POST') {
    return registerDealer(req, res);
  }

  return res.status(405).json({
    success: false,
    error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
  });
}

async function listDealers(req, res) {
  try {
    const {
      area,
      game,
      min_rating,
      verified_only,
      limit = 20,
      offset = 0
    } = req.query;

    let query = supabase
      .from('captain_dealer_marketplace')
      .select(`
        *,
        profiles:dealer_id (id, display_name, avatar_url)
      `, { count: 'exact' })
      .eq('status', 'active')
      .order('rating', { ascending: false, nullsFirst: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (area) {
      query = query.contains('service_area', [area]);
    }

    if (game) {
      query = query.contains('games_offered', [game]);
    }

    if (min_rating) {
      query = query.gte('rating', parseFloat(min_rating));
    }

    if (verified_only === 'true') {
      query = query.eq('verified', true);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    return res.status(200).json({
      success: true,
      data: {
        dealers: data || [],
        total: count,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    console.error('List dealers error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to list dealers' }
    });
  }
}

async function registerDealer(req, res) {
  try {
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

    const {
      name,
      service_area,
      hourly_rate,
      games_offered,
      experience_years,
      bio,
      available_days,
      contact_email,
      contact_phone
    } = req.body;

    if (!name || !service_area || !games_offered) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_FIELDS', message: 'name, service_area, and games_offered required' }
      });
    }

    // Check if already registered
    const { data: existing } = await supabase
      .from('captain_dealer_marketplace')
      .select('id')
      .eq('dealer_id', user.id)
      .single();

    if (existing) {
      return res.status(400).json({
        success: false,
        error: { code: 'ALREADY_REGISTERED', message: 'You are already registered as a dealer' }
      });
    }

    const { data: dealer, error } = await supabase
      .from('captain_dealer_marketplace')
      .insert({
        dealer_id: user.id,
        name,
        service_area,
        hourly_rate,
        games_offered,
        experience_years,
        bio,
        available_days,
        contact_email: contact_email || user.email,
        contact_phone,
        status: 'active',
        verified: false
      })
      .select(`
        *,
        profiles:dealer_id (id, display_name, avatar_url)
      `)
      .single();

    if (error) throw error;

    return res.status(201).json({
      success: true,
      data: { dealer }
    });
  } catch (error) {
    console.error('Register dealer error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to register dealer' }
    });
  }
}
