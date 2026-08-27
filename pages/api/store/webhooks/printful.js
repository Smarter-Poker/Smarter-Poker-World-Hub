import { timingSafeEqual } from 'node:crypto';
import { createClient } from '../../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../../src/lib/sentryWrap';
const { restoreUuidFromExternalId } = require('../../../../src/lib/store/printfulFulfillment');

export const config = {
    api: { bodyParser: { sizeLimit: '256kb' } },
};

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
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

function webhookSecret(req) {
    const header = req.headers['x-smarter-poker-webhook-secret'];
    const query = Array.isArray(req.query.secret) ? req.query.secret[0] : req.query.secret;
    return typeof header === 'string' ? header : query;
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
        if (!expectedSecret) {
            console.warn('[printful-webhook] secret is not configured');
            return res.status(503).json({ success: false, error: 'Webhook not configured' });
        }
        if (!safeEqual(webhookSecret(req), expectedSecret)) {
            return res.status(401).json({ success: false, error: 'Invalid webhook secret' });
        }

        const body = req.body && typeof req.body === 'object' ? req.body : {};
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
            'order_failed',
            'order_canceled',
            'package_returned',
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

        if (type === 'package_shipped') {
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
                needs_refund: type === 'order_canceled' || type === 'package_returned',
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
