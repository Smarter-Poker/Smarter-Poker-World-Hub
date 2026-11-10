import React from 'react';
import Link from 'next/link';
import CopyAgentHandoffButton from './CopyAgentHandoffButton';
import { formatChicagoTime, reliabilityScopeEntries } from '../../lib/messenger/reliabilityIncident.mjs';

// Read-only view of one reliability incident. It renders what the authorized
// read returned and nothing else: every state other than "ready" carries no
// incident field at all.
const C = { bg: '#F0F2F5', card: '#FFFFFF', text: '#050505', textSec: '#65676B', border: '#DADDE1', blue: '#0084FF', red: '#B42318' };

const STATE_COPY = {
    loading: ['Loading Incident', 'Reading The Incident With Your Account.'],
    not_authorized: ['Not Authorized', 'This Incident Is Only Available To The Platform Alert Recipient. Nothing About It Is Shown To This Account.'],
    function_missing: ['Incident Details Are Not Available Yet', 'The Incident Reader Is Not Installed On The Server Yet. The Messenger Message Still Carries The Full Agent Handoff.'],
    not_found: ['Incident Not Found', 'No Incident Matches This Link.'],
    invalid_id: ['Incident Not Found', 'This Incident Link Is Not Valid.'],
    error: ['Could Not Load The Incident', 'The Request Did Not Complete. Nothing Was Changed.'],
};

const label = (value) => (value ? String(value).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'Not Recorded');
const number = (value) => (value === null ? 'Not Recorded' : value.toLocaleString('en-US'));
const button = {
    minHeight: 44, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    padding: '8px 14px', borderRadius: 10, border: `1px solid ${C.border}`, background: C.card, color: C.blue,
    fontSize: 14, fontWeight: 700, textDecoration: 'none', cursor: 'pointer', fontFamily: 'inherit',
};
const card = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginTop: 12, minWidth: 0 };
const heading = { fontSize: 16, fontWeight: 700, margin: '0 0 10px' };
const wrap = { overflowWrap: 'anywhere', wordBreak: 'break-word', minWidth: 0 };

function Field({ name, children }) {
    return <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 12px', padding: '8px 0', borderTop: `1px solid ${C.border}` }}>
        <dt style={{ flex: '0 0 150px', color: C.textSec, fontSize: 13 }}>{name}</dt>
        <dd style={{ flex: '1 1 180px', margin: 0, fontSize: 14, fontWeight: 600, ...wrap }}>{children}</dd>
    </div>;
}

export default function ReliabilityIncidentView({ state, incident, onRetry }) {
    const shell = (children) => <main data-testid="reliability-incident" data-state={state} style={{
        minHeight: '100vh', width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
        background: C.bg, color: C.text, padding: '16px 12px 88px', fontFamily: "'Segoe UI', system-ui, sans-serif",
    }}>
        <div style={{ maxWidth: 720, margin: '0 auto', minWidth: 0 }}>
            <Link href="/hub/messenger" style={button}>Back To Messenger</Link>
            {children}
        </div>
    </main>;

    if (state !== 'ready' || !incident) {
        const [title, detail] = STATE_COPY[state] || STATE_COPY.error;
        return shell(<section style={card} role={state === 'loading' ? 'status' : 'alert'}>
            <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>{title}</h1>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: C.textSec }}>{detail}</p>
            {state === 'error' && onRetry && <button type="button" onClick={onRetry} style={{ ...button, marginTop: 12 }}>Try Again</button>}
        </section>);
    }

    const scope = reliabilityScopeEntries(incident.scope);
    const labels = reliabilityScopeEntries(incident.labels);
    return shell(<>
        <section style={card}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.textSec, letterSpacing: '0.4px' }}>Reliability Incident · Read Only</div>
            <h1 style={{ fontSize: 20, lineHeight: 1.3, margin: '6px 0 10px', ...wrap }}>{incident.title || 'Untitled Incident'}</h1>
            <dl style={{ margin: 0 }}>
                <Field name="Incident ID"><span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13 }}>{incident.id}</span></Field>
                {incident.incidentClass && <Field name="Incident Class">{incident.incidentClass}</Field>}
                {incident.alertName && <Field name="Alert Name">{incident.alertName}</Field>}
                {incident.source && <Field name="Source">{incident.source}</Field>}
                {incident.environment && <Field name="Environment">{label(incident.environment)}</Field>}
                <Field name="Severity">{label(incident.severity)}</Field>
                <Field name="Status">{label(incident.status)}</Field>
                <Field name="Resolution State">{label(incident.resolutionState)}</Field>
                {incident.closureBasis && <Field name="Closure Basis">{label(incident.closureBasis)}</Field>}
                <Field name="First Observation">{formatChicagoTime(incident.firstObservedAt)}</Field>
                <Field name="Latest Observation">{formatChicagoTime(incident.latestObservedAt)}</Field>
                {incident.lastFiringAt && <Field name="Last Firing">{formatChicagoTime(incident.lastFiringAt)}</Field>}
                {incident.lastResolvedAt && <Field name="Last Resolved Signal">{formatChicagoTime(incident.lastResolvedAt)}</Field>}
                <Field name="Occurrence Count">{number(incident.occurrenceCount)}</Field>
                <Field name="Recurrence Count">{number(incident.recurrenceCount)}</Field>
                <Field name="Escalation State">{label(incident.escalationState)}</Field>
                <Field name="Escalation Reason">{incident.escalationReason || 'None Recorded'}</Field>
                {incident.engineRelease && <Field name="Engine Release">{incident.engineRelease}</Field>}
                {incident.relatedIncidentId && <Field name="Related Incident">
                    <Link href={`/hub/reliability/incidents/${incident.relatedIncidentId}`} style={{ color: C.blue, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13 }}>{incident.relatedIncidentId}</Link>
                </Field>}
            </dl>
            <p style={{ margin: '8px 0 0', fontSize: 12, color: C.textSec }}>Times Are Shown In America/Chicago.</p>
        </section>

        <section style={card}>
            <h2 style={heading}>Scope</h2>
            {scope.length === 0
                ? <p style={{ margin: 0, fontSize: 14, color: C.textSec }}>No Scope Was Recorded.</p>
                : <dl style={{ margin: 0 }}>{scope.map(([key, value]) => <Field key={key} name={key}>{value}</Field>)}</dl>}
        </section>

        {labels.length > 0 && <section style={card}>
            <h2 style={heading}>Labels</h2>
            <dl style={{ margin: 0 }}>{labels.map(([key, value]) => <Field key={key} name={key}>{value}</Field>)}</dl>
        </section>}

        <section style={card}>
            <h2 style={heading}>Recent Events</h2>
            {incident.events.length === 0
                ? <p style={{ margin: 0, fontSize: 14, color: C.textSec }}>No Events Were Recorded.</p>
                : <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                    {incident.events.map((event, index) => {
                        const detail = event.reason;
                        return <li key={index} style={{ padding: '8px 0', borderTop: `1px solid ${C.border}`, ...wrap }}>
                            <div style={{ fontSize: 14, fontWeight: 600 }}>
                                {[label(event.kind), [event.fromStatus, event.toStatus].filter(Boolean).map(label).join(' To ')].filter(Boolean).join(' · ')}
                            </div>
                            <div style={{ fontSize: 12, color: C.textSec }}>{formatChicagoTime(event.at)}</div>
                            {detail && <div style={{ fontSize: 12, marginTop: 4 }}>{detail}</div>}
                        </li>;
                    })}
                </ol>}
        </section>

        <section style={card}>
            <h2 style={heading}>Agent Handoff</h2>
            {incident.handoff
                ? <>
                    <pre data-testid="incident-handoff" style={{
                        margin: '0 0 12px', padding: 12, borderRadius: 8, background: C.bg, fontSize: 13, lineHeight: 1.5,
                        whiteSpace: 'pre-wrap', maxWidth: '100%', boxSizing: 'border-box', userSelect: 'text', WebkitUserSelect: 'text',
                        fontFamily: 'ui-monospace, Menlo, monospace', ...wrap,
                    }}>{incident.handoff}</pre>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        <CopyAgentHandoffButton getText={() => incident.handoff} style={button}
                            statusStyle={{ fontSize: 13, fontWeight: 600, color: C.red }} />
                    </div>
                </>
                : <p style={{ margin: 0, fontSize: 14, color: C.textSec }}>No Handoff Text Was Returned For This Incident.</p>}
        </section>
    </>);
}
