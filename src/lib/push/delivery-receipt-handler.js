/**
 * Handler for POST /api/push/delivery-receipt, kept free of the shared
 * Supabase package so it can be unit tested under plain node --test
 * (__tests__/push-delivery-receipt-route.test.mjs). The route file wires the
 * real client and rate limiter.
 */
import { hashReceiptToken, RECEIPT_TOKEN, UUID } from './device-receipt.js';

const STAGES = new Set(['received', 'displayed']);

export function createDeliveryReceiptHandler({ getClient, rateLimit }) {
    return async function handler(req, res) {
        if (req.method !== 'POST') {
            res.setHeader('Allow', 'POST');
            return res.status(405).json({ error: 'Method not allowed' });
        }
        // Same reasoning as /api/push/receipt: session-less, so it buckets by IP,
        // and carrier CGNAT puts many devices behind one address.
        if (!rateLimit(req, res, { max: 1000, windowMs: 60_000, scope: 'push-delivery-receipt' })) return;

        res.setHeader('Cache-Control', 'no-store');
        let body = req.body;
        if (typeof body === 'string') {
            try { body = JSON.parse(body); } catch { body = null; }
        }
        const id = body?.id;
        const token = body?.token;
        const stage = body?.stage;
        if (typeof id !== 'string' || !UUID.test(id) || typeof token !== 'string' || !RECEIPT_TOKEN.test(token)
            || typeof stage !== 'string' || !STAGES.has(stage)) {
            return res.status(400).json({ error: 'invalid_receipt' });
        }

        let data;
        try {
            const out = await getClient().rpc('fn_record_push_receipt', {
                p_outbox_id: id.toLowerCase(),
                p_token_sha256: hashReceiptToken(token),
                p_stage: stage,
            });
            if (out.error) throw new Error(out.error.message);
            data = out.data;
        } catch (error) {
            console.warn('[Push Delivery Receipt] Recording failed:', error?.message || error);
            return res.status(503).json({ error: 'receipt_unavailable' });
        }

        if (data?.ok === true && (data.result === 'recorded' || data.result === 'duplicate')) {
            return res.status(200).json({ ok: true, result: data.result, stage: data.stage });
        }
        if (data?.result === 'invalid') return res.status(400).json({ error: 'invalid_receipt' });
        // not_found, or anything unexpected: one indistinguishable answer.
        return res.status(404).json({ error: 'not_found' });
    };
}
