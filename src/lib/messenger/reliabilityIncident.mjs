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
const count = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

// The object fn_reliability_incident_for_owner returns, key for key. Only the
// fields its contract marks nullable are allowed to be absent.
export function normalizeReliabilityIncident(data) {
    if (!isObject(data) || !isReliabilityIncidentId(data.incident_id)) return null;
    return {
        id: data.incident_id,
        title: text(data.title),
        incidentClass: text(data.incident_class),
        alertName: text(data.alertname),
        source: text(data.source),
        environment: text(data.environment),
        severity: text(data.severity),
        status: text(data.status),
        resolutionState: text(data.resolution_state),
        closureBasis: text(data.closure_basis),
        escalationState: text(data.escalation_state),
        escalationReason: text(data.escalation_reason),
        occurrenceCount: count(data.occurrence_count),
        recurrenceCount: count(data.recurrence_count),
        scope: isObject(data.scope) ? data.scope : {},
        labels: isObject(data.labels) ? data.labels : {},
        firstObservedAt: text(data.first_observed_at),
        latestObservedAt: text(data.last_observed_at),
        lastFiringAt: text(data.last_firing_at),
        lastResolvedAt: text(data.last_resolved_at),
        engineRelease: text(data.engine_release),
        relatedIncidentId: isReliabilityIncidentId(data.related_incident_id) ? data.related_incident_id : null,
        events: (Array.isArray(data.events) ? data.events : []).filter(isObject).slice(0, 20).map((event) => ({
            kind: text(event.kind),
            fromStatus: text(event.from_status),
            toStatus: text(event.to_status),
            at: text(event.at),
            reason: text(event.reason),
        })),
        handoff: text(data.handoff),
    };
}

/**
 * One authorized read. Every outcome is a named state so the page never has
 * to guess from a missing field:
 *   ready            the caller may read this incident
 *   not_authorized   SQLSTATE 42501: the function answered "Not Authorized",
 *                    or the role has no EXECUTE on it
 *   function_missing the function is not installed (PGRST202 / 42883)
 *   not_found        an authorized caller and no such incident (SQL NULL)
 *   invalid_id       the id is not a uuid (22P02 if it ever reaches the cast)
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
        if (code === 'PGRST202' || code === '42883') return { state: 'function_missing', incident: null };
        if (code === '42501') return { state: 'not_authorized', incident: null };
        if (code === '22P02') return { state: 'invalid_id', incident: null };
        return { state: 'error', incident: null };
    }
    if (data === null || data === undefined) return { state: 'not_found', incident: null };
    const incident = normalizeReliabilityIncident(data);
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

// scope and labels are flat objects of string values.
export function reliabilityScopeEntries(scope) {
    if (!isObject(scope)) return [];
    return Object.keys(scope).sort().map((key) => [key, String(scope[key])]);
}

/**
 * A controller message split for display: its first line is the heading
 * ("AI AGENT NEEDED", "RELIABILITY CONTROLLER VALIDATION") shown beside the
 * time it was sent, and the rest is the body. The stored text is unchanged
 * and is still what Copy Agent Handoff falls back to.
 */
export function reliabilityMessageParts(content) {
    const value = typeof content === 'string' ? content : '';
    const lines = value.replace(/^\s*\n/, '').split('\n');
    const label = (lines[0] || '').trim().slice(0, 80) || 'AI AGENT NEEDED';
    const body = lines.slice(1).join('\n').replace(/^\n+/, '');
    return { label, body };
}
