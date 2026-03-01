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
      .select('id, first_name, last_name, phone, email, last_visit, comp_balance, membership_tier, membership_status, membership_expires, time_balance_minutes, member_number')
      .eq('venue_id', venueFilter)
      .limit(limitNum);

    if (isPhone) {
      const digits = q.replace(/\D/g, '');
      query = query.ilike('phone', `%${digits}%`);
    } else {
      // Search first_name, last_name, member_number, phone, email (matching the proven working members API pattern)
      query = query.or(
        `first_name.ilike.%${q}%,last_name.ilike.%${q}%,member_number.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`
      );
    }

    const { data: members, error } = await query.order('last_visit', { ascending: false, nullsFirst: false });

    if (error) {
      console.error('Member search error:', error, 'query:', q, 'venue:', venueFilter);
      return res.status(200).json({ success: true, data: [] });
    }

    let results = (members || []).map(m => ({ ...m, phone: formatPhone(m.phone) }));

    // ═══ ALSO search commander_staff (owners, managers, floor, dealers) ═══
    // Staff/owners may not have a commander_members record.
    try {
      let staffQuery = supabase
        .from('commander_staff')
        .select('id, user_id, role, display_name, venue_id')
        .eq('venue_id', venueFilter)
        .eq('is_active', true)
        .limit(limitNum);

      if (!isPhone) {
        staffQuery = staffQuery.ilike('display_name', `%${q}%`);
      }

      const { data: staffMatches } = await staffQuery;

      if (staffMatches && staffMatches.length > 0) {
        // De-duplicate: skip staff who already appear in member results (by display_name match)
        const memberNames = new Set(results.map(r => `${(r.first_name || '').toLowerCase()} ${(r.last_name || '').toLowerCase()}`));

        for (const s of staffMatches) {
          const nameParts = (s.display_name || '').trim().split(/\s+/);
          const firstName = nameParts[0] || s.display_name || 'Staff';
          const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
          const fullNameKey = `${firstName.toLowerCase()} ${lastName.toLowerCase()}`;

          if (memberNames.has(fullNameKey)) continue; // already in results

          results.push({
            id: s.user_id || `staff-${s.id}`,
            first_name: firstName,
            last_name: lastName,
            phone: null,
            email: null,
            last_visit: null,
            comp_balance: 0,
            membership_tier: null,
            membership_status: null,
            member_number: null,
            _from_staff: true,
            _staff_role: s.role,
            _staff_id: s.id,
          });
        }
      }
    } catch (staffErr) {
      console.warn('Staff search fallback warning:', staffErr);
    }

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
              phone: formatPhone(wl.player_phone) || null,
              email: null,
              last_visit: null,
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
