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
// Read state is the conversation's own read marker
// (social_conversation_participants.last_read_at), the same marker the
// Messenger inbox counts with, so the widget badge and the conversation list
// can never disagree and the state survives a refresh.

import { selectInBatches } from './inBatches.mjs';

const MAX_REPORTS = 100;
const NOT_INSTALLED_CODES = new Set(['PGRST205', '42P01']);
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
    constructor(step, cause) {
        super(`Bug Report Inbox Unavailable (${step})`);
        this.name = 'BugReportInboxError';
        this.step = step;
        this.status = 503;
        this.code = cause?.code || null;
    }
}

function isNotInstalled(error) {
    if (!error) return false;
    if (NOT_INSTALLED_CODES.has(String(error.code || ''))) return true;
    return /bug_report_routing/.test(String(error.message || ''))
        && /(does not exist|could not find the table)/i.test(String(error.message || ''));
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

async function readRouting(db) {
    const { data, error } = await db
        .from('bug_report_routing')
        .select('recipient_user_id, conversation_id')
        .eq('id', true)
        .maybeSingle();
    if (error) {
        if (isNotInstalled(error)) return null;
        throw new BugReportInboxError('routing', error);
    }
    return data || null;
}

/**
 * @returns {{ owner: false } | { owner: true, conversationId: string|null,
 *   unreadCount: number, reports: object[] }}
 */
export async function getBugReportInbox(db, userId) {
    if (!userId) return { owner: false };
    const routing = await readRouting(db);
    if (!routing || routing.recipient_user_id !== userId) return { owner: false };

    const { data: deliveries, error: deliveryError } = await db
        .from('bug_report_deliveries')
        .select('id, source_table, reference, conversation_id, message_id, delivered_at')
        .eq('status', 'delivered')
        .eq('recipient_user_id', userId)
        .order('delivered_at', { ascending: false })
        .limit(MAX_REPORTS);
    if (deliveryError) throw new BugReportInboxError('deliveries', deliveryError);

    const rows = (deliveries || []).filter(row => row.message_id && row.conversation_id);
    if (!rows.length) {
        return { owner: true, conversationId: routing.conversation_id || null, unreadCount: 0, reports: [] };
    }

    const conversationIds = [...new Set(rows.map(row => row.conversation_id))];
    const [messagesResult, participantsResult] = await Promise.all([
        selectInBatches(rows.map(row => row.message_id), batch => db.from('social_messages')
            .select('id, conversation_id, content, created_at, is_deleted')
            .in('id', batch)),
        selectInBatches(conversationIds, batch => db.from('social_conversation_participants')
            .select('conversation_id, last_read_at')
            .eq('user_id', userId)
            .in('conversation_id', batch)),
    ]);
    if (messagesResult.error) throw new BugReportInboxError('messages', messagesResult.error);
    if (participantsResult.error) throw new BugReportInboxError('read-state', participantsResult.error);

    const messages = new Map((messagesResult.data || []).map(message => [message.id, message]));
    // A conversation the recipient is no longer in is not readable by them.
    const readThrough = new Map((participantsResult.data || [])
        .map(row => [row.conversation_id, row.last_read_at ? Date.parse(row.last_read_at) : null]));

    const reports = [];
    for (const row of rows) {
        const message = messages.get(row.message_id);
        if (!message || message.is_deleted || message.conversation_id !== row.conversation_id) continue;
        if (!readThrough.has(row.conversation_id)) continue;
        const marker = readThrough.get(row.conversation_id);
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
            unread: marker === null || Date.parse(message.created_at) > marker,
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

// The route, with its collaborators injected so the focused test drives the
// real handler: identity comes only from the verified token, never from the
// query string or body.
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
            const inbox = await getBugReportInbox(db, user.id);
            if (!inbox.owner) return res.status(200).json({ success: true, owner: false });
            return res.status(200).json({ success: true, ...inbox });
        } catch (error) {
            try { report?.(error, req); } catch (_reportError) { /* reporting never masks the response */ }
            console.warn('[bug-reports] Inbox read failed:', error?.step || error?.message || error);
            if (res.headersSent) return undefined;
            return res.status(error?.status === 503 ? 503 : 500)
                .json({ success: false, error: 'Bug Reports Are Temporarily Unavailable' });
        }
    };
}
