/**
 * Venue Management API
 * For claimed/verified venue owners to update their venue info
 *
 * GET: Get venue management data
 * PATCH: Update venue info
 */

import { contributionPrivate, contributionBody, contributionSession, contributionId, contributionUuid, contributionRevision, contributionSource, contributionText, contributionRpc, contributionError, contributionInvalid } from '../../../../../src/lib/poker-near-me/venueContributionsServer';
import { createClient } from '../../../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../../../src/lib/apiErrorHandler';

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
  contributionPrivate(res);
  if (!['GET', 'PATCH'].includes(req.method)) { res.setHeader('Allow', 'GET, PATCH'); return res.status(405).json({ success: false, error: 'Method not allowed' }); }
  if (req.method === 'PATCH') {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
    let operationId;
    try {
      const session = await contributionSession(req, res);
      if (!session) return;
      const body = contributionBody(req);
      operationId = contributionUuid(body.operation_id);
      const changes = body.changes || Object.fromEntries(Object.entries(body).filter(([key]) => !['operation_id', 'expected_revision', 'source_url', 'notes'].includes(key)));
      const normalized = {};
      for (const [field, value] of Object.entries(changes)) {
        const column = FIELD_ALIASES[field] || field;
        if (!FIELD_PERMISSIONS[column]) throw contributionInvalid(`Unsupported venue field: ${field}`);
        normalized[column] = value;
      }
      if (!Object.keys(normalized).length) throw contributionInvalid('No valid fields to update');
      const receipt = await contributionRpc(session.client, 'pnm_mutate_venue_info', { p_request_id: operationId, p_venue_id: contributionId(req.query.id),
        p_payload: { changes: normalized, expected_revision: contributionRevision(body.expected_revision, 'expected_revision'), source_url: contributionSource(body.source_url), notes: contributionText(body.notes, 'notes', 2000) } }, operationId);
      return res.status(200).json({ success: true, ...receipt, venue: receipt.venue, message: 'Venue update saved with its source and audit trail.' });
    } catch (error) { if (operationId && !error.code && !error.status) error.operationId = operationId; return contributionError(res, error); }
  }
  try {
    // NEVER shared-cache this endpoint. Every response is per-manager and
    // authenticated: it carries the full venue row, every manager's public profile
    // (no email - a co-manager is not platform staff). Activity omits IP and
    // user-agent diagnostics. Under `public, s-maxage=60` a CDN would hand
    // one manager's payload to the next visitor of the same URL — or hand a
    // cached 403 to a legitimate manager.
    res.setHeader('Cache-Control', 'private, no-store');

    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

      const id = contributionId(req.query.id);
      const session = await contributionSession(req, res);
      if (!session) return;
      const user = session.user;
      const access = await contributionRpc(session.client, 'pnm_venue_contribution_access', { p_venue_id: id });
      if (!Object.values(access.permissions || {}).some(Boolean)) return res.status(403).json({ success: false, error: 'Not authorized to manage this venue' });

      // Check if user is a manager of this venue
      const { data: manager, error: managerError } = await getSupabase()
          .from('venue_managers')
          .select('*')
          .eq('venue_id', parseInt(id))
          .eq('user_id', user.id)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

      if (managerError) throw managerError;
      if (!manager && !access.legacy_claim && !access.claim) {
          return res.status(403).json({
              success: false, error: 'Not authorized',
              message: 'You do not have permission to manage this venue.'
          });
      }

      if (req.method === 'GET') {
          return handleGet(req, res, id, user, manager || { role: 'manager' }, access.permissions);
      }

      return res.status(405).json({ success: false, error: 'Method not allowed' });

  } catch (err) {
    try { reportApiError(err, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return contributionError(res, err);
  }
}

async function handleGet(req, res, venueId, user, manager, permissions) {
    try {
        // Get venue with all editable fields
        const { data: venue, error: venueError } = await getSupabase()
            .from('poker_venues')
            .select('*')
            .eq('id', parseInt(venueId))
            .maybeSingle();

        if (venueError || !venue) {
            return res.status(404).json({ success: false, error: 'Venue not found' });
        }

        // Get other managers
        const { data: managers, error: managersError } = await getSupabase()
            .from('venue_managers')
            .select(`
                id, role, is_active, created_at,
                user:profiles(id, username, display_name, avatar_url)
            `)
            .eq('venue_id', parseInt(venueId))
            .eq('is_active', true)
                .limit(100);

        // Get recent activity
        const { data: activity, error: activityError } = await getSupabase()
            .from('venue_verification_log')
            .select('id,claim_id,venue_id,action,details,performed_by,created_at')
            .eq('venue_id', parseInt(venueId))
            .order('created_at', { ascending: false })
            .limit(20);

        // Get tournament schedules
        const { data: tournaments, error: tournamentsError } = await getSupabase()
            .from('venue_tournament_schedules')
            .select('*')
            .eq('venue_id', parseInt(venueId))
            .order('start_time');
        if (managersError || activityError || tournamentsError) throw managersError || activityError || tournamentsError;

        return res.status(200).json({
            venue,
            manager: {
                role: manager.role,
                permissions
            },
            managers: managers || [],
            activity: activity || [],
            tournaments: tournaments || []
        });

    } catch (error) {
        console.warn('Venue manage GET error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

// Installed-column whitelist. Unknown fields fail the complete atomic request;
// location changes use independent correction review, not an owner bypass.

// Incoming field name -> real poker_venues column.
const FIELD_ALIASES = {
    zip_code: 'zip',
    description: 'about',
};

// Real column -> the venue_managers permission flag that gates it.
const FIELD_PERMISSIONS = {
    // can_edit_info
    name: 'can_edit_info',
    zip: 'can_edit_info',
    phone: 'can_edit_info',
    website: 'can_edit_info',
    about: 'can_edit_info',
    tagline: 'can_edit_info',
    social_links: 'can_edit_info',
    profile_photo_url: 'can_edit_info',
    cover_photo_url: 'can_edit_info',
    logo_url: 'can_edit_info',
    // can_edit_hours
    hours: 'can_edit_hours',
    hours_weekday: 'can_edit_hours',
    hours_weekend: 'can_edit_hours',
    // can_edit_games
    games_offered: 'can_edit_games',
    stakes_cash: 'can_edit_games',
    has_tournaments: 'can_edit_games',
};
