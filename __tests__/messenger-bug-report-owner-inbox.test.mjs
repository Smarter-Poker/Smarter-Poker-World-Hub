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

function fixtureTables({ lastReadAt = '2026-11-09T10:30:00Z' } = {}) {
    return {
        bug_report_routing: [{ id: true, recipient_user_id: OWNER, sender_user_id: SENDER, conversation_id: CONVERSATION }],
        bug_report_deliveries: [
            { id: 'r1', source_table: 'live_help_tickets', reference: 'BUG-11111111', status: 'delivered', recipient_user_id: OWNER, conversation_id: CONVERSATION, message_id: '11111111-0000-4000-8000-000000000000', delivered_at: '2026-11-09T10:00:00Z' },
            { id: 'r2', source_table: 'user_feedback', reference: 'CA-22222222', status: 'delivered', recipient_user_id: OWNER, conversation_id: CONVERSATION, message_id: '22222222-0000-4000-8000-000000000000', delivered_at: '2026-11-09T11:00:00Z' },
            { id: 'r3', source_table: 'live_help_tickets', reference: null, status: 'failed', recipient_user_id: null, conversation_id: null, message_id: null, delivered_at: null },
        ],
        social_messages: [
            message('11111111-0000-4000-8000-000000000000', '2026-11-09T10:00:00Z', 'Older Report'),
            message('22222222-0000-4000-8000-000000000000', '2026-11-09T11:00:00Z', 'Newer Report'),
        ],
        social_conversation_participants: [
            { conversation_id: CONVERSATION, user_id: OWNER, last_read_at: lastReadAt },
            { conversation_id: CONVERSATION, user_id: SENDER, last_read_at: null },
        ],
    };
}

// Minimal PostgREST-shaped reader. Records every table it is asked for.
function fakeDb(tables, { errors = {} } = {}) {
    const touched = [];
    return {
        touched,
        from(table) {
            touched.push(table);
            let rows = [...(tables[table] || [])];
            const builder = {
                select() { return builder; },
                eq(column, value) { rows = rows.filter(row => row[column] === value); return builder; },
                in(column, values) { rows = rows.filter(row => values.includes(row[column])); return builder; },
                order() { return builder; },
                limit() { return builder; },
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

function handlerFor(db, sessionUserId) {
    return createBugReportInboxHandler({
        getDb: () => db,
        // Identity is the session only. The request's own claims are ignored.
        getUser: async () => ({ user: sessionUserId ? { id: sessionUserId } : null }),
    });
}

test('the configured recipient receives reports newest first with unread state', async () => {
    const { status, body, headers } = await call(handlerFor(fakeDb(fixtureTables()), OWNER), {});
    assert.equal(status, 200);
    assert.equal(body.owner, true);
    assert.equal(body.conversationId, CONVERSATION);
    assert.deepEqual(body.reports.map(report => [report.id, report.unread]), [['r2', true], ['r1', false]]);
    assert.equal(body.unreadCount, 1);
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

test('read state is the conversation read marker, so it survives a reload', async () => {
    const unread = await getBugReportInbox(fakeDb(fixtureTables({ lastReadAt: null })), OWNER);
    assert.equal(unread.unreadCount, 2);
    const read = await getBugReportInbox(fakeDb(fixtureTables({ lastReadAt: '2026-11-09T11:00:00Z' })), OWNER);
    assert.equal(read.unreadCount, 0);
    assert.ok(read.reports.every(report => report.unread === false));
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

test('before the routing table exists every account keeps the normal form', async () => {
    const db = fakeDb({}, { errors: { bug_report_routing: { code: 'PGRST205', message: "Could not find the table 'public.bug_report_routing' in the schema cache" } } });
    assert.deepEqual(await getBugReportInbox(db, OWNER), { owner: false });
});

test('an unreadable inbox is reported as unavailable, never as empty', async () => {
    const db = fakeDb(fixtureTables(), { errors: { bug_report_deliveries: { code: '57014', message: 'canceling statement due to statement timeout' } } });
    const { status, body } = await call(handlerFor(db, OWNER), {});
    assert.equal(status, 503);
    assert.equal(body.success, false);
    assert.equal(body.reports, undefined);
    const routingDown = fakeDb(fixtureTables(), { errors: { bug_report_routing: { code: '57014', message: 'timeout' } } });
    assert.equal((await call(handlerFor(routingDown, PLAYER), {})).status, 503);
});

test('a report whose message is deleted or outside the recipient conversations is not shown', async () => {
    const tables = fixtureTables();
    tables.social_messages[0].is_deleted = true;
    tables.social_conversation_participants = tables.social_conversation_participants.filter(row => row.user_id !== OWNER);
    const inbox = await getBugReportInbox(fakeDb(tables), OWNER);
    assert.equal(inbox.owner, true);
    assert.deepEqual(inbox.reports, []);
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
        assert.doesNotMatch(source, uuid, `${name} must not hard-code an account id`);
        assert.doesNotMatch(source, /@[a-z0-9.-]+\.(com|poker)/i, `${name} must not hard-code an account email`);
    }
    assert.match(route, /getServerUserWithFallback\(req, db\)/);
    assert.match(route, /src\/lib\/supabaseServerClient/);
    assert.doesNotMatch(route + reader, /req\.(query|body)\??\.\s*(userId|user_id|recipient)/);
    assert.match(reader, /routing\.recipient_user_id !== userId/);
    // Non-recipients get the unchanged submission form.
    assert.match(widget, /if \(!isOwner\) \{\s*return <ReportBugWidget contextPath=\{contextPath\} theme=\{theme\} \/>;/);
    assert.match(widget, /\/api\/messenger\/mark-read/);
    assert.match(page, /<BugReportInboxWidget contextPath="\/hub\/messenger"/);
});
