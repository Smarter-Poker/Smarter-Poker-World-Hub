/**
 * POST /api/notifications/link-user -- RETIRED 2026-08-19.
 *
 * This route linked a Supabase user id to a OneSignal player id, because the
 * OneSignal JS SDK's login() call was unreliable. Both sides of that problem
 * are gone: there are no player ids, and identity is never asserted by the
 * client. POST /api/push/subscribe reads the user id from the verified JWT and
 * writes it onto the push_subscriptions row itself, which also closes the IDOR
 * hole a client-supplied user id would open.
 *
 * (The file is retained rather than deleted because the working-tree mount used
 * for this migration cannot unlink files. Safe to delete outright.)
 */
export default function handler(req, res) {
    return res.status(410).json({
        success: false,
        error: 'Retired. OneSignal was removed on 2026-08-19; identity is bound server-side at POST /api/push/subscribe.',
    });
}
