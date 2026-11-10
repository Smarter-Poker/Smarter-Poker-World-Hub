// Owner inbox for the Messenger "Report A Bug" widget.
//
// Every bug report is delivered once, in the database, to one configured
// recipient (public.bug_report_routing) as a Messenger message with a receipt
// in public.bug_report_deliveries. This module reads that inbox for the
// configured recipient and for nobody else.
//
// Access rule: the recipient is whoever the routing row names. It is resolved
// here, on the server, with the service identity, and compared with the
// caller's verified JWT subject. No account id lives in the client, and a
// caller that is not the recipient receives no report data at all.
//
// Read state is per report: a report is unread until public.social_message_reads
// holds a row for its message and the recipient. Opening one report writes
// that one row, so older unopened reports stay unread, and the state lives in
// the database, so it survives a refresh. Reading the report conversation in
// Messenger writes the same rows through its own route.
//
// "Not the recipient" and "could not tell" are different answers. owner:false
// is returned only after the routing row was read successfully and names
// someone else. Every failed read, a missing table included, is an error.

import { selectInBatches } from './inBatches.mjs';

const MAX_REPORTS = 100;
const HEADER_FIELDS = {
    'Subject': 'subject',
    'Reference': 'reference',
    'Reporter': 'reporter',
    'Priority': 'priority',
    'Page': 'page',
    'Reported': 'reportedLabel',
};
const FOOTER_FIELDS = {
    'Open Ticket Queue': 'queueUrl',
    'Record': null,
    'Reporter Profile': 'profileUrl',
};

export class BugReportInboxError extends Error {
    constructor(step, cause, status = 503) {
        super(`Bug Report Inbox Unavailable (${step}${cause?.code ? `, ${cause.code}` : ''})`);
        this.name = 'BugReportInboxError';
        this.step = step;
        this.status = status;
        this.code = cause?.code || null;
    }
}

function splitField(line) {
    const at = line.indexOf(': ');
    if (at <= 0) return null;
    return [line.slice(0, at), line.slice(at + 2).trim()];
}

// The routed message is plain text written by fn_route_bug_report_to_owner:
// a kind line, labelled header lines, a blank line, the reporter's words,
// a blank line and labelled footer lines. Anything unrecognised stays in
// the description so nothing the reporter wrote is ever dropped.
export function parseBugReportContent(content) {
    const text = String(content || '').replace(/\r\n/g, '\n');
    const lines = text.split('\n');
    const parsed = {
        kind: 'Bug Report', subject: '', reference: '', reporter: '', priority: '',
        page: '', reportedLabel: '', description: '', queueUrl: '', profileUrl: '',
    };
    let index = 0;
    const first = (lines[0] || '').trim();
    if (first && !splitField(first)) {
        parsed.kind = first.replace(/\s*\[[^\]]*\]\s*$/, '') || 'Bug Report';
        index = 1;
    }
    for (; index < lines.length; index++) {
        const field = splitField(lines[index]);
        if (!field || !(field[0] in HEADER_FIELDS)) break;
        parsed[HEADER_FIELDS[field[0]]] = field[1];
    }
    let end = lines.length;
    while (end > index) {
        const line = lines[end - 1];
        if (!line.trim()) { end--; continue; }
        const field = splitField(line);
        if (!field || !(field[0] in FOOTER_FIELDS)) break;
        const key = FOOTER_FIELDS[field[0]];
        if (key && /^https:\/\/smarter\.poker\//.test(field[1])) parsed[key] = field[1];
        end--;
    }
    parsed.description = lines.slice(index, end).join('\n').trim();
    if (!parsed.subject) parsed.subject = 'No Subject';
    if (parsed.priority === 'Not Provided') parsed.priority = '';
    if (parsed.page === 'Not Provided') parsed.page = '';
    return parsed;
}

// Resolves whether the caller is the configured recipient. Throws when that
// cannot be established; never answers "not the recipient" on a failed read.
async function readRouting(db, userId) {
    const { data, error } = await db
        .from('bug_report_routing')
        .select('recipient_user_id, conversation_id')
        .eq('id', true)
        .maybeSingle();
    if (error) throw new BugReportInboxError('routing', error);
    if (!data?.recipient_user_id) throw new BugReportInboxError('routing-not-configured');
    return data.recipient_user_id === userId ? data : null;
}

async function readDeliveries(db, userId) {
    const { data, error } = await db
        .from('bug_report_deliveries')
        .select('id, source_table, reference, conversation_id, message_id, delivered_at')
        .eq('status', 'delivered')
        .eq('recipient_user_id', userId)
        .order('delivered_at', { ascending: false })
        .limit(MAX_REPORTS);
    if (error) throw new BugReportInboxError('deliveries', error);
    return (data || []).filter(row => row.message_id && row.conversation_id);
}

async function readMessageIdsRead(db, userId, messageIds) {
    const { data, error } = await selectInBatches(messageIds, batch => db.from('social_message_reads')
        .select('message_id')
        .eq('user_id', userId)
        .in('message_id', batch));
    if (error) throw new BugReportInboxError('read-state', error);
    return new Set(data.map(row => row.message_id));
}

/**
 * @returns {{ owner: false } | { owner: true, conversationId: string|null,
 *   unreadCount: number, reports: object[] }}
 */
export async function getBugReportInbox(db, userId) {
    const routing = await readRouting(db, userId);
    if (!routing) return { owner: false };

    const rows = await readDeliveries(db, userId);
    if (!rows.length) {
        return { owner: true, conversationId: routing.conversation_id || null, unreadCount: 0, reports: [] };
    }

    const messageIds = rows.map(row => row.message_id);
    const [messagesResult, readIds] = await Promise.all([
        selectInBatches(messageIds, batch => db.from('social_messages')
            .select('id, conversation_id, content, created_at, is_deleted')
            .in('id', batch)),
        readMessageIdsRead(db, userId, messageIds),
    ]);
    if (messagesResult.error) throw new BugReportInboxError('messages', messagesResult.error);
    const messages = new Map(messagesResult.data.map(message => [message.id, message]));

    const reports = [];
    for (const row of rows) {
        const message = messages.get(row.message_id);
        if (!message || message.is_deleted || message.conversation_id !== row.conversation_id) continue;
        const parsed = parseBugReportContent(message.content);
        reports.push({
            id: row.id,
            messageId: message.id,
            conversationId: row.conversation_id,
            source: row.source_table === 'user_feedback' ? 'Club Arena' : 'Smarter.Poker',
            reference: row.reference || parsed.reference,
            kind: parsed.kind,
            subject: parsed.subject,
            reporter: parsed.reporter,
            priority: parsed.priority,
            page: parsed.page,
            description: parsed.description,
            queueUrl: parsed.queueUrl,
            profileUrl: parsed.profileUrl,
            reportedAt: message.created_at,
            unread: !readIds.has(message.id),
        });
    }
    reports.sort((a, b) => String(b.reportedAt).localeCompare(String(a.reportedAt)));
    return {
        owner: true,
        conversationId: routing.conversation_id || reports[0]?.conversationId || null,
        unreadCount: reports.filter(report => report.unread).length,
        reports,
    };
}

/**
 * Marks one report (reportId) or every delivered report (reportId null) read
 * for the recipient. Only the recipient's own delivered reports can be marked.
 * @returns {{ owner: false } | { owner: true, marked: number }}
 */
export async function markBugReportsRead(db, userId, reportId = null) {
    const routing = await readRouting(db, userId);
    if (!routing) return { owner: false };
    let rows = await readDeliveries(db, userId);
    if (reportId !== null) {
        rows = rows.filter(row => row.id === reportId);
        if (!rows.length) throw new BugReportInboxError('report-not-found', null, 404);
    }
    if (!rows.length) return { owner: true, marked: 0 };
    const readAt = new Date().toISOString();
    const { error } = await db.from('social_message_reads').upsert(
        rows.map(row => ({ message_id: row.message_id, user_id: userId, read_at: readAt })),
        { onConflict: 'message_id,user_id', ignoreDuplicates: true },
    );
    if (error) throw new BugReportInboxError('mark-read', error);
    return { owner: true, marked: rows.length };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The route, with its collaborators injected so the focused test drives the
// real handler: identity comes only from the verified token, never from the
// query string or body. The body may name an action and a report, nothing else.
export function createBugReportInboxHandler({ getDb, getUser, rateLimit, report }) {
    return async function handler(req, res) {
        try {
            if (req.method !== 'POST') {
                return res.status(405).json({ success: false, error: 'Method Not Allowed' });
            }
            if (rateLimit && !rateLimit(req, res)) return undefined;
            const db = getDb();
            const { user } = await getUser(req, db);
            if (!user?.id) return res.status(401).json({ success: false, error: 'Auth Required' });
            res.setHeader?.('Cache-Control', 'private, no-store');
            const action = req.body?.action || 'list';
            if (action === 'read' || action === 'read_all') {
                const reportId = action === 'read' ? req.body?.reportId : null;
                if (action === 'read' && (typeof reportId !== 'string' || !UUID.test(reportId))) {
                    return res.status(400).json({ success: false, error: 'A Report Is Required' });
                }
                const marked = await markBugReportsRead(db, user.id, reportId);
                if (!marked.owner) return res.status(403).json({ success: false, error: 'Not Available' });
            } else if (action !== 'list') {
                return res.status(400).json({ success: false, error: 'Unknown Action' });
            }
            const inbox = await getBugReportInbox(db, user.id);
            if (!inbox.owner) return res.status(200).json({ success: true, owner: false });
            return res.status(200).json({ success: true, ...inbox });
        } catch (error) {
            if (error?.status === 404) {
                return res.status(404).json({ success: false, error: 'Report Not Found' });
            }
            // A broken inbox is an incident, never a quiet "not the recipient".
            try { report?.(error, req); } catch (_reportError) { /* reporting never masks the response */ }
            console.warn('[bug-reports] Inbox request failed:', error?.message || error);
            if (res.headersSent) return undefined;
            return res.status(error?.status === 503 ? 503 : 500)
                .json({ success: false, error: 'Bug Inbox Unavailable' });
        }
    };
}
