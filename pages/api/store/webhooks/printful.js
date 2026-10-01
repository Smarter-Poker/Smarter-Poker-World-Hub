import { createHmac, timingSafeEqual } from 'node:crypto';
import { createClient } from '../../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../../src/lib/apiErrorHandler';
const { restoreUuidFromExternalId } = require('../../../../src/lib/store/printfulFulfillment');

export const config = {
    api: { bodyParser: false },
};

const MAX_WEBHOOK_BYTES = 256 * 1024;

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

function safeEqual(actual, expected) {
    if (typeof actual !== 'string' || typeof expected !== 'string') return false;
    const actualBuffer = Buffer.from(actual);
    const expectedBuffer = Buffer.from(expected);
    return actualBuffer.length === expectedBuffer.length
        && timingSafeEqual(actualBuffer, expectedBuffer);
}

async function readRawBody(req) {
    const chunks = [];
    let received = 0;
    for await (const chunk of req) {
        received += chunk.length;
        if (received > MAX_WEBHOOK_BYTES) {
            const error = new Error('Printful webhook payload too large');
            error.code = 'PAYLOAD_TOO_LARGE';
            throw error;
        }
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

function verifyPrintfulSignature(req, rawBody, secretHex, expectedPublicKey) {
    const signature = req.headers['x-pf-webhook-signature'];
    const publicKey = req.headers['x-pf-webhook-public-key'];
    if (
        typeof signature !== 'string'
        || !/^[0-9a-f]{64}$/i.test(signature)
        || typeof publicKey !== 'string'
        || !safeEqual(publicKey, expectedPublicKey)
        || typeof secretHex !== 'string'
        || !/^(?:[0-9a-f]{2})+$/i.test(secretHex)
    ) return false;
    const expected = createHmac('sha256', Buffer.from(secretHex, 'hex'))
        .update(rawBody)
        .digest('hex');
    return safeEqual(signature.toLowerCase(), expected);
}

function clean(value, maxLength = 255) {
    if (value === null || value === undefined) return null;
    const text = String(value).trim();
    return text ? text.slice(0, maxLength) : null;
}

function orderFromEvent(body) {
    return body?.data?.order || body?.order || null;
}

export default async function handler(req, res) {
    try {
        if (req.method !== 'POST') {
            res.setHeader('Allow', 'POST');
            return res.status(405).json({ success: false, error: 'Method not allowed' });
        }

        const expectedSecret = process.env.PRINTFUL_WEBHOOK_SECRET;
        const expectedPublicKey = process.env.PRINTFUL_WEBHOOK_PUBLIC_KEY;
        if (!expectedSecret || !expectedPublicKey) {
            console.warn('[printful-webhook] signed webhook keys are not configured');
            return res.status(503).json({ success: false, error: 'Webhook not configured' });
        }
        let rawBody;
        try {
            rawBody = await readRawBody(req);
        } catch (error) {
            if (error?.code === 'PAYLOAD_TOO_LARGE') {
                return res.status(413).json({ success: false, error: 'Payload too large' });
            }
            throw error;
        }
        if (!verifyPrintfulSignature(req, rawBody, expectedSecret, expectedPublicKey)) {
            return res.status(401).json({ success: false, error: 'Invalid webhook signature' });
        }
        let body;
        try {
            body = JSON.parse(rawBody.toString('utf8'));
        } catch (_) {
            return res.status(400).json({ success: false, error: 'Invalid JSON' });
        }
        const expectedStoreId = clean(process.env.PRINTFUL_STORE_ID, 64);
        const observedStoreId = clean(
            body.store
            ?? body.store_id
            ?? body?.data?.store
            ?? orderFromEvent(body)?.store,
            64,
        );
        if (expectedStoreId && observedStoreId !== expectedStoreId) {
            return res.status(403).json({ success: false, error: 'Unexpected store' });
        }

        const type = clean(body.type, 80);
        const providerOrder = orderFromEvent(body);
        const orderId = restoreUuidFromExternalId(providerOrder?.external_id);
        if (!type || !orderId) {
            return res.status(202).json({ success: true, ignored: true });
        }

        const actionable = new Set([
            'package_shipped',
            'shipment_sent',
            'order_failed',
            'order_canceled',
            'package_returned',
            'shipment_returned',
        ]);
        if (!actionable.has(type)) {
            return res.status(202).json({ success: true, ignored: true });
        }

        const { data: order, error: readError } = await getSupabase()
            .from('merchandise_orders')
            .select('id, status, metadata')
            .eq('id', orderId)
            .maybeSingle();
        if (readError) throw readError;
        if (!order) return res.status(202).json({ success: true, ignored: true });

        const existingMetadata = order.metadata && typeof order.metadata === 'object'
            ? order.metadata
            : {};
        const now = new Date().toISOString();
        const shipment = body?.data?.shipment || body?.shipment || {};
        const update = {
            updated_at: now,
            metadata: {
                ...existingMetadata,
                fulfillment_provider: 'printful',
                fulfillment_event: type,
                fulfillment_event_at: now,
                printful_order_id: clean(providerOrder?.id, 80) || existingMetadata.printful_order_id || null,
            },
        };

        if (type === 'package_shipped' || type === 'shipment_sent') {
            update.status = 'shipped';
            const trackingNumber = clean(shipment.tracking_number, 160);
            const trackingUrl = clean(shipment.tracking_url, 500);
            const carrier = clean(shipment.carrier, 120);
            if (trackingNumber) update.tracking_number = trackingNumber;
            if (trackingUrl) update.tracking_url = trackingUrl;
            if (carrier) update.carrier = carrier;
            const existingShipments = Array.isArray(existingMetadata.shipments)
                ? existingMetadata.shipments.slice(-19)
                : [];
            const shipmentEntry = {
                tracking_number: trackingNumber,
                tracking_url: trackingUrl,
                carrier,
                shipped_at: clean(shipment.shipped_at, 80) || now,
            };
            const shipmentKey = trackingNumber || trackingUrl;
            const shipments = shipmentKey && !existingShipments.some(entry => (
                entry?.tracking_number === trackingNumber
                || (trackingUrl && entry?.tracking_url === trackingUrl)
            ))
                ? [...existingShipments, shipmentEntry]
                : existingShipments;
            update.metadata = {
                ...update.metadata,
                fulfillment_status: 'shipped',
                needs_review: false,
                shipped_at: shipmentEntry.shipped_at,
                shipments,
            };
        } else {
            // A provider failure is not a customer refund. Keep the order paid
            // and make the required refund/recovery action explicit.
            update.status = ['shipped', 'delivered', 'completed'].includes(order.status)
                ? order.status
                : 'paid';
            update.metadata = {
                ...update.metadata,
                fulfillment_status: type,
                needs_review: true,
                needs_refund: ['order_canceled', 'package_returned', 'shipment_returned'].includes(type),
                reason: `printful_${type}`,
                flagged_at: now,
            };
        }

        const { data: updated, error: updateError } = await getSupabase()
            .from('merchandise_orders')
            .update(update)
            .eq('id', orderId)
            .select('id');
        if (updateError || !updated?.length) {
            throw updateError || new Error('Printful webhook update matched zero orders');
        }

        return res.status(200).json({ success: true });
    } catch (error) {
        try { reportApiError(error, req); } catch (_) { /* best effort */ }
        console.warn('[printful-webhook] handler failed:', error?.message || error);
        if (!res.headersSent) return res.status(500).json({ success: false, error: 'Webhook handler failed' });
    }
}

export { readRawBody, verifyPrintfulSignature };
