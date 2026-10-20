import { isOwnerId } from './ownerOperationalClassifier.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const checked = result => { if (result.error) throw result.error; return result.data || []; };

// Read current authority for retained owner alert originals, never rewrite their
// historical message or confuse a read receipt with an incident resolution.
export async function enrichOperationalResolution(supabase, rows, userId) {
    if (!isOwnerId(userId)) return rows;
    const originals = rows.filter(row => row.user_id === userId && row.type === 'system' &&
        row.data?.source === 'owner-real-alert' && Number.isSafeInteger(row.data.inbox_id) && row.data.inbox_id > 0);
    if (!originals.length) return rows;
    const ids = [...new Set(originals.map(row => row.data.inbox_id))];
    let events;
    try { events = checked(await supabase.from('operational_alert_events')
        .select('id,source,alertname,payload').in('id', ids).limit(ids.length));
    } catch (error) {
        console.warn('[Notifications] Operational Status Lookup Unavailable', error?.code || 'read_failed');
        return rows.map(row => originals.includes(row) ? { ...row, operationalResolution: { status: 'unknown' } } : row);
    }
    const statusById = new Map();
    await Promise.all(events.filter(event => originals.some(row => row.data.inbox_id === event.id &&
        row.data.alert === event.alertname)).map(async event => {
        try {
        const original = event.payload?.original_notification;
        const incidentId = original?.data?.incident_id;
        if (event.source === 'owner-operational-notifications' && original?.user_id === userId && UUID.test(incidentId || '')) {
            const incident = checked(await supabase.from('ca_drift_incidents')
                .select('id,status,resolved_at').eq('id', incidentId).limit(1))[0];
            statusById.set(event.id, incident?.status === 'resolved' && incident.resolved_at
                ? { status: 'resolved', resolvedAt: incident.resolved_at } : { status: incident ? 'open' : 'unknown' });
            return;
        }
        const alert = event.payload?.alert;
        if (event.source === 'alertmanager' && typeof alert?.fingerprint === 'string' &&
            typeof alert.startsAt === 'string' && Number.isFinite(Date.parse(alert.startsAt))) {
            // Fingerprint alone identifies a series, not this particular outage.
            // Match its start as well so a later recovery cannot close an older episode.
            const recovery = checked(await supabase.from('operational_alert_events')
                .select('id,payload').eq('source', 'alertmanager').eq('status', 'resolved')
                .eq('alertname', event.alertname)
                .contains('payload', { alert: { fingerprint: alert.fingerprint, startsAt: alert.startsAt } })
                .limit(1))[0];
            const endsAt = recovery?.payload?.alert?.endsAt;
            statusById.set(event.id, endsAt && Date.parse(endsAt) >= Date.parse(alert.startsAt)
                ? { status: 'resolved', resolvedAt: endsAt } : { status: 'unknown' });
        }
        } catch (error) {
            console.warn('[Notifications] Operational Status Lookup Unavailable', error?.code || 'read_failed');
            statusById.set(event.id, { status: 'unknown' });
        }
    }));
    return rows.map(row => {
        if (!originals.includes(row)) return row;
        const operationalResolution = statusById.get(row.data.inbox_id) || { status: 'unknown' };
        if (operationalResolution.status !== 'resolved') return { ...row, operationalResolution };
        // Shared feed consumers already display actor_name/title verbatim. Mark
        // the current display, keeping stored original text and messages intact.
        const resolvedTitle = value => typeof value === 'string' && value
            ? value.replace(/ \(Resolved\)$/, '') + ' (Resolved)' : value;
        return { ...row, title: resolvedTitle(row.title), actor_name: resolvedTitle(row.actor_name), operationalResolution };
    });
}
