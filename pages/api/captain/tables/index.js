/**
 * Captain Tables API - GET/POST /api/captain/tables
 * List tables or create new table
 * Reference: Phase 2 - Table CRUD
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

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
    const { venue_id, status } = req.query;

    if (!venue_id) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'venue_id is required' }
      });
    }

    let query = supabase
      .from('captain_tables')
      .select(`
        *,
        captain_games (
          id,
          game_type,
          stakes,
          status,
          current_players,
          max_players
        )
      `)
      .eq('venue_id', venue_id)
      .order('table_number', { ascending: true });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Captain tables query error:', error);
      return res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Failed to fetch tables' }
      });
    }

    return res.status(200).json({
      success: true,
      data: { tables: data || [] }
    });
  } catch (error) {
    console.error('Captain tables GET error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
  }
}

async function handlePost(req, res) {
  try {
    // TODO: Add staff authentication check

    const {
      venue_id,
      table_number,
      table_name,
      max_seats = 9,
      features = {},
      position_x,
      position_y
    } = req.body;

    if (!venue_id || !table_number) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'venue_id and table_number are required' }
      });
    }

    // Check if table number already exists at venue
    const { data: existing } = await supabase
      .from('captain_tables')
      .select('id')
      .eq('venue_id', venue_id)
      .eq('table_number', table_number)
      .single();

    if (existing) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Table number already exists at this venue' }
      });
    }

    const { data: table, error } = await supabase
      .from('captain_tables')
      .insert({
        venue_id,
        table_number,
        table_name: table_name || `Table ${table_number}`,
        max_seats,
        status: 'available',
        features,
        position_x,
        position_y
      })
      .select()
      .single();

    if (error) {
      console.error('Captain table create error:', error);
      return res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Failed to create table' }
      });
    }

    return res.status(201).json({
      success: true,
      data: { table }
    });
  } catch (error) {
    console.error('Captain tables POST error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
  }
}
