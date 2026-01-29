/**
 * Marketplace Equipment API
 * GET /api/commander/marketplace/equipment - List available equipment rentals
 * POST /api/commander/marketplace/equipment - List equipment for rent
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return listEquipment(req, res);
  }

  if (req.method === 'POST') {
    return listForRent(req, res);
  }

  return res.status(405).json({
    success: false,
    error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
  });
}

async function listEquipment(req, res) {
  try {
    const {
      category,
      area,
      max_daily_rate,
      limit = 20,
      offset = 0
    } = req.query;

    let query = supabase
      .from('commander_equipment_rentals')
      .select(`
        *,
        profiles:vendor_id (id, display_name, avatar_url)
      `, { count: 'exact' })
      .eq('available', true)
      .order('daily_rate', { ascending: true })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (category) {
      query = query.eq('category', category);
    }

    if (area) {
      query = query.contains('service_area', [area]);
    }

    if (max_daily_rate) {
      query = query.lte('daily_rate', parseFloat(max_daily_rate));
    }

    const { data, error, count } = await query;

    if (error) throw error;

    // Get unique categories for filtering
    const { data: categories } = await supabase
      .from('commander_equipment_rentals')
      .select('category')
      .eq('available', true);

    const uniqueCategories = [...new Set(categories?.map(c => c.category).filter(Boolean))];

    return res.status(200).json({
      success: true,
      data: {
        equipment: data || [],
        categories: uniqueCategories,
        total: count,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    console.error('List equipment error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to list equipment' }
    });
  }
}

async function listForRent(req, res) {
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
      description,
      category,
      daily_rate,
      weekly_rate,
      service_area,
      images,
      deposit_required
    } = req.body;

    if (!name || !category || !daily_rate) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_FIELDS', message: 'name, category, and daily_rate required' }
      });
    }

    const { data: equipment, error } = await supabase
      .from('commander_equipment_rentals')
      .insert({
        vendor_id: user.id,
        name,
        description,
        category,
        daily_rate,
        weekly_rate,
        service_area: service_area || [],
        images: images || [],
        deposit_required,
        available: true
      })
      .select(`
        *,
        profiles:vendor_id (id, display_name, avatar_url)
      `)
      .single();

    if (error) throw error;

    return res.status(201).json({
      success: true,
      data: { equipment }
    });
  } catch (error) {
    console.error('List equipment for rent error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to list equipment' }
    });
  }
}
