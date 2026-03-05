/**
 * Commander Tables API - GET/POST /api/commander/tables
 * List tables or create new table
 * Reference: Phase 2 - Table CRUD
 */
import { createClient } from '@supabase/supabase-js';
import { guardWriteStaff } from '../../../../src/lib/commander/auth';
import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

  // Auth guard: require staff auth for write operations
  const _authResult = await guardWriteStaff(req, res);
  if (!_authResult) return;

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

    // Try with game + seats join first, fallback to simple query
    let data, error;
    try {
      const result = await supabase
        .from('commander_tables')
        .select(`
        .limit(100)
          *,
          commander_games!commander_games_table_id_fkey (
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

      if (result.error) throw result.error;
      data = result.data;

      // Also fetch seat occupancy data
      try {
        const { data: seats } = await supabase
          .from('commander_table_seats')
          .select('table_number, seat_number, status, player_name, seated_at')
          .eq('venue_id', venue_id)
          .eq('status', 'occupied')
              .limit(100);
        // Merge seats into table data
        if (seats && data) {
          const seatsByTable = {};
          seats.forEach(s => {
            if (!seatsByTable[s.table_number]) seatsByTable[s.table_number] = [];
            seatsByTable[s.table_number].push(s);
          });
          data = data.map(t => ({ ...t, seats: seatsByTable[t.table_number] || [] }));
        }
      } catch { /* seats table may not exist yet — non-critical */ }

      // Fetch tournament details for tournament tables
      try {
        const tournamentIds = [...new Set((data || []).filter(t => t.tournament_id).map(t => t.tournament_id))];
        if (tournamentIds.length > 0) {
          const { data: tournaments } = await supabase
            .from('commander_tournaments')
            .select('id, name, status, buyin_amount, buyin_fee, current_level, players_remaining, current_entries, starting_chips, tournament_type')
            .in('id', tournamentIds)
                .limit(100);
          if (tournaments) {
            const tournMap = Object.fromEntries(tournaments.map(t => [t.id, t]));
            data = data.map(t => t.tournament_id ? { ...t, tournament: tournMap[t.tournament_id] || null } : t);
          }
        }
      } catch { /* tournament join non-critical */ }
    } catch {
      // Fallback: simple query without FK join
      const result = await supabase
        .from('commander_tables')
        .select('*')
        .eq('venue_id', venue_id)
        .order('table_number', { ascending: true })
            .limit(100);
      data = result.data;
      error = result.error;
    }

    if (status) {
      data = (data || []).filter(t => t.status === status);
    }

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
      position_y,
      game_type,
      stakes
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

    const insertData = {
      venue_id,
      table_number,
      table_name: table_name || `Table ${table_number}`,
      max_seats,
      status: 'available',
      features,
      position_x,
      position_y
    };
    if (game_type) insertData.game_type = game_type.toUpperCase();
    if (stakes) insertData.stakes = stakes;

    const { data: table, error } = await supabase
      .from('commander_tables')
      .insert(insertData)
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
