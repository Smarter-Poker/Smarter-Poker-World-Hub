import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const ROOT = new URL('../', import.meta.url);
const OWNER = '11111111-1111-4111-8111-111111111111';
const OPERATION = '22222222-2222-4222-8222-222222222222';
const CLAIM = '33333333-3333-4333-8333-333333333333';
const REVISION = '2026-10-11T05:00:00.000Z';
const source = 'https://venue.example.com/poker';

function fixture({ user = OWNER, role = 'admin', mfa = true, error = null, throwRpc = false, missingClaim = false, sessionStatus = null, correctionCategory = 'details', proposal = {}, operation = null, canPostUpdates = false, accessOverride = null, managerRow, venueRow, tableRows = {}, tableErrors = {} } = {}) {
  const calls = [];
  const receipt = { operation_id: OPERATION, status: 'pending', claim: { id: CLAIM, status: 'pending' }, schedule: { id: 1, updated_at: REVISION }, venue: { id: 10 } };
  const service = {
    rpc: async (name, args) => { calls.push({ name, args, service: true }); return { data: receipt, error }; },
    from(table) {
      let bounds = null;
      let rowLimit = null;
      const query = { select(fields) { calls.push({ table, fields }); return query; }, insert(value) { calls.push({ table, insert: value }); return query; }, eq(key, value) { calls.push({ table, filter: key, value }); return query; }, in() { return query; }, order(key, options) { calls.push({ table, order: key, options }); return query; }, limit(value) { rowLimit = value; return query; }, range(from, to) { bounds = [from, to]; calls.push({ table, range: bounds }); return query; },
        maybeSingle: async () => ({ data: table === 'profiles' ? { role } : table === 'pnm_contribution_operations' ? operation : table === 'poker_venues' ? venueRow === undefined ? { id: 10, name: 'Venue', state: 'TX', city: 'Austin', venue_type: 'poker_club', is_claimed: false } : venueRow : table === 'venue_managers' && managerRow !== undefined ? managerRow : table === 'pnm_venue_corrections' ? { id: CLAIM, venue_id: 10, category: correctionCategory, proposal } : missingClaim ? null : { id: CLAIM, user_id: OWNER, venue_id: 10, status: 'pending' }, error: tableErrors[table] || null }),
        then(resolve, reject) {
          let data = tableRows[table] || (table === 'venue_claims' ? [{ id: CLAIM, verification_code: 'Never Publish', verification_attempts: 1 }] : []);
          if (bounds) data = data.slice(bounds[0], bounds[1] + 1);
          if (rowLimit !== null) data = data.slice(0, rowLimit);
          return Promise.resolve({ data, error: typeof tableErrors[table] === 'function' ? tableErrors[table](bounds) : tableErrors[table] || null }).then(resolve, reject);
        },
      }; return query;
    },
  };
  const participant = { ...service, rpc: async (name, args) => {
    calls.push({ name, args, service: false });
    if (throwRpc) throw new Error('Network connection closed');
    return { data: name === 'pnm_contribution_operation' ? receipt : name === 'pnm_venue_contribution_access' ? accessOverride || { venue_id: 10, is_claimed: false, claim: user ? receipt.claim : null, permissions: { can_edit_games: false, can_post_updates: canPostUpdates } } : receipt, error };
  } };
  const modules = {
    '../supabaseServerClient': { createClient: (_url, key) => key ? participant : service },
    '../serverAuth': { getServerUserWithFallback: async () => ({ user: user && !sessionStatus ? { id: user } : null, error: sessionStatus ? 'Session unavailable' : null, status: sessionStatus }) },
    '../mfaGate': { requireMfaEnrolled: async () => ({ ok: mfa, status: 403, reason: 'MFA challenge required' }) },
  };
  function compile(path, dependencies) {
    const module = { exports: {} };
    const code = ts.transpileModule(fs.readFileSync(new URL(path, ROOT), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    new Function('require', 'module', 'exports', code)(name => { if (dependencies[name]) return dependencies[name]; throw new Error(`Unexpected dependency ${name}`); }, module, module.exports);
    return module.exports;
  }
  const previous = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'isolated-participant-fixture';
  const helper = compile('src/lib/poker-near-me/venueContributionsServer.js', modules);
  const integrity = compile('src/lib/poker-near-me/venueIntegrity.js', {});
  const integrityServer = compile('src/lib/poker-near-me/venueIntegrityServer.js', { './venueIntegrity.js': integrity, '../../../public/data/us-states-simplified.json': { default: JSON.parse(fs.readFileSync(new URL('public/data/us-states-simplified.json', ROOT), 'utf8')) } });
  const routes = {};
  for (const path of ['poker/venue-contributions', 'admin/venue-contributions', 'poker/venue-schedules', 'poker/notifications', 'poker/claim-page', 'public/venue/claim', 'public/venue/verify', 'public/venue/[id]/manage']) {
    const depth = path.startsWith('public/venue/[id]') ? '../../../../../' : path.startsWith('public/') ? '../../../../' : '../../../';
    const prefix = `${depth}src/lib/`;
    routes[path] = compile(`pages/api/${path}.js`, {
      [`${prefix}poker-near-me/venueContributionsServer`]: helper,
      [`${prefix}poker-near-me/venueIntegrityServer`]: integrityServer,
      [`${prefix}apiRateLimit`]: { applyRateLimit: () => true, LIMITS: {} },
      [`${prefix}apiErrorHandler`]: { reportApiError() {} },
      [`${prefix}serverAuth`]: modules['../serverAuth'],
      [`${prefix}supabaseServerClient`]: modules['../supabaseServerClient'],
      [`${prefix}cors`]: { applyCors: () => true, corsHeaders: () => ({}) },
    }).default;
  }
  return { helper, routes, calls, receipt, async run(path, method = 'POST', body = {}, query = {}) {
    const res = { headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; }, end() { return this; } };
    try { await routes[path]({ method, headers: user ? { authorization: 'Bearer isolated-test-session-not-a-real-token' } : {}, query, body }, res); }
    finally { if (previous === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previous; }
    return res;
  } };
}
const claimBody = { kind: 'claim', operation_id: OPERATION, venue_id: 10, payload: { role: 'Manager', contact_name: 'Venue Manager', contact_email: 'manager@example.com', source_url: source } };

test('venue notifications respect authoritative explicit denial instead of historical claim fallback', async () => {
  const body = { page_type: 'venue', page_id: '10', title: 'Venue update', message: 'Schedule changed', notification_type: 'schedule_change' };
  const denied = fixture({ role: 'player' });
  assert.equal((await denied.run('poker/notifications', 'POST', body)).statusCode, 403);
  assert.equal(denied.calls.some(call => call.table === 'page_claims' || call.table === 'venue_claims' || call.table === 'venue_managers' || call.insert), false);
  assert.equal(denied.calls.find(call => call.name)?.service, false);
  const permitted = fixture({ role: 'player', canPostUpdates: true });
  assert.equal((await permitted.run('poker/notifications', 'POST', body)).statusCode, 201);
  assert.ok(permitted.calls.some(call => call.table === 'page_notifications' && call.insert));
});
test('non-venue notification claims retain their existing authorization without venue RPCs', async () => {
  const f = fixture({ role: 'player' });
  const result = await f.run('poker/notifications', 'POST', { page_type: 'tour', page_id: 'tour-10', title: 'Tour update', message: 'Schedule changed', notification_type: 'schedule_change' });
  assert.equal(result.statusCode, 201); assert.ok(f.calls.some(call => call.table === 'page_claims')); assert.equal(f.calls.some(call => call.name), false);
});

test('claim submit uses the verified participant JWT and lowercase role, never body actor identity', async () => {
  const f = fixture();
  const result = await f.run('poker/venue-contributions', 'POST', { ...claimBody, user_id: 'stranger' });
  assert.equal(result.statusCode, 201);
  assert.equal(result.headers['Cache-Control'], 'private, no-store');
  assert.equal(f.calls[0].service, false);
  assert.equal(f.calls[0].args.p_payload.role, 'manager');
  assert.equal(f.calls[0].args.p_actor_id, undefined);
});
test('unauthenticated claims and unavailable session checks fail closed before RPC', async () => {
  for (const options of [{ user: null }, { sessionStatus: 503 }]) {
    const f = fixture(options); const result = await f.run('poker/venue-contributions', 'POST', claimBody);
    assert.equal(result.statusCode, options.sessionStatus || 401); assert.equal(f.calls.length, 0);
  }
});
test('claim validation rejects malformed IDs, missing evidence and oversized contact fields', async () => {
  for (const body of [{ ...claimBody, venue_id: '10suffix' }, { ...claimBody, operation_id: 'invalid' }, { ...claimBody, payload: { ...claimBody.payload, source_url: 'javascript:alert(1)' } }, { ...claimBody, payload: { ...claimBody.payload, contact_name: 'x'.repeat(121) } }]) {
    const f = fixture(); assert.equal((await f.run('poker/venue-contributions', 'POST', body)).statusCode, 400); assert.equal(f.calls.length, 0);
  }
});
test('own operation recovery returns the durable receipt without repeating a write', async () => {
  const f = fixture(); const result = await f.run('poker/venue-contributions', 'GET', {}, { operation_id: OPERATION });
  assert.deepEqual(result.body.operation, f.receipt); assert.equal(f.calls[0].name, 'pnm_contribution_operation');
});
test('network uncertainty retains the exact operation ID instead of claiming failure or success', async () => {
  const f = fixture({ throwRpc: true }); const result = await f.run('poker/venue-contributions', 'POST', claimBody);
  assert.equal(result.statusCode, 503); assert.equal(result.body.outcome, 'unknown'); assert.equal(result.body.operation_id, OPERATION);
});
test('authoritative permission, missing target and CAS errors preserve distinct API outcomes', async () => {
  for (const [code, message, status] of [['42501', 'Permission denied', 403], ['P0002', 'Target not found', 404], ['P0001', 'PNM_CONFLICT', 409]]) {
    const f = fixture({ error: { code, message } }); assert.equal((await f.run('poker/venue-contributions', 'POST', claimBody)).statusCode, status);
  }
});
test('PostgREST business conflict is a definite 409 even without a PNM message prefix', async () => {
  const f = fixture({ error: { code: 'PT409', message: 'schedule revision changed' } });
  const result = await f.run('poker/venue-schedules', 'POST', { operation_id: OPERATION, venue_id: 10, id: 1, expected_updated_at: REVISION, source_url: source, day_of_week: 'monday', game_name: 'NLH' });
  assert.equal(result.statusCode, 409);
  assert.equal(result.body.error, 'schedule revision changed');
  assert.equal(result.body.outcome, undefined);
});
test('staff reviews require platform role and actual MFA gate before service RPC', async () => {
  for (const options of [{ role: 'player' }, { mfa: false }]) {
    const f = fixture(options); const result = await f.run('admin/venue-contributions', 'POST', { kind: 'claim', id: CLAIM, operation_id: OPERATION, payload: { action: 'approve', expected_updated_at: REVISION, source_url: source, reason: 'Independent venue source checked' } });
    assert.equal(result.statusCode, 403); assert.equal(f.calls.some(call => call.name), false);
  }
  const f = fixture(); const result = await f.run('admin/venue-contributions', 'POST', { kind: 'claim', id: CLAIM, operation_id: OPERATION, actor_id: 'stranger', payload: { action: 'approve', expected_updated_at: REVISION, source_url: source, reason: 'Independent venue source checked' } });
  assert.equal(result.statusCode, 200); assert.equal(f.calls.at(-1).args.p_actor_id, OWNER); assert.equal(f.calls.at(-1).service, true);
});
test('staff queue never exposes stored verification codes', async () => {
  const f = fixture(); const result = await f.run('admin/venue-contributions', 'GET');
  assert.equal(result.statusCode, 200); assert.equal(JSON.stringify(result.body).includes('Never Publish'), false);
});
test('schedule mutation uses atomic participant RPC, revision and evidence; overnight times remain valid', async () => {
  const f = fixture(); const result = await f.run('poker/venue-schedules', 'POST', { operation_id: OPERATION, venue_id: 10, id: 1, expected_updated_at: REVISION, source_url: source, day_of_week: 'friday', game_name: 'NLH 1/2', start_time: '22:00', end_time: '04:00' });
  assert.equal(result.statusCode, 200); assert.equal(f.calls[0].name, 'pnm_mutate_venue_schedule'); assert.equal(f.calls[0].service, false); assert.equal(f.calls[0].args.p_payload.action, 'update');
});

test('explicit post-write schedule refresh never returns shared stale cache policy', async () => {
  const fresh = fixture(); const result = await fresh.run('poker/venue-schedules', 'GET', {}, { venue_id: '10', refresh: '1' });
  assert.equal(result.statusCode, 200); assert.equal(result.headers['Cache-Control'], 'private, no-store');
  const ordinary = fixture(); const cached = await ordinary.run('poker/venue-schedules', 'GET', {}, { venue_id: '10' });
  assert.equal(cached.statusCode, 200); assert.equal(cached.headers['Cache-Control'], 'public, s-maxage=60, stale-while-revalidate=300');
});
test('invalid schedule time and stale-target delete never report a false successful update', async () => {
  const f = fixture(); assert.equal((await f.run('poker/venue-schedules', 'POST', { operation_id: OPERATION, venue_id: 10, source_url: source, day_of_week: 'friday', game_name: 'NLH', start_time: '25:00' })).statusCode, 400); assert.equal(f.calls.length, 0);
  const missing = fixture({ error: { code: 'P0002', message: 'Schedule not found' } }); assert.equal((await missing.run('poker/venue-schedules', 'DELETE', { operation_id: OPERATION, venue_id: 10, id: 99, expected_updated_at: REVISION, source_url: source })).statusCode, 404);
});
test('legacy venue claim routes use the same authoritative pending pipeline and personalized no-store access', async () => {
  const f = fixture(); const result = await f.run('poker/claim-page', 'POST', { ...claimBody.payload, operation_id: OPERATION, page_type: 'venue', page_id: 10 });
  assert.equal(result.statusCode, 201); assert.equal(f.calls[0].name, 'pnm_submit_venue_claim');
  const own = fixture(); const status = await own.run('poker/claim-page', 'GET', {}, { page_type: 'venue', page_id: 10 }); assert.equal(status.body.claim.is_yours, true); assert.equal(status.headers['Vary'], 'Authorization, Cookie');
});
test('legacy verification cannot self-approve or modify attempts and reveals only the caller claim', async () => {
  const f = fixture(); const result = await f.run('public/venue/verify', 'POST', { claim_id: CLAIM, verification_code: '1234' });
  assert.equal(result.statusCode, 200); assert.equal(result.body.status, 'pending'); assert.equal(f.calls.some(call => call.name), false); assert.equal(result.body.verification_method, 'evidence_review');
});
test('manager info PATCH is one permission-scoped atomic operation with no partial column retries', async () => {
  const f = fixture(); const result = await f.run('public/venue/[id]/manage', 'PATCH', { operation_id: OPERATION, expected_revision: REVISION, source_url: source, changes: { description: 'Published venue description' } }, { id: 10 });
  assert.equal(result.statusCode, 200); assert.equal(f.calls[0].name, 'pnm_mutate_venue_info'); assert.deepEqual(f.calls[0].args.p_payload.changes, { about: 'Published venue description' });
  const invalid = fixture(); assert.equal((await invalid.run('public/venue/[id]/manage', 'PATCH', { operation_id: OPERATION, expected_revision: REVISION, source_url: source, changes: { has_parking: true } }, { id: 10 })).statusCode, 400); assert.equal(invalid.calls.length, 0);
});
test('management GET trusts authoritative administrator permissions without requiring a personal venue claim', async () => {
  const allowed = fixture({ managerRow: null, accessOverride: { claim: null, legacy_claim: null, permissions: { can_edit_info: true } } });
  const result = await allowed.run('public/venue/[id]/manage', 'GET', {}, { id: '10' });
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.venue.id, 10);
  assert.equal(result.body.manager.permissions.can_edit_info, true);
  assert.equal(result.headers['Cache-Control'], 'private, no-store');
  const denied = fixture({ managerRow: null, accessOverride: { permissions: { can_edit_info: false } } });
  assert.equal((await denied.run('public/venue/[id]/manage', 'GET', {}, { id: '10' })).statusCode, 403);
  assert.equal(denied.calls.some(call => call.table === 'poker_venues'), false);
});
test('management GET distinguishes unavailable database reads from a missing venue', async () => {
  const f = fixture({ managerRow: { role: 'manager' }, accessOverride: { permissions: { can_edit_info: true } }, tableErrors: { poker_venues: { message: 'Read unavailable' } } });
  const result = await f.run('public/venue/[id]/manage', 'GET', {}, { id: '10' });
  assert.equal(result.statusCode, 503);
  assert.equal(result.body.venue, undefined);
  const missing = fixture({ managerRow: { role: 'manager' }, accessOverride: { permissions: { can_edit_info: true } }, venueRow: null });
  assert.equal((await missing.run('public/venue/[id]/manage', 'GET', {}, { id: '10' })).statusCode, 404);
  const managerError = fixture({ accessOverride: { permissions: { can_edit_info: true } }, tableErrors: { venue_managers: { message: 'Manager read unavailable' } } });
  assert.equal((await managerError.run('public/venue/[id]/manage', 'GET', {}, { id: '10' })).statusCode, 503);
});
test('schedule GET collects every active entry beyond the former 200-row truncation with deterministic paging', async () => {
  const rows = Array.from({ length: 450 }, (_, index) => ({ id: index + 1, day_of_week: 'monday', game_name: `Game ${index + 1}`, start_time: '19:00' }));
  const f = fixture({ tableRows: { venue_game_schedules: rows } });
  const result = await f.run('poker/venue-schedules', 'GET', {}, { venue_id: '10' });
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.total_entries, 450);
  assert.deepEqual(result.body.schedule.monday.map(row => row.id), rows.map(row => row.id));
  assert.deepEqual(f.calls.filter(call => call.table === 'venue_game_schedules' && call.range).map(call => call.range), [[0, 199], [200, 399], [400, 599]]);
  assert.equal(f.calls.filter(call => call.table === 'venue_game_schedules' && call.order === 'id').length, 3);
});
test('schedule GET refuses an incomplete bounded inventory rather than announcing a partial successful total', async () => {
  const rows = Array.from({ length: 5001 }, (_, index) => ({ id: index + 1, day_of_week: 'monday', game_name: `Game ${index + 1}` }));
  const f = fixture({ tableRows: { venue_game_schedules: rows } });
  const result = await f.run('poker/venue-schedules', 'GET', {}, { venue_id: '10' });
  assert.equal(result.statusCode, 503);
  assert.equal(result.body.schedule, undefined);
  assert.equal(result.headers['Cache-Control'], 'private, no-store');
  assert.equal(f.calls.filter(call => call.range).length, 25);
});
test('schedule GET withholds partial rows after a later-page failure or a concurrent duplicate', async () => {
  const rows = Array.from({ length: 201 }, (_, index) => ({ id: index + 1, day_of_week: 'monday', game_name: `Game ${index + 1}` }));
  const unavailable = fixture({ tableRows: { venue_game_schedules: rows }, tableErrors: { venue_game_schedules: bounds => bounds?.[0] === 200 ? { message: 'Next page unavailable' } : null } });
  const duplicate = fixture({ tableRows: { venue_game_schedules: [...rows.slice(0, 200), rows[0]] } });
  for (const f of [unavailable, duplicate]) {
    const result = await f.run('poker/venue-schedules', 'GET', {}, { venue_id: '10' });
    assert.equal(result.statusCode, 503);
    assert.equal(result.body.schedule, undefined);
    assert.equal(result.headers['Cache-Control'], 'private, no-store');
  }
});
test('malformed JSON is a definite 400 refusal before any contribution mutation', async () => {
  const f = fixture(); const result = await f.run('poker/venue-contributions', 'POST', '{broken');
  assert.equal(result.statusCode, 400); assert.equal(result.body.outcome, undefined); assert.equal(f.calls.length, 0);
});
test('anonymous compatibility access exposes only the public claimed flag, never claims or manager grants', async () => {
  const f = fixture({ user: null }); const result = await f.run('public/venue/claim', 'GET', {}, { venue_id: 10 });
  assert.equal(result.statusCode, 200); assert.equal(result.body.user_claim, null); assert.equal(result.body.is_manager, false);
  assert.equal(f.calls.some(call => call.name), false); assert.equal(f.calls.find(call => call.fields)?.fields, 'id,is_claimed,claimed_at');
});
test('staff location corrections use the actual state polygon assessment and stored proposal, not client-supplied status', async () => {
  const payload = { action: 'apply', expected_updated_at: REVISION, source_url: source, reason: 'Independent physical source confirms location', resolved_location: { state: 'TX', latitude: 0, longitude: 0, integrity_status: 'verified' } };
  const valid = fixture({ correctionCategory: 'location', proposal: { latitude: 30.2672, longitude: -97.7431 } });
  assert.equal((await valid.run('admin/venue-contributions', 'POST', { kind: 'correction', id: CLAIM, operation_id: OPERATION, payload })).statusCode, 200);
  const resolved = valid.calls.find(call => call.name === 'pnm_review_venue_correction').args.p_payload.resolved_location;
  assert.equal(resolved.latitude, 30.2672); assert.equal(resolved.integrity_status, 'verified'); assert.equal(resolved.integrity_reason, 'state_coordinate_match');
  const conflict = fixture({ correctionCategory: 'location', proposal: { latitude: 40.7128, longitude: -74.006 } });
  assert.equal((await conflict.run('admin/venue-contributions', 'POST', { kind: 'correction', id: CLAIM, operation_id: OPERATION, payload })).statusCode, 422);
  assert.equal(conflict.calls.some(call => call.name === 'pnm_review_venue_correction'), false);
});
test('staff venue-scoped queue applies the actual venue predicate to both families', async () => {
  const f = fixture(); assert.equal((await f.run('admin/venue-contributions', 'GET', {}, { venue_id: 10 })).statusCode, 200);
  for (const table of ['venue_claims', 'pnm_venue_corrections']) assert.ok(f.calls.some(call => call.table === table && call.filter === 'venue_id' && call.value === 10));
});
test('identical review replay returns the original durable receipt without re-reading changed or deleted targets', async () => {
  const payload = { action: 'apply', expected_updated_at: REVISION, source_url: source, reason: 'Independent physical source confirms location' };
  const original = { operation_id: OPERATION, kind: 'correction_review', venue_id: 10, status: 'applied', correction: { id: CLAIM, status: 'applied' } };
  const operation = { actor_id: OWNER, kind: 'correction_review', payload: { ...payload, correction_id: CLAIM, resolved_location: { city: 'Original City', latitude: 30.2672, longitude: -97.7431, integrity_status: 'verified' } }, result: original };
  const f = fixture({ operation, missingClaim: true, correctionCategory: 'location', proposal: { latitude: 40.7128, longitude: -74.006 } });
  const result = await f.run('admin/venue-contributions', 'POST', { kind: 'correction', id: CLAIM, operation_id: OPERATION, payload });
  assert.equal(result.statusCode, 200); assert.deepEqual(result.body, { success: true, ...original });
  assert.equal(f.calls.some(call => ['pnm_venue_corrections', 'poker_venues'].includes(call.table)), false);
  assert.equal(f.calls.some(call => call.name), false);
  assert.ok(f.calls.some(call => call.table === 'pnm_contribution_operations' && call.filter === 'actor_id' && call.value === OWNER));
});
test('changed decision or target under the original review operation ID conflicts before any mutation', async () => {
  const payload = { action: 'apply', expected_updated_at: REVISION, source_url: source, reason: 'Independent physical source confirms location' };
  const operation = { actor_id: OWNER, kind: 'correction_review', payload: { ...payload, correction_id: CLAIM }, result: { operation_id: OPERATION } };
  for (const body of [{ kind: 'correction', id: CLAIM, operation_id: OPERATION, payload: { ...payload, action: 'reject' } }, { kind: 'correction', id: OPERATION, operation_id: OPERATION, payload }, { kind: 'claim', id: CLAIM, operation_id: OPERATION, payload: { ...payload, action: 'approve' } }]) {
    const f = fixture({ operation }); const result = await f.run('admin/venue-contributions', 'POST', body);
    assert.equal(result.statusCode, 409); assert.equal(f.calls.some(call => call.name), false);
  }
});
test('SQL-aligned minimum claimant name and maximum schedule name are rejected before mutation', async () => {
  const f = fixture(); assert.equal((await f.run('poker/venue-contributions', 'POST', { ...claimBody, payload: { ...claimBody.payload, contact_name: 'X' } })).statusCode, 400); assert.equal(f.calls.length, 0);
  const schedule = fixture(); assert.equal((await schedule.run('poker/venue-schedules', 'POST', { operation_id: OPERATION, venue_id: 10, source_url: source, day_of_week: 'monday', game_name: 'X'.repeat(121) })).statusCode, 400); assert.equal(schedule.calls.length, 0);
});
