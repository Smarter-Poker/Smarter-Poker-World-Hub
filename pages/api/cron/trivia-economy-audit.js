import { requireAdminSecret } from '../../../src/lib/trivia/adminAuth';
import { withCronHealth } from '../../../src/lib/cronHealth';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { serviceClient } from '../trivia/tournament-lifecycle';

export const config = { maxDuration: 60 };

async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') {
        res.setHeader('Allow', 'GET, POST');
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    if (!requireAdminSecret(req, res, { label: 'trivia-economy-audit' })) return;

    try {
        const { data, error } = await serviceClient().rpc('run_trivia_economy_audit_v1');
        if (error) throw new Error(error.message || String(error));
        if (!data || data.success === false) {
            throw new Error(data?.error || 'audit_failed');
        }
        if (data.healthy !== true) {
            console.error('[trivia-economy-audit] ECONOMY EXCEPTIONS:', data.findings);
            try {
                reportApiError(new Error(`Trivia economy exceptions: ${data.exception_count}`), {
                    route: '/api/cron/trivia-economy-audit',
                    findings: data.findings
                });
            } catch (_) {}
        }
        return res.status(data.healthy === true ? 200 : 503).json(data);
    } catch (error) {
        console.error('[trivia-economy-audit] fatal:', error);
        try { reportApiError(error, req); } catch (_) {}
        return res.status(500).json({ success: false, healthy: false, error: 'internal_error' });
    }
}

export default withCronHealth('trivia-economy-audit', handler);
