/**
 * Shift Handoff API
 * POST /api/commander/shift-handoff — Create new handoff (outgoing floor)
 * GET /api/commander/shift-handoff — List handoffs for venue
 * PATCH /api/commander/shift-handoff — Acknowledge handoff (incoming floor)
 */
import { createClient } from '@supabase/supabase-js';
import { guardWriteStaff } from '../../../src/lib/commander/auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const _g = await guardWriteStaff(req, res); if (!_g) return;

  if (req.method === 'POST') return createHandoff(req, res);
  if (req.method === 'GET') return listHandoffs(req, res);
  if (req.method === 'PATCH') return acknowledgeHandoff(req, res);
  return res.status(405).json({ success: false, error: { code: 'METHOD_NOT_ALLOWED' } });
}

async function createHandoff(req, res) {
  const { venue_id, staff_name, notes, issues, vip_alerts, pending_actions, incoming_staff_name } = req.body;

  if (!venue_id || !staff_name) {
    return res.status(400).json({ success: false, error: { code: 'MISSING_FIELDS', message: 'venue_id and staff_name required' } });
  }

  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');
    let userId = null;
    if (token) {
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id;
    }

    // Snapshot current floor state
    const [tablesRes, waitlistRes, incidentsRes, sessionsRes] = await Promise.all([
      supabase.from('commander_tables').select('id, table_number, table_name, status, current_game_type, current_stakes, max_seats').eq('venue_id', venue_id).eq('status', 'active'),
      supabase.from('commander_waitlist').select('id').eq('venue_id', venue_id).eq('status', 'waiting'),
      supabase.from('commander_incidents').select('id').eq('venue_id', venue_id).eq('status', 'open'),
      supabase.from('commander_table_sessions').select('id, table_number, player_name, seat_number').eq('venue_id', venue_id).eq('status', 'active')
    ]);

    const tables = tablesRes.data || [];
    const waitlist = waitlistRes.data || [];
    const incidents = incidentsRes.data || [];
    const sessions = sessionsRes.data || [];

    // Build table snapshot with player counts
    const tableSnapshot = tables.map(t => {
      const playersAtTable = sessions.filter(s => String(s.table_number) === String(t.table_number));
      return {
        table_number: t.table_number,
        table_name: t.table_name,
        game: t.current_game_type ? `${t.current_game_type} ${t.current_stakes || ''}`.trim() : 'No game',
        players: playersAtTable.length,
        max_seats: t.max_seats || 9,
        player_names: playersAtTable.map(p => p.player_name).filter(Boolean)
      };
    });

    const { data: handoff, error } = await supabase
      .from('commander_shift_handoffs')
      .insert({
        venue_id,
        outgoing_staff_id: userId || '00000000-0000-0000-0000-000000000000',
        outgoing_staff_name: staff_name,
        incoming_staff_name: incoming_staff_name || null,
        shift_date: new Date().toISOString().split('T')[0],
        open_tables_count: tables.length,
        active_players_count: sessions.length,
        waitlist_count: waitlist.length,
        open_incidents_count: incidents.length,
        notes: notes || null,
        issues: issues || null,
        vip_alerts: vip_alerts || null,
        pending_actions: pending_actions || null,
        table_snapshot: tableSnapshot
      })
      .select()
      .single();

    if (error) throw error;

    return res.status(201).json({ success: true, data: { handoff } });
  } catch (error) {
    console.error('Create handoff error:', error);
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
}

async function listHandoffs(req, res) {
  const { venue_id, limit = 20, status: filterStatus } = req.query;

  if (!venue_id) {
    return res.status(400).json({ success: false, error: { code: 'MISSING_FIELDS', message: 'venue_id required' } });
  }

  try {
    let query = supabase
      .from('commander_shift_handoffs')
      .select('*')
      .eq('venue_id', venue_id)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (filterStatus) query = query.eq('status', filterStatus);

    const { data: handoffs, error } = await query;
    if (error) throw error;

    return res.status(200).json({ success: true, data: { handoffs: handoffs || [] } });
  } catch (error) {
    console.error('List handoffs error:', error);
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
}

async function acknowledgeHandoff(req, res) {
  const { handoff_id, staff_name } = req.body;

  if (!handoff_id || !staff_name) {
    return res.status(400).json({ success: false, error: { code: 'MISSING_FIELDS', message: 'handoff_id and staff_name required' } });
  }

  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');
    let userId = null;
    if (token) {
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id;
    }

    const { data: handoff, error } = await supabase
      .from('commander_shift_handoffs')
      .update({
        incoming_staff_id: userId || '00000000-0000-0000-0000-000000000000',
        incoming_staff_name: staff_name,
        acknowledged_at: new Date().toISOString(),
        status: 'acknowledged'
      })
      .eq('id', handoff_id)
      .eq('status', 'pending')
      .select()
      .single();

    if (error) throw error;

    return res.status(200).json({ success: true, data: { handoff } });
  } catch (error) {
    console.error('Acknowledge handoff error:', error);
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
}
