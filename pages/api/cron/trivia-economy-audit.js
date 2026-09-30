import { requireAdminSecret } from '../../../src/lib/trivia/adminAuth';
import { withCronHealth } from '../../../src/lib/cronHealth';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { serviceClient } from '../trivia/tournament-lifecycle';

export const config = { maxDuration: 60 };

async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') {
        res.setHeader('Allow', 'GET, POST');
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    if (!requireAdminSecret(req, res, { label: 'trivia-economy-audit' })) return;

    try {
        const client = serviceClient();
        const { data, error } = await client.rpc('run_trivia_economy_audit_v1');
        if (error) throw new Error(error.message || String(error));
        if (!data || data.success === false) {
            throw new Error(data?.error || 'audit_failed');
        }
        // Trivia Phase 2: the balanced Trivia journal has its own health check
        // (every journal balances, account balances match their lines, every
        // wallet leg matches its platform diamond row, zero terminal escrow,
        // zero unexplained settlement variance, treasury floor, settlement SLO,
        // idempotency conflicts). It runs in the same audit so one alert covers
        // both. A ledger check that cannot be read counts as unhealthy.
        const ledgerRead = await client.rpc('trivia_ledger_health_v1');
        const ledger = !ledgerRead.error && ledgerRead.data && ledgerRead.data.success === true
            ? ledgerRead.data
            : { success: false, healthy: false, error: 'ledger_health_unavailable' };
        const economyHealthy = data.healthy === true;
        const ledgerHealthy = ledger.healthy === true;
        const healthy = economyHealthy && ledgerHealthy;
        if (!economyHealthy) {
            console.error('[trivia-economy-audit] ECONOMY EXCEPTIONS:', data.findings);
            try {
                reportApiError(new Error(`Trivia economy exceptions: ${data.exception_count}`), {
                    route: '/api/cron/trivia-economy-audit',
                    findings: data.findings
                });
            } catch (_) {}
        }
        if (!ledgerHealthy) {
            console.error('[trivia-economy-audit] LEDGER EXCEPTIONS:', ledger.findings || ledger.error);
            try {
                reportApiError(new Error(`Trivia ledger exceptions: ${ledger.exception_count ?? 'unreadable'}`), {
                    route: '/api/cron/trivia-economy-audit',
                    findings: ledger.findings || { error: ledger.error }
                });
            } catch (_) {}
        }
        return res.status(healthy ? 200 : 503).json({
            ...data,
            healthy,
            economy_healthy: economyHealthy,
            ledger,
        });
    } catch (error) {
        console.error('[trivia-economy-audit] fatal:', error);
        try { reportApiError(error, req); } catch (_) {}
        return res.status(500).json({ success: false, healthy: false, error: 'internal_error' });
    }
}

export default withCronHealth('trivia-economy-audit', handler);
