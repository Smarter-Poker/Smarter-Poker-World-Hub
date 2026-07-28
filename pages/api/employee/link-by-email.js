/**
 * Link by Email API — POST /api/employee/link-by-email  
 * Auto-link: checks if any commander_staff records have the same email as the authenticated user
 * If found, links them automatically (user must confirm on frontend first)
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

export default async function handler(req, res) {
  try {
    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

      if (req.method === 'GET') return handleGet(req, res);
      if (req.method === 'POST') return handlePost(req, res);
      return res.status(405).json({ success: false, error: 'Method not allowed' });

  } catch (err) {
    try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

// GET — Check for matching staff records by email
async function handleGet(req, res) {
    try {
        const token = (req.headers.authorization || '').replace('Bearer ', '');
        if (!token) return res.status(401).json({ success: false, error: 'Auth required' });

        const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
        const user = authData?.user;
        if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid session' });

        const userEmail = user.email;
        if (!userEmail) {
            return res.status(200).json({ success: true, data: { matches: [] } });
        }

        // Find unlinked staff records matching this email
        const { data: matches } = await getSupabase()
            .from('commander_staff')
            .select('id, display_name, role, venue_id, email')
            .eq('email', userEmail)
            .is('linked_user_id', null)
            .eq('is_active', true)
                .limit(100);

        if (!matches?.length) {
            return res.status(200).json({ success: true, data: { matches: [] } });
        }

        // Enrich with venue names
        const venueIds = [...new Set(matches.map(m => m.venue_id))];
        const { data: venues } = await getSupabase()
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

        return res.status(200).json({ success: true, data: { matches: enriched } });
    } catch (err) {
        console.warn('Email match check error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

// POST — Confirm email-based link
async function handlePost(req, res) {
    try {
        const token = (req.headers.authorization || '').replace('Bearer ', '');
        if (!token) return res.status(401).json({ success: false, error: 'Auth required' });

        const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
        const user = authData?.user;
        if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid session' });

        const { staff_id } = req.body;
        if (!staff_id) return res.status(400).json({ success: false, error: 'staff_id required' });

        // Verify the staff record has matching email and is unlinked
        const { data: staff } = await getSupabase()
            .from('commander_staff')
            .select('id, display_name, role, venue_id, email, linked_user_id')
            .eq('id', staff_id)
            .eq('email', user.email)
            .eq('is_active', true)
            .maybeSingle();

        if (!staff) {
            return res.status(404).json({ success: false, error: 'No matching staff record found' });
        }

        if (staff.linked_user_id) {
            return res.status(400).json({ success: false, error: 'This staff position is already linked' });
        }

        // Link
        const { error: updateErr } = await getSupabase()
            .from('commander_staff')
            .update({ linked_user_id: user.id })
            .eq('id', staff_id);

        if (updateErr) {
            return res.status(500).json({ success: false, error: 'Failed to link account' });
        }

        const { data: venue } = await getSupabase()
            .from('poker_venues')
            .select('name')
            .eq('id', staff.venue_id)
            .maybeSingle();

        return res.status(200).json({
            success: true,
            data: {
                staff_name: staff.display_name,
                venue_name: venue?.name || 'Unknown Venue',
                role: staff.role,
            },
        });
    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.warn('Email link error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
