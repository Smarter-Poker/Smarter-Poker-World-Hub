/** Indexed Poker Near Me venue operations. */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { requireMfaEnrolled } from '../../../src/lib/mfaGate';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { assessVenueLocation } from '../../../src/lib/poker-near-me/venueIntegrityServer';
import { syncVenueIntegrityState } from '../../../src/lib/poker-near-me/venueIntegrityState';

const ADMIN_ROLES = ['admin', 'superadmin', 'god'];
const ISSUE_TYPES = ['conflict', 'missing', 'duplicate', 'unverified', 'incomplete', 'stale'];
const VENUE_FIELDS = 'id,name,venue_type,address,city,state,latitude,longitude,lat,lng,location_integrity_revision,data_quality,scrape_status,is_active,phone,website,profile_photo_url,cover_photo_url,logo_url,canonical_venue_id';
const STATE_FIELDS = 'venue_id,name,venue_type,address,city,state,latitude,longitude,revision,active,location_status,location_reason,mappable,issue_types,primary_issue,priority,related_ids,missing_fields,completeness_score,last_scraped_at,data_quality,scrape_status,assessed_at,updated_at';
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

function parseBody(req) {
  return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
}

function validRevision(value) {
  return !!value && Number.isFinite(Date.parse(value));
}

function normalizedHttpUrl(value, maxLength = 1000, allowRelative = false) {
  const raw = normalizedString(value, maxLength);
  if (!raw) return null;
  if (allowRelative && /^\/[a-zA-Z0-9/_?&=.%+-]+$/.test(raw)) return raw;
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(candidate);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : null;
  } catch (_error) {
    return null;
  }
}

async function requirePlatformAdmin(req, res) {
  const supabase = getSupabase();
  const { user } = await getServerUserWithFallback(req, supabase);
  if (!user?.id) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return null;
  }
  const { data: profile, error } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (error || !profile || !ADMIN_ROLES.includes(profile.role)) {
    res.status(403).json({ success: false, error: 'Platform admin access required' });
    return null;
  }
  return { ...user, platformRole: profile.role };
}

async function requireMutationMfa(req, res, supabase, admin) {
  const gate = await requireMfaEnrolled(req, supabase, admin);
  if (gate.ok) return true;
  res.status(gate.status || 403).json({
    success: false,
    error: gate.reason || 'MFA challenge required',
    requiresMfa: true,
    requiresEnrollment: gate.requiresEnrollment === true,
  });
  return false;
}

function rpcErrorResponse(res, error) {
  if (error?.code === '40001' || /revision changed/i.test(error?.message || '')) {
    return res.status(409).json({ success: false, error: 'Venue changed after it was loaded; refresh before applying this operation' });
  }
  if (['22023', 'P0002'].includes(error?.code)) {
    return res.status(error.code === 'P0002' ? 404 : 422).json({ success: false, error: error.message });
  }
  throw error;
}

async function queueSummary(supabase) {
  const count = async (issue) => {
    let query = supabase.from('venue_location_integrity_state').select('venue_id', { count: 'exact', head: true }).eq('active', true);
    if (issue) query = query.contains('issue_types', [issue]);
    const { count: value, error } = await query;
    if (error) throw error;
    return value || 0;
  };
  const [input, ...counts] = await Promise.all([count(null), ...ISSUE_TYPES.map(count)]);
  const summary = { input };
  ISSUE_TYPES.forEach((issue, index) => { summary[issue] = counts[index]; });
  const { count: actionable, error } = await supabase.from('venue_location_integrity_state')
    .select('venue_id', { count: 'exact', head: true }).eq('active', true).not('primary_issue', 'is', null);
  if (error) throw error;
  summary.actionable = actionable || 0;
  const { data: duplicateRows, error: duplicateError } = await supabase
    .from('venue_location_integrity_state')
    .select('venue_id,related_ids')
    .eq('active', true)
    .contains('issue_types', ['duplicate']);
  if (duplicateError) throw duplicateError;
  summary.duplicate_groups = new Set((duplicateRows || []).map((row) => (
    [row.venue_id, ...(row.related_ids || [])].map(Number).sort((a, b) => a - b).join(':')
  ))).size;
  return summary;
}

async function handleGet(req, res, supabase) {
  const page = clampInt(req.query.page, 1, 1, 100000);
  const pageSize = clampInt(req.query.pageSize, 50, 10, 100);
  const requestedStatus = normalizedString(req.query.status, 20).toLowerCase();
  const status = ISSUE_TYPES.includes(requestedStatus) ? requestedStatus : 'all';
  const search = normalizedString(req.query.search, 120);
  const from = (page - 1) * pageSize;
  let query = supabase.from('venue_location_integrity_state').select(STATE_FIELDS, { count: 'exact' })
    .eq('active', true).not('primary_issue', 'is', null);
  if (status !== 'all') query = query.contains('issue_types', [status]);
  if (search) query = query.textSearch('search_vector', search, { type: 'websearch', config: 'simple' });

  const [queueResult, summary, correctionsResult, enrichmentsResult, retirementsResult] = await Promise.all([
    query.order('priority', { ascending: true }).order('state', { ascending: true }).order('city', { ascending: true }).range(from, from + pageSize - 1),
    queueSummary(supabase),
    supabase.from('venue_location_integrity_log').select('id,venue_id,reason,integrity_status,integrity_reason,after_record,created_at').order('created_at', { ascending: false }).limit(12),
    supabase.from('venue_directory_enrichment_log').select('id,venue_id,reason,source_url,confidence,after_record,created_at').order('created_at', { ascending: false }).limit(12),
    supabase.from('venue_duplicate_retirement_log').select('id,retired_venue_id,canonical_venue_id,reason,created_at').order('created_at', { ascending: false }).limit(12),
  ]);
  for (const result of [queueResult, correctionsResult, enrichmentsResult, retirementsResult]) {
    if (result.error) throw result.error;
  }

  const stateRows = queueResult.data || [];
  const ids = stateRows.map((row) => row.venue_id);
  let venueById = new Map();
  if (ids.length) {
    const { data: venues, error } = await supabase.from('poker_venues').select(VENUE_FIELDS).in('id', ids);
    if (error) throw error;
    venueById = new Map((venues || []).map((venue) => [venue.id, venue]));
  }
  const issues = stateRows.map((row) => ({
    ...row,
    ...venueById.get(row.venue_id),
    id: row.venue_id,
    issue_type: row.primary_issue,
  }));
  return res.status(200).json({
    success: true,
    summary,
    issues,
    pagination: { page, pageSize, total: queueResult.count || 0, pages: Math.max(1, Math.ceil((queueResult.count || 0) / pageSize)) },
    recent_corrections: correctionsResult.data || [],
    recent_enrichments: enrichmentsResult.data || [],
    recent_retirements: retirementsResult.data || [],
    generated_at: new Date().toISOString(),
  });
}

async function handleLocationCorrection(req, res, supabase, admin) {
  const body = parseBody(req);
  const id = Number.parseInt(body.id, 10);
  const expectedRevision = normalizedString(body.expected_revision, 80);
  const reason = normalizedString(body.reason, 500);
  const address = normalizedString(body.address, 300);
  const city = normalizedString(body.city, 120);
  const state = normalizedString(body.state, 40).toUpperCase();
  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ success: false, error: 'A valid venue id is required' });
  if (!validRevision(expectedRevision)) return res.status(400).json({ success: false, error: 'The venue revision is required; refresh and try again' });
  if (reason.length < 12) return res.status(400).json({ success: false, error: 'An audit reason of at least 12 characters is required' });
  if (!city || !state) return res.status(400).json({ success: false, error: 'City and state are required' });
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return res.status(400).json({ success: false, error: 'Finite latitude and longitude are required' });
  const { data: current, error: currentError } = await supabase.from('poker_venues').select(VENUE_FIELDS).eq('id', id).maybeSingle();
  if (currentError) throw currentError;
  if (!current) return res.status(404).json({ success: false, error: 'Venue not found' });
  const locationQuality = assessVenueLocation({ ...current, address, city, state, latitude, longitude, lat: latitude, lng: longitude });
  if (!['verified', 'border'].includes(locationQuality.status)) {
    return res.status(422).json({ success: false, error: 'Correction still conflicts with the venue state boundary', location_quality: locationQuality });
  }
  const { data, error } = await supabase.rpc('resolve_venue_location_integrity', {
    p_venue_id: id, p_expected_updated_at: expectedRevision, p_address: address || null,
    p_city: city, p_state: state, p_latitude: latitude, p_longitude: longitude,
    p_reason: reason, p_actor_id: admin.id, p_integrity_status: locationQuality.status,
    p_integrity_reason: locationQuality.reason,
  });
  if (error) return rpcErrorResponse(res, error);
  await syncVenueIntegrityState(supabase, { venueIds: [id] });
  return res.status(200).json({ success: true, result: data, location_quality: locationQuality });
}

async function handleEnrichment(req, res, supabase, admin) {
  const body = parseBody(req);
  const id = Number.parseInt(body.id, 10);
  const expectedRevision = normalizedString(body.expected_revision, 80);
  const reason = normalizedString(body.reason, 500);
  const sourceUrl = normalizedHttpUrl(body.source_url);
  const confidence = Number(body.confidence);
  if (!Number.isInteger(id) || id < 1 || !validRevision(expectedRevision)) return res.status(400).json({ success: false, error: 'A venue id and current revision are required' });
  if (reason.length < 12 || !sourceUrl || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    return res.status(400).json({ success: false, error: 'A source URL, confidence from 0 to 1, and 12-character audit reason are required' });
  }
  const websiteInput = normalizedString(body.website, 1000);
  const profileInput = normalizedString(body.profile_photo_url, 1000);
  const coverInput = normalizedString(body.cover_photo_url, 1000);
  const logoInput = normalizedString(body.logo_url, 1000);
  const website = normalizedHttpUrl(websiteInput);
  const profilePhotoUrl = normalizedHttpUrl(profileInput, 1000, true);
  const coverPhotoUrl = normalizedHttpUrl(coverInput, 1000, true);
  const logoUrl = normalizedHttpUrl(logoInput, 1000, true);
  if ((websiteInput && !website) || (profileInput && !profilePhotoUrl) || (coverInput && !coverPhotoUrl) || (logoInput && !logoUrl)) {
    return res.status(400).json({ success: false, error: 'Website and artwork fields must be valid HTTP(S) or site-relative URLs' });
  }
  const { data, error } = await supabase.rpc('apply_venue_directory_enrichment', {
    p_venue_id: id, p_expected_revision: expectedRevision,
    p_phone: normalizedString(body.phone, 120) || null,
    p_website: website,
    p_profile_photo_url: profilePhotoUrl,
    p_cover_photo_url: coverPhotoUrl,
    p_logo_url: logoUrl,
    p_source_url: sourceUrl, p_confidence: confidence, p_reason: reason, p_actor_id: admin.id,
  });
  if (error) return rpcErrorResponse(res, error);
  return res.status(200).json({ success: true, result: data });
}

async function handlePost(req, res, supabase, admin) {
  const body = parseBody(req);
  const action = normalizedString(body.action, 40).toLowerCase();
  if (action === 'refresh') {
    const result = await syncVenueIntegrityState(supabase);
    return res.status(200).json({ success: true, refreshed: result.synced_rows, summary: result });
  }
  if (action !== 'retire_duplicate') return res.status(400).json({ success: false, error: 'Unknown venue operation' });
  const id = Number.parseInt(body.id, 10);
  const canonicalId = Number.parseInt(body.canonical_venue_id, 10);
  const revision = normalizedString(body.expected_revision, 80);
  const reason = normalizedString(body.reason, 500);
  if (![id, canonicalId].every((value) => Number.isInteger(value) && value > 0) || !validRevision(revision) || reason.length < 12) {
    return res.status(400).json({ success: false, error: 'Retirement requires source/canonical ids, current revision, and a 12-character audit reason' });
  }
  const { data, error } = await supabase.rpc('retire_duplicate_poker_venue', {
    p_venue_id: id, p_canonical_venue_id: canonicalId, p_expected_revision: revision,
    p_reason: reason, p_actor_id: admin.id,
  });
  if (error) return rpcErrorResponse(res, error);
  return res.status(200).json({ success: true, result: data });
}

export default async function handler(req, res) {
  const allowed = ['GET', 'PATCH', 'PUT', 'POST'];
  if (!allowed.includes(req.method)) {
    res.setHeader('Allow', allowed.join(', '));
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  if (!applyRateLimit(req, res, req.method === 'GET' ? LIMITS.read : LIMITS.write)) return;
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    const admin = await requirePlatformAdmin(req, res);
    if (!admin) return;
    const supabase = getSupabase();
    if (req.method === 'GET') return handleGet(req, res, supabase);
    if (!(await requireMutationMfa(req, res, supabase, admin))) return;
    if (req.method === 'PATCH') return handleLocationCorrection(req, res, supabase, admin);
    if (req.method === 'PUT') return handleEnrichment(req, res, supabase, admin);
    return handlePost(req, res, supabase, admin);
  } catch (error) {
    try { reportApiError(error, req); } catch (_reportError) { /* noop */ }
    console.warn('[venue-integrity-admin] error:', error?.message || error);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
