/**
 * Admin Lead Management API
 * Reference: IMPLEMENTATION_PHASES.md - Phase 6, Step 6.5
 *
 * Manage venue onboarding leads
 */
import { createClient } from '@supabase/supabase-js';
import { getUser } from '../../../../../src/lib/auth';

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
    } else if (req.method === 'PATCH') {
      return handlePatch(req, res, user);
    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Lead management error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function handleGet(req, res) {
  const { status, sort = 'created_at', order = 'desc', limit = 50, offset = 0 } = req.query;

  let query = supabase
    .from('commander_onboarding_leads')
    .select('*', { count: 'exact' })
    .order(sort, { ascending: order === 'asc' })
    .range(offset, offset + limit - 1);

  if (status && status !== 'all') {
    query = query.eq('status', status);
  }

  const { data, error, count } = await query;

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  // Calculate statistics
  const { data: stats } = await supabase
    .from('commander_onboarding_leads')
    .select('status');

  const statusCounts = {
    new: 0,
    contacted: 0,
    demo_scheduled: 0,
    negotiating: 0,
    signed: 0,
    setup: 0,
    live: 0,
    declined: 0,
  };

  (stats || []).forEach((lead) => {
    if (statusCounts.hasOwnProperty(lead.status)) {
      statusCounts[lead.status]++;
    }
  });

  return res.status(200).json({
    success: true,
    leads: data,
    total: count,
    stats: statusCounts,
  });
}

async function handlePatch(req, res, user) {
  const { id, status, notes, assignedTo, demoScheduledAt, nextFollowUp } = req.body;

  if (!id) {
    return res.status(400).json({ error: 'Lead ID required' });
  }

  const updates = {};
  if (status) updates.status = status;
  if (notes !== undefined) updates.notes = notes;
  if (assignedTo !== undefined) updates.assigned_to = assignedTo;
  if (demoScheduledAt !== undefined) updates.demo_scheduled_at = demoScheduledAt;
  if (nextFollowUp !== undefined) updates.next_follow_up = nextFollowUp;
  updates.updated_at = new Date().toISOString();
  updates.updated_by = user.id;

  const { data, error } = await supabase
    .from('commander_onboarding_leads')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  // Log the update
  await supabase.from('commander_audit_logs').insert({
    user_id: user.id,
    actor_type: 'user',
    action: 'lead_updated',
    action_category: 'admin',
    target_type: 'lead',
    target_id: id,
    changes: updates,
  });

  return res.status(200).json({
    success: true,
    lead: data,
  });
}
