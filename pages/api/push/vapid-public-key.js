/**
 * GET /api/push/vapid-public-key
 *
 * Returns the VAPID application server key the browser needs to call
 * pushManager.subscribe(). Public by design -- this key is meant to be handed
 * to every visitor. The PRIVATE key never leaves the server.
 *
 * 503 when VAPID is not configured, so push-client.js can show an honest error
 * instead of a spinner that never resolves.
 */
import { vapidConfig } from '../../../src/lib/push/web-push';

export default function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { publicKey } = vapidConfig();
    if (!publicKey) {
        return res.status(503).json({
            error: 'Push notifications are not configured on this deployment',
            code: 'vapid_not_configured',
        });
    }

    // Safe to cache: this key is immutable for the life of the deployment and
    // rotating it would invalidate every subscription anyway.
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
    return res.status(200).json({ key: publicKey });
}
