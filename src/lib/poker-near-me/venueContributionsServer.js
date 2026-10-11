import { createClient } from '../supabaseServerClient';
import { getServerUserWithFallback } from '../serverAuth';
import { requireMfaEnrolled } from '../mfaGate';

export const CONTRIBUTION_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
export const CONTRIBUTION_STAFF_ROLES = ['admin', 'superadmin', 'god'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function contributionPrivate(res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Vary', 'Authorization, Cookie');
}

export function contributionBody(req) {
  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  catch { throw contributionInvalid('Invalid JSON request body'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw contributionInvalid('Invalid request body');
  return body;
}

export function contributionInvalid(message) { return Object.assign(new Error(message), { status: 400 }); }
export function contributionId(value, label = 'venue_id') {
  if (!/^[1-9][0-9]*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) throw contributionInvalid(`Invalid ${label}`);
  return Number(value);
}
export function contributionUuid(value, label = 'operation_id') {
  if (typeof value !== 'string' || !UUID.test(value)) throw contributionInvalid(`Invalid ${label}`);
  return value;
}
export function contributionText(value, label, max, required = false) {
  if (value == null || value === '') {
    if (required) throw contributionInvalid(`${label} required`);
    return null;
  }
  if (typeof value !== 'string' || value.trim().length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw contributionInvalid(`Invalid ${label}`);
  const text = value.trim();
  if (!text && required) throw contributionInvalid(`${label} required`);
  return text || null;
}
export function contributionSource(value, required = true) {
  const text = contributionText(value, 'source_url', 1000, required);
  if (!text) return null;
  let url;
  try { url = new URL(text); } catch { throw contributionInvalid('A public http or https source URL is required'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !url.hostname.includes('.')) throw contributionInvalid('Invalid source_url');
  return url.toString();
}
export function contributionRevision(value, label = 'expected_updated_at') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) throw contributionInvalid(`Invalid ${label}`);
  return value;
}
export function claimPayload(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw contributionInvalid('Invalid claim payload');
  const role = contributionText(input.role || 'owner', 'role', 20, true).toLowerCase();
  if (!['owner', 'manager', 'staff'].includes(role)) throw contributionInvalid('Invalid claimant role');
  const email = contributionText(input.contact_email, 'contact_email', 254, true);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw contributionInvalid('Invalid contact_email');
  const contactName = contributionText(input.contact_name, 'contact_name', 120, true);
  if (contactName.length < 2) throw contributionInvalid('contact_name must contain at least two characters');
  return { role, contact_name: contactName, contact_email: email,
    contact_phone: contributionText(input.contact_phone, 'contact_phone', 40), source_url: contributionSource(input.source_url),
    notes: contributionText(input.notes ?? input.verification_notes, 'notes', 2000) };
}
export function correctionPayload(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw contributionInvalid('Invalid correction payload');
  if (!['details', 'location', 'closure', 'schedule'].includes(input.category)) throw contributionInvalid('Invalid correction category');
  let proposal = input.proposal ?? input.changes;
  if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal) || !Object.keys(proposal).length || JSON.stringify(proposal).length > 8000) throw contributionInvalid('A bounded correction proposal is required');
  if (input.category === 'details') proposal = Object.fromEntries(Object.entries(proposal).map(([key, value]) => [key === 'description' ? 'about' : key, value]));
  return { category: input.category, proposal, source_url: contributionSource(input.source_url),
    notes: contributionText(input.notes ?? input.reason, 'notes', 2000), expected_revision: contributionRevision(input.expected_revision, 'expected_revision') };
}
export function schedulePayload(input, action = input.id ? 'update' : 'create') {
  if (!['create', 'update', 'delete'].includes(action)) throw contributionInvalid('Invalid schedule action');
  const payload = { action, source_url: contributionSource(input.source_url) };
  if (action !== 'create') {
    payload.id = contributionId(input.id, 'id');
    payload.expected_updated_at = contributionRevision(input.expected_updated_at);
  }
  if (action === 'delete') return payload;
  if (!CONTRIBUTION_DAYS.includes(input.day_of_week)) throw contributionInvalid('Invalid day_of_week');
  const gameName = contributionText(input.game_name, 'game_name', 120, true);
  if (gameName.length < 2) throw contributionInvalid('game_name must contain at least two characters');
  Object.assign(payload, { day_of_week: input.day_of_week, game_name: gameName, notes: contributionText(input.notes, 'notes', 2000) });
  for (const field of ['start_time', 'end_time']) {
    const value = contributionText(input[field], field, 5);
    if (value && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) throw contributionInvalid(`Invalid ${field}; use HH:MM`);
    payload[field] = value;
  }
  return payload;
}
export function reviewPayload(input, kind) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw contributionInvalid('Invalid review payload');
  if (!(kind === 'claim' ? ['approve', 'reject', 'revoke'] : ['apply', 'reject']).includes(input.action)) throw contributionInvalid('Invalid review action');
  const reason = contributionText(input.reason, 'reason', 2000, true);
  if (reason.length < 12) throw contributionInvalid('A review reason of at least 12 characters is required');
  return { action: input.action, expected_updated_at: contributionRevision(input.expected_updated_at), source_url: contributionSource(input.source_url), reason };
}

export async function contributionAccess(session, venueId) {
  if (session.user) return contributionRpc(session.client, 'pnm_venue_contribution_access', { p_venue_id: venueId });
  const { data: venue, error } = await session.service.from('poker_venues').select('id,is_claimed,claimed_at').eq('id', venueId).maybeSingle();
  if (error) throw error;
  if (!venue) throw Object.assign(new Error('Venue not found'), { code: 'P0002' });
  return { venue_id: venue.id, is_claimed: venue.is_claimed === true, claimed_at: venue.claimed_at, claim: null, legacy_claim: null, permissions: {}, corrections: [] };
}

export async function contributionSession(req, res, { required = true, staff = false, mfa = false } = {}) {
  const service = createClient();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey) throw new Error('Participant client unavailable');
  const header = req.headers?.authorization;
  if (!header && !required) return { service, user: null, client: createClient(undefined, anonKey, { auth: { persistSession: false, autoRefreshToken: false } }) };
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Authentication required' }); return null;
  }
  const result = await getServerUserWithFallback(req, service);
  if (!result.user || result.error) {
    res.status(result.status === 503 ? 503 : 401).json({ success: false, error: result.status === 503 ? 'Session verification unavailable' : 'Invalid or expired session' }); return null;
  }
  const user = result.user;
  if (staff) {
    const { data: profile, error } = await service.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (error) throw error;
    if (!profile || !CONTRIBUTION_STAFF_ROLES.includes(profile.role)) { res.status(403).json({ success: false, error: 'Platform review access required' }); return null; }
  }
  if (mfa) {
    const gate = await requireMfaEnrolled(req, service, user);
    if (!gate.ok) { res.status(gate.status || 403).json({ success: false, error: gate.reason, requiresMfa: true, requiresEnrollment: gate.requiresEnrollment === true }); return null; }
  }
  const client = createClient(undefined, anonKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: header } } });
  return { service, client, user };
}

export async function contributionRpc(client, name, params, operationId = null) {
  const { data, error } = await client.rpc(name, params);
  if (error) throw Object.assign(new Error(error.message || 'Contribution request unavailable'), error, { operationId });
  if (!data) throw Object.assign(new Error('Contribution result unavailable'), { operationId });
  return data;
}

function contributionCanonicalJson(value) {
  if (Array.isArray(value)) return JSON.stringify(value.map(item => JSON.parse(contributionCanonicalJson(item))));
  if (value && typeof value === 'object') return JSON.stringify(Object.fromEntries(Object.keys(value).sort().map(key => [key, JSON.parse(contributionCanonicalJson(value[key]))])));
  return JSON.stringify(value);
}

// The original request owns its acknowledgment. Trusted derived assessment
// fields are excluded only here; every submitted decision and target must match.
export async function contributionReviewReplay(session, operationId, kind, targetId, payload) {
  const { data: operation, error } = await session.service.from('pnm_contribution_operations')
    .select('actor_id,kind,payload,result').eq('request_id', operationId).eq('actor_id', session.user.id).maybeSingle();
  if (error) throw error;
  if (!operation) return null;
  const expectedKind = kind === 'claim' ? 'claim_review' : 'correction_review';
  const targetKey = kind === 'claim' ? 'claim_id' : 'correction_id';
  const stored = { ...(operation.payload || {}) };
  delete stored.resolved_location;
  const incoming = { ...payload, [targetKey]: targetId };
  if (operation.actor_id !== session.user.id || operation.kind !== expectedKind || contributionCanonicalJson(stored) !== contributionCanonicalJson(incoming)) {
    throw Object.assign(new Error('PNM_CONFLICT: request identity reused with different input'), { code: '40001' });
  }
  if (!operation.result?.operation_id || operation.result.operation_id !== operationId) throw new Error('Durable review receipt unavailable');
  return operation.result;
}
export function contributionError(res, error) {
  const code = error?.code;
  const status = error?.status || (code === '42501' ? 403 : code === 'P0002' ? 404 : ['22023', '22P02', '22007', '23514'].includes(code) ? 400 : ['PT409', '40001'].includes(code) || /PNM_CONFLICT/.test(error?.message || '') ? 409 : 503);
  const uncertain = status >= 500 && Boolean(error?.operationId);
  return res.status(status).json({ success: false, error: status >= 500 ? 'Contribution service unavailable. Check the saved operation before retrying.' : error.message,
    ...(uncertain ? { outcome: 'unknown', operation_id: error.operationId } : {}) });
}
