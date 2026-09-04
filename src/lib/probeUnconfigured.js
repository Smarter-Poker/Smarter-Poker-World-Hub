/**
 * unconfiguredProbe - a probe that cannot run must SAY SO where probes speak.
 *
 * WHY (2026-09-04). recovery-probe's PROBE_RECOVERY_EMAIL was empty. The
 * handler returned {status:'unconfigured'} and exited BEFORE the heartbeat
 * insert, so probe_heartbeats had no row from it for at least 24 hours and
 * the auth-health dashboard - which reads that table - showed nothing at
 * all. A probe that never writes is indistinguishable from a probe that was
 * never scheduled; the dashboard cannot draw a red badge for a row that does
 * not exist. It was found by accident while reading a different probe's
 * rows.
 *
 * The same shape ran the login-probe outage that day for 22 hours: a
 * monitor that reports nothing wrong because it reports nothing.
 *
 * USAGE, on every early-return for a missing env var:
 *
 *     return unconfiguredProbe(res, admin, 'recovery-probe', 'Missing PROBE_RECOVERY_EMAIL ...');
 *
 * Writes a 'failed' heartbeat with details.status = 'unconfigured' (the
 * dashboard already renders 'failed' red), then returns the same 500 JSON
 * the callers always returned. Fail-open: if the heartbeat insert itself
 * fails - or admin is null because the service key is the thing missing -
 * the 500 still goes out.
 */
export async function unconfiguredProbe(res, admin, probeName, error) {
    const details = { status: 'unconfigured', error };
    if (admin) {
        try {
            const { error: hbErr } = await admin.from('probe_heartbeats').insert({
                probe_name: probeName,
                status: 'failed',
                duration_ms: 0,
                details,
            });
            if (hbErr) console.warn(`[${probeName}] unconfigured heartbeat insert failed:`, hbErr.message);
        } catch (e) {
            console.warn(`[${probeName}] unconfigured heartbeat threw:`, e?.message || e);
        }
    }
    console.error(`[${probeName}] unconfigured: ${error}`);
    return res.status(500).json({ status: 'unconfigured', error });
}
