/**
 * POST /api/push/rotate  -- SESSION-LESS subscription rotation.
 *
 * Body: { oldEndpoint, endpoint, keys: { p256dh, auth } }
 *
 * WHY THIS IS NOT AUTHENTICATED
 * A service worker has no access to localStorage, and smarter.poker
 * authenticates API routes with a Bearer JWT read from localStorage -- so the
 * SW physically cannot present credentials. But the browser fires
 * `pushsubscriptionchange` at moments the user is not around to re-authenticate
 * (OS update, storage purge, long idle), and if we drop that event the endpoint
 * dies silently while the server keeps reporting success. That is the exact
 * zombie-subscription failure this whole stack exists to eliminate.
 *
 * WHAT MAKES IT SAFE
 * The caller must present the OLD endpoint. Endpoints are long, unguessable,
 * origin-scoped strings issued by the push service to one specific device, and
 * we only ever move a row that already exists -- the user_id is copied from the
 * matched row and is never taken from the request. So the worst a caller can do
 * with a stolen endpoint is redirect that one device's own pushes, which
 * possessing the endpoint already allows. No row is ever created, no user is
 * ever inferred, and no data is returned.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit } from '../../../src/lib/apiRateLimit';

let _supabase = null;
function getSupabase() {
    if (!_supabase) _supabase = createClient();
    return _supabase;
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method not allowed' });
    }
    if (!applyRateLimit(req, res, { max: 20, windowMs: 60_000, scope: 'push-rotate' })) return;

    const body = typeof req.body === 'string' ? safeParse(req.body) : (req.body || {});
    const oldEndpoint = body?.oldEndpoint;
    const endpoint = body?.endpoint;
    const p256dh = body?.keys?.p256dh || body?.p256dh;
    const auth = body?.keys?.auth || body?.auth;

    if (!oldEndpoint || !endpoint || !p256dh || !auth) {
        return res.status(204).end(); // SW cannot act on an error -- stay quiet
    }

    try {
        const supabase = getSupabase();

        const { data: existing } = await supabase
            .from('push_subscriptions')
            .select('id, user_id')
            .eq('endpoint', oldEndpoint)
            .maybeSingle();

        // Unknown old endpoint: nothing to migrate. Never create a row here --
        // that would let an anonymous caller invent subscriptions.
        if (!existing?.user_id) return res.status(204).end();

        const nowIso = new Date().toISOString();

        // The device may already hold a row under the new endpoint from a prior
        // partial heal. Upsert on (user_id, endpoint) so both paths converge.
        await supabase.from('push_subscriptions').upsert(
            {
                user_id: existing.user_id,
                endpoint,
                p256dh,
                auth,
                is_active: true,
                failure_count: 0,
                last_failure_reason: null,
                device_label: 'auto-healed',
                updated_at: nowIso,
            },
            { onConflict: 'user_id,endpoint' }
        );

        if (oldEndpoint !== endpoint) {
            await supabase
                .from('push_subscriptions')
                .update({ is_active: false, last_failure_reason: 'rotated', updated_at: nowIso })
                .eq('id', existing.id);
        }

        return res.status(204).end();
    } catch {
        return res.status(204).end();
    }
}

function safeParse(s) {
    try { return JSON.parse(s); } catch { return {}; }
}
