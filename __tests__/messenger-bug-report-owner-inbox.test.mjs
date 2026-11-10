// The Messenger "Report A Bug" widget shows incoming reports to the one
// configured recipient and to nobody else. These tests drive the real route
// handler and inbox reader against an in-memory database.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    createBugReportInboxHandler,
    getBugReportInbox,
    parseBugReportContent,
} from '../src/lib/bugReportInbox.mjs';

const OWNER = 'aaaaaaaa-0000-4000-8000-000000000001';
const PLAYER = 'bbbbbbbb-0000-4000-8000-000000000002';
const SENDER = 'cccccccc-0000-4000-8000-000000000003';
const CONVERSATION = 'dddddddd-0000-4000-8000-000000000004';
const REPORT_A = 'a0000000-0000-4000-8000-00000000000a'; // older
const REPORT_B = 'b0000000-0000-4000-8000-00000000000b'; // newer
const MESSAGE_A = '11111111-0000-4000-8000-000000000000';
const MESSAGE_B = '22222222-0000-4000-8000-000000000000';

function message(id, createdAt, subject) {
    return {
        id, conversation_id: CONVERSATION, sender_id: SENDER, created_at: createdAt, is_deleted: false,
        content: [
            'Bug Report [HIGH]', `Subject: ${subject}`, `Reference: BUG-${id.slice(0, 8).toUpperCase()}`,
            'Reporter: Fixture Reporter (@fixture)', 'Priority: High', 'Page: /hub/messenger',
            'Reported: 2026-11-09 04:11 Central', '', 'The Table Froze\nAfter The Flop', '',
            'Open Ticket Queue: https://smarter.poker/horses?tab=players',
            `Record: live_help_tickets ${id}`, 'Reporter Profile: https://smarter.poker/hub/user/fixture',
        ].join('\n'),
    };
}

function fixtureTables({ read = [] } = {}) {
    return {
        bug_report_routing: [{ id: true, recipient_user_id: OWNER, sender_user_id: SENDER, conversation_id: CONVERSATION }],
        bug_report_deliveries: [
            { id: REPORT_A, source_table: 'live_help_tickets', reference: 'BUG-11111111', status: 'delivered', recipient_user_id: OWNER, conversation_id: CONVERSATION, message_id: MESSAGE_A, delivered_at: '2026-11-09T10:00:00Z' },
            { id: REPORT_B, source_table: 'user_feedback', reference: 'CA-22222222', status: 'delivered', recipient_user_id: OWNER, conversation_id: CONVERSATION, message_id: MESSAGE_B, delivered_at: '2026-11-09T11:00:00Z' },
            { id: 'f0000000-0000-4000-8000-00000000000f', source_table: 'live_help_tickets', reference: null, status: 'failed', recipient_user_id: null, conversation_id: null, message_id: null, delivered_at: null },
        ],
        social_messages: [
            message(MESSAGE_A, '2026-11-09T10:00:00Z', 'Older Report'),
            message(MESSAGE_B, '2026-11-09T11:00:00Z', 'Newer Report'),
        ],
        social_message_reads: read.map(messageId => ({ message_id: messageId, user_id: OWNER })),
    };
}

// Minimal PostgREST-shaped reader. Records every table it is asked for.
function fakeDb(tables, { errors = {} } = {}) {
    const touched = [];
    const writes = [];
    return {
        touched, writes,
        from(table) {
            touched.push(table);
            let rows = [...(tables[table] || [])];
            const builder = {
                select() { return builder; },
                eq(column, value) { rows = rows.filter(row => row[column] === value); return builder; },
                in(column, values) { rows = rows.filter(row => values.includes(row[column])); return builder; },
                order() { return builder; },
                limit() { return builder; },
                upsert(values, options) {
                    assert.equal(table, 'social_message_reads', 'the only table this route writes');
                    assert.deepEqual(options, { onConflict: 'message_id,user_id', ignoreDuplicates: true });
                    if (errors[table]) return Promise.resolve({ error: errors[table] });
                    for (const value of values) {
                        writes.push(value);
                        if (!tables[table].some(row => row.message_id === value.message_id && row.user_id === value.user_id)) tables[table].push(value);
                    }
                    return Promise.resolve({ error: null });
                },
                maybeSingle() { return Promise.resolve(errors[table] ? { data: null, error: errors[table] } : { data: rows[0] || null, error: null }); },
                then(resolve, reject) {
                    return Promise.resolve(errors[table] ? { data: null, error: errors[table] } : { data: rows, error: null }).then(resolve, reject);
                },
            };
            return builder;
        },
    };
}

function call(handler, req) {
    return new Promise((resolve, reject) => {
        const res = {
            statusCode: 200, headers: {}, headersSent: false,
            setHeader(name, value) { this.headers[name] = value; },
            status(code) { this.statusCode = code; return this; },
            json(body) { this.headersSent = true; resolve({ status: this.statusCode, body, headers: this.headers }); return this; },
        };
        Promise.resolve(handler({ method: 'POST', headers: {}, body: {}, query: {}, ...req }, res)).catch(reject);
    });
}

function handlerFor(db, sessionUserId, reported = []) {
    return createBugReportInboxHandler({
        getDb: () => db,
        report: error => reported.push(error),
        // Identity is the session only. The request's own claims are ignored.
        getUser: async () => ({ user: sessionUserId ? { id: sessionUserId } : null }),
    });
}

test('the configured recipient receives reports newest first with unread state', async () => {
    const db = fakeDb(fixtureTables());
    const { status, body, headers } = await call(handlerFor(db, OWNER), {});
    assert.equal(status, 200);
    assert.equal(body.owner, true);
    assert.deepEqual(db.writes, [], 'listing never changes read state');
    assert.equal(body.conversationId, CONVERSATION);
    assert.deepEqual(body.reports.map(report => [report.id, report.unread]), [[REPORT_B, true], [REPORT_A, true]]);
    assert.equal(body.unreadCount, 2);
    assert.equal(headers['Cache-Control'], 'private, no-store');
    const newest = body.reports[0];
    assert.equal(newest.subject, 'Newer Report');
    assert.equal(newest.source, 'Club Arena');
    assert.equal(newest.reference, 'CA-22222222');
    assert.equal(newest.reporter, 'Fixture Reporter (@fixture)');
    assert.equal(newest.priority, 'High');
    assert.equal(newest.page, '/hub/messenger');
    assert.equal(newest.description, 'The Table Froze\nAfter The Flop');
    assert.equal(newest.queueUrl, 'https://smarter.poker/horses?tab=players');
    assert.equal(newest.profileUrl, 'https://smarter.poker/hub/user/fixture');
});

test('opening one report marks only that report read, and the state survives a reload', async () => {
    const tables = fixtureTables();
    const db = fakeDb(tables);
    const opened = await call(handlerFor(db, OWNER), { body: { action: 'read', reportId: REPORT_B } });
    assert.equal(opened.status, 200);
    assert.deepEqual(db.writes.map(write => [write.message_id, write.user_id]), [[MESSAGE_B, OWNER]]);
    assert.deepEqual(opened.body.reports.map(report => [report.id, report.unread]), [[REPORT_B, false], [REPORT_A, true]],
        'the older unopened report stays unread');
    assert.equal(opened.body.unreadCount, 1);
    // A reload is a fresh handler and a fresh list request over the same stored rows.
    const reloaded = await call(handlerFor(fakeDb(tables), OWNER), {});
    assert.deepEqual(reloaded.body.reports.map(report => [report.id, report.unread]), [[REPORT_B, false], [REPORT_A, true]]);
    assert.equal(reloaded.body.unreadCount, 1);
});

test('mark all read is explicit and clears every report', async () => {
    const tables = fixtureTables({ read: [MESSAGE_B] });
    const db = fakeDb(tables);
    const { status, body } = await call(handlerFor(db, OWNER), { body: { action: 'read_all' } });
    assert.equal(status, 200);
    assert.equal(body.unreadCount, 0);
    assert.equal((await getBugReportInbox(fakeDb(tables), OWNER)).unreadCount, 0);
});

test('a report read in the Messenger conversation is read in the widget', async () => {
    // The conversation mark-read route writes the same social_message_reads rows.
    const inbox = await getBugReportInbox(fakeDb(fixtureTables({ read: [MESSAGE_A] })), OWNER);
    assert.deepEqual(inbox.reports.map(report => [report.id, report.unread]), [[REPORT_B, true], [REPORT_A, false]]);
});

test('a non-recipient cannot mark anything read', async () => {
    for (const body of [{ action: 'read', reportId: REPORT_A }, { action: 'read_all' }]) {
        const db = fakeDb(fixtureTables());
        const { status, body: answer } = await call(handlerFor(db, PLAYER), { body });
        assert.equal(status, 403);
        assert.equal(answer.reports, undefined);
        assert.deepEqual(db.writes, []);
        assert.deepEqual(db.touched, ['bug_report_routing']);
    }
});

test('a read action must name one of the recipient reports', async () => {
    const db = fakeDb(fixtureTables());
    assert.equal((await call(handlerFor(db, OWNER), { body: { action: 'read', reportId: 'not-an-id' } })).status, 400);
    assert.equal((await call(handlerFor(db, OWNER), { body: { action: 'read', reportId: OWNER } })).status, 404);
    assert.equal((await call(handlerFor(db, OWNER), { body: { action: 'delete' } })).status, 400);
    assert.deepEqual(db.writes, []);
});

test('a signed-in account that is not the recipient receives no report data', async () => {
    const db = fakeDb(fixtureTables());
    const { status, body } = await call(handlerFor(db, PLAYER), {
        // A caller cannot name the recipient to borrow the inbox.
        body: { userId: OWNER, recipient_user_id: OWNER }, query: { userId: OWNER },
    });
    assert.equal(status, 200);
    assert.deepEqual(body, { success: true, owner: false });
    assert.deepEqual(db.touched, ['bug_report_routing'], 'no report, message or read-state table is read for a non-recipient');
});

test('a request with no valid session is refused before any table is read', async () => {
    const db = fakeDb(fixtureTables());
    const { status, body } = await call(handlerFor(db, null), { body: { userId: OWNER } });
    assert.equal(status, 401);
    assert.equal(body.success, false);
    assert.equal(body.reports, undefined);
    assert.deepEqual(db.touched, []);
});

test('only POST is served', async () => {
    const { status } = await call(handlerFor(fakeDb(fixtureTables()), OWNER), { method: 'GET' });
    assert.equal(status, 405);
});

test('a failed read is an error that is reported, never a not-the-recipient answer', async () => {
    const failures = {
        'missing routing table': { bug_report_routing: { code: 'PGRST205', message: "Could not find the table 'public.bug_report_routing' in the schema cache" } },
        'routing timeout': { bug_report_routing: { code: '57014', message: 'canceling statement due to statement timeout' } },
        'deliveries unreadable': { bug_report_deliveries: { code: '42501', message: 'permission denied' } },
        'messages unreadable': { social_messages: { code: '57014', message: 'timeout' } },
        'read state unreadable': { social_message_reads: { code: '57014', message: 'timeout' } },
    };
    for (const [name, errors] of Object.entries(failures)) {
        // Routing failures hit every caller; the rest only the recipient.
        for (const caller of errors.bug_report_routing ? [OWNER, PLAYER] : [OWNER]) {
            const reported = [];
            const { status, body } = await call(handlerFor(fakeDb(fixtureTables(), { errors }), caller, reported), {});
            assert.equal(status, 503, name);
            assert.equal(body.success, false, name);
            assert.equal(body.owner, undefined, `${name}: must not answer owner:false`);
            assert.equal(body.reports, undefined, name);
            assert.equal(reported.length, 1, `${name}: reported once`);
        }
    }
});

test('a routing table with no configured recipient is an error, not a non-recipient', async () => {
    const tables = fixtureTables();
    tables.bug_report_routing = [];
    const reported = [];
    const { status, body } = await call(handlerFor(fakeDb(tables), PLAYER, reported), {});
    assert.equal(status, 503);
    assert.equal(body.owner, undefined);
    assert.equal(reported.length, 1);
});

test('a failed read-state write is reported and leaves the report unread', async () => {
    const tables = fixtureTables();
    const reported = [];
    const db = fakeDb(tables, { errors: { social_message_reads: { code: '57014', message: 'timeout' } } });
    const { status } = await call(handlerFor(db, OWNER, reported), { body: { action: 'read', reportId: REPORT_B } });
    assert.equal(status, 503);
    assert.equal(reported.length, 1);
    assert.equal((await getBugReportInbox(fakeDb(tables), OWNER)).unreadCount, 2);
});

test('a report whose message is deleted is not shown', async () => {
    const tables = fixtureTables();
    tables.social_messages[0].is_deleted = true;
    const inbox = await getBugReportInbox(fakeDb(tables), OWNER);
    assert.deepEqual(inbox.reports.map(report => report.id), [REPORT_B]);
    assert.equal(inbox.unreadCount, 1);
});

test('unrecognised message text is kept whole as the description', () => {
    const parsed = parseBugReportContent('Something Unexpected\n\nFree Text: With A Colon\nSecond Line');
    assert.equal(parsed.kind, 'Something Unexpected');
    assert.equal(parsed.subject, 'No Subject');
    assert.equal(parsed.description, 'Free Text: With A Colon\nSecond Line');
});

test('the route and widget hold no account id and take identity from the session', () => {
    const route = fs.readFileSync(new URL('../pages/api/messenger/bug-reports.js', import.meta.url), 'utf8');
    const reader = fs.readFileSync(new URL('../src/lib/bugReportInbox.mjs', import.meta.url), 'utf8');
    const widget = fs.readFileSync(new URL('../src/components/messenger/BugReportInboxWidget.jsx', import.meta.url), 'utf8');
    const page = fs.readFileSync(new URL('../pages/hub/messenger.js', import.meta.url), 'utf8');
    const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    for (const [name, source] of [['route', route], ['reader', reader], ['widget', widget]]) {
        assert.doesNotMatch(source.replace(/\[0-9a-f\]\{8\}-.*?\{12\}/g, ''), uuid, `${name} must not hard-code an account id`);
        assert.doesNotMatch(source, /@[a-z0-9.-]+\.(com|poker)/i, `${name} must not hard-code an account email`);
    }
    assert.match(route, /getServerUserWithFallback\(req, db\)/);
    assert.match(route, /src\/lib\/supabaseServerClient/);
    assert.doesNotMatch(route + reader, /req\.(query|body)\??\.\s*(userId|user_id|recipient)/);
    assert.match(reader, /data\.recipient_user_id === userId \? data : null/);
    // Non-recipients get the unchanged submission form.
    assert.match(widget, /\}\s*return <ReportBugWidget contextPath=\{contextPath\} theme=\{theme\} \/>;\s*\}/);
    // A failure is shown as unavailable only to an account the server already
    // confirmed as the recipient; it is never mistaken for "not the recipient".
    assert.match(widget, /if \(loadError && knownRecipient\) \{/);
    assert.match(widget, /Bug Inbox Unavailable/);
    assert.match(widget, /Retry Bug Inbox/);
    assert.match(widget, /if \(!response\.ok \|\| !data\?\.success\) \{[^}]*setLoadError\(true\);\s*return;/);
    assert.match(widget, /request\(\{ action: 'read', reportId: report\.id \}\)/);
    assert.match(widget, /request\(\{ action: 'read_all' \}\)/);
    assert.doesNotMatch(widget, /mark-read/, 'the widget never marks the whole conversation read');
    assert.match(page, /<BugReportInboxWidget contextPath="\/hub\/messenger"/);
});
