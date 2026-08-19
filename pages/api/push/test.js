/**
 * POST /api/push/test
 *
 * Self-test:  {}                          -> pushes to the caller's own devices
 * Admin test: { user_id, title, body }    -> pushes to any user (admin/god only)
 *
 * Test pushes bypass the per-type preference gate (see UNGATED_EVENTS in
 * push-prefs.js). If a user taps "Send Test" and gets nothing because of a
 * category toggle, the button has lied about the health of their subscription
 * and the whole diagnostic is worthless. They are still gated by mute_all and
 * push_enabled, because those are the user saying "stop" outright.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { applyRateLimit } from '../../../src/lib/apiRateLimit';
import { enqueuePush } from '../../../src/lib/push/push-enqueue';
import { isPushConfigured } from '../../../src/lib/push/web-push';

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
    if (!applyRateLimit(req, res, { max: 6, windowMs: 60_000, scope: 'push-test' })) return;

    if (!isPushConfigured()) {
        return res.status(503).json({ error: 'Push is not configured on this deployment', code: 'vapid_not_configured' });
    }

    const supabase = getSupabase();
    const { user } = await getServerUserWithFallback(req, supabase);
    if (!user?.id) return res.status(401).json({ error: 'Not authenticated' });

    const body = typeof req.body === 'string' ? safeParse(req.body) : (req.body || {});
    let targetId = user.id;
    let event = 'self_test';
    let title = 'Smarter Poker';
    let text = 'Push notifications are working on this device.';

    if (body.user_id && body.user_id !== user.id) {
        // NEVER trust a body-supplied user id without checking the caller's role.
        const { data: me } = await supabase
            .from('profiles').select('role').eq('id', user.id).maybeSingle();
        if (!me || !['admin', 'god'].includes(me.role)) {
            return res.status(403).json({ error: 'Admin required to push to another user' });
        }
        targetId = body.user_id;
        event = 'admin_test';
        title = body.title || 'Smarter Poker';
        text = body.body || 'Test notification from an administrator.';
    } else {
        if (body.title) title = String(body.title);
        if (body.body) text = String(body.body);
    }

    const result = await enqueuePush(supabase, {
        userId: targetId,
        title,
        body: text,
        url: '/hub/settings/notifications',
        event,
        tag: `test:${targetId}`,
    });

    if (result.skipped) {
        return res.status(200).json({
            ok: false,
            sent: 0,
            reason: result.reason,
            hint: result.reason === 'mute_all'
                ? 'Mute All is switched on in your notification settings.'
                : result.reason === 'push_disabled'
                    ? 'Push is switched off in your notification settings.'
                    : undefined,
        });
    }

    return res.status(200).json({
        ok: result.sent,
        sent: result.accepted,
        outboxId: result.outboxId,
        reason: result.reason,
    });
}

function safeParse(s) {
    try { return JSON.parse(s); } catch { return {}; }
}
