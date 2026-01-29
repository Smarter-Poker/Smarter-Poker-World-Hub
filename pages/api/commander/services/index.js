/**
 * Commander Services API - GET/POST /api/commander/services
 * List or create service requests
 * Reference: Phase 2 - Service Requests
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const VALID_REQUEST_TYPES = ['food', 'drink', 'chips', 'table_change', 'cashout', 'floor', 'other'];

export default async function handler(req, res) {
  switch (req.method) {
    case 'GET':
      return handleGet(req, res);
    case 'POST':
      return handlePost(req, res);
    default:
      return res.status(405).json({
        success: false,
        error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
      });
  }
}

async function handleGet(req, res) {
  try {
    const { venue_id, game_id, status, limit = 50 } = req.query;

    let query = supabase
      .from('commander_service_requests')
      .select(`
        *,
        commander_games (
          id,
          game_type,
          stakes,
          commander_tables (
            table_number,
            table_name
          )
        ),
        commander_seats (
          seat_number
        )
      `)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (venue_id) {
      query = query.eq('venue_id', venue_id);
    }

    if (game_id) {
      query = query.eq('game_id', game_id);
    }

    if (status) {
      query = query.eq('status', status);
    } else {
      // Default to pending/acknowledged/in_progress
      query = query.in('status', ['pending', 'acknowledged', 'in_progress']);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Commander services query error:', error);
      return res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Failed to fetch service requests' }
      });
    }

    return res.status(200).json({
      success: true,
      data: { requests: data || [] }
    });
  } catch (error) {
    console.error('Commander services GET error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
  }
}

async function handlePost(req, res) {
  try {
    const {
      venue_id,
      game_id,
      seat_id,
      player_id,
      request_type,
      details = {},
      notes,
      priority = 0
    } = req.body;

    if (!venue_id || !request_type) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'venue_id and request_type are required' }
      });
    }

    if (!VALID_REQUEST_TYPES.includes(request_type)) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: `Invalid request_type. Must be: ${VALID_REQUEST_TYPES.join(', ')}` }
      });
    }

    const { data: request, error } = await supabase
      .from('commander_service_requests')
      .insert({
        venue_id,
        game_id: game_id || null,
        seat_id: seat_id || null,
        player_id: player_id || null,
        request_type,
        status: 'pending',
        details,
        notes,
        priority
      })
      .select()
      .single();

    if (error) {
      console.error('Commander service create error:', error);
      return res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Failed to create service request' }
      });
    }

    return res.status(201).json({
      success: true,
      data: { request }
    });
  } catch (error) {
    console.error('Commander services POST error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
  }
}
