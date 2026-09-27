// Read-only eligibility probe. Writes stay in the atomic ownership RPC
// (subscription-ownership.mjs); this module never mutates a row.
// BACKGROUND REPAIR NEVER ENROLLS AN ACCOUNT THAT DID NOT ASK (2026-09-27).
// Browser notification permission belongs to the ORIGIN, not to an account, so
// on a shared browser "permission is granted" says nothing about whoever is
// signed in now. The silent sync may only refresh an enrollment this account
// already holds on this device: an active row for this endpoint, or for this
// browser profile's device id (a rotated or re-scoped endpoint). Anything else
// needs the person's own tap. A failed read refuses rather than guessing.
const DEVICE = /^[A-Za-z0-9-]{8,64}$/;
export async function hasRepairableEnrollment(db, userId, { endpoint, device_id: deviceId } = {}) {
    const probes = [];
    if (typeof endpoint === 'string' && endpoint) probes.push(['endpoint', endpoint]);
    if (typeof deviceId === 'string' && DEVICE.test(deviceId)) probes.push(['device_id', deviceId]);
    for (const [column, value] of probes) {
        const { data, error } = await db.from('push_subscriptions').select('id')
            .eq('user_id', userId).eq(column, value).eq('is_active', true).limit(1);
        if (error) throw Object.assign(new Error('Device notification settings are temporarily unavailable.'), { status: 503 });
        if (Array.isArray(data) && data.length > 0) return true;
    }
    return false;
}
