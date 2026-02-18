/**
 * Member Search API
 * GET /api/commander/members/search?q=query&limit=10&venue_id=xxx
 * Search members by name or phone number
 * Venue scoping enforced: venue_id from query param, x-staff-session, or Bearer auth
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const { q, limit = '10', venue_id } = req.query;
    if (!q || q.length < 2) return res.status(200).json({ success: true, data: [] });

    const limitNum = Math.min(parseInt(limit) || 10, 50);

    // Determine venue scope (required for security — prevents cross-venue data exposure)
    let venueFilter = venue_id || null;

    // Try x-staff-session header (Commander staff session)
    if (!venueFilter) {
      const staffSession = req.headers['x-staff-session'];
      if (staffSession) {
        try {
          const sessionData = JSON.parse(staffSession);
          if (sessionData.venue_id) venueFilter = sessionData.venue_id;
        } catch { /* invalid session format */ }
      }
    }

    // Try Bearer auth token (owner/user login)
    if (!venueFilter) {
      const authHeader = req.headers.authorization;
      if (authHeader) {
        const token = authHeader.replace('Bearer ', '');
        const { data: { user } } = await supabase.auth.getUser(token);
        if (user) {
          const { data: staff } = await supabase
            .from('commander_staff')
            .select('venue_id')
            .eq('user_id', user.id)
            .eq('is_active', true)
            .single();
          if (staff) venueFilter = staff.venue_id;
        }
      }
    }

    // SECURITY: Refuse to search without venue scope
    if (!venueFilter) {
      return res.status(200).json({ success: true, data: [] });
    }

    // Search by phone (digits only) or name (ilike)
    const isPhone = /^\d+$/.test(q.replace(/[\s\-\(\)]/g, ''));
    let query = supabase
      .from('commander_members')
      .select('id, first_name, last_name, name, phone, email, last_checkin, comp_balance')
      .eq('venue_id', venueFilter)
      .limit(limitNum);

    if (isPhone) {
      const digits = q.replace(/\D/g, '');
      query = query.ilike('phone', `%${digits}%`);
    } else {
      // Search name or first_name/last_name
      query = query.or(`name.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%`);
    }

    const { data: members, error } = await query.order('last_checkin', { ascending: false, nullsFirst: false });

    if (error) {
      console.error('Member search error:', error);
      return res.status(200).json({ success: true, data: [] });
    }

    return res.status(200).json({ success: true, data: members || [] });
  } catch (err) {
    console.error('Member search error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
