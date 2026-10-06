import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { validatePaidSkipReceipt } from '../../../src/lib/trivia/paidSkipPolicy.mjs';
import { serviceClient } from './tournament-lifecycle';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_FIELDS = new Set(['sessionId', 'questionId', 'clientNonce']);

function errorStatus(code) {
    switch (code) {
        case 'authentication_required': return 401;
        case 'not_your_session': return 403;
        case 'session_not_found': return 404;
        case 'insufficient_diamonds': return 402;
        case 'session_expired': return 410;
        case 'paid_skip_limit_reached':
        case 'run_miss_limit_reached':
        case 'ambiguous_paid_skip_debit':
        case 'position_out_of_order':
        case 'answer_already_recorded':
        case 'session_closed':
        case 'question_unavailable': return 409;
        case 'invalid_arguments':
        case 'question_not_in_session':
        case 'paid_skip_not_supported': return 400;
        default: return 500;
    }
}

export default async function handler(req, res) {
    try {
        if (req.method !== 'POST') {
            res.setHeader('Allow', 'POST');
            return res.status(405).json({ success: false, error: 'Method not allowed' });
        }
        if (!applyRateLimit(req, res, LIMITS.write)) return;

        const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
            ? req.body
            : null;
        if (!body || Buffer.byteLength(JSON.stringify(body), 'utf8') > 1024) {
            return res.status(400).json({ success: false, error: 'invalid_request' });
        }
        const unexpected = Object.keys(body).filter(key => !ALLOWED_FIELDS.has(key));
        if (unexpected.length > 0) {
            return res.status(400).json({ success: false, error: 'unexpected_field', fields: unexpected });
        }
        const { sessionId, questionId, clientNonce } = body;
        if (typeof sessionId !== 'string' || !UUID_RE.test(sessionId)) {
            return res.status(400).json({ success: false, error: 'invalid_session_id' });
        }
        if (typeof questionId !== 'string' || !UUID_RE.test(questionId)) {
            return res.status(400).json({ success: false, error: 'invalid_question_id' });
        }
        if (clientNonce != null && (typeof clientNonce !== 'string' || !UUID_RE.test(clientNonce))) {
            return res.status(400).json({ success: false, error: 'invalid_client_nonce' });
        }

        const sb = serviceClient();
        const { user, error: authError } = await getServerUserWithFallback(req, sb);
        if (authError || !user?.id) {
            return res.status(401).json({ success: false, error: 'authentication_required' });
        }

        const { data, error } = await sb.rpc('trivia_paid_skip_v1', {
            p_session_id: sessionId,
            p_user_id: user.id,
            p_question_id: questionId,
            p_client_nonce: clientNonce || null,
        });
        res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
        if (error) {
            console.warn('[trivia session-paid-skip] authority failed:', error.message || error);
            return res.status(500).json({ success: false, error: 'paid_skip_failed' });
        }
        if (!data || data.success !== true) {
            const code = data?.error || 'paid_skip_failed';
            return res.status(errorStatus(code)).json({
                success: false,
                error: code,
                ...(Number.isInteger(data?.paidSkipCount) ? { paidSkipCount: data.paidSkipCount } : {}),
                ...(Number.isInteger(data?.paidSkipLimit) ? { paidSkipLimit: data.paidSkipLimit } : {}),
                ...(Number.isInteger(data?.nonPaidMissCount) ? { nonPaidMissCount: data.nonPaidMissCount } : {}),
                ...(Number.isInteger(data?.terminalFailureCount) ? { terminalFailureCount: data.terminalFailureCount } : {}),
                ...(Number.isInteger(data?.missLimit) ? { missLimit: data.missLimit } : {}),
                ...(typeof data?.runMissLimitReached === 'boolean'
                    ? { runMissLimitReached: data.runMissLimitReached }
                    : {}),
                ...(Number.isInteger(data?.expectedPosition) && data.expectedPosition >= 1
                    ? { expectedPosition: data.expectedPosition }
                    : {}),
                ...(typeof data?.priorQuestionId === 'string' && UUID_RE.test(data.priorQuestionId)
                    ? { priorQuestionId: data.priorQuestionId }
                    : {}),
                ...(Number.isInteger(data?.newBalance) ? { newBalance: data.newBalance } : {}),
            });
        }
        const checked = validatePaidSkipReceipt(data, { sessionId, questionId });
        if (!checked.ok) {
            console.warn('[trivia session-paid-skip] invalid authority receipt:', checked.error);
            return res.status(502).json({ success: false, error: 'invalid_paid_skip_receipt' });
        }
        return res.status(200).json(checked.receipt);
    } catch (error) {
        console.warn('[trivia session-paid-skip] unexpected:', error?.message || error);
        try { reportApiError(error, req); } catch (_reportError) { /* noop */ }
        if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
        return undefined;
    }
}
