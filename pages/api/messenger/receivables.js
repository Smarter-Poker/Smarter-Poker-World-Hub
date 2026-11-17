import { createClient } from '../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cents = value => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 1e12 && Math.abs(value * 100 - Math.round(value * 100)) < 0.0001;
let client;
export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store');
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
    if (!applyRateLimit(req, res, LIMITS.read)) return;
    try {
        if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Service unavailable');
        client ||= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
        const { user } = await getServerUserWithFallback(req, client);
        if (!user) return res.status(401).json({ success: false, error: 'Sign in required' });
        const { action = 'list', clubId, periodEnd = null, payments, invoiceId } = req.body || {};
        let rpc, args;
        if (action === 'list') {
            if (!UUID.test(clubId || '') || (periodEnd !== null && (typeof periodEnd !== 'string' || !Number.isFinite(Date.parse(periodEnd)))))
                return res.status(400).json({ success: false, error: 'Invalid invoice request' });
            rpc = 'fn_messenger_receivables'; args = { p_user: user.id, p_club: clubId, p_period_end: periodEnd };
        } else if (action === 'status') {
            if (!UUID.test(invoiceId || '')) return res.status(400).json({ success: false, error: 'Invalid invoice' });
            rpc = 'fn_messenger_invoice_payment_status'; args = { p_user: user.id, p_invoice: invoiceId };
        } else if (action === 'record') {
            if (!Array.isArray(payments) || !payments.length || payments.length > 200 || payments.some(p => !p || !UUID.test(p.invoice_id || '') || !UUID.test(p.operation_id || '') || !cents(p.amount) || !cents(p.expected_remaining) || typeof p.reference !== 'string' || !p.reference.trim() || p.reference.length > 256))
                return res.status(400).json({ success: false, error: 'Enter a valid payment amount and reference' });
            rpc = 'fn_accounting_record_received_batch'; args = { p_user: user.id, p_items: payments };
        } else return res.status(400).json({ success: false, error: 'Unknown invoice action' });
        const { data, error } = await client.rpc(rpc, args);
        if (error) {
            const status = error.code === '42501' ? 403 : ['40001', '23505'].includes(error.code) ? 409 : error.code === '22023' ? 400 : 503;
            return res.status(status).json({ success: false, error: status === 503 ? 'Payment service unavailable. Keep this request and retry to check its outcome.' : error.message });
        }
        if (data?.success !== true) throw new Error('Invalid payment response');
        return res.status(200).json(data);
    } catch (e) {
        console.warn('[messenger/receivables]', e.message);
        return res.status(503).json({ success: false, error: 'Invoice service unavailable. Please retry.' });
    }
}
