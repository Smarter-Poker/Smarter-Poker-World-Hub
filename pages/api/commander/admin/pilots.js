/**
 * Pilot Venues Management API
 * Reference: IMPLEMENTATION_PHASES.md - Phase 6, Step 6.6
 *
 * Manage pilot venue deployments
 */
import { createClient } from '@supabase/supabase-js';
import { getUser } from '../../../../src/lib/auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  try {
    // Verify admin access
    const user = await getUser(req);
    if (!user) {
      return res.status(401).json({ error: 'AUTH_REQUIRED' });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Admin access required' });
    }

    if (req.method === 'GET') {
      return handleGet(req, res);
    } else if (req.method === 'POST') {
      return handlePost(req, res, user);
    } else if (req.method === 'PATCH') {
      return handlePatch(req, res, user);
    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Pilot management error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function handleGet(req, res) {
  const { status } = req.query;

  let query = supabase
    .from('commander_pilot_venues')
    .select(`
      *,
      venue:poker_venues(id, name, city, state)
    `)
    .order('pilot_start_date', { ascending: false });

  if (status && status !== 'all') {
    query = query.eq('status', status);
  }

  const { data, error } = await query;

  if (error) {
    // If table doesn't exist, return empty array
    if (error.code === '42P01') {
      return res.status(200).json({ success: true, pilots: [] });
    }
    return res.status(500).json({ error: error.message });
  }

  // Transform data
  const pilots = (data || []).map((pilot) => ({
    id: pilot.id,
    venue_id: pilot.venue_id,
    venue_name: pilot.venue?.name || 'Unknown Venue',
    city: pilot.venue?.city || '',
    state: pilot.venue?.state || '',
    pilot_start_date: pilot.pilot_start_date,
    pilot_end_date: pilot.pilot_end_date,
    status: pilot.status,
    uptime_percentage: pilot.uptime_percentage,
    support_tickets_count: pilot.support_tickets_count,
    staff_satisfaction_score: pilot.staff_satisfaction_score,
    player_adoption_percentage: pilot.player_adoption_percentage,
    weekly_reports: pilot.weekly_reports || [],
    final_assessment: pilot.final_assessment,
    converted_to_paid: pilot.converted_to_paid,
  }));

  return res.status(200).json({
    success: true,
    pilots,
  });
}

async function handlePost(req, res, user) {
  const { venue_id, pilot_start_date } = req.body;

  if (!venue_id || !pilot_start_date) {
    return res.status(400).json({ error: 'venue_id and pilot_start_date required' });
  }

  // Verify venue exists and has Commander enabled
  const { data: venue, error: venueError } = await supabase
    .from('poker_venues')
    .select('id, name, commander_enabled')
    .eq('id', venue_id)
    .single();

  if (venueError || !venue) {
    return res.status(404).json({ error: 'Venue not found' });
  }

  // Create pilot record
  const { data, error } = await supabase
    .from('commander_pilot_venues')
    .insert({
      venue_id,
      pilot_start_date,
      status: 'active',
      uptime_percentage: 100,
      support_tickets_count: 0,
    })
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  // Log the action
  await supabase.from('commander_audit_logs').insert({
    user_id: user.id,
    venue_id,
    actor_type: 'user',
    action: 'pilot_created',
    action_category: 'admin',
    target_type: 'pilot',
    target_id: data.id,
  });

  return res.status(201).json({
    success: true,
    pilot: data,
  });
}

async function handlePatch(req, res, user) {
  const { id, ...updates } = req.body;

  if (!id) {
    return res.status(400).json({ error: 'Pilot ID required' });
  }

  // Sanitize updates
  const allowedFields = [
    'status',
    'uptime_percentage',
    'support_tickets_count',
    'staff_satisfaction_score',
    'player_adoption_percentage',
    'weekly_reports',
    'final_assessment',
    'converted_to_paid',
    'pilot_end_date',
  ];

  const sanitizedUpdates = {};
  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      sanitizedUpdates[key] = value;
    }
  }
  sanitizedUpdates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('commander_pilot_venues')
    .update(sanitizedUpdates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  // Log the action
  await supabase.from('commander_audit_logs').insert({
    user_id: user.id,
    actor_type: 'user',
    action: 'pilot_updated',
    action_category: 'admin',
    target_type: 'pilot',
    target_id: id,
    changes: sanitizedUpdates,
  });

  return res.status(200).json({
    success: true,
    pilot: data,
  });
}
