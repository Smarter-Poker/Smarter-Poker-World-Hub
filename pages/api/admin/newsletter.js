/**
 * Backwards-compatible Newsletter Operations admin alias (`/api/admin/newsletter`).
 *
 * Delegates to the authoritative `/api/news/operations` handler while retaining
 * explicit `getServerUserWithFallback` + `['admin', 'superadmin', 'god']` role
 * verification on this path as well. Primary `/admin/newsletter` UI calls
 * `/api/news/operations` directly so `PATCH` subscriber toggles do not hit
 * `middleware.ts`'s `/api/admin/*` `mfa_session` cookie gate.
 */
import { createClient } from '../../../src/lib/supabaseServerClient.js';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth.js';
import operationsHandler from '../news/operations.js';

const ADMIN_ROLES = ['admin', 'superadmin', 'god'];

export default async function handler(req, res) {
    const supabase = createClient();
    const { user } = await getServerUserWithFallback(req, supabase);
    if (!user?.id) {
        return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    const { data: profile, error } = await supabase
        .from('profiles')
        .select('role, is_admin')
        .eq('id', user.id)
        .maybeSingle();
    if (error || !profile || (!profile.is_admin && !ADMIN_ROLES.includes(profile.role))) {
        return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    return operationsHandler(req, res);
}
