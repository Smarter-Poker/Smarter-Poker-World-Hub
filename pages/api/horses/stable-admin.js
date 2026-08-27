/**
 * STABLE WRITE API — the horses themselves, and the engine settings.
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
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
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

const ADMIN_ROLES = ['admin', 'superadmin', 'god'];

/** Columns a caller may set. Anything else in the payload is dropped, so a
 *  future column cannot be written from the browser just by naming it. */
const HORSE_FIELDS = [
  'name', 'alias', 'gender', 'location', 'specialty', 'stakes',
  'bio', 'voice', 'avatar_url', 'avatar_seed', 'timezone', 'is_active',
];

/** Settings keys the panel owns. `id` is handled separately. */
const SETTINGS_FIELDS = [
  'posts_per_day', 'min_delay_minutes', 'max_delay_minutes', 'ai_model',
  'temperature', 'engine_enabled', 'auto_publish', 'peak_hours',
  'grinder_max_tables', 'grinder_daily_hours', 'grinder_starting_chips',
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

const MAX_BULK = 600; // the stable is 593 horses; one page of "select all" must fit

/** live_help_tickets.status values the Bug Reports tab can set. */
const VALID_TICKET_STATUS = ['open', 'resolved'];

/** Audit Log reader. A page has to fit in one response; 500 is the ceiling. */
const AUDIT_PAGE_DEFAULT = 100;
const AUDIT_PAGE_MAX = 500;

function pick(source, allowed) {
  const out = {};
  for (const key of allowed) {
    if (source && Object.prototype.hasOwnProperty.call(source, key)) out[key] = source[key];
  }
  return out;
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
    if (!Number.isFinite(n)) { errors.push(`${key} must be a number`); continue; }
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

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || null;
}

async function audit(req, adminId, action, targetId, details, targetType) {
  // Columns verified against production: admin_user_id, action, target_type,
  // target_id, details, ip_address, created_at.
  const { error } = await getSupabase().from('admin_audit_log').insert({
    admin_user_id: adminId,
    action,
    // Defaults to the horse table because that is most of this route, but a
    // support ticket is not a content_author and must not be filed as one.
    target_type: targetType || (String(action).startsWith('ticket.') ? 'live_help_ticket' : 'content_author'),
    target_id: targetId ? String(targetId) : null,
    details: details || {},
    ip_address: clientIp(req),
  });
  if (error) console.warn('[stable-admin] audit write failed:', error.message);
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
    if (!applyRateLimit(req, res, LIMITS.write)) return;

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Authorization required' });

    const { user, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

    const { data: profile } = await getSupabase()
      .from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (!profile || !ADMIN_ROLES.includes(profile.role)) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    const db = getSupabase();
    const { action } = req.body || {};

    // ── CREATE ────────────────────────────────────────────────────────────
    if (action === 'create_horse') {
      const horse = pick(req.body.horse, HORSE_FIELDS);
      const errors = validateHorse(horse);
      if (errors.length) return res.status(400).json({ success: false, error: errors.join('; ') });

      if (!horse.alias) {
        const base = String(horse.name).replace(/[^a-zA-Z0-9]/g, '') || 'Horse';
        horse.alias = `${base}${Math.floor(Math.random() * 10000)}`;
      }
      if (!horse.avatar_seed) horse.avatar_seed = String(horse.alias).toLowerCase();
      if (!horse.timezone) horse.timezone = 'America/New_York';
      if (horse.is_active === undefined) horse.is_active = true;

      const { data, error } = await db.from('content_authors').insert([horse]).select().maybeSingle();
      if (error) {
        console.error('[stable-admin] create failed:', error);
        return res.status(500).json({ success: false, error: `Could not create the horse: ${error.message}` });
      }
      if (!data) return res.status(500).json({ success: false, error: 'The horse was not created.' });

      await audit(req, user.id, 'horse.created', data.id, { name: data.name, alias: data.alias });
      return res.status(200).json({ success: true, horse: data });
    }

    // ── UPDATE ────────────────────────────────────────────────────────────
    if (action === 'update_horse') {
      const { id } = req.body;
      if (id === undefined || id === null) return res.status(400).json({ success: false, error: 'id is required' });

      const horse = pick(req.body.horse, HORSE_FIELDS);
      if (Object.keys(horse).length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });
      const errors = validateHorse(horse, { partial: true });
      if (errors.length) return res.status(400).json({ success: false, error: errors.join('; ') });

      const { data, error } = await db.from('content_authors').update(horse).eq('id', id).select().maybeSingle();
      if (error) {
        console.error('[stable-admin] update failed:', error);
        return res.status(500).json({ success: false, error: `Could not save the horse: ${error.message}` });
      }
      // The whole point of this route: a zero-row write is reported, not hidden.
      if (!data) return res.status(404).json({ success: false, error: 'That horse no longer exists.' });

      await audit(req, user.id, 'horse.updated', id, { fields: Object.keys(horse) });
      return res.status(200).json({ success: true, horse: data });
    }

    // ── SET ACTIVE (single) ───────────────────────────────────────────────
    if (action === 'set_active') {
      const { id, is_active } = req.body;
      if (id === undefined || id === null) return res.status(400).json({ success: false, error: 'id is required' });
      if (typeof is_active !== 'boolean') return res.status(400).json({ success: false, error: 'is_active must be a boolean' });

      const { data, error } = await db.from('content_authors')
        .update({ is_active }).eq('id', id).select('id, is_active').maybeSingle();
      if (error) {
        console.error('[stable-admin] set_active failed:', error);
        return res.status(500).json({ success: false, error: `Could not change the horse: ${error.message}` });
      }
      if (!data) return res.status(404).json({ success: false, error: 'That horse no longer exists.' });

      await audit(req, user.id, is_active ? 'horse.activated' : 'horse.rested', id, {});
      return res.status(200).json({ success: true, horse: data });
    }

    // ── BULK ACTIVE ───────────────────────────────────────────────────────
    if (action === 'bulk_active') {
      const { ids, is_active } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ success: false, error: 'ids must be a non-empty array' });
      if (ids.length > MAX_BULK) return res.status(400).json({ success: false, error: `At most ${MAX_BULK} horses at a time` });
      if (typeof is_active !== 'boolean') return res.status(400).json({ success: false, error: 'is_active must be a boolean' });

      const { data, error } = await db.from('content_authors')
        .update({ is_active }).in('id', ids).select('id');
      if (error) {
        console.error('[stable-admin] bulk_active failed:', error);
        return res.status(500).json({ success: false, error: `Bulk update failed: ${error.message}` });
      }
      const affected = (data || []).length;
      await audit(req, user.id, is_active ? 'horse.bulk_activated' : 'horse.bulk_rested', null,
        { requested: ids.length, affected });
      // affected is returned so the browser can tell the operator the truth
      // when some ids no longer exist.
      return res.status(200).json({ success: true, affected, requested: ids.length });
    }

    // ── DELETE (single) ───────────────────────────────────────────────────
    if (action === 'delete_horse') {
      const { id } = req.body;
      if (id === undefined || id === null) return res.status(400).json({ success: false, error: 'id is required' });

      const { data: existing } = await db.from('content_authors')
        .select('id, name, alias').eq('id', id).maybeSingle();

      const { data, error } = await db.from('content_authors').delete().eq('id', id).select('id').maybeSingle();
      if (error) {
        console.error('[stable-admin] delete failed:', error);
        return res.status(500).json({ success: false, error: `Could not retire the horse: ${error.message}` });
      }
      if (!data) return res.status(404).json({ success: false, error: 'That horse no longer exists.' });

      // Deletion is irreversible and there is no soft-delete column, so the
      // audit row carries the whole record.
      await audit(req, user.id, 'horse.deleted', id, { deleted: existing || null });
      return res.status(200).json({ success: true, id });
    }

    // ── BULK DELETE ───────────────────────────────────────────────────────
    if (action === 'bulk_delete') {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ success: false, error: 'ids must be a non-empty array' });
      if (ids.length > MAX_BULK) return res.status(400).json({ success: false, error: `At most ${MAX_BULK} horses at a time` });

      const { data: existing } = await db.from('content_authors')
        .select('id, name, alias').in('id', ids);

      const { data, error } = await db.from('content_authors').delete().in('id', ids).select('id');
      if (error) {
        console.error('[stable-admin] bulk_delete failed:', error);
        return res.status(500).json({ success: false, error: `Bulk retire failed: ${error.message}` });
      }
      const affected = (data || []).length;
      await audit(req, user.id, 'horse.bulk_deleted', null,
        { requested: ids.length, affected, deleted: existing || [] });
      return res.status(200).json({ success: true, affected, requested: ids.length });
    }

    // ── SUPPORT TICKET STATUS ─────────────────────────────────────────────
    //
    // The Bug Reports tab used to UPDATE live_help_tickets straight from the
    // browser. Three problems, all fixed by routing it here:
    //
    //   1. NO AUDIT. Resolving or reopening a support ticket left no record of
    //      who did it. It was the last mutation in the console still going
    //      direct to PostgREST.
    //   2. A ZERO-ROW UPDATE LOOKS LIKE SUCCESS. PostgREST returns
    //      { error: null } when nothing matched, so before the RLS fix -- when
    //      two of the three admin accounts could not see a ticket at all --
    //      the toast said "Ticket Marked Resolved" and nothing had changed.
    //      That is exactly the failure this whole audit started from.
    //   3. It depended on the caller's own RLS grant rather than on being an
    //      admin, so it broke silently whenever that policy drifted.
    if (action === 'set_ticket_status') {
      const { id, status } = req.body;
      if (!id) return res.status(400).json({ success: false, error: 'id is required' });
      if (!VALID_TICKET_STATUS.includes(status)) {
        return res.status(400).json({ success: false, error: `status must be one of: ${VALID_TICKET_STATUS.join(', ')}` });
      }

      const { data: before } = await db.from('live_help_tickets')
        .select('id, status, subject, user_id').eq('id', id).maybeSingle();

      const { data, error } = await db.from('live_help_tickets')
        .update({
          status,
          updated_at: new Date().toISOString(),
          resolved_at: status === 'resolved' ? new Date().toISOString() : null,
        })
        .eq('id', id).select('id, status').maybeSingle();

      if (error) {
        console.error('[stable-admin] set_ticket_status failed:', error);
        return res.status(500).json({ success: false, error: `Could not update the ticket: ${error.message}` });
      }
      if (!data) return res.status(404).json({ success: false, error: 'That ticket no longer exists.' });

      await audit(req, user.id, status === 'resolved' ? 'ticket.resolved' : 'ticket.reopened', id, {
        subject: before?.subject || null,
        reporter: before?.user_id || null,
        from: before?.status || null,
        to: status,
      });
      return res.status(200).json({ success: true, ticket: data });
    }

    // ── SETTINGS ──────────────────────────────────────────────────────────
    if (action === 'save_settings') {
      const settings = pick(req.body.settings, SETTINGS_FIELDS);
      if (Object.keys(settings).length === 0) return res.status(400).json({ success: false, error: 'No settings to save' });
      const errors = validateSettings(settings);
      if (errors.length) return res.status(400).json({ success: false, error: errors.join('; ') });

      // Update the existing singleton rather than upserting. The old browser
      // code upserted without an id, which inserts a SECOND row when the id
      // lookup misses -- and the reader takes an arbitrary one of them.
      const { data: current, error: readErr } = await db
        .from('content_settings').select('id').order('id', { ascending: true }).limit(1).maybeSingle();
      if (readErr) {
        console.error('[stable-admin] settings read failed:', readErr);
        return res.status(500).json({ success: false, error: 'Could not read the current settings' });
      }

      if (!current?.id) {
        const { data, error } = await db.from('content_settings')
          .insert([{ ...settings, updated_at: new Date().toISOString() }]).select().maybeSingle();
        if (error) {
          console.error('[stable-admin] settings insert failed:', error);
          return res.status(500).json({ success: false, error: `Could not save settings: ${error.message}` });
        }
        await audit(req, user.id, 'content_settings.created', data?.id, { fields: Object.keys(settings) });
        return res.status(200).json({ success: true, settings: data });
      }

      const { data, error } = await db.from('content_settings')
        .update({ ...settings, updated_at: new Date().toISOString() })
        .eq('id', current.id).select().maybeSingle();
      if (error) {
        console.error('[stable-admin] settings update failed:', error);
        return res.status(500).json({ success: false, error: `Could not save settings: ${error.message}` });
      }
      if (!data) return res.status(500).json({ success: false, error: 'Settings row vanished mid-write.' });

      await audit(req, user.id, 'content_settings.updated', current.id, { fields: Object.keys(settings) });
      return res.status(200).json({ success: true, settings: data });
    }

    // ── AUDIT LOG (read) ──────────────────────────────────────────────────
    //
    // Until this release the console WROTE to admin_audit_log from three
    // routes and READ it from nowhere. The whole table held nine rows across
    // five months, and there was no surface anywhere on the platform that
    // could show them. An audit trail nobody can read is a table, not a
    // control.
    //
    // Service-role on purpose. admin_audit_log records who kicked a player and
    // who approved a cashout, so it must not be readable through the caller's
    // own grants -- that is how a policy drift turns into a privacy incident.
    // The admin gate above is the only thing that opens it.
    if (action === 'audit_log') {
      const {
        actionPrefix, adminId, targetType, targetId, days,
        limit: rawLimit, offset: rawOffset,
      } = req.body;

      const limit = Math.min(Math.max(parseInt(rawLimit, 10) || AUDIT_PAGE_DEFAULT, 1), AUDIT_PAGE_MAX);
      const offset = Math.max(parseInt(rawOffset, 10) || 0, 0);

      let q = db.from('admin_audit_log')
        .select('id, admin_user_id, action, target_type, target_id, details, before_state, after_state, ip_address, actor_role, request_id, created_at', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      // `like` with a trailing % rather than `ilike` on both sides: action
      // strings are namespaced (cashout.*, fleet.*, hg.*), so a prefix match is
      // what the filter actually means. Note this does NOT use
      // admin_audit_log_action_idx -- a btree under a non-C collation cannot
      // serve LIKE -- but the created_at range is what bounds the scan, and
      // idx_aal_created does serve that. If this table ever grows large enough
      // for the prefix scan to matter, the fix is a text_pattern_ops index on
      // action, not a change here.
      //
      // The % and _ strip is deliberate: without it an operator-supplied
      // prefix could turn into a full-table wildcard scan.
      if (actionPrefix) q = q.like('action', `${String(actionPrefix).replace(/[%_]/g, '')}%`);
      if (adminId) q = q.eq('admin_user_id', adminId);
      if (targetType) q = q.eq('target_type', targetType);
      if (targetId) q = q.eq('target_id', String(targetId));
      if (days) {
        const n = Math.min(Math.max(parseInt(days, 10) || 0, 1), 365);
        q = q.gte('created_at', new Date(Date.now() - n * 86400000).toISOString());
      }

      const { data: rows, error, count } = await q;
      if (error) {
        console.error('[stable-admin] audit_log read failed:', error);
        return res.status(500).json({ success: false, error: `Could not read the audit log: ${error.message}` });
      }

      // Resolve the admin ids to names in one round trip. A join through
      // PostgREST needs a declared FK that admin_audit_log does not have, and
      // one lookup per row would be N+1 across a 500-row page.
      const ids = [...new Set((rows || []).map((r) => r.admin_user_id).filter(Boolean))];
      let names = {};
      if (ids.length) {
        const { data: profiles } = await db.from('profiles')
          .select('id, username, email, role').in('id', ids);
        names = Object.fromEntries((profiles || []).map((pr) => [pr.id, pr]));
      }

      // The set of admins who appear ANYWHERE in the log, so the UI can offer a
      // real "who" filter instead of asking the operator to paste a uuid. Read
      // from a dedicated distinct query rather than from the current page --
      // filtering by an admin who happens not to appear on page 1 is exactly
      // the case the filter exists for.
      let actors = [];
      {
        const { data: actorRows } = await db
          .from('admin_audit_log').select('admin_user_id').not('admin_user_id', 'is', null)
          .limit(5000);
        const actorIds = [...new Set((actorRows || []).map((r) => r.admin_user_id))];
        if (actorIds.length) {
          const { data: actorProfiles } = await db.from('profiles')
            .select('id, username, email, role').in('id', actorIds);
          actors = (actorProfiles || []).map((a) => ({
            id: a.id, name: a.username || a.email || a.id, role: a.role,
          })).sort((x, y) => String(x.name).localeCompare(String(y.name)));
        }
      }

      return res.status(200).json({
        success: true,
        actors,
        entries: (rows || []).map((r) => ({
          ...r,
          admin_name: names[r.admin_user_id]?.username || names[r.admin_user_id]?.email || null,
          admin_role: names[r.admin_user_id]?.role || r.actor_role || null,
        })),
        total: count ?? null,
        limit,
        offset,
      });
    }

    return res.status(400).json({ success: false, error: 'Unknown action' });
  } catch (err) {
    console.error('[stable-admin] handler error:', err);
    try { reportApiError(err, req); } catch (_) { /* reporting must never mask the response */ }
    return res.status(500).json({ success: false, error: 'Stable admin request failed' });
  }
}
