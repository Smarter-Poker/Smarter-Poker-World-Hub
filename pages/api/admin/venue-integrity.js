/**
 * Venue location integrity operations.
 *
 * GET   returns the protected remediation queue.
 * PATCH atomically corrects one venue through a role-checked, audit-logged RPC.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { requireMfaEnrolled } from '../../../src/lib/mfaGate';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { assessVenueLocation } from '../../../src/lib/poker-near-me/venueIntegrityServer';
import { buildVenueIntegrityQueue, filterVenueIntegrityQueue } from '../../../src/lib/poker-near-me/venueIntegrityOperations';

const ADMIN_ROLES = ['admin', 'superadmin', 'god'];
const VENUE_FIELDS = 'id,name,venue_type,address,city,state,latitude,longitude,lat,lng,location_integrity_revision,data_quality,scrape_status,is_active';
let _supabase = null;

function getSupabase() {
  if (!_supabase) _supabase = createClient();
  return _supabase;
}

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(Array.isArray(value) ? value[0] : value, 10);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, min), max) : fallback;
}

function normalizedString(value, maxLength) {
  if (Array.isArray(value)) value = value[0];
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

async function requirePlatformAdmin(req, res) {
  const supabase = getSupabase();
  const { user } = await getServerUserWithFallback(req, supabase);
  if (!user?.id) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return null;
  }
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (error || !profile || !ADMIN_ROLES.includes(profile.role)) {
    res.status(403).json({ success: false, error: 'Platform admin access required' });
    return null;
  }
  return { ...user, platformRole: profile.role };
}

async function fetchActiveVenues(supabase) {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('poker_venues')
      .select(VENUE_FIELDS)
      .eq('is_active', true)
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

export default async function handler(req, res) {
  if (!['GET', 'PATCH'].includes(req.method)) {
    res.setHeader('Allow', 'GET, PATCH');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  if (!applyRateLimit(req, res, req.method === 'GET' ? LIMITS.read : LIMITS.write)) return;
  res.setHeader('Cache-Control', 'private, no-store');

  try {
    const admin = await requirePlatformAdmin(req, res);
    if (!admin) return;
    const supabase = getSupabase();

    if (req.method === 'PATCH') {
      const gate = await requireMfaEnrolled(req, supabase, admin);
      if (!gate.ok) {
        return res.status(gate.status || 403).json({
          success: false,
          error: gate.reason || 'MFA challenge required',
          requiresMfa: true,
          requiresEnrollment: gate.requiresEnrollment === true,
        });
      }

      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const id = Number.parseInt(body.id, 10);
      const expectedRevision = normalizedString(body.expected_revision, 80);
      const reason = normalizedString(body.reason, 500);
      const address = normalizedString(body.address, 300);
      const city = normalizedString(body.city, 120);
      const state = normalizedString(body.state, 40).toUpperCase();
      const latitude = Number(body.latitude);
      const longitude = Number(body.longitude);

      if (!Number.isInteger(id) || id < 1) return res.status(400).json({ success: false, error: 'A valid venue id is required' });
      if (!expectedRevision || !Number.isFinite(Date.parse(expectedRevision))) {
        return res.status(400).json({ success: false, error: 'The venue revision is required; refresh and try again' });
      }
      if (reason.length < 12) return res.status(400).json({ success: false, error: 'An audit reason of at least 12 characters is required' });
      if (!city || !state) return res.status(400).json({ success: false, error: 'City and state are required' });
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return res.status(400).json({ success: false, error: 'Finite latitude and longitude are required' });
      }

      const { data: current, error: currentError } = await supabase
        .from('poker_venues')
        .select(VENUE_FIELDS)
        .eq('id', id)
        .maybeSingle();
      if (currentError) throw currentError;
      if (!current) return res.status(404).json({ success: false, error: 'Venue not found' });

      const proposed = { ...current, address, city, state, latitude, longitude, lat: latitude, lng: longitude };
      const locationQuality = assessVenueLocation(proposed);
      if (!['verified', 'border'].includes(locationQuality.status)) {
        return res.status(422).json({
          success: false,
          error: 'Correction still conflicts with the venue state boundary',
          location_quality: locationQuality,
        });
      }

      const { data, error } = await supabase.rpc('resolve_venue_location_integrity', {
        p_venue_id: id,
        // Keep the original RPC argument name so CREATE OR REPLACE remains
        // compatible; its value is the dedicated location revision.
        p_expected_updated_at: expectedRevision,
        p_address: address || null,
        p_city: city,
        p_state: state,
        p_latitude: latitude,
        p_longitude: longitude,
        p_reason: reason,
        p_actor_id: admin.id,
        p_integrity_status: locationQuality.status,
        p_integrity_reason: locationQuality.reason,
      });
      if (error) {
        if (error.code === '40001' || /revision changed/i.test(error.message || '')) {
          return res.status(409).json({ success: false, error: 'Venue changed after it was loaded; refresh before applying a correction' });
        }
        throw error;
      }
      return res.status(200).json({ success: true, result: data, location_quality: locationQuality });
    }

    const page = clampInt(req.query.page, 1, 1, 100000);
    const pageSize = clampInt(req.query.pageSize, 50, 10, 200);
    const status = normalizedString(req.query.status, 20).toLowerCase() || 'all';
    const search = normalizedString(req.query.search, 120);
    const venues = await fetchActiveVenues(supabase);
    const queue = buildVenueIntegrityQueue(venues);
    const filtered = filterVenueIntegrityQueue(queue.issues, { status, search });
    const from = (page - 1) * pageSize;
    const { data: recentCorrections, error: historyError } = await supabase
      .from('venue_location_integrity_log')
      .select('id,venue_id,reason,integrity_status,integrity_reason,after_record,created_at')
      .order('created_at', { ascending: false })
      .limit(20);
    if (historyError) throw historyError;
    return res.status(200).json({
      success: true,
      summary: queue.summary,
      issues: filtered.slice(from, from + pageSize),
      pagination: {
        page,
        pageSize,
        total: filtered.length,
        pages: Math.max(1, Math.ceil(filtered.length / pageSize)),
      },
      recent_corrections: recentCorrections || [],
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    try { reportApiError(error, req); } catch (_reportError) { /* noop */ }
    console.warn('[venue-integrity-admin] error:', error?.message || error);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
