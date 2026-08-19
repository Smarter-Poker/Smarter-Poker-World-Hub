/**
 * GET   /api/notifications/push-types  -> { types, groups, prefs, pushEnabled, muteAll }
 * PATCH /api/notifications/push-types  -> single  { key, enabled }
 *                                      -> bulk    { push_type_prefs: { key: false } }
 *                                      -> master  { push_enabled } | { mute_all }
 *
 * DEFAULT-ON STORAGE: only explicit `false` entries are persisted. Enabling a
 * type DELETES its key rather than storing `true`, so the jsonb stays small and
 * a type added to PUSH_TYPES later is automatically on for everyone.
 *
 * Saves instantly -- there is no Save button on the categories list.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { applyRateLimit } from '../../../src/lib/apiRateLimit';
import { PUSH_TYPES, PUSH_GROUPS, PUSH_TYPE_KEYS } from '../../../src/lib/push/push-prefs';

let _supabase = null;
function getSupabase() {
    if (!_supabase) _supabase = createClient();
    return _supabase;
}

export default async function handler(req, res) {
    if (!['GET', 'PATCH'].includes(req.method)) {
        res.setHeader('Allow', 'GET, PATCH');
        return res.status(405).json({ error: 'Method not allowed' });
    }
    if (!applyRateLimit(req, res, { max: 60, windowMs: 60_000, scope: 'push-types' })) return;

    const supabase = getSupabase();
    const { user } = await getServerUserWithFallback(req, supabase);
    if (!user?.id) return res.status(401).json({ error: 'Not authenticated' });

    if (req.method === 'GET') {
        const { data } = await supabase
            .from('notification_preferences')
            .select('push_enabled, mute_all, push_type_prefs, quiet_hours_start, quiet_hours_end, quiet_hours_tz, daily_push_cap')
            .eq('user_id', user.id)
            .maybeSingle();

        return res.status(200).json({
            types: PUSH_TYPES,
            groups: PUSH_GROUPS,
            prefs: data?.push_type_prefs || {},
            // No row means default-on, which is `true` here on purpose.
            pushEnabled: data ? data.push_enabled !== false : true,
            muteAll: data?.mute_all === true,
            quietHours: {
                start: data?.quiet_hours_start ?? null,
                end: data?.quiet_hours_end ?? null,
                // Fall back to the browser's zone on the client when unset.
                tz: data?.quiet_hours_tz || null,
            },
            dailyCap: Number(data?.daily_push_cap || 0),
        });
    }

    // ---- PATCH -------------------------------------------------------------
    const body = typeof req.body === 'string' ? safeParse(req.body) : (req.body || {});

    // TYPE TOGGLES go through set_push_type_pref, which merges inside Postgres
    // (`||` to set, `-` to clear) against the CURRENT row. The previous
    // read-modify-write here discarded the read error, so a transient failure
    // made `next` start empty and the write then wiped every prior opt-out;
    // and because the UI saves instantly per toggle, two quick taps raced and
    // the second write silently discarded the first.
    const patch = { user_id: user.id, updated_at: new Date().toISOString() };
    const typeUpdates = [];

    if (typeof body.key === 'string') {
        if (!PUSH_TYPE_KEYS.has(body.key)) {
            return res.status(400).json({ error: `Unknown push type: ${body.key}` });
        }
        typeUpdates.push([body.key, body.enabled !== false]);
    }

    if (body.push_type_prefs && typeof body.push_type_prefs === 'object') {
        for (const [k, v] of Object.entries(body.push_type_prefs)) {
            if (!PUSH_TYPE_KEYS.has(k)) continue;
            typeUpdates.push([k, v !== false]);
        }
    }

    let mergedPrefs = null;
    for (const [k, enabled] of typeUpdates) {
        const { data: merged, error: mergeErr } = await supabase.rpc('set_push_type_pref', {
            p_key: k,
            p_enabled: enabled,
        });
        if (mergeErr) {
            console.warn('[push-types] merge failed:', mergeErr.message);
            return res.status(500).json({ error: 'Could not save that preference' });
        }
        mergedPrefs = merged;
    }
    if (typeof body.push_enabled === 'boolean') patch.push_enabled = body.push_enabled;
    if (typeof body.mute_all === 'boolean') patch.mute_all = body.mute_all;

    // ---- quiet hours -------------------------------------------------------
    // null clears the window. Anything outside 0-23 is rejected rather than
    // silently clamped, so a broken client cannot quietly mute someone forever.
    if ('quiet_hours_start' in body || 'quiet_hours_end' in body) {
        const norm = (v) => {
            if (v === null || v === '' || typeof v === 'undefined') return null;
            const n = Number(v);
            if (!Number.isInteger(n) || n < 0 || n > 23) return NaN;
            return n;
        };
        const qs = norm(body.quiet_hours_start);
        const qe = norm(body.quiet_hours_end);
        if (Number.isNaN(qs) || Number.isNaN(qe)) {
            return res.status(400).json({ error: 'quiet_hours_start and quiet_hours_end must be whole hours 0-23, or null' });
        }
        patch.quiet_hours_start = qs;
        patch.quiet_hours_end = qe;
    }
    if (typeof body.quiet_hours_tz === 'string' || body.quiet_hours_tz === null) {
        const tz = body.quiet_hours_tz;
        if (tz) {
            // Validate against ICU so an unusable zone never reaches the gate.
            try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); }
            catch { return res.status(400).json({ error: `Unknown timezone: ${tz}` }); }
        }
        patch.quiet_hours_tz = tz || null;
    }

    // ---- daily cap ---------------------------------------------------------
    if ('daily_push_cap' in body) {
        const cap = Number(body.daily_push_cap);
        if (!Number.isInteger(cap) || cap < 0 || cap > 500) {
            return res.status(400).json({ error: 'daily_push_cap must be a whole number between 0 and 500 (0 = unlimited)' });
        }
        patch.daily_push_cap = cap;
    }

    // patch always carries user_id + updated_at; anything more is a real change.
    const hasScalarPatch = Object.keys(patch).length > 2;

    if (!hasScalarPatch && typeUpdates.length === 0) {
        return res.status(400).json({ error: 'Nothing to update' });
    }

    if (hasScalarPatch) {
        const { error } = await supabase
            .from('notification_preferences')
            .upsert(patch, { onConflict: 'user_id' });
        // Log the Postgres detail server-side; return a generic message.
        if (error) {
            console.warn('[push-types] upsert failed:', error.message);
            return res.status(500).json({ error: 'Could not save your notification settings' });
        }
    }

    // Prefer the merged value the RPC returned. Only re-read when nothing
    // touched the type map.
    let prefs = mergedPrefs;
    if (prefs === null) {
        const { data: current } = await supabase
            .from('notification_preferences')
            .select('push_type_prefs')
            .eq('user_id', user.id)
            .maybeSingle();
        prefs = current?.push_type_prefs || {};
    }

    return res.status(200).json({ ok: true, prefs });
}

function safeParse(s) {
    try { return JSON.parse(s); } catch { return {}; }
}
