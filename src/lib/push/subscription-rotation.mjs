// Source successor: authenticated row CAS, not a device/account epoch protocol.
import { timingSafeEqual } from 'node:crypto';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REVISION = /^[1-9][0-9]{0,18}$/;
const conflict = () => Object.assign(new Error('Reopen notification settings to enroll this device.'), { status: 409 });
const unavailable = () => Object.assign(new Error('Device rotation could not be confirmed.'), { status: 503 });
function equalSecret(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const left = Buffer.from(a), right = Buffer.from(b);
    return left.length > 0 && left.length === right.length && timingSafeEqual(left, right);
}
function validRevision(value) {
    return typeof value === 'string' && REVISION.test(value) && BigInt(value) <= 9223372036854775807n;
}

export async function rotatePushSubscription(db, userId, input) {
    // Cast in the PostgREST projection: JSON numbers would lose bigint precision.
    // An unsupported/malformed projection fails closed, never coerces a number.
    const { data: rows, error } = await db.from('push_subscriptions')
        .select('id,user_id,endpoint,p256dh,auth,device_id,transport,rotation_revision::text')
        .eq('user_id', userId).eq('endpoint', input.oldEndpoint).eq('is_active', true).limit(2);
    if (error) throw unavailable();
    if (!Array.isArray(rows) || rows.length !== 1) throw conflict();
    const source = rows[0];
    if (!source || source.user_id !== userId || !UUID.test(source.id || '') ||
        source.endpoint !== input.oldEndpoint || source.transport !== 'webpush' ||
        typeof source.device_id !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(source.device_id) ||
        !equalSecret(input.oldKeys.p256dh, source.p256dh) || !equalSecret(input.oldKeys.auth, source.auth)) throw conflict();
    if (!validRevision(source.rotation_revision)) throw unavailable();
    const expected = { id: source.id, endpoint: source.endpoint, transport: source.transport,
        device_id: source.device_id, rotation_revision: source.rotation_revision,
        p256dh: input.oldKeys.p256dh, auth: input.oldKeys.auth };
    const { data, error: rpcError } = await db.rpc('fn_rotate_push_subscription', {
        p_user_id: userId, p_expected: expected,
        p_replacement: { endpoint: input.endpoint, p256dh: input.keys.p256dh, auth: input.keys.auth },
    });
    if (rpcError) {
        if (rpcError.message === 'push_rotation_conflict' || rpcError.code === '23505') throw conflict();
        throw unavailable();
    }
    if (!data || data.schema_version !== 1 || data.success !== true || data.user_id !== userId ||
        data.source_subscription_id !== source.id || data.source_revision !== source.rotation_revision ||
        !validRevision(data.retired_revision) || BigInt(data.retired_revision) !== BigInt(source.rotation_revision) + 1n ||
        !UUID.test(data.subscription_id || '') || data.subscription_id === source.id || data.rotation_revision !== '1' ||
        data.old_endpoint !== source.endpoint || data.endpoint !== input.endpoint ||
        data.device_id !== source.device_id || data.transport !== 'webpush') throw unavailable();
    return data;
}

// Dependencies are wired once by the real API route. Tests exercise this same
// handler and adapter; there is no separate implementation of the transaction.
export function createPushRotationHandler({ getDatabase, getUser, rateLimit, validateEndpoint, validateKeys, sameService }) {
    return async function handler(req, res) {
        res.setHeader('Cache-Control', 'no-store');
        if (req.method !== 'POST') {
            res.setHeader('Allow', 'POST');
            return res.status(405).json({ error: 'Method not allowed' });
        }
        if (!rateLimit(req, res, { max: 20, windowMs: 60_000, scope: 'push-rotate' })) return;
        try {
            const db = getDatabase();
            const { user } = await getUser(req, db);
            if (!user?.id || !UUID.test(user.id)) return res.status(401).json({ error: 'Not authenticated' });
            let body;
            try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch { body = null; }
            if (!body || !validateEndpoint(body.oldEndpoint).ok || !validateEndpoint(body.endpoint).ok ||
                body.oldEndpoint === body.endpoint || !sameService(body.oldEndpoint, body.endpoint) ||
                !validateKeys(body.keys?.p256dh, body.keys?.auth).ok ||
                !validateKeys(body.oldKeys?.p256dh, body.oldKeys?.auth).ok) {
                return res.status(400).json({ error: 'A verified old and replacement WebPush subscription are required.' });
            }
            const receipt = await rotatePushSubscription(db, user.id, body);
            return res.status(200).json({ ok: true, rotated: true, receipt });
        } catch (error) {
            // Database/provider messages may contain endpoint/key material.
            // Expose only this adapter's fixed messages, never log raw errors.
            const status = error?.status === 409 ? 409 : 503;
            return res.status(status).json({ error: status === 409 ? conflict().message : unavailable().message });
        }
    };
}
