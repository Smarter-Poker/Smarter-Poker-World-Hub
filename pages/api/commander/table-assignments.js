/**
 * Table Assignment API
 * GET  /api/commander/table-assignments - List all tables with current assignments
 * PUT  /api/commander/table-assignments - Assign a table to a mode (inactive/cash/tournament)
 * POST /api/commander/table-assignments - Close a table (end all sessions, set inactive)
 *
 * The floor manager uses this to control which physical tables run which games/tournaments.
 * Dealer tablets read their table's mode to show the correct interface.
 */
import { createClient } from '@supabase/supabase-js';
import { guardWriteStaff } from '../../../src/lib/commander/auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const _g = await guardWriteStaff(req, res); if (!_g) return;

  try {
    // Auth
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, error: 'Authorization required' });
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

    const { data: staff } = await supabase
      .from('commander_staff')
      .select('id, venue_id, role')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();
    if (!staff) return res.status(403).json({ success: false, error: 'Staff access required' });

    if (req.method === 'GET') return handleGet(req, res, staff);
    if (req.method === 'PUT') return handlePut(req, res, staff, user);
    if (req.method === 'POST') return handleClose(req, res, staff, user);
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('Table assignment error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

// GET: List all tables with their current assignments
async function handleGet(req, res, staff) {
  // Get all tables
  const { data: tables, error } = await supabase
    .from('commander_tables')
    .select('*')
    .eq('venue_id', staff.venue_id)
    .order('table_number');

  if (error) return res.status(500).json({ success: false, error: 'Failed to fetch tables' });

  // Get active tournaments at this venue
  const { data: tournaments } = await supabase
    .from('commander_tournaments')
    .select('id, name, status, game_type, buyin_amount')
    .eq('venue_id', staff.venue_id)
    .in('status', ['registering', 'running', 'paused', 'late_registration'])
    .order('created_at', { ascending: false });

  // Get active session counts per table
  const { data: sessions } = await supabase
    .from('commander_table_sessions')
    .select('table_number')
    .eq('venue_id', staff.venue_id)
    .eq('status', 'active');

  const sessionCounts = {};
  (sessions || []).forEach(s => {
    sessionCounts[s.table_number] = (sessionCounts[s.table_number] || 0) + 1;
  });

  // Get tournament entry counts per table
  const tournamentTableCounts = {};
  const tournamentIds = [...new Set((tables || []).filter(t => t.tournament_id).map(t => t.tournament_id))];
  for (const tid of tournamentIds) {
    const { data: entries } = await supabase
      .from('commander_tournament_entries')
      .select('table_number')
      .eq('tournament_id', tid)
      .in('status', ['active', 'seated']);
    (entries || []).forEach(e => {
      if (e.table_number) {
        tournamentTableCounts[e.table_number] = (tournamentTableCounts[e.table_number] || 0) + 1;
      }
    });
  }

  const enriched = (tables || []).map(t => ({
    ...t,
    active_players: t.mode === 'tournament'
      ? (tournamentTableCounts[t.table_number] || 0)
      : (sessionCounts[t.table_number] || 0),
    open_seats: t.max_seats - (
      t.mode === 'tournament'
        ? (tournamentTableCounts[t.table_number] || 0)
        : (sessionCounts[t.table_number] || 0)
    )
  }));

  return res.status(200).json({
    success: true,
    data: {
      tables: enriched,
      tournaments: tournaments || []
    }
  });
}

// PUT: Assign a table to a mode
async function handlePut(req, res, staff, user) {
  const { table_id, mode, game_type, stakes, tournament_id } = req.body;

  if (!table_id || !mode) {
    return res.status(400).json({ success: false, error: 'table_id and mode required' });
  }
  if (!['inactive', 'cash', 'tournament'].includes(mode)) {
    return res.status(400).json({ success: false, error: 'mode must be inactive, cash, or tournament' });
  }
  if (mode === 'cash' && (!game_type || !stakes)) {
    return res.status(400).json({ success: false, error: 'game_type and stakes required for cash mode' });
  }
  if (mode === 'tournament' && !tournament_id) {
    return res.status(400).json({ success: false, error: 'tournament_id required for tournament mode' });
  }

  // Verify table belongs to venue
  const { data: table } = await supabase
    .from('commander_tables')
    .select('*')
    .eq('id', table_id)
    .eq('venue_id', staff.venue_id)
    .single();

  if (!table) return res.status(404).json({ success: false, error: 'Table not found' });

  // Build update
  const updates = {
    mode,
    game_type: mode === 'cash' ? game_type : null,
    stakes: mode === 'cash' ? stakes : null,
    tournament_id: mode === 'tournament' ? tournament_id : null,
    assigned_at: new Date().toISOString(),
    assigned_by: user.id,
    status: mode === 'inactive' ? 'available' : 'in_use'
  };

  const { data: updated, error } = await supabase
    .from('commander_tables')
    .update(updates)
    .eq('id', table_id)
    .select()
    .single();

  if (error) {
    console.error('Assignment update error:', error);
    return res.status(500).json({ success: false, error: 'Failed to update table assignment' });
  }

  return res.status(200).json({ success: true, data: updated });
}

// POST: Close a table (end sessions, set inactive)
async function handleClose(req, res, staff, user) {
  const { table_id } = req.body;
  if (!table_id) return res.status(400).json({ success: false, error: 'table_id required' });

  const { data: table } = await supabase
    .from('commander_tables')
    .select('*')
    .eq('id', table_id)
    .eq('venue_id', staff.venue_id)
    .single();

  if (!table) return res.status(404).json({ success: false, error: 'Table not found' });

  // End all active sessions at this table
  await supabase
    .from('commander_table_sessions')
    .update({ status: 'ended', ended_at: new Date().toISOString() })
    .eq('venue_id', staff.venue_id)
    .eq('table_number', table.table_number)
    .eq('status', 'active');

  // Clear seats
  await supabase
    .from('commander_table_seats')
    .delete()
    .eq('venue_id', staff.venue_id)
    .eq('table_number', table.table_number);

  // Set table to inactive
  const { data: updated } = await supabase
    .from('commander_tables')
    .update({
      mode: 'inactive',
      game_type: null,
      stakes: null,
      tournament_id: null,
      status: 'available',
      current_game_id: null,
      assigned_at: null,
      assigned_by: null
    })
    .eq('id', table_id)
    .select()
    .single();

  return res.status(200).json({ success: true, data: updated });
}
