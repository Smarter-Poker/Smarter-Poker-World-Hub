// A Reliability Controller message in Messenger shows Open Incident and Copy
// Agent Handoff. These tests render the real MessageBubble and the real
// incident view, and drive the real reader and clipboard helper.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import * as reliability from '../src/lib/messenger/reliabilityIncident.mjs';
import * as accounting from '../src/lib/accountingMessage.mjs';
import * as messageMedia from '../src/lib/messenger/messageMedia.mjs';
import * as liveInvite from '../src/lib/messenger/liveInvite.mjs';
import * as callReceipt from '../src/lib/messenger/callReceipt.mjs';
import * as unionEco from '../src/lib/unionEco.mjs';

const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const ts = require('typescript');

const {
    RELIABILITY_PLATFORM_SENDER_ID: PLATFORM, reliabilityIncidentControls, readReliabilityIncident,
    readReliabilityIncidentOnce, resetReliabilityIncidentReads, reliabilityHandoffText, formatChicagoTime,
} = reliability;
const OTHER = 'bbbbbbbb-0000-4000-8000-000000000002';
const INCIDENT = 'a0000000-0000-4000-8000-00000000000a';
const BODY = `AI AGENT NEEDED\nIncident ID: ${INCIDENT}\nSeverity: CRITICAL\nTitle: Engine Tick Stalled`;
const theme = { card: '#fff', text: '#111', border: '#ccc', textSec: '#555', blue: '#07f', otherBubble: '#eee', ownBubble: '#07f', hoverBg: '#ddd', red: '#c00' };

const source = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
function compiled(path, load) {
    const code = ts.transpileModule(source(path), { fileName: 'component.jsx', compilerOptions: {
        jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2022,
    } }).outputText;
    const module = { exports: {} };
    new Function('require', 'module', 'exports', code)(load, module, module.exports);
    return module.exports;
}

const Anchor = ({ href, children, ...rest }) => React.createElement('a', { href, ...rest }, children);
const rpcCalls = [];
const supabase = { rpc: async (name, args) => { rpcCalls.push([name, args]); return { data: null, error: null }; } };
const clipboard = compiled('../src/lib/clipboard.js', require);
const copyButton = compiled('../src/components/reliability/CopyAgentHandoffButton.jsx',
    name => name === '../../lib/clipboard' ? clipboard : require(name));
const shared = (name) => ({
    'next/link': { __esModule: true, default: Anchor },
    '../../lib/supabase': { supabase },
    '../../lib/messenger/reliabilityIncident.mjs': reliability,
    '../reliability/CopyAgentHandoffButton': copyButton,
    './CopyAgentHandoffButton': copyButton,
})[name];
const controls = compiled('../src/components/messenger/ReliabilityIncidentControls.jsx', name => shared(name) || require(name));
const Nothing = () => null;
const MessageBubble = compiled('../src/components/messenger/MessageBubble.js', name => shared(name) || ({
    './ReliabilityIncidentControls': controls,
    './MediaViewer': { __esModule: true, default: Nothing, ATTACHMENT_ATTRIBUTE: 'data-attachment' },
    './MessengerTheme': { defaultTheme: theme },
    './Avatar': { Avatar: Nothing },
    './AccountingInvoiceCard': { __esModule: true, default: Nothing },
    './CashoutRequestActions': { __esModule: true, default: Nothing, formatChips: String },
    '../../lib/authUtils': { getAccessToken: () => null, authedFetch: async () => ({}) },
    '../../lib/accountingMessage.mjs': accounting,
    '../../lib/messenger/messageMedia.mjs': messageMedia,
    '../../lib/messenger/liveInvite.mjs': liveInvite,
    '../../lib/messenger/callReceipt.mjs': callReceipt,
    '../../lib/unionEco.mjs': unionEco,
})[name] || require(name)).MessageBubble;
const IncidentView = compiled('../src/components/reliability/ReliabilityIncidentView.jsx', name => shared(name) || require(name)).default;

function message(extra = {}) {
    return {
        id: '11111111-0000-4000-8000-000000000000', conversation_id: 'dddddddd-0000-4000-8000-000000000004',
        sender_id: PLATFORM, message_type: 'text', content: BODY, created_at: '2026-11-09T18:00:00Z',
        media_metadata: { kind: 'reliability_incident', incident_id: INCIDENT, notification_kind: 'escalation', handoff_version: 1 },
        ...extra,
    };
}
const bubble = (msg, isOwn = false) => renderToStaticMarkup(React.createElement(MessageBubble, {
    message: msg, isOwn, showAvatar: false, isLastInGroup: true, sender: { username: 'smarterpoker' }, currentUserId: OTHER, theme,
}));

test('the platform sender with the reliability kind gets both controls and the text unchanged', () => {
    const html = bubble(message());
    assert.match(html, /data-testid="reliability-incident-controls"/);
    assert.match(html, new RegExp(`<a[^>]*href="/hub/reliability/incidents/${INCIDENT}"[^>]*>Open Incident</a>`));
    assert.match(html, /<button[^>]*data-testid="copy-agent-handoff"[^>]*>Copy Agent Handoff<\/button>/);
    assert.match(html, /AI AGENT NEEDED/);
    assert.match(html, /Engine Tick Stalled/);
    // Nothing about the incident beyond its id is placed in the link.
    assert.doesNotMatch(html, /href="[^"]*(\?|severity|CRITICAL)/i);
});

test('a validation message with no incident id gets Copy Agent Handoff only', () => {
    const html = bubble(message({
        content: 'RELIABILITY CONTROLLER VALIDATION\nDelivery check.',
        media_metadata: { kind: 'reliability_incident', incident_id: null, notification_kind: 'validation', handoff_version: 1 },
    }));
    assert.match(html, /Copy Agent Handoff/);
    assert.doesNotMatch(html, /Open Incident/);
    assert.deepEqual(reliabilityIncidentControls(message({ media_metadata: { kind: 'reliability_incident', incident_id: 'not-a-uuid' } })),
        { incidentId: null, href: null });
});

test('a controller message keeps its line breaks and wraps; no other message changes', () => {
    const html = bubble(message());
    const block = html.match(/<div data-testid="reliability-incident-text" style="([^"]*)">([\s\S]*?)<\/div>/);
    assert.ok(block);
    assert.match(block[1], /white-space:pre-wrap/);
    assert.match(block[1], /overflow-wrap:anywhere/);
    assert.ok(block[2].includes(`AI AGENT NEEDED\nIncident ID: ${INCIDENT}\nSeverity: CRITICAL`));
    for (const other of [message({ sender_id: OTHER }), message({ media_metadata: null }), message({ media_metadata: { kind: 'bug_report' } })]) {
        const plain = bubble(other);
        assert.match(plain, /AI AGENT NEEDED/);
        assert.doesNotMatch(plain, /reliability-incident-text|pre-wrap/);
    }
});

test('forged metadata from any other sender renders no controls', () => {
    for (const forged of [
        message({ sender_id: OTHER }),
        message({ sender_id: OTHER, media_metadata: { ...message().media_metadata, sender_id: PLATFORM, platform: true } }),
        message({ sender_id: null }),
        message({ sender_id: undefined }),
        message({ sender_id: `${PLATFORM} ` }),
    ]) {
        assert.equal(reliabilityIncidentControls(forged), null);
        for (const own of [false, true]) {
            const html = bubble(forged, own);
            assert.match(html, /AI AGENT NEEDED/);
            assert.doesNotMatch(html, /Open Incident|Copy Agent Handoff|reliability-incident-controls|\/hub\/reliability\//);
        }
    }
});

test('the controls never come from the text or from another kind', () => {
    for (const msg of [
        message({ media_metadata: null }),
        message({ media_metadata: {} }),
        message({ media_metadata: { kind: 'bug_report', incident_id: INCIDENT } }),
        message({ media_metadata: 'reliability_incident' }),
        message({ media_metadata: [{ kind: 'reliability_incident' }] }),
        message({ is_deleted: true }),
    ]) {
        assert.equal(reliabilityIncidentControls(msg), null);
        assert.doesNotMatch(bubble(msg), /Open Incident|Copy Agent Handoff/);
    }
    // The kind and the sender are sufficient: the text is not consulted.
    assert.ok(reliabilityIncidentControls(message({ content: 'hello' })));
});

function fakeDom({ execResult = true } = {}) {
    const state = { appended: 0, removed: 0, copiedValue: null, range: null };
    const textarea = {
        value: '', style: {}, setAttribute() {}, focus() {}, select() {},
        setSelectionRange(start, end) { state.range = [start, end]; },
    };
    const document = {
        createElement: () => textarea,
        body: { appendChild() { state.appended += 1; }, removeChild() { state.removed += 1; } },
        execCommand(command) { if (command === 'copy' && execResult) state.copiedValue = textarea.value; return execResult; },
    };
    return { state, document };
}
async function withGlobals(globals, run) {
    const before = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    try { return await run(); } finally {
        for (const [key, descriptor] of Object.entries(before)) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
        }
    }
}

test('copy falls back to a selected textarea where navigator.clipboard is unavailable', async () => {
    const { safeCopyToClipboard } = clipboard;
    const absent = fakeDom();
    assert.equal(await withGlobals({ navigator: {}, document: absent.document }, () => safeCopyToClipboard(BODY)), true);
    assert.equal(absent.state.copiedValue, BODY);
    assert.deepEqual(absent.state.range, [0, BODY.length]); // iOS needs the explicit range
    assert.equal(absent.state.appended, 1);
    assert.equal(absent.state.removed, 1);

    const refused = fakeDom();
    const rejecting = { clipboard: { writeText: async () => { throw new Error('NotAllowedError'); } } };
    assert.equal(await withGlobals({ navigator: rejecting, document: refused.document }, () => safeCopyToClipboard(BODY)), true);
    assert.equal(refused.state.copiedValue, BODY);

    const written = [];
    const working = { clipboard: { writeText: async (value) => { written.push(value); } } };
    const unused = fakeDom();
    assert.equal(await withGlobals({ navigator: working, document: unused.document }, () => safeCopyToClipboard(BODY)), true);
    assert.deepEqual(written, [BODY]);
    assert.equal(unused.state.appended, 0);

    // Both paths exhausted is reported as a failure, never as copied.
    const dead = fakeDom({ execResult: false });
    assert.equal(await withGlobals({ navigator: {}, document: dead.document }, () => safeCopyToClipboard(BODY)), false);

    const button = source('../src/components/reliability/CopyAgentHandoffButton.jsx');
    assert.match(button, /await safeCopyToClipboard\(getText\(\)\)/);
    assert.match(button, /copied \? 'copied' : 'failed'/);
    assert.match(button, /Handoff Copied/);
    assert.match(button, /Copy Failed\./);
});

test('the copied text is the authorized handoff when there is one, else the message', () => {
    assert.equal(reliabilityHandoffText({ state: 'ready', incident: { handoff: 'Agent Handoff\nAlert name: X' } }, BODY), 'Agent Handoff\nAlert name: X');
    for (const result of [null, { state: 'ready', incident: { handoff: null } }, { state: 'not_authorized', incident: null },
        { state: 'function_missing', incident: null }, { state: 'error', incident: { handoff: 'stale' } }]) {
        assert.equal(reliabilityHandoffText(result, BODY), BODY);
    }
});

// The returned object of fn_reliability_incident_for_owner, key for key.
const RELATED = 'c0000000-0000-4000-8000-00000000000c';
const RPC_ROW = {
    incident_id: INCIDENT, incident_class: 'table_liveness', title: 'Engine Tick Stalled (table_liveness)',
    severity: 'critical', status: 'escalated', resolution_state: 'uncertain', closure_basis: null,
    source: 'alertmanager', alertname: 'EngineTickStalled', environment: 'production',
    scope: { table_id: 'T-42', instance: 'engine-1' },
    labels: { table_id: 'T-42', instance: 'engine-1', alertname: 'EngineTickStalled', severity: 'critical', component: 'dealer' },
    first_observed_at: '2026-11-09T18:00:00+00:00', last_observed_at: '2026-11-10T03:30:15+00:00',
    last_firing_at: '2026-11-10T03:30:15+00:00', last_resolved_at: null,
    first_inbox_event_id: 100, latest_inbox_event_id: 200, occurrence_count: 7, recurrence_count: 2,
    escalation_state: 'escalated', escalation_reason: 'no eligible recovery', engine_release: null,
    related_incident_id: RELATED,
    events: [
        { at: '2026-11-09T18:01:00+00:00', kind: 'status_change', from_status: 'investigating', to_status: 'escalated', reason: 'no enabled runbook' },
        { at: '2026-11-09T18:00:00+00:00', kind: 'opened', from_status: null, to_status: 'investigating', reason: null },
    ],
    handoff: 'AI AGENT NEEDED\nAgent Handoff\nAlert name: EngineTickStalled', handoff_version: 1,
};
const client = (answer) => {
    const calls = [];
    return { calls, rpc: async (name, args) => { calls.push([name, args]); if (answer instanceof Error) throw answer; return answer; } };
};
const view = (result) => renderToStaticMarkup(React.createElement(IncidentView, { ...result, onRetry() {} }));
const INCIDENT_DATA = /Engine Tick Stalled|EngineTickStalled|T-42|no eligible recovery|a0000000-|c0000000-/;

test('authorized: one call with the caller session, rendered read only in America/Chicago', async () => {
    const db = client({ data: RPC_ROW, error: null });
    const result = await readReliabilityIncident(db, INCIDENT);
    assert.deepEqual(db.calls, [['fn_reliability_incident_for_owner', { p_incident_id: INCIDENT }]]);
    assert.equal(result.state, 'ready');
    const html = view(result);
    for (const expected of ['Engine Tick Stalled (table_liveness)', INCIDENT, 'table_liveness', 'Critical', 'Escalated', 'Uncertain',
        'T-42', 'engine-1', 'dealer', 'Nov 9, 2026, 12:00:00 PM CST', 'Nov 9, 2026, 9:30:15 PM CST', '>7<', '>2<',
        'no eligible recovery', `href="/hub/reliability/incidents/${RELATED}"`,
        'Status Change · Investigating To Escalated', 'no enabled runbook', 'Opened · Investigating',
        'Alert name: EngineTickStalled', 'Copy Agent Handoff']) {
        assert.ok(html.includes(expected), `missing ${expected}`);
    }
    // Nullable fields that are null are left out instead of being invented.
    assert.doesNotMatch(html, /Closure Basis|Last Resolved Signal|Engine Release/);
    // An object that is not the contract's shape is not presented as an incident.
    assert.deepEqual(await readReliabilityIncident(client({ data: { incident: RPC_ROW }, error: null }), INCIDENT), { state: 'error', incident: null });
    assert.match(html, /data-state="ready"/);
    // Read only: the only actions are navigation back and copying.
    assert.deepEqual([...html.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map(m => m[1]), ['Copy Agent Handoff']);
    assert.doesNotMatch(html, /<(input|textarea|select|form)\b/);
    assert.equal(formatChicagoTime('2026-07-04T17:00:00Z'), 'Jul 4, 2026, 12:00:00 PM CDT');
    assert.equal(formatChicagoTime('nonsense'), 'Not Recorded');
});

test('not authorized is its own plain state and shows no incident data', async () => {
    // Raised by the function for a signed-in non-recipient, and by Postgres for a role with no EXECUTE.
    for (const message of ['Not Authorized', 'permission denied for function fn_reliability_incident_for_owner']) {
        assert.deepEqual(await readReliabilityIncident(client({ data: null, error: { code: '42501', message } }), INCIDENT),
            { state: 'not_authorized', incident: null });
    }
    const result = await readReliabilityIncident(client({ data: RPC_ROW, error: { code: '42501', message: 'Not Authorized' } }), INCIDENT);
    assert.deepEqual(result, { state: 'not_authorized', incident: null });
    const html = view(result);
    assert.match(html, /Not Authorized/);
    assert.doesNotMatch(html, INCIDENT_DATA);
    assert.doesNotMatch(html, /Copy Agent Handoff|Try Again/);
    // Even if a caller handed the view an incident, a non-ready state shows none of it.
    assert.doesNotMatch(view({ state: 'not_authorized', incident: reliability.normalizeReliabilityIncident(RPC_ROW) }), INCIDENT_DATA);
});

test('a missing function is distinct from a refusal', async () => {
    for (const error of [
        { code: 'PGRST202', message: 'Could not find the function public.fn_reliability_incident_for_owner(p_incident_id) in the schema cache' },
        { code: '42883', message: 'function public.fn_reliability_incident_for_owner(uuid) does not exist' },
    ]) {
        const result = await readReliabilityIncident(client({ data: null, error }), INCIDENT);
        assert.deepEqual(result, { state: 'function_missing', incident: null });
        const html = view(result);
        assert.match(html, /Incident Details Are Not Available Yet/);
        assert.doesNotMatch(html, /Not Authorized/);
        assert.doesNotMatch(html, INCIDENT_DATA);
    }
});

test('not found, an invalid id and a failed request are each stated plainly', async () => {
    // An authorized caller and no such incident is SQL NULL.
    const missing = await readReliabilityIncident(client({ data: null, error: null }), INCIDENT);
    assert.deepEqual(missing, { state: 'not_found', incident: null });
    assert.match(view(missing), /Incident Not Found/);
    assert.deepEqual(await readReliabilityIncident(client({ data: null, error: { code: '22P02', message: 'invalid input syntax for type uuid' } }), INCIDENT),
        { state: 'invalid_id', incident: null });
    const untouched = client({ data: RPC_ROW, error: null });
    assert.deepEqual(await readReliabilityIncident(untouched, 'not-a-uuid'), { state: 'invalid_id', incident: null });
    assert.deepEqual(await readReliabilityIncident(untouched, undefined), { state: 'invalid_id', incident: null });
    assert.equal(untouched.calls.length, 0);
    assert.match(view({ state: 'invalid_id', incident: null }), /This Incident Link Is Not Valid/);

    for (const answer of [{ data: null, error: { code: '57014', message: 'statement timeout' } }, new Error('Failed to fetch')]) {
        const result = await readReliabilityIncident(client(answer), INCIDENT);
        assert.deepEqual(result, { state: 'error', incident: null });
        const html = view(result);
        assert.match(html, /Could Not Load The Incident/);
        assert.match(html, /Try Again/);
        assert.doesNotMatch(html, /Not Authorized|Not Found/);
    }
});

test('the Messenger read is shared per incident and a refusal is asked once', async () => {
    resetReliabilityIncidentReads();
    const ok = client({ data: RPC_ROW, error: null });
    const [first, second] = await Promise.all([readReliabilityIncidentOnce(ok, INCIDENT), readReliabilityIncidentOnce(ok, INCIDENT.toUpperCase())]);
    assert.equal(first, second);
    assert.equal(ok.calls.length, 1);

    resetReliabilityIncidentReads();
    const missing = client({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
    assert.equal((await readReliabilityIncidentOnce(missing, INCIDENT)).state, 'function_missing');
    assert.equal((await readReliabilityIncidentOnce(missing, 'c0000000-0000-4000-8000-00000000000c')).state, 'function_missing');
    assert.equal(missing.calls.length, 1);

    resetReliabilityIncidentReads();
    const flaky = client({ data: null, error: { code: '57014', message: 'timeout' } });
    await readReliabilityIncidentOnce(flaky, INCIDENT);
    await readReliabilityIncidentOnce(flaky, INCIDENT);
    assert.equal(flaky.calls.length, 2); // a transient failure is not kept
    resetReliabilityIncidentReads();
});

test('the page reads with the browser session only and names itself before anything else', () => {
    const page = source('../pages/hub/reliability/incidents/[id].js');
    assert.match(page, /import \{ supabase \} from '..\/..\/..\/..\/src\/lib\/supabase'/);
    assert.match(page, /useRequireAuth\(/);
    assert.match(page, /readReliabilityIncident\(supabase, incidentId\)/);
    assert.match(page, /<SEOHead[\s\S]*?noindex[\s\S]*?\/>\s*<ReliabilityIncidentBody \/>/);
    const reachable = [page, source('../src/lib/messenger/reliabilityIncident.mjs'),
        source('../src/components/reliability/ReliabilityIncidentView.jsx'),
        source('../src/components/messenger/ReliabilityIncidentControls.jsx'),
        source('../src/components/reliability/CopyAgentHandoffButton.jsx')].join('\n');
    assert.doesNotMatch(reachable, /SERVICE_ROLE|service_role|supabaseAdmin|\/api\/|fetch\(/);
    assert.equal(fs.existsSync(new URL('../pages/api/reliability', import.meta.url)), false);

    const bubbleSource = source('../src/components/messenger/MessageBubble.js');
    assert.match(bubbleSource, /const controls = reliabilityIncidentControls\(message\);\s*if \(!controls\) return null;/);
    assert.equal(bubbleSource.match(/<ReliabilityIncidentControls/g).length, 1);

    // Product copy in the new surfaces carries no em dash.
    assert.doesNotMatch(reachable, /—/);
});
