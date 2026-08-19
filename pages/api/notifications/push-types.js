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
            .select('push_enabled, mute_all, push_type_prefs')
            .eq('user_id', user.id)
            .maybeSingle();

        return res.status(200).json({
            types: PUSH_TYPES,
            groups: PUSH_GROUPS,
            prefs: data?.push_type_prefs || {},
            // No row means default-on, which is `true` here on purpose.
            pushEnabled: data ? data.push_enabled !== false : true,
            muteAll: data?.mute_all === true,
        });
    }

    // ---- PATCH -------------------------------------------------------------
    const body = typeof req.body === 'string' ? safeParse(req.body) : (req.body || {});

    const { data: existing } = await supabase
        .from('notification_preferences')
        .select('push_type_prefs')
        .eq('user_id', user.id)
        .maybeSingle();

    const next = { ...(existing?.push_type_prefs || {}) };
    const patch = { user_id: user.id, updated_at: new Date().toISOString() };
    let touchedTypes = false;

    if (typeof body.key === 'string') {
        if (!PUSH_TYPE_KEYS.has(body.key)) {
            return res.status(400).json({ error: `Unknown push type: ${body.key}` });
        }
        if (body.enabled === false) next[body.key] = false;
        else delete next[body.key];
        touchedTypes = true;
    }

    if (body.push_type_prefs && typeof body.push_type_prefs === 'object') {
        for (const [k, v] of Object.entries(body.push_type_prefs)) {
            if (!PUSH_TYPE_KEYS.has(k)) continue;
            if (v === false) next[k] = false;
            else delete next[k];
        }
        touchedTypes = true;
    }

    if (touchedTypes) patch.push_type_prefs = next;
    if (typeof body.push_enabled === 'boolean') patch.push_enabled = body.push_enabled;
    if (typeof body.mute_all === 'boolean') patch.mute_all = body.mute_all;

    if (Object.keys(patch).length <= 2) {
        return res.status(400).json({ error: 'Nothing to update' });
    }

    const { error } = await supabase
        .from('notification_preferences')
        .upsert(patch, { onConflict: 'user_id' });

    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({
        ok: true,
        prefs: touchedTypes ? next : (existing?.push_type_prefs || {}),
    });
}

function safeParse(s) {
    try { return JSON.parse(s); } catch { return {}; }
}
