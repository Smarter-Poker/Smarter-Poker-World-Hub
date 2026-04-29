/**
 * /api/employee/* — Hono catch-all router (Phase 4.4 module #6, 2026-04-28)
 *
 * Consolidates 6 previously-separate handlers under a single Hono app.
 * Same pattern as venues/kyc/hendonmob/trivia.
 *
 * Routes (mounted at /api/employee):
 *   POST /claim           — claim a code to link account to venue staff record (rate-limited)
 *   GET  /downs           — dealing history for linked staff member
 *   GET  /link-by-email   — find unlinked staff records matching user's email
 *   POST /link-by-email   — confirm email-based link (rate-limited)
 *   GET  /schedule        — published shift schedule for a linked staff member
 *   GET  /time-entries    — clock in/out history
 *   GET  /venues          — all venues where user is linked as staff
 *
 * Replaces:
 *   pages/api/employee/claim.js          (139 LOC)
 *   pages/api/employee/downs.js          (127 LOC)
 *   pages/api/employee/link-by-email.js  (149 LOC)
 *   pages/api/employee/schedule.js       (110 LOC)
 *   pages/api/employee/time-entries.js   (110 LOC)
 *   pages/api/employee/venues.js         (80 LOC)
 *   = 715 LOC, now ~440 LOC with shared middleware.
 *
 * Auth: shared userAuth middleware via getServerUserWithFallback (Phase 4.1d
 * ESM-clean). Replaces older direct GoTrue calls that were in all 6 handlers.
 */

import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
const { getServerUserWithFallback } = require('../../../src/lib/serverAuth');

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    _supabase = createClient(url, key);
  }
  return _supabase;
}

function getWeekBounds(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  const day = d.getDay();
  const start = new Date(d);
  start.setDate(d.getDate() - day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

// ─── Hono app ─────────────────────────────────────────────────────────────
const app = new Hono().basePath('/api/employee');

// Shared auth middleware (all routes require user JWT)
app.use('*', async (c, next) => {
  try {
    const req = c.env?.req;
    const supabase = getSupabase();
    const { user } = await getServerUserWithFallback(req, supabase);
    if (!user) {
      return c.json({ success: false, error: 'Auth required' }, 401);
    }
    c.set('user', user);
    await next();
  } catch (err) {
    console.warn('[employee] auth error:', err);
    return c.json({ success: false, error: 'Invalid session' }, 401);
  }
});

// Rate-limit middleware (per-route on writes)
const writeLimit = async (c, next) => {
  const req = c.env?.req;
  const res = c.env?.res;
  if (req && res && !applyRateLimit(req, res, LIMITS.write)) {
    return c.body(null, 429);
  }
  await next();
};

// ─── Routes ───────────────────────────────────────────────────────────────

// POST /api/employee/claim — link account via claim code
app.post('/claim', writeLimit, async (c) => {
  const user = c.get('user');
  const supabase = getSupabase();
  try {
    const body = await c.req.json().catch(() => ({}));
    const { code } = body;
    if (!code || code.length < 4) {
      return c.json({ success: false, error: 'Valid claim code required' }, 400);
    }

    const { data: claim, error: claimErr } = await supabase
      .from('staff_claim_tokens')
      .select('*')
      .eq('token', code.toUpperCase().trim())
      .maybeSingle();

    if (claimErr || !claim) {
      return c.json({ success: false, error: 'Invalid claim code' }, 404);
    }
    if (claim.claimed_by) {
      return c.json({ success: false, error: 'This code has already been used' }, 400);
    }
    if (new Date(claim.expires_at) < new Date()) {
      return c.json({ success: false, error: 'This code has expired. Ask your manager for a new one.' }, 400);
    }

    const { data: staff } = await supabase
      .from('commander_staff')
      .select('id, display_name, role, linked_user_id, venue_id')
      .eq('id', claim.staff_id)
      .maybeSingle();

    if (!staff) {
      return c.json({ success: false, error: 'Staff record not found' }, 404);
    }
    if (staff.linked_user_id && staff.linked_user_id !== user.id) {
      return c.json({ success: false, error: 'This staff position is already linked to another account' }, 400);
    }

    const { data: existingLink } = await supabase
      .from('commander_staff')
      .select('id')
      .eq('venue_id', staff.venue_id)
      .eq('linked_user_id', user.id)
      .eq('is_active', true)
      .limit(1);

    if (existingLink?.length > 0) {
      return c.json({ success: false, error: 'You are already linked to this venue' }, 400);
    }

    const { error: updateErr } = await supabase
      .from('commander_staff')
      .update({ linked_user_id: user.id })
      .eq('id', claim.staff_id);

    if (updateErr) {
      console.warn('[employee/claim] Link staff error:', updateErr);
      return c.json({ success: false, error: 'Failed to link account' }, 500);
    }

    await supabase
      .from('staff_claim_tokens')
      .update({ claimed_by: user.id, claimed_at: new Date().toISOString() })
      .eq('id', claim.id);

    const { data: venue } = await supabase
      .from('poker_venues')
      .select('name')
      .eq('id', staff.venue_id)
      .maybeSingle();

    return c.json({
      success: true,
      data: {
        staff_name: staff.display_name,
        venue_name: venue?.name || 'Unknown Venue',
        role: staff.role,
        message: `Account linked! You are now connected as ${staff.display_name} (${staff.role}) at ${venue?.name || 'this venue'}.`,
      },
    });
  } catch (err) {
    console.warn('[employee/claim]', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /api/employee/downs — dealing history
app.get('/downs', async (c) => {
  const user = c.get('user');
  const supabase = getSupabase();
  try {
    const staff_id = c.req.query('staff_id');
    const venue_id = c.req.query('venue_id');
    const date_from = c.req.query('date_from');
    const date_to = c.req.query('date_to');

    if (!staff_id || !venue_id) {
      return c.json({ success: false, error: 'staff_id and venue_id required' }, 400);
    }

    const { data: staff } = await supabase
      .from('commander_staff')
      .select('id, display_name, role')
      .eq('id', staff_id)
      .eq('venue_id', venue_id)
      .eq('linked_user_id', user.id)
      .maybeSingle();

    if (!staff) {
      return c.json({ success: false, error: 'Access denied' }, 403);
    }

    const from = date_from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const to = date_to || new Date().toISOString().split('T')[0];

    const { data: rotations, error: rotErr } = await supabase
      .from('commander_dealer_rotations')
      .select('*')
      .eq('venue_id', venue_id)
      .eq('dealer_id', staff_id)
      .gte('started_at', `${from}T00:00:00`)
      .lte('started_at', `${to}T23:59:59`)
      .order('started_at', { ascending: false })
      .limit(100);

    if (rotErr) throw rotErr;

    const { data: activeRotations } = await supabase
      .from('commander_dealer_rotations')
      .select('id, table_number, started_at')
      .eq('venue_id', venue_id)
      .eq('dealer_id', staff_id)
      .is('ended_at', null);

    const activeTables = (activeRotations || []).map(r => ({
      id: r.id,
      table_number: r.table_number,
      game_type: null,
    }));

    const downs = rotations || [];
    let totalMinutes = 0;
    let cashDowns = 0;
    let tournamentDowns = 0;

    downs.forEach(d => {
      if (d.started_at && d.ended_at) {
        const start = new Date(d.started_at);
        const end = new Date(d.ended_at);
        totalMinutes += (end - start) / 60000;
      }
      if (d.table_number && d.table_number.toString().startsWith('T')) {
        tournamentDowns++;
      } else {
        cashDowns++;
      }
    });

    return c.json({
      success: true,
      data: {
        downs,
        active_tables: activeTables,
        stats: {
          total_downs: downs.length,
          cash_downs: cashDowns,
          tournament_downs: tournamentDowns,
          total_hours_on_table: Math.round((totalMinutes / 60) * 100) / 100,
          date_range: { from, to },
        },
      },
    });
  } catch (err) {
    console.warn('[employee/downs]', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /api/employee/link-by-email — find matching staff records
app.get('/link-by-email', async (c) => {
  const user = c.get('user');
  const supabase = getSupabase();
  try {
    const userEmail = user.email;
    if (!userEmail) {
      return c.json({ success: true, data: { matches: [] } });
    }

    const { data: matches } = await supabase
      .from('commander_staff')
      .select('id, display_name, role, venue_id, email')
      .eq('email', userEmail)
      .is('linked_user_id', null)
      .eq('is_active', true)
      .limit(100);

    if (!matches?.length) {
      return c.json({ success: true, data: { matches: [] } });
    }

    const venueIds = [...new Set(matches.map(m => m.venue_id))];
    const { data: venues } = await supabase
      .from('poker_venues')
      .select('id, name')
      .in('id', venueIds)
      .limit(100);

    const venueMap = Object.fromEntries((venues || []).map(v => [v.id, v.name]));

    const enriched = matches.map(m => ({
      staff_id: m.id,
      display_name: m.display_name,
      role: m.role,
      venue_id: m.venue_id,
      venue_name: venueMap[m.venue_id] || 'Unknown Venue',
    }));

    return c.json({ success: true, data: { matches: enriched } });
  } catch (err) {
    console.warn('[employee/link-by-email GET]', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/employee/link-by-email — confirm email-based link
app.post('/link-by-email', writeLimit, async (c) => {
  const user = c.get('user');
  const supabase = getSupabase();
  try {
    const body = await c.req.json().catch(() => ({}));
    const { staff_id } = body;
    if (!staff_id) {
      return c.json({ success: false, error: 'staff_id required' }, 400);
    }

    const { data: staff } = await supabase
      .from('commander_staff')
      .select('id, display_name, role, venue_id, email, linked_user_id')
      .eq('id', staff_id)
      .eq('email', user.email)
      .eq('is_active', true)
      .maybeSingle();

    if (!staff) {
      return c.json({ success: false, error: 'No matching staff record found' }, 404);
    }
    if (staff.linked_user_id) {
      return c.json({ success: false, error: 'This staff position is already linked' }, 400);
    }

    const { error: updateErr } = await supabase
      .from('commander_staff')
      .update({ linked_user_id: user.id })
      .eq('id', staff_id);

    if (updateErr) {
      return c.json({ success: false, error: 'Failed to link account' }, 500);
    }

    const { data: venue } = await supabase
      .from('poker_venues')
      .select('name')
      .eq('id', staff.venue_id)
      .maybeSingle();

    return c.json({
      success: true,
      data: {
        staff_name: staff.display_name,
        venue_name: venue?.name || 'Unknown Venue',
        role: staff.role,
      },
    });
  } catch (err) {
    console.warn('[employee/link-by-email POST]', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /api/employee/schedule — published shift schedule
app.get('/schedule', async (c) => {
  const user = c.get('user');
  const supabase = getSupabase();
  try {
    const staff_id = c.req.query('staff_id');
    const venue_id = c.req.query('venue_id');
    const week = c.req.query('week');

    if (!staff_id || !venue_id) {
      return c.json({ success: false, error: 'staff_id and venue_id required' }, 400);
    }

    const { data: staff } = await supabase
      .from('commander_staff')
      .select('id, display_name, role')
      .eq('id', staff_id)
      .eq('venue_id', venue_id)
      .eq('linked_user_id', user.id)
      .maybeSingle();

    if (!staff) {
      return c.json({ success: false, error: 'Access denied - not your staff record' }, 403);
    }

    const { start, end } = getWeekBounds(week);

    const { data: shifts, error: shiftErr } = await supabase
      .from('commander_staff_shifts')
      .select('*')
      .eq('staff_id', staff_id)
      .eq('venue_id', venue_id)
      .gte('shift_date', start.toISOString().split('T')[0])
      .lte('shift_date', end.toISOString().split('T')[0])
      .order('shift_date', { ascending: true })
      .limit(100);

    if (shiftErr) throw shiftErr;

    const totalHours = (shifts || []).reduce((sum, s) => {
      if (s.start_time && s.end_time) {
        const [sh, sm] = s.start_time.split(':').map(Number);
        const [eh, em] = s.end_time.split(':').map(Number);
        let hours = (eh * 60 + em - sh * 60 - sm) / 60;
        if (hours < 0) hours += 24;
        return sum + hours;
      }
      return sum;
    }, 0);

    return c.json({
      success: true,
      data: {
        shifts: shifts || [],
        week_start: start.toISOString().split('T')[0],
        week_end: end.toISOString().split('T')[0],
        total_shifts: (shifts || []).length,
        total_hours: Math.round(totalHours * 100) / 100,
      },
    });
  } catch (err) {
    console.warn('[employee/schedule]', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /api/employee/time-entries — clock in/out history
app.get('/time-entries', async (c) => {
  const user = c.get('user');
  const supabase = getSupabase();
  try {
    const staff_id = c.req.query('staff_id');
    const venue_id = c.req.query('venue_id');
    const date_from = c.req.query('date_from');
    const date_to = c.req.query('date_to');

    if (!staff_id || !venue_id) {
      return c.json({ success: false, error: 'staff_id and venue_id required' }, 400);
    }

    const { data: staff } = await supabase
      .from('commander_staff')
      .select('id, display_name, role')
      .eq('id', staff_id)
      .eq('venue_id', venue_id)
      .eq('linked_user_id', user.id)
      .maybeSingle();

    if (!staff) {
      return c.json({ success: false, error: 'Access denied' }, 403);
    }

    const from = date_from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const to = date_to ? `${date_to}T23:59:59.999Z` : new Date().toISOString();

    const { data: entries, error } = await supabase
      .from('commander_time_clock')
      .select('*')
      .eq('staff_id', staff_id)
      .eq('venue_id', venue_id)
      .gte('clock_in', from)
      .lte('clock_in', to)
      .order('clock_in', { ascending: false })
      .limit(100);

    if (error) throw error;

    const records = entries || [];
    let totalHours = 0;
    const daysWorked = new Set();
    let currentlyOnShift = false;

    records.forEach(e => {
      if (e.hours_worked) {
        totalHours += parseFloat(e.hours_worked);
      }
      if (e.clock_in) {
        daysWorked.add(new Date(e.clock_in).toISOString().split('T')[0]);
      }
      if (!e.clock_out) {
        currentlyOnShift = true;
      }
    });

    return c.json({
      success: true,
      data: {
        entries: records,
        stats: {
          total_entries: records.length,
          total_hours: Math.round(totalHours * 100) / 100,
          days_worked: daysWorked.size,
          currently_on_shift: currentlyOnShift,
          avg_hours_per_shift: records.length > 0
            ? Math.round((totalHours / records.length) * 100) / 100
            : 0,
        },
      },
    });
  } catch (err) {
    console.warn('[employee/time-entries]', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /api/employee/venues — all venues where user is linked as staff
app.get('/venues', async (c) => {
  const user = c.get('user');
  const supabase = getSupabase();
  try {
    const { data: staffRecords, error } = await supabase
      .from('commander_staff')
      .select('id, venue_id, display_name, role, is_active, email, phone, created_at')
      .eq('linked_user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    if (!staffRecords?.length) {
      return c.json({ success: true, data: { venues: [] } });
    }

    const venueIds = [...new Set(staffRecords.map(s => s.venue_id))];
    const { data: venues } = await supabase
      .from('poker_venues')
      .select('id, name, logo_url, city, state')
      .in('id', venueIds)
      .limit(100);

    const venueMap = Object.fromEntries((venues || []).map(v => [v.id, v]));

    const enriched = staffRecords.map(s => ({
      staff_id: s.id,
      venue_id: s.venue_id,
      venue_name: venueMap[s.venue_id]?.name || 'Unknown Venue',
      venue_logo: venueMap[s.venue_id]?.logo_url || null,
      venue_city: venueMap[s.venue_id]?.city || null,
      venue_state: venueMap[s.venue_id]?.state || null,
      display_name: s.display_name,
      role: s.role,
      is_active: s.is_active,
      joined_at: s.created_at,
    }));

    return c.json({ success: true, data: { venues: enriched } });
  } catch (err) {
    console.warn('[employee/venues]', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ─── Vercel adapter ───────────────────────────────────────────────────────
const handler = handle(app);

export default async function vercelHandler(req, res) {
  try {
    return await handler(req, res);
  } catch (err) {
    try {
      reportApiError(err, req);
    } catch (_sentryErr) {
      console.warn('[employee] handled exception:', _sentryErr?.message ?? _sentryErr);
    }
    console.warn('[employee] router error:', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
}
