/**
 * Spending Limits API
 * GET /api/captain/responsible-gaming/limits
 * PUT /api/captain/responsible-gaming/limits
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return handleGet(req, res);
  } else if (req.method === 'PUT') {
    return handleUpdate(req, res);
  }

  return res.status(405).json({
    success: false,
    error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
  });
}

async function handleGet(req, res) {
  // Get player from auth
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({
      success: false,
      error: { code: 'AUTH_REQUIRED', message: 'Authentication required' }
    });
  }

  try {
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_REQUIRED', message: 'Invalid token' }
      });
    }

    const player_id = user.id;

    const { data: limits, error } = await supabase
      .from('captain_spending_limits')
      .select('*')
      .eq('player_id', player_id)
      .single();

    if (error && error.code !== 'PGRST116') throw error;

    // Return defaults if no limits set
    const effectiveLimits = limits || {
      player_id,
      daily_limit: null,
      weekly_limit: null,
      monthly_limit: null,
      session_limit: null,
      loss_limit: null,
      time_limit_hours: null,
      enabled: false
    };

    return res.status(200).json({
      success: true,
      data: { limits: effectiveLimits }
    });
  } catch (error) {
    console.error('Get limits error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to fetch limits' }
    });
  }
}

async function handleUpdate(req, res) {
  // Get player from auth
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({
      success: false,
      error: { code: 'AUTH_REQUIRED', message: 'Authentication required' }
    });
  }

  try {
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_REQUIRED', message: 'Invalid token' }
      });
    }

    const player_id = user.id;

    const {
      daily_limit,
      weekly_limit,
      monthly_limit,
      session_limit,
      loss_limit,
      time_limit_hours,
      enabled = true
    } = req.body;
    // Upsert limits
    const { data: limits, error } = await supabase
      .from('captain_spending_limits')
      .upsert({
        player_id,
        daily_limit,
        weekly_limit,
        monthly_limit,
        session_limit,
        loss_limit,
        time_limit_hours,
        enabled,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'player_id'
      })
      .select()
      .single();

    if (error) throw error;

    return res.status(200).json({
      success: true,
      data: { limits }
    });
  } catch (error) {
    console.error('Update limits error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to update limits' }
    });
  }
}
