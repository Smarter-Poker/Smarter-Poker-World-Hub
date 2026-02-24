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

// Format phone to 555-555-5555
function formatPhone(raw) {
  if (!raw) return null;
  const d = raw.replace(/\D/g, '');
  const digits = d.length === 11 && d[0] === '1' ? d.slice(1) : d;
  if (digits.length !== 10) return raw;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

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

    let results = (members || []).map(m => ({ ...m, phone: formatPhone(m.phone) }));

    // ═══ FALLBACK: Also search commander_waitlist for active web/kiosk sign-ups ═══
    // Web sign-ups may not have a commander_members record yet.
    // This ensures the kiosk can find anyone who signed up online.
    if (results.length === 0) {
      try {
        let wlQuery = supabase
          .from('commander_waitlist')
          .select('id, player_name, player_phone, signup_method, status, created_at')
          .eq('venue_id', venueFilter)
          .in('status', ['waiting', 'called'])
          .limit(limitNum);

        if (isPhone) {
          const digits = q.replace(/\D/g, '');
          wlQuery = wlQuery.ilike('player_phone', `%${digits}%`);
        } else {
          wlQuery = wlQuery.ilike('player_name', `%${q}%`);
        }

        const { data: wlMatches } = await wlQuery.order('created_at', { ascending: false });

        if (wlMatches && wlMatches.length > 0) {
          // De-duplicate by name+phone and convert to member-like shape
          const seen = new Set();
          for (const wl of wlMatches) {
            const dedupKey = `${(wl.player_name || '').toLowerCase()}::${wl.player_phone || ''}`;
            if (seen.has(dedupKey)) continue;
            seen.add(dedupKey);

            const nameParts = (wl.player_name || '').trim().split(/\s+/);
            results.push({
              id: `wl-${wl.id}`,
              first_name: nameParts[0] || wl.player_name,
              last_name: nameParts.length > 1 ? nameParts.slice(1).join(' ') : '',
              name: wl.player_name,
              phone: formatPhone(wl.player_phone) || null,
              email: null,
              last_checkin: null,
              comp_balance: 0,
              _from_waitlist: true,
              _waitlist_id: wl.id,
              _signup_method: wl.signup_method,
            });
          }
        }
      } catch (wlErr) {
        console.warn('Waitlist fallback search warning:', wlErr);
      }
    }

    return res.status(200).json({ success: true, data: results });
  } catch (err) {
    console.error('Member search error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
