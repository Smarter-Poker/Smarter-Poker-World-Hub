// Read-only eligibility probe. Writes stay in the atomic ownership RPC
// (subscription-ownership.mjs); this module never mutates a row.
//
// BACKGROUND REPAIR NEVER ENROLLS AN ACCOUNT THAT DID NOT ASK (2026-09-27).
// Browser notification permission belongs to the ORIGIN, not to an account, so
// on a shared browser "permission is granted" says nothing about whoever is
// signed in now. The silent sync may only refresh an enrollment this account
// already holds on this device. Anything else needs the person's own tap. A
// failed read refuses rather than guessing.
//
// A DEVICE THE SYSTEM RETIRED IS STILL THIS ACCOUNT'S ENROLLMENT (2026-11-05).
// Dan, 2026-11-05: "I even just did the test push notification to my phone and
// got nothing." His iPhone had opted in, then Apple answered 410 for its
// endpoint on Nov 2 (ordinary APNs endpoint expiry). The dispatcher correctly
// set is_active=false, and from that moment the old rule ("an ACTIVE row for
// this endpoint or device") refused every silent repair with 409. The phone
// still had permission, the app still believed it was enrolled, and nothing
// would ever re-enroll it. No new subscription row had been saved platform
// wide since Oct 27, which is this same dead end repeated on every device.
//
// The consent question is "did THIS account opt in on THIS device, and has the
// PERSON (not the push service) since turned it off or handed the device to
// someone else?" A row the system retired (endpoint expired, superseded by a
// rotation on the same device, receipt dedup) answers yes / no. A row the
// person turned off, revoked, or that moved to another account answers no.
// Only the NEWEST row per probe decides, so an old superseded row can never
// outvote a later deliberate "off" on the same device.
const DEVICE = /^[A-Za-z0-9-]{8,64}$/;

// Reasons written by the platform itself, never by the person.
const SYSTEM_RETIRED = [
    /^expired_\d{3}$/,          // push service said the endpoint is gone (404/410)
    /^superseded/,              // rotated on the same device / replaced endpoint
    /^no_receipt_while_sibling_confirmed$/,
];

export function isSystemRetirement(reason) {
    return typeof reason === 'string' && SYSTEM_RETIRED.some(re => re.test(reason));
}

export function rowIsRepairable(row) {
    if (!row) return false;
    if (row.is_active === true) return true;
    return isSystemRetirement(row.last_failure_reason);
}

export async function hasRepairableEnrollment(db, userId, { endpoint, device_id: deviceId, replaces_endpoint: replaces } = {}) {
    const probes = [];
    if (typeof endpoint === 'string' && endpoint) probes.push(['endpoint', endpoint]);
    if (typeof replaces === 'string' && replaces && replaces !== endpoint) probes.push(['endpoint', replaces]);
    if (typeof deviceId === 'string' && DEVICE.test(deviceId)) probes.push(['device_id', deviceId]);
    for (const [column, value] of probes) {
        const { data, error } = await db.from('push_subscriptions')
            .select('id, is_active, last_failure_reason, updated_at')
            .eq('user_id', userId).eq(column, value)
            .order('updated_at', { ascending: false }).limit(1);
        if (error) throw Object.assign(new Error('Device notification settings are temporarily unavailable.'), { status: 503 });
        if (Array.isArray(data) && rowIsRepairable(data[0])) return true;
    }
    return false;
}

// THE ENDPOINT ITSELF IS DEAD (2026-11-05). A 404/410 from the push service is
// permanent: that URL will never deliver again. Re-saving it would flip the row
// back to is_active=true (the ownership RPC upserts) and every send would burn
// a request into a dead endpoint and report "sent". The browser must create a
// fresh subscription instead, so the subscribe route answers 410 and the
// client rotates.
export async function endpointIsExpired(db, userId, endpoint) {
    if (typeof endpoint !== 'string' || !endpoint) return false;
    const { data, error } = await db.from('push_subscriptions')
        .select('is_active, last_failure_reason')
        .eq('user_id', userId).eq('endpoint', endpoint).limit(1);
    if (error) return false; // never block an enrollment on a failed read
    const row = Array.isArray(data) ? data[0] : null;
    return Boolean(row && row.is_active !== true && /^expired_\d{3}$/.test(row.last_failure_reason || ''));
}
