// Reliability Controller messages in Messenger.
//
// The controller sends ordinary public.social_messages rows from the platform
// identity with media_metadata.kind = 'reliability_incident'. Any signed-in
// account can put arbitrary media_metadata on its OWN message (send-message
// forwards the object and the insert policy only binds sender_id to the
// caller), so metadata alone proves nothing. The sender id cannot be chosen by
// a client: the route forces it to the verified session subject and the insert
// policy requires sender_id = auth.uid(). The controls therefore require both.
//
// The incident itself is read only through fn_reliability_incident_for_owner
// with the caller's own session. That function decides who may read; nothing
// here holds a recipient id or a service credential.

export const RELIABILITY_PLATFORM_SENDER_ID = '2d1cd6c3-5700-4af9-a271-d4863fdab20d';
export const RELIABILITY_INCIDENT_KIND = 'reliability_incident';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

export function isReliabilityIncidentId(value) {
    return typeof value === 'string' && UUID.test(value);
}

export function reliabilityIncidentHref(incidentId) {
    return isReliabilityIncidentId(incidentId) ? `/hub/reliability/incidents/${incidentId.toLowerCase()}` : null;
}

/**
 * The controls a message is entitled to, or null. Content text is never
 * consulted: a message that only says "AI AGENT NEEDED" gets nothing.
 */
export function reliabilityIncidentControls(message) {
    if (!isObject(message) || message.is_deleted) return null;
    const meta = message.media_metadata;
    if (!isObject(meta) || meta.kind !== RELIABILITY_INCIDENT_KIND) return null;
    if (typeof message.sender_id !== 'string' ||
        message.sender_id.toLowerCase() !== RELIABILITY_PLATFORM_SENDER_ID) return null;
    const incidentId = isReliabilityIncidentId(meta.incident_id) ? meta.incident_id.toLowerCase() : null;
    return { incidentId, href: reliabilityIncidentHref(incidentId) };
}

const text = (value) => (typeof value === 'string' && value.trim() ? value : null);

function pick(sources, keys) {
    for (const source of sources) {
        if (!isObject(source)) continue;
        for (const key of keys) {
            const value = source[key];
            if (value !== undefined && value !== null && value !== '') return value;
        }
    }
    return null;
}

// An observation may arrive as a timestamp or as a record carrying one.
function observedAt(value) {
    if (isObject(value)) return text(value.observed_at) || text(value.at) || text(value.created_at);
    return text(value);
}

function handoffOf(value) {
    if (isObject(value)) return text(value.text) || text(value.body);
    return text(value);
}

export function normalizeReliabilityIncident(data, requestedId = null) {
    if (!isObject(data)) return null;
    const sources = [data.incident, data.summary, data].filter(isObject);
    const events = pick([data, ...sources], ['incident_events', 'events', 'recent_events']);
    const count = Number(pick(sources, ['occurrence_count']));
    return {
        id: text(pick(sources, ['id', 'incident_id'])) || requestedId,
        title: text(pick(sources, ['title'])) || text(data.summary),
        incidentClass: text(pick(sources, ['incident_class'])),
        alertName: text(pick(sources, ['alertname', 'alert_name'])),
        source: text(pick(sources, ['source'])),
        environment: text(pick(sources, ['environment'])),
        severity: text(pick(sources, ['severity'])),
        status: text(pick(sources, ['status'])),
        resolutionState: text(pick(sources, ['resolution_state'])),
        escalationReason: text(pick(sources, ['escalation_reason'])),
        occurrenceCount: Number.isFinite(count) ? count : null,
        scope: pick(sources, ['scope']),
        firstObservedAt: observedAt(pick(sources, ['first_observed_at', 'first_observation'])),
        latestObservedAt: observedAt(pick(sources, ['last_observed_at', 'latest_observed_at', 'latest_observation'])),
        events: (Array.isArray(events) ? events : []).filter(isObject).slice(0, 20).map((event) => ({
            id: event.id ?? null,
            kind: text(event.kind),
            fromStatus: text(event.from_status),
            toStatus: text(event.to_status),
            at: text(event.at) || text(event.created_at),
            detail: event.detail ?? null,
        })),
        handoff: handoffOf(pick([data, ...sources], ['handoff', 'handoff_text'])),
    };
}

/**
 * One authorized read. Every outcome is a named state so the page never has
 * to guess from a missing field:
 *   ready            the caller may read this incident
 *   not_authorized   SQLSTATE 42501, the function refused this caller
 *   function_missing the function is not installed (PGRST202 / 42883)
 *   not_found        no such incident
 *   invalid_id       the id is not a uuid; nothing was sent
 *   error            anything else, including a network failure
 */
export async function readReliabilityIncident(client, incidentId) {
    if (!isReliabilityIncidentId(incidentId)) return { state: 'invalid_id', incident: null };
    let data = null;
    let error = null;
    try {
        ({ data, error } = await client.rpc('fn_reliability_incident_for_owner', { p_incident_id: incidentId }));
    } catch (thrown) {
        error = thrown || { message: 'request failed' };
    }
    if (error) {
        const code = String(error.code || '');
        const message = String(error.message || '');
        if (code === 'PGRST202' || code === '42883') return { state: 'function_missing', incident: null };
        if (code === '42501') return { state: 'not_authorized', incident: null };
        if (code === 'P0002' || code === 'PGRST116') return { state: 'not_found', incident: null };
        if (code === '22P02') return { state: 'invalid_id', incident: null };
        if (/could not find the function/i.test(message)) return { state: 'function_missing', incident: null };
        return { state: 'error', incident: null };
    }
    if (data === null || data === undefined || (isObject(data) && data.found === false)) {
        return { state: 'not_found', incident: null };
    }
    const incident = normalizeReliabilityIncident(data, incidentId.toLowerCase());
    return incident ? { state: 'ready', incident } : { state: 'error', incident: null };
}

// One read per incident per page session, shared by every message that names
// it. A refusal or a missing function is the same answer for every incident,
// so it is asked once. A transient failure is not kept.
const handoffReads = new Map();
let settledRefusal = null;

export function readReliabilityIncidentOnce(client, incidentId) {
    if (!isReliabilityIncidentId(incidentId)) return Promise.resolve({ state: 'invalid_id', incident: null });
    if (settledRefusal) return Promise.resolve({ state: settledRefusal, incident: null });
    const key = incidentId.toLowerCase();
    if (!handoffReads.has(key)) {
        handoffReads.set(key, readReliabilityIncident(client, key).then((result) => {
            if (result.state === 'not_authorized' || result.state === 'function_missing') settledRefusal = result.state;
            if (result.state !== 'ready' && result.state !== 'not_found') handoffReads.delete(key);
            return result;
        }));
    }
    return handoffReads.get(key);
}

export function resetReliabilityIncidentReads() {
    handoffReads.clear();
    settledRefusal = null;
}

/** The handoff from the authorized read when there is one, else the message. */
export function reliabilityHandoffText(result, messageContent) {
    const fromIncident = result?.state === 'ready' ? text(result.incident?.handoff) : null;
    return fromIncident || (typeof messageContent === 'string' ? messageContent : '');
}

const CHICAGO = { timeZone: 'America/Chicago', year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', second: '2-digit', timeZoneName: 'short' };

export function formatChicagoTime(value) {
    if (!value) return 'Not Recorded';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Not Recorded';
    return new Intl.DateTimeFormat('en-US', CHICAGO).format(date);
}

export function reliabilityScopeEntries(scope) {
    if (isObject(scope)) {
        return Object.keys(scope).sort().map((key) => [key,
            typeof scope[key] === 'string' ? scope[key] : JSON.stringify(scope[key])]);
    }
    const single = text(scope);
    return single ? [['scope', single]] : [];
}

export function reliabilityEventDetail(detail) {
    if (detail === null || detail === undefined) return '';
    if (typeof detail === 'string') return detail.slice(0, 400);
    if (isObject(detail) && Object.keys(detail).length === 0) return '';
    try { return JSON.stringify(detail).slice(0, 400); } catch { return ''; }
}
