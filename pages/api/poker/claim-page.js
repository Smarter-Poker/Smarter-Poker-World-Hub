import { getServerUserWithFallback } from '../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
const { applyCors } = require('../../../src/lib/cors');
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
    if (!applyCors(req, res, { methods: 'GET, POST, PUT, DELETE, OPTIONS', headers: 'Content-Type, x-user-id, Authorization' })) return;
try {
    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

    try {
      if (req.method === 'POST') {
        // Require JWT for page claims
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ success: false, error: 'Auth required for page claims' });
        const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
        /* removed duplicate authUser */
        if (authErr || !authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

        const { page_type, page_id, contact_name, contact_email, contact_phone, role, verification_notes } = req.body;
        const user_id = authUser.id;

        if (!page_type || !page_id || !contact_name || !contact_email || !role) {
          return res.status(400).json({
            success: false,
            error: 'Missing required fields: page_type, page_id, contact_name, contact_email, role',
          });
        }

        const pageIdStr = String(page_id);

        // Check if claim already exists for this page
        const { data: existingClaim, error: checkError } = await getSupabase()
          .from('page_claims')
          .select('id, status, user_id')
          .eq('page_type', page_type)
          .eq('page_id', pageIdStr)
          .limit(1);

        if (checkError) {
          console.warn('Error checking existing claim:', checkError);
          return res.status(500).json({ success: false, error: checkError.message });
        }

        if (existingClaim && existingClaim.length > 0) {
          return res.status(409).json({
            success: false,
            error: 'A claim already exists for this page',
            existing_claim: {
              status: existingClaim[0].status,
              is_yours: existingClaim[0].user_id === user_id,
            },
          });
        }

        const insertData = {
          page_type,
          page_id: pageIdStr,
          user_id,
          contact_name,
          contact_email,
          role,
          status: 'pending',
          created_at: new Date().toISOString(),
        };
        if (verification_notes) {
          insertData.verification_notes = verification_notes;
        }
        if (contact_phone !== undefined && contact_phone !== null) {
          insertData.contact_phone = contact_phone;
        }

        const { data, error } = await getSupabase()
          .from('page_claims')
          .insert(insertData)
          .select()
          .maybeSingle();

        if (error) {
          console.warn('Error creating claim:', error);
          return res.status(500).json({ success: false, error: 'Internal server error' });
        }

        return res.status(201).json({ success: true, claim: data });
      }

      if (req.method === 'GET') {
        const safeQ = (v) => v ? (Array.isArray(v) ? String(v[0]) : typeof v === 'object' ? null : String(v)) : v;
        const page_type = safeQ(req.query.page_type);
        const page_id = safeQ(req.query.page_id);
        const user_id = safeQ(req.query.user_id);

        // Get claim status for a specific page.
        // SECURITY: this branch is public, so it must never expose the claimant's
        // contact_name / contact_email / contact_phone / verification_notes.
        if (page_type && page_id) {
          const pageIdStr = String(page_id);
          const { data, error } = await getSupabase()
            .from('page_claims')
            .select('id, status, created_at, user_id')
            .eq('page_type', page_type)
            .eq('page_id', pageIdStr)
            .order('created_at', { ascending: false })
            .limit(1);

          if (error) {
            console.warn('Error fetching claim:', error);
            return res.status(500).json({ success: false, error: 'Internal server error' });
          }

          if (!data || data.length === 0) {
            return res.status(200).json({ success: true, claimed: false, claim: null });
          }

          // Only tell the caller the claim is theirs when they present a valid JWT.
          let isYours = false;
          const token = req.headers.authorization?.replace('Bearer ', '');
          if (token) {
            try {
              const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
              isYours = Boolean(authData?.user && authData.user.id === data[0].user_id);
            } catch (_authErr) { isYours = false; }
          }

          return res.status(200).json({
            success: true,
            claimed: true,
            claim: {
              id: data[0].id,
              status: data[0].status,
              created_at: data[0].created_at,
              is_yours: isYours,
            },
          });
        }

        // Get all claims for a user (own claims only)
        if (user_id) {
          const token = req.headers.authorization?.replace('Bearer ', '');
          if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
          const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
          /* removed duplicate authUser */
          if (authErr || !authUser) return res.status(401).json({ success: false, error: 'Invalid token' });
          if (authUser.id !== user_id) {
            return res.status(403).json({ success: false, error: 'Not authorized to view these claims' });
          }

          const { data, error } = await getSupabase()
            .from('page_claims')
            .select('*')
            .eq('user_id', user_id)
            .order('created_at', { ascending: false })
                .limit(100);

          if (error) {
            console.warn('Error fetching user claims:', error);
            return res.status(500).json({ success: false, error: 'Internal server error' });
          }

          return res.status(200).json({ success: true, claims: data || [] });
        }

        return res.status(400).json({ success: false, error: 'page_type+page_id or user_id is required' });
      }

      return res.status(405).json({ success: false, error: `Method ${req.method} not allowed` });
    } catch (err) {
      console.warn('Claim page API error:', err);
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
