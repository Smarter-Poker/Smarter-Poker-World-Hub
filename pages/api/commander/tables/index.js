/**
 * Commander Tables API - GET/POST /api/commander/tables
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
      .from('commander_tables')
      .select(`
        *,
        commander_games (
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
      console.error('Commander tables query error:', error);
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
    console.error('Commander tables GET error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
  }
}

async function handlePost(req, res) {
  try {
    // Verify staff authentication
    const staffSession = req.headers['x-staff-session'];
    if (!staffSession) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_REQUIRED', message: 'Staff authentication required' }
      });
    }

    let sessionData;
    try {
      sessionData = JSON.parse(staffSession);
    } catch {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_SESSION', message: 'Invalid session format' }
      });
    }

    // Verify staff exists and is active
    const { data: staff, error: staffError } = await supabase
      .from('commander_staff')
      .select('id, venue_id, role, is_active')
      .eq('id', sessionData.id)
      .eq('is_active', true)
      .single();

    if (staffError || !staff) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_STAFF', message: 'Staff member not found or inactive' }
      });
    }

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
      .from('commander_tables')
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
      .from('commander_tables')
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
      console.error('Commander table create error:', error);
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
    console.error('Commander tables POST error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
  }
}
