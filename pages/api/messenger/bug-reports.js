/**
 * BUG REPORT OWNER INBOX API
 *
 * POST, bearer token required. Returns the routed bug reports and their
 * unread state to the one account public.bug_report_routing names as the
 * recipient. Every other signed-in account receives { owner: false } and no
 * report data; a request with no valid session receives 401.
 *
 * The caller's id is the verified JWT subject. Nothing in the query string
 * or body can select whose inbox is read. Marking a report read goes through
 * the existing /api/messenger/mark-read route and its participant check.
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { createBugReportInboxHandler } from '../../../src/lib/bugReportInbox.mjs';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
        _supabase = createClient(url, key);
    }
    return _supabase;
}

export default createBugReportInboxHandler({
    getDb: getSupabase,
    getUser: (req, db) => getServerUserWithFallback(req, db),
    rateLimit: (req, res) => applyRateLimit(req, res, LIMITS.read),
    report: reportApiError,
});
