/**
 * POST /api/notifications/import-users -- RETIRED 2026-08-19.
 *
 * This route bulk-imported Supabase profiles into OneSignal as external users.
 * OneSignal was removed and replaced with self-hosted VAPID Web Push, where
 * there is no external user directory to sync: a device becomes reachable the
 * moment it calls POST /api/push/subscribe, and the row is keyed to the
 * Supabase user id from the caller's verified JWT.
 *
 * There is nothing to import and nothing this route could usefully do, so it
 * answers 410 Gone rather than pretending to succeed.
 *
 * (The file is retained rather than deleted because the working-tree mount used
 * for this migration cannot unlink files. Safe to delete outright.)
 */
export default function handler(req, res) {
    return res.status(410).json({
        success: false,
        error: 'Retired. OneSignal was removed on 2026-08-19; push subscriptions now register through POST /api/push/subscribe.',
    });
}
