/**
 * STABLE WRITE API - the horses themselves, and the engine settings.
 *
 * POST /api/horses/stable-admin
 *   { action: 'create_horse',  horse: {...} }
 *   { action: 'update_horse',  id, horse: {...} }
 *   { action: 'delete_horse',  id }
 *   { action: 'set_active',    id, is_active }
 *   { action: 'bulk_active',   ids: [...], is_active }
 *   { action: 'bulk_delete',   ids: [...] }
 *   { action: 'save_settings', settings: {...} }
 *   { action: 'set_ticket_status', id, status }
 *   { action: 'audit_log', ...filters }   (read)
 *
 * PHASE 1 NOTE (2026-09-02). Rebuilt onto src/lib/horses/operatorRoute.js. The
 * wrapper owns the method allowlist, the rate limit, operator auth
 * (service-role only, no anon fallback) and the envelope. The route asks for
 * content.write; the two actions that are not content operations ask for their
 * own permission inside the handler (audit_log -> audit.read,
 * set_ticket_status -> support.write) so Phase 2 can narrow them without
 * touching this file. Every id is validated as a uuid before it reaches
 * Postgres, MAX_BULK is 500 per contract item 6, and every mutation writes one
 * audit row through auditOperatorAction with a real before/after snapshot.
 *
 * WHY THIS ROUTE EXISTS (added 2026-08-26, second audit pass).
 *
 * Every write the Social Horses tab and the Settings tab made was a SILENT
 * NO-OP, and had been for as long as the RLS policies have existed. Verified
 * against production:
 *
 *   content_authors  ALL  ->  USING/WITH CHECK (EXISTS (SELECT 1 FROM profiles
 *                             WHERE profiles.id = auth.uid()
 *                               AND profiles.is_admin = true))
 *
 *   select count(*) from profiles where is_admin is true;  ->  0
 *
 * `profiles.is_admin` is true for ZERO rows. The three real admin accounts
 * (daniel@smarter.poker, daniel@bekavactrading.com, danimal5022@yahoo.com) are
 * identified by `profiles.role`, not by that column. So creating a horse,
 * renaming one, retiring one, or flipping the active toggle matched no rows.
 *
 * `content_settings` is worse, because its write policy is service_role only:
 *
 *   Allow service role write on content_settings   ALL   {service_role}
 *
 * so every posts-per-day, delay, model, temperature, engine-enabled,
 * auto-publish and grinder-* change the operator has ever made went nowhere.
 *
 * A PostgREST UPDATE or DELETE that matches zero rows returns `{ error: null }`.
 * That is why none of this surfaced: the browser saw success, and said so.
 *
 * The fix is deliberately NOT a policy change. Widening `content_authors` to
 * `role IN (admin, superadmin, god)` would let the browser write directly, but
 * it would also mean 593 rows of content identity are writable by anything
 * holding an admin JWT, with no server-side validation and no audit trail.
 * Routing the writes through the service role behind an admin gate keeps the
 * table closed, validates the payload, and records who did what.
 *
 * Every mutation here writes `admin_audit_log`.
 */
import { withOperatorRoute } from '../../../src/lib/horses/operatorRoute.js';
import { PERMISSIONS, hasPermission } from '../../../src/lib/horses/permissions.js';
import { badRequest, forbidden, notFound, ApiError } from '../../../src/lib/horses/apiEnvelope.js';
import { auditOperatorAction } from '../../../src/lib/horses/operatorAudit.js';
import { mapDbError } from '../../../src/lib/horses/dbErrors.js';
import { chunk, readByIds, IN_CHUNK } from '../../../src/lib/horses/listShape.js';
import { uuid, uuidList, int, enumOf, isoDate, text, pick } from '../../../src/lib/horses/validate.js';

/** Columns a caller may set. Anything else in the payload is dropped, so a
 *  future column cannot be written from the browser just by naming it. */
const HORSE_FIELDS = [
  'name',
  'alias',
  'gender',
  'location',
  'specialty',
  'stakes',
  'bio',
  'voice',
  'avatar_url',
  'avatar_seed',
  'timezone',
  'is_active',
];

/** Settings keys the panel owns. `id` is handled separately. */
const SETTINGS_FIELDS = [
  'posts_per_day',
  'min_delay_minutes',
  'max_delay_minutes',
  'ai_model',
  'temperature',
  'engine_enabled',
  'auto_publish',
  'peak_hours',
  'grinder_max_tables',
  'grinder_daily_hours',
  'grinder_starting_chips',
  'grinder_ai_model',
];

const SETTING_RANGES = {
  posts_per_day: [1, 100],
  min_delay_minutes: [5, 180],
  max_delay_minutes: [15, 300],
  temperature: [0, 1],
  grinder_max_tables: [1, 4],
  grinder_daily_hours: [1, 24],
  grinder_starting_chips: [1000, 100000],
};

/**
 * Contract item 6. The old ceiling was 600 with the comment "the stable is 593
 * horses"; the fleet crossed 1,000 on 2026-09-02 and "Select All" then failed
 * outright. 500 is the number the client chunks against, so a selection of any
 * size ships as a sequence of accepted calls instead of one rejected one.
 */
const MAX_BULK = 500;

/**
 * ...but a PostgREST `.in()` list travels in the URL, and 500 uuids is about
 * 19 KB of query string, which is where a proxy starts answering 414 and the
 * operator sees a scrubbed 500 for a button that says "Select All". The route
 * accepts 500 ids per CALL and sends them to Postgres 200 at a time, summing
 * `affected` across the chunks. The client's BULK_CHUNK of 500 therefore
 * always fits, and the request that reaches the database always does too.
 */
const BULK_IN_CHUNK = IN_CHUNK;

/** live_help_tickets.status values the Bug Reports tab can set. */
const VALID_TICKET_STATUS = ['open', 'resolved'];

const ACTIONS = [
  'create_horse',
  'update_horse',
  'set_active',
  'bulk_active',
  'delete_horse',
  'bulk_delete',
  'set_ticket_status',
  'save_settings',
  'audit_log',
];

/** Audit Log reader. A page has to fit in one response; 500 is the ceiling. */
const AUDIT_PAGE_DEFAULT = 100;
const AUDIT_PAGE_MAX = 500;
const AUDIT_FIELDS =
  'id, admin_user_id, action, target_type, target_id, details, before_state, after_state, ' +
  'ip_address, actor_role, request_id, created_at';

/**
 * The actor list used to rescan up to 5,000 audit rows on EVERY page load of
 * the Audit tab, including the paging clicks. It changes when a new operator
 * acts for the first time, which is not a per-request event, so it is cached
 * for 60 seconds at module scope and the scan only runs when the cache is
 * stale.
 */
const ACTOR_CACHE_TTL_MS = 60_000;
const ACTOR_SCAN_ROWS = 5000;
let _actorCache = { at: 0, actors: [] };

/** Test seam: lets a unit test force a cold or warm cache. */
export function _resetActorCacheForTests(cache = { at: 0, actors: [] }) {
  _actorCache = cache;
}

function validateHorse(horse, { partial = false } = {}) {
  const errors = [];
  const required = ['name', 'location', 'stakes', 'bio'];
  if (!partial) {
    for (const key of required) {
      if (!String(horse[key] || '').trim()) errors.push(`${key} is required`);
    }
  }
  if (horse.name !== undefined && String(horse.name).length > 120) errors.push('name is too long');
  if (horse.bio !== undefined && String(horse.bio).length > 2000) errors.push('bio is too long');
  if (horse.gender !== undefined && !['male', 'female'].includes(horse.gender)) {
    errors.push('gender must be male or female');
  }
  if (horse.is_active !== undefined && typeof horse.is_active !== 'boolean') {
    errors.push('is_active must be a boolean');
  }
  return errors;
}

function validateSettings(settings) {
  const errors = [];
  for (const [key, [min, max]] of Object.entries(SETTING_RANGES)) {
    if (settings[key] === undefined) continue;
    const n = Number(settings[key]);
    // NaN used to be written straight to the row whenever a number input was
    // cleared. It cannot reach the table any more.
    if (!Number.isFinite(n)) {
      errors.push(`${key} must be a number`);
      continue;
    }
    if (n < min || n > max) errors.push(`${key} must be between ${min} and ${max}`);
  }
  if (settings.min_delay_minutes !== undefined && settings.max_delay_minutes !== undefined) {
    if (Number(settings.min_delay_minutes) > Number(settings.max_delay_minutes)) {
      errors.push('min_delay_minutes cannot exceed max_delay_minutes');
    }
  }
  if (settings.engine_enabled !== undefined && typeof settings.engine_enabled !== 'boolean') {
    errors.push('engine_enabled must be a boolean');
  }
  if (settings.auto_publish !== undefined && typeof settings.auto_publish !== 'boolean') {
    errors.push('auto_publish must be a boolean');
  }
  if (settings.peak_hours !== undefined && !Array.isArray(settings.peak_hours)) {
    errors.push('peak_hours must be an array');
  }
  return errors;
}

/** A horse id the operator sent. Malformed ids become a 400, never a 22P02. */
function horseId(value) {
  const id = uuid(value);
  if (!id) throw badRequest('A Valid Horse Id Is Required');
  return id;
}

function horseIdList(value) {
  if (!Array.isArray(value) || value.length === 0) throw badRequest('Ids Must Be A Non-Empty List');
  if (value.length > MAX_BULK) throw badRequest(`At Most ${MAX_BULK} Horses At A Time`);
  const ids = uuidList(value, { max: MAX_BULK });
  if (!ids) throw badRequest('Every Id Must Be A Valid Horse Id');
  return ids;
}

/**
 * Run one write per chunk of at most BULK_IN_CHUNK ids and merge the returned
 * rows. Stops at the first failing chunk and hands the error back rather than
 * throwing, so the caller can audit what DID happen before it refuses: a bulk
 * delete that got through two chunks and failed on the third must not be the
 * one operation with no record of itself.
 */
async function writeInChunks(ids, run) {
  const rows = [];
  let error = null;
  let chunks = 0;
  for (const part of chunk(ids, BULK_IN_CHUNK)) {
    chunks += 1;
    const res = await run(part);
    if (res?.error) {
      error = res.error;
      break;
    }
    rows.push(...(res?.data || []));
  }
  return { rows, error, chunks };
}

// -- ACTIONS -----------------------------------------------------------------

async function createHorse(db, op, req, body) {
  const horse = pick(body.horse, HORSE_FIELDS);
  const errors = validateHorse(horse);
  if (errors.length) throw badRequest(errors.join('; '));

  if (!horse.alias) {
    const base = String(horse.name).replace(/[^a-zA-Z0-9]/g, '') || 'Horse';
    horse.alias = `${base}${Math.floor(Math.random() * 10000)}`;
  }
  if (!horse.avatar_seed) horse.avatar_seed = String(horse.alias).toLowerCase();
  if (!horse.timezone) horse.timezone = 'America/New_York';
  if (horse.is_active === undefined) horse.is_active = true;

  const { data, error } = await db.from('content_authors').insert([horse]).select().maybeSingle();
  // `alias` is unique and this route generates it from Math.random() when the
  // caller does not supply one, so a collision is an ordinary event, not a
  // server fault. Addendum item 17: it comes back as a 409 the operator can
  // act on instead of a 500 that says "Request failed" and pages Sentry.
  if (error) throw mapDbError(error, 'A Horse With That Name Or Alias', { route: 'horses.stable-admin' });
  if (!data) throw new ApiError(500, 'The Horse Was Not Created', 'not_created');

  await auditOperatorAction(op, req, {
    action: 'horse.create',
    targetType: 'content_author',
    targetId: data.id,
    before: null,
    after: pick(data, ['id', ...HORSE_FIELDS]),
    details: { name: data.name, alias: data.alias },
  });
  return { horse: data };
}

async function updateHorse(db, op, req, body) {
  const id = horseId(body.id);
  const horse = pick(body.horse, HORSE_FIELDS);
  if (Object.keys(horse).length === 0) throw badRequest('No Fields To Update');
  const errors = validateHorse(horse, { partial: true });
  if (errors.length) throw badRequest(errors.join('; '));

  const { data: before } = await db
    .from('content_authors')
    .select('id, ' + HORSE_FIELDS.join(', '))
    .eq('id', id)
    .maybeSingle();

  const { data, error } = await db
    .from('content_authors')
    .update(horse)
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) throw mapDbError(error, 'A Horse With That Name Or Alias', { route: 'horses.stable-admin' });
  // The whole point of this route: a zero-row write is reported, not hidden.
  if (!data) throw notFound('That Horse No Longer Exists');

  await auditOperatorAction(op, req, {
    action: 'horse.update',
    targetType: 'content_author',
    targetId: id,
    before: before ? pick(before, Object.keys(horse)) : null,
    after: pick(data, Object.keys(horse)),
    details: { fields: Object.keys(horse) },
  });
  return { horse: data };
}

async function setActive(db, op, req, body) {
  const id = horseId(body.id);
  if (typeof body.is_active !== 'boolean') throw badRequest('is_active Must Be A Boolean');
  const isActive = body.is_active;

  const { data: before } = await db
    .from('content_authors')
    .select('id, name, is_active')
    .eq('id', id)
    .maybeSingle();

  const { data, error } = await db
    .from('content_authors')
    .update({ is_active: isActive })
    .eq('id', id)
    .select('id, is_active')
    .maybeSingle();
  if (error) throw mapDbError(error, 'That Horse', { route: 'horses.stable-admin' });
  if (!data) throw notFound('That Horse No Longer Exists');

  await auditOperatorAction(op, req, {
    action: 'horse.set_active',
    targetType: 'content_author',
    targetId: id,
    before: before ? { is_active: before.is_active ?? null } : null,
    after: { is_active: data.is_active },
    details: { name: before?.name || null, is_active: isActive },
  });
  return { horse: data };
}

async function bulkActive(db, op, req, body) {
  const ids = horseIdList(body.ids);
  if (typeof body.is_active !== 'boolean') throw badRequest('is_active Must Be A Boolean');
  const isActive = body.is_active;

  const beforeRead = await readByIds(db, ids, (part) =>
    db.from('content_authors').select('id, is_active').in('id', part)
  );

  const { rows, error, chunks } = await writeInChunks(ids, (part) =>
    db.from('content_authors').update({ is_active: isActive }).in('id', part).select('id')
  );
  const affected = rows.length;

  await auditOperatorAction(op, req, {
    action: 'horse.bulk_active',
    targetType: 'content_author',
    targetId: null,
    before: { rows: beforeRead.rows },
    after: { is_active: isActive, ids: rows.map((r) => r.id) },
    details: {
      requested: ids.length,
      affected,
      is_active: isActive,
      chunks,
      chunkSize: BULK_IN_CHUNK,
      partial: Boolean(error),
    },
  });
  if (error) throw mapDbError(error, 'Those Horses', { route: 'horses.stable-admin' });
  // affected is returned so the browser can tell the operator the truth
  // when some ids no longer exist.
  return { affected, requested: ids.length, chunks };
}

async function deleteHorse(db, op, req, body) {
  const id = horseId(body.id);

  const { data: existing } = await db.from('content_authors').select('*').eq('id', id).maybeSingle();

  const { data, error } = await db
    .from('content_authors')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) throw mapDbError(error, 'That Horse', { route: 'horses.stable-admin' });
  if (!data) throw notFound('That Horse No Longer Exists');

  // Deletion is irreversible and there is no soft-delete column, so the
  // audit row carries the whole record.
  await auditOperatorAction(op, req, {
    action: 'horse.delete',
    targetType: 'content_author',
    targetId: id,
    before: existing || null,
    after: null,
    details: { deleted: existing ? { name: existing.name, alias: existing.alias } : null },
  });
  return { id };
}

async function bulkDelete(db, op, req, body) {
  const ids = horseIdList(body.ids);

  // IDENTITY, NOT THE WHOLE ROW. This used to `select('*')` for up to 500 rows
  // and put every one of them into a single admin_audit_log.before_state - each
  // `bio` is up to 2,000 characters, so one delete could write about a megabyte
  // of JSON into one JSONB cell. Identity plus a count is what makes the row
  // findable afterwards, which is what an audit row is for.
  const beforeRead = await readByIds(db, ids, (part) =>
    db.from('content_authors').select('id, name, alias').in('id', part)
  );

  const { rows, error, chunks } = await writeInChunks(ids, (part) =>
    db.from('content_authors').delete().in('id', part).select('id')
  );
  const affected = rows.length;

  await auditOperatorAction(op, req, {
    action: 'horse.bulk_delete',
    targetType: 'content_author',
    targetId: null,
    before: { rows: beforeRead.rows, count: beforeRead.rows.length },
    after: null,
    details: {
      requested: ids.length,
      affected,
      chunks,
      chunkSize: BULK_IN_CHUNK,
      partial: Boolean(error),
      deleted: rows.map((r) => r.id),
    },
  });
  // The audit row is written FIRST: chunks that succeeded before the failure
  // are already gone, and an irreversible delete recorded nowhere is worse than
  // a delete that failed loudly.
  if (error) throw mapDbError(error, 'Those Horses', { route: 'horses.stable-admin' });
  return { affected, requested: ids.length, chunks };
}

// -- SUPPORT TICKET STATUS ---------------------------------------------------
//
// The Bug Reports tab used to UPDATE live_help_tickets straight from the
// browser. Three problems, all fixed by routing it here:
//
//   1. NO AUDIT. Resolving or reopening a support ticket left no record of
//      who did it. It was the last mutation in the console still going
//      direct to PostgREST.
//   2. A ZERO-ROW UPDATE LOOKS LIKE SUCCESS. PostgREST returns
//      { error: null } when nothing matched, so before the RLS fix - when
//      two of the three admin accounts could not see a ticket at all - the
//      toast said "Ticket Marked Resolved" and nothing had changed. That is
//      exactly the failure this whole audit started from.
//   3. It depended on the caller's own RLS grant rather than on being an
//      admin, so it broke silently whenever that policy drifted.
async function setTicketStatus(db, op, req, body) {
  const id = uuid(body.id);
  if (!id) throw badRequest('A Valid Ticket Id Is Required');
  const status = enumOf(body.status, VALID_TICKET_STATUS);
  if (!status) throw badRequest(`Status Must Be One Of: ${VALID_TICKET_STATUS.join(', ')}`);

  const { data: before } = await db
    .from('live_help_tickets')
    .select('id, status, subject, user_id, resolved_at')
    .eq('id', id)
    .maybeSingle();

  const now = new Date().toISOString();
  const { data, error } = await db
    .from('live_help_tickets')
    .update({
      status,
      updated_at: now,
      resolved_at: status === 'resolved' ? now : null,
    })
    .eq('id', id)
    .select('id, status')
    .maybeSingle();
  if (error) throw mapDbError(error, 'That Ticket', { route: 'horses.stable-admin' });
  if (!data) throw notFound('That Ticket No Longer Exists');

  await auditOperatorAction(op, req, {
    action: 'ticket.set_status',
    targetType: 'live_help_ticket',
    targetId: id,
    before: before ? { status: before.status ?? null, resolved_at: before.resolved_at ?? null } : null,
    after: { status: data.status, resolved_at: status === 'resolved' ? now : null },
    details: {
      subject: before?.subject || null,
      reporter: before?.user_id || null,
      from: before?.status || null,
      to: status,
    },
  });
  return { ticket: data };
}

// -- SETTINGS ----------------------------------------------------------------
async function saveSettings(db, op, req, body) {
  const settings = pick(body.settings, SETTINGS_FIELDS);
  if (Object.keys(settings).length === 0) throw badRequest('No Settings To Save');
  const errors = validateSettings(settings);
  if (errors.length) throw badRequest(errors.join('; '));

  // Update the existing singleton rather than upserting. The old browser code
  // upserted without an id, which inserts a SECOND row when the id lookup
  // misses - and the reader takes an arbitrary one of them. The ordering here
  // is the contract the reader must match: lowest id wins, always.
  const { data: current, error: readErr } = await db
    .from('content_settings')
    .select('*')
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (readErr) throw mapDbError(readErr, 'The Engine Settings', { route: 'horses.stable-admin' });

  if (!current?.id) {
    const { data, error } = await db
      .from('content_settings')
      .insert([{ ...settings, updated_at: new Date().toISOString() }])
      .select()
      .maybeSingle();
    if (error) throw mapDbError(error, 'The Engine Settings', { route: 'horses.stable-admin' });
    await auditOperatorAction(op, req, {
      action: 'settings.save',
      targetType: 'content_settings',
      targetId: data?.id ?? null,
      before: null,
      after: pick(data || {}, SETTINGS_FIELDS),
      details: { fields: Object.keys(settings), created: true },
    });
    return { settings: data };
  }

  const { data, error } = await db
    .from('content_settings')
    .update({ ...settings, updated_at: new Date().toISOString() })
    .eq('id', current.id)
    .select()
    .maybeSingle();
  if (error) throw mapDbError(error, 'The Engine Settings', { route: 'horses.stable-admin' });
  if (!data) throw new ApiError(500, 'Settings Row Vanished Mid-Write', 'settings_missing');

  await auditOperatorAction(op, req, {
    action: 'settings.save',
    targetType: 'content_settings',
    targetId: current.id,
    before: pick(current, SETTINGS_FIELDS),
    after: pick(data, SETTINGS_FIELDS),
    details: { fields: Object.keys(settings) },
  });
  return { settings: data };
}

// -- AUDIT LOG (read) --------------------------------------------------------
//
// Until this release the console WROTE to admin_audit_log from three routes and
// READ it from nowhere. The whole table held nine rows across five months, and
// there was no surface anywhere on the platform that could show them. An audit
// trail nobody can read is a table, not a control.
//
// Service-role on purpose. admin_audit_log records who kicked a player and who
// approved a cashout, so it must not be readable through the caller's own
// grants - that is how a policy drift turns into a privacy incident. The
// audit.read permission is the only thing that opens it.
async function readActors(db) {
  const now = Date.now();
  if (_actorCache.at && now - _actorCache.at < ACTOR_CACHE_TTL_MS) {
    return { actors: _actorCache.actors, failed: false };
  }

  // PostgREST cannot express SELECT DISTINCT, so the distinct is a bounded
  // scan of the id column de-duplicated here. It runs at most once a minute.
  const { data: actorRows, error: scanErr } = await db
    .from('admin_audit_log')
    .select('admin_user_id')
    .not('admin_user_id', 'is', null)
    .range(0, ACTOR_SCAN_ROWS - 1);

  // FAILURE IS NOT CACHED. It used to be: one bad scan wrote `actors: []` into
  // a 60 second cache and the operator's "who" dropdown was silently empty for
  // a minute with nothing on screen to say why.
  if (scanErr) {
    console.error('[horses.stable-admin] audit actor scan failed:', scanErr.message);
    return { actors: _actorCache.actors || [], failed: true };
  }

  const actorIds = [...new Set((actorRows || []).map((r) => r.admin_user_id).filter(Boolean))];
  let actors = [];
  if (actorIds.length) {
    const { rows: actorProfiles, error: profileErr } = await readByIds(db, actorIds, (part) =>
      db.from('profiles').select('id, username, display_name, email, role').in('id', part)
    );
    if (profileErr) {
      console.error('[horses.stable-admin] audit actor profiles failed:', profileErr.message);
      return { actors: _actorCache.actors || [], failed: true };
    }
    actors = (actorProfiles || [])
      .map((a) => ({
        id: a.id,
        username: a.username || null,
        display_name: a.display_name || null,
        // `name` and `role` are what the current console renders in the filter
        // dropdown. Added to, never renamed.
        name: a.username || a.display_name || a.email || a.id,
        role: a.role || null,
      }))
      .sort((x, y) => String(x.name).localeCompare(String(y.name)));
  }

  _actorCache = { at: now, actors };
  return { actors, failed: false };
}

/** No filter group needs more than a handful of prefixes. */
const MAX_ACTION_PREFIXES = 12;

/**
 * Clean and de-duplicate the action prefixes a caller sent, from either
 * `actionPrefixes: string[]` or the single `actionPrefix`.
 *
 * `%` and `*` are LIKE wildcards and are stripped, so an operator-supplied
 * prefix can never become a full-table wildcard scan. `,`, `(`, `)` and quotes
 * are stripped because they would rewrite the .or() filter tree.
 *
 * `_` is deliberately KEPT. It is a single-character LIKE wildcard, so it
 * matches more than itself - but it also matches itself, and every real action
 * name in this console contains one (`content_settings`, `set_status`,
 * `bulk_delete`). Stripping it, as the first version did, turned the "Engine
 * Settings" filter into `contentsettings%`, which matches nothing at all.
 */
function cleanPrefixes(list, single) {
  const raw = [];
  if (Array.isArray(list)) raw.push(...list);
  else if (typeof list === 'string' && list) raw.push(list);
  if (single !== undefined && single !== null) raw.push(single);

  const out = [];
  const seen = new Set();
  for (const value of raw) {
    if (typeof value !== 'string') continue;
    const cleaned = text(value.replace(/[%*,()"'\s]/g, ''), { min: 1, max: 60 });
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
    if (out.length >= MAX_ACTION_PREFIXES) break;
  }
  return out;
}

async function auditLog(db, body) {
  const limit = Math.min(int(body.limit, { min: 1, fallback: AUDIT_PAGE_DEFAULT }), AUDIT_PAGE_MAX);
  // A malformed offset used to fall back to 0 and, because `body.offset !==
  // undefined`, beat `page` - so a caller asking for page 4 with a broken
  // offset was silently handed page 1 and had no way to tell. It is a 400 now,
  // exactly as adminId, from and to already are.
  const hasOffset = body.offset !== undefined && body.offset !== null && body.offset !== '';
  const offset = int(body.offset, { min: 0, fallback: null });
  if (hasOffset && offset === null) throw badRequest('Offset Must Be A Whole Number Of Rows');
  const pageNumber = int(body.page, { min: 0, fallback: null });
  // `page` (contract item 4) and `offset` both work; offset wins when both are
  // sent, so the current client keeps behaving exactly as it does today.
  const start = hasOffset ? offset : pageNumber !== null ? pageNumber * limit : 0;

  let q = db
    .from('admin_audit_log')
    .select(AUDIT_FIELDS, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(start, start + limit - 1);

  // `like` with a trailing % rather than `ilike` on both sides: action strings
  // are namespaced (cashout.*, fleet.*, hg.*), so a prefix match is what the
  // filter actually means. Note this does NOT use admin_audit_log_action_idx -
  // a btree under a non-C collation cannot serve LIKE - but the created_at
  // range is what bounds the scan, and idx_aal_created does serve that.
  //
  // The % and _ strip is deliberate: without it an operator-supplied prefix
  // could turn into a full-table wildcard scan.
  //
  // REVIEW ADDENDUM ITEM 14. Phase 1 renamed the audit vocabulary
  // (content_settings.updated -> settings.save, horse.created -> horse.create,
  // and so on) and nothing was backfilled, so history is split across two
  // vocabularies and the console's "Engine Settings" filter matched zero rows.
  // The fix is not to rewrite history: the tab's filter groups now map to an
  // ARRAY of prefixes, [new, legacy], and this accepts `actionPrefixes` as an
  // OR of `like` filters so both eras come back in one query. `actionPrefix`
  // still works on its own for any caller that sends one.
  const prefixes = cleanPrefixes(body.actionPrefixes, body.actionPrefix);
  if (prefixes.length === 1) {
    q = q.like('action', `${prefixes[0]}%`);
  } else if (prefixes.length > 1) {
    // Inside an .or() string PostgREST spells the LIKE wildcard `*`, not `%`.
    q = q.or(prefixes.map((p) => `action.like.${p}*`).join(','));
  }
  if (body.adminId !== undefined && body.adminId !== null && body.adminId !== '') {
    const adminId = uuid(body.adminId);
    if (!adminId) throw badRequest('A Valid Admin Id Is Required');
    q = q.eq('admin_user_id', adminId);
  }
  if (body.targetType) {
    const targetType = text(body.targetType, { min: 1, max: 80 });
    if (targetType) q = q.eq('target_type', targetType);
  }
  if (body.targetId !== undefined && body.targetId !== null && body.targetId !== '') {
    const targetId = text(String(body.targetId), { min: 1, max: 200 });
    if (!targetId) throw badRequest('A Valid Target Id Is Required');
    q = q.eq('target_id', targetId);
  }
  if (body.from !== undefined && body.from !== null && body.from !== '') {
    const from = isoDate(body.from);
    if (!from) throw badRequest('From Must Be A Date');
    q = q.gte('created_at', from);
  }
  if (body.to !== undefined && body.to !== null && body.to !== '') {
    const to = isoDate(body.to);
    if (!to) throw badRequest('To Must Be A Date');
    q = q.lte('created_at', to);
  }
  if (body.days !== undefined && body.days !== null && body.days !== '') {
    const days = int(body.days, { min: 1, max: 365 });
    if (days === null) throw badRequest('Days Must Be Between 1 And 365');
    q = q.gte('created_at', new Date(Date.now() - days * 86400000).toISOString());
  }

  const { data: rows, error, count } = await q;
  if (error) throw mapDbError(error, 'The Audit Log', { route: 'horses.stable-admin' });

  // Resolve the admin ids to names, 200 ids per .in(). A join through PostgREST
  // needs a declared FK that admin_audit_log does not have, and one lookup per
  // row would be N+1 across a 500-row page.
  const ids = [...new Set((rows || []).map((r) => r.admin_user_id).filter(Boolean))];
  let names = {};
  if (ids.length) {
    const { rows: profiles } = await readByIds(db, ids, (part) =>
      db.from('profiles').select('id, username, display_name, email, role').in('id', part)
    );
    names = Object.fromEntries((profiles || []).map((pr) => [pr.id, pr]));
  }

  const entries = (rows || []).map((r) => ({
    ...r,
    admin_name: names[r.admin_user_id]?.username || names[r.admin_user_id]?.email || null,
    admin_display_name: names[r.admin_user_id]?.display_name || null,
    admin_role: names[r.admin_user_id]?.role || r.actor_role || null,
  }));

  const total = count ?? null;
  const actorRead = await readActors(db);
  return {
    actors: actorRead.actors,
    entries,
    rows: entries,
    total,
    limit,
    offset: start,
    page: limit > 0 ? Math.floor(start / limit) : 0,
    hasMore: typeof total === 'number' ? start + entries.length < total : entries.length === limit,
    truncated: typeof total === 'number' ? total > entries.length : entries.length === limit,
    actionPrefixes: prefixes,
    // Named, generic, and never database text: the dropdown can say why it is
    // empty instead of looking like there have never been any operators.
    failedSources: actorRead.failed ? ['audit_actors read failed'] : undefined,
  };
}

/**
 * THE PERMISSION EACH ACTION ACTUALLY NEEDS.
 *
 * The route used to declare `permission: CONTENT_WRITE` at the wrapper, which
 * meant `requireOperator` refused a caller without content.write BEFORE the
 * inner check for `audit_log` (audit.read) or `set_ticket_status`
 * (support.write) could run. The file's own header promised those two could be
 * narrowed in Phase 2 without splitting it, and they could not be: a read-only
 * compliance operator was refused at the door of a read.
 *
 * The wrapper cannot see `body.action`, so the route-level gate is the console
 * floor (console.read - you must be an operator at all) and EVERY action then
 * asks for the permission it really needs, from this map, before it touches
 * anything. Today all three legacy roles hold every permission, so behaviour is
 * unchanged; in Phase 2 this table is the whole story.
 */
const ACTION_PERMISSIONS = Object.freeze({
  create_horse: PERMISSIONS.CONTENT_WRITE,
  update_horse: PERMISSIONS.CONTENT_WRITE,
  set_active: PERMISSIONS.CONTENT_WRITE,
  bulk_active: PERMISSIONS.CONTENT_WRITE,
  delete_horse: PERMISSIONS.CONTENT_WRITE,
  bulk_delete: PERMISSIONS.CONTENT_WRITE,
  save_settings: PERMISSIONS.CONTENT_WRITE,
  set_ticket_status: PERMISSIONS.SUPPORT_WRITE,
  audit_log: PERMISSIONS.AUDIT_READ,
});

export const spec = {
  name: 'horses.stable-admin',
  methods: ['POST'],
  // The floor. The real gate is ACTION_PERMISSIONS, checked below.
  permission: PERMISSIONS.CONSOLE_READ,
  limit: 'write',
};

export async function handle({ req, op, db, body }) {
  const action = enumOf(body.action, ACTIONS);
  if (!action) throw badRequest('Unknown Action');

  const required = ACTION_PERMISSIONS[action];
  if (!required || !hasPermission(op.permissions, required)) {
    throw forbidden('Permission Required: ' + (required || 'unknown'), 'permission_denied');
  }

  if (action === 'audit_log') return auditLog(db, body);
  if (action === 'set_ticket_status') return setTicketStatus(db, op, req, body);

  if (action === 'create_horse') return createHorse(db, op, req, body);
  if (action === 'update_horse') return updateHorse(db, op, req, body);
  if (action === 'set_active') return setActive(db, op, req, body);
  if (action === 'bulk_active') return bulkActive(db, op, req, body);
  if (action === 'delete_horse') return deleteHorse(db, op, req, body);
  if (action === 'bulk_delete') return bulkDelete(db, op, req, body);
  return saveSettings(db, op, req, body);
}

export default withOperatorRoute(spec, handle);
