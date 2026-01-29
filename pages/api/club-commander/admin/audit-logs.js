/**
 * Audit Logs API
 * Reference: IMPLEMENTATION_PHASES.md - Phase 6
 * GET /api/club-commander/admin/audit-logs - Get audit logs for venue(s)
 */
import { createClient } from '@supabase/supabase-js';
import { withRateLimit } from '../../../../src/lib/club-commander/rateLimit';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization required' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const {
      venue_id,
      action_category,
      action,
      user_id: filterUserId,
      date_from,
      date_to,
      limit = 100,
      offset = 0
    } = req.query;

    // Get venues user can access
    const { data: staffRecords } = await supabase
      .from('captain_staff')
      .select('venue_id, role')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .in('role', ['owner', 'manager']);

    if (!staffRecords || staffRecords.length === 0) {
      return res.status(403).json({ error: 'Manager access required' });
    }

    const allowedVenueIds = staffRecords.map(s => s.venue_id);

    // Build query
    let query = supabase
      .from('captain_audit_logs')
      .select(`
        *,
        profiles:user_id (id, display_name, avatar_url),
        captain_staff:staff_id (id, display_name, role)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    // Filter by venue
    if (venue_id) {
      if (!allowedVenueIds.includes(parseInt(venue_id))) {
        return res.status(403).json({ error: 'Access denied to this venue' });
      }
      query = query.eq('venue_id', parseInt(venue_id));
    } else {
      query = query.in('venue_id', allowedVenueIds);
    }

    // Apply filters
    if (action_category) {
      query = query.eq('action_category', action_category);
    }

    if (action) {
      query = query.eq('action', action);
    }

    if (filterUserId) {
      query = query.eq('user_id', filterUserId);
    }

    if (date_from) {
      query = query.gte('created_at', date_from);
    }

    if (date_to) {
      query = query.lte('created_at', date_to + 'T23:59:59');
    }

    const { data: logs, error, count } = await query;

    if (error) throw error;

    return res.status(200).json({
      logs,
      total: count,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

  } catch (error) {
    console.error('Audit logs error:', error);
    return res.status(500).json({ error: error.message });
  }
}

export default withRateLimit(handler);
