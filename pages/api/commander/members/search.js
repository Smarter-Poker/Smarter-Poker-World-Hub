/**
 * Member Search API
 * GET /api/commander/members/search?q=query&limit=10&venue_id=xxx
 * Search members by name or phone number
 * Also returns staff/owners/managers alongside members
 * When no query provided, returns staff + recent members for quick access
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
    const searchQuery = (q || '').trim();
    const limitNum = Math.min(parseInt(limit) || 10, 50);

    // Determine venue scope (required for security)
    let venueFilter = venue_id || null;

    if (!venueFilter) {
      const staffSession = req.headers['x-staff-session'];
      if (staffSession) {
        try {
          const sessionData = JSON.parse(staffSession);
          if (sessionData.venue_id) venueFilter = sessionData.venue_id;
        } catch { /* invalid session format */ }
      }
    }

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

    if (!venueFilter) {
      return res.status(200).json({ success: true, data: [] });
    }

    let results = [];

    // ═══ 1. Always fetch active staff (owners, managers, floor) ═══
    try {
      let staffQ = supabase
        .from('commander_staff')
        .select('id, display_name, role, user_id, is_active')
        .eq('venue_id', venueFilter)
        .eq('is_active', true)
        .in('role', ['owner', 'manager', 'floor']);

      if (searchQuery.length >= 2) {
        staffQ = staffQ.ilike('display_name', `%${searchQuery}%`);
      }

      const { data: staffMembers } = await staffQ.order('role', { ascending: true });

      if (staffMembers && staffMembers.length > 0) {
        // Cross-reference staff with commander_members to get real member IDs + balances
        // Auto-create commander_members records for staff who don't have one
        const memberByStaffId = {};

        // Batch lookup: find all existing member records for these staff (by name match)
        for (const s of staffMembers) {
          const nameParts = (s.display_name || '').trim().split(/\s+/);
          const sfFirst = (nameParts[0] || '').trim();
          const sfLast = nameParts.length > 1 ? nameParts.slice(1).join(' ').trim() : '';
          if (!sfFirst) continue;

          let mq = supabase
            .from('commander_members')
            .select('id, first_name, last_name, time_balance_minutes, membership_tier, membership_status, membership_expires, member_number, phone, comp_balance')
            .eq('venue_id', venueFilter)
            .ilike('first_name', sfFirst);
          if (sfLast) mq = mq.ilike('last_name', sfLast);
          const { data: memberMatch } = await mq.maybeSingle();

          if (memberMatch) {
            memberByStaffId[s.id] = memberMatch;
          } else {
            // AUTO-CREATE a commander_members record for this staff member
            const { data: newMember, error: createErr } = await supabase
              .from('commander_members')
              .insert({
                venue_id: venueFilter,
                first_name: sfFirst,
                last_name: sfLast,
                player_name: s.display_name,
                membership_status: 'active',
                time_balance_minutes: 0,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .select('id, first_name, last_name, time_balance_minutes, membership_tier, membership_status, membership_expires, member_number, phone, comp_balance')
              .single();
            if (!createErr && newMember) {
              memberByStaffId[s.id] = newMember;
              console.log(`Auto-created commander_members record for staff: ${s.display_name} → ${newMember.id}`);
            } else {
              console.warn(`Failed to auto-create member record for ${s.display_name}:`, createErr?.message);
            }
          }
        }

        for (const s of staffMembers) {
          const nameParts = (s.display_name || '').trim().split(/\s+/);
          const memberRec = memberByStaffId[s.id] || null;
          results.push({
            id: memberRec?.id || s.id,  // Use commander_members.id if available
            user_id: s.user_id,
            first_name: nameParts[0] || s.display_name,
            last_name: nameParts.length > 1 ? nameParts.slice(1).join(' ') : '',
            name: s.display_name,
            phone: memberRec?.phone ? formatPhone(memberRec.phone) : null,
            email: null,
            last_visit: null,
            comp_balance: memberRec?.comp_balance || 0,
            membership_tier: memberRec?.membership_tier || null,
            membership_status: memberRec?.membership_status || null,
            membership_expires: memberRec?.membership_expires || null,
            time_balance_minutes: memberRec?.time_balance_minutes || 0,
            member_number: memberRec?.member_number || null,
            _is_staff: true,
            _staff_role: s.role,
            _staff_id: s.id,
          });
        }
      }
    } catch (staffErr) {
      console.warn('Staff search warning:', staffErr);
    }

    // ═══ 2. Search commander_members ═══
    if (searchQuery.length >= 2) {
      const isPhone = /^\d+$/.test(searchQuery.replace(/[\s\-\(\)]/g, ''));
      let query = supabase
        .from('commander_members')
        .select('id, first_name, last_name, phone, email, last_visit, comp_balance, membership_tier, membership_status, membership_expires, time_balance_minutes, member_number')
        .eq('venue_id', venueFilter)
        .limit(limitNum);

      if (isPhone) {
        const digits = searchQuery.replace(/\D/g, '');
        query = query.ilike('phone', `%${digits}%`);
      } else {
        query = query.or(
          `first_name.ilike.%${searchQuery}%,last_name.ilike.%${searchQuery}%,member_number.ilike.%${searchQuery}%,phone.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`
        );
      }

      const { data: members, error } = await query.order('last_visit', { ascending: false, nullsFirst: false });
      if (!error && members) {
        const existingIds = new Set(results.map(r => r.id));
        const existingUserIds = new Set(results.filter(r => r.user_id).map(r => r.user_id));
        for (const m of members) {
          // Skip if already in staff results (by user_id or id)
          if (existingIds.has(m.id)) continue;
          if (m.user_id && existingUserIds.has(m.user_id)) continue;
          results.push({ ...m, phone: formatPhone(m.phone) });
        }
      }
    } else {
      // No search query — show recent members alongside staff
      try {
        const { data: recentMembers } = await supabase
          .from('commander_members')
          .select('id, first_name, last_name, phone, email, last_visit, membership_tier, membership_status, time_balance_minutes, member_number')
          .eq('venue_id', venueFilter)
          .order('last_visit', { ascending: false, nullsFirst: false })
          .limit(Math.max(limitNum - results.length, 5));
        if (recentMembers) {
          const existingIds = new Set(results.map(r => r.id));
          const existingUserIds = new Set(results.filter(r => r.user_id).map(r => r.user_id));
          for (const m of recentMembers) {
            if (existingIds.has(m.id)) continue;
            if (m.user_id && existingUserIds.has(m.user_id)) continue;
            results.push({ ...m, phone: formatPhone(m.phone) });
          }
        }
      } catch { /* ignore */ }
    }

    // ═══ 3. Waitlist fallback (for web/kiosk sign-ups without member record) ═══
    if (searchQuery.length >= 2 && results.length === 0) {
      try {
        let wlQuery = supabase
          .from('commander_waitlist')
          .select('id, player_name, player_phone, signup_method, status, created_at')
          .eq('venue_id', venueFilter)
          .in('status', ['waiting', 'called'])
          .limit(limitNum);

        const isPhone = /^\d+$/.test(searchQuery.replace(/[\s\-\(\)]/g, ''));
        if (isPhone) {
          const digits = searchQuery.replace(/\D/g, '');
          wlQuery = wlQuery.ilike('player_phone', `%${digits}%`);
        } else {
          wlQuery = wlQuery.ilike('player_name', `%${searchQuery}%`);
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
              name: wl.player_name,
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
