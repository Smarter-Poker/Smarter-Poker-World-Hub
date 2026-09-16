import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';

const ALLOWED_EVENTS = new Set([
    'catalog_load',
    'library_sync',
    'reels_boundary',
    'watch_progress_flush',
]);

export default function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    if (!applyRateLimit(req, res, LIMITS.write)) return;
    if (Number(req.headers['content-length'] || 0) > 8_000) {
        return res.status(413).json({ success: false, error: 'Request body too large' });
    }

    const event = String(req.body?.event || '').trim();
    if (!ALLOWED_EVENTS.has(event)) {
        return res.status(400).json({ success: false, error: 'Invalid telemetry event' });
    }

    const message = String(req.body?.message || 'Video Library client failure').trim().slice(0, 500);
    const error = new Error(`[video-library:${event}] ${message}`);
    error.name = 'VideoLibraryClientError';
    try {
        reportApiError(error, req);
    } catch (reportError) {
        console.warn('[video-library/client-error] telemetry forwarding failed:', reportError?.message || reportError);
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.status(202).json({ success: true });
}
