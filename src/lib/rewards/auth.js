/**
 * Shared JWT authentication for reward endpoints.
 * All reward endpoints grant diamonds — auth is mandatory.
 * 
 * Usage:
 *   import { requireAuth } from '../../../src/lib/rewards/auth';
 *   const userId = await requireAuth(req, res, supabase);
 *   if (!userId) return; // already sent 401
 */

export async function requireAuth(req, res, supabase) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
        res.status(401).json({ error: 'Auth required' });
        return null;
    }
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
        res.status(401).json({ error: 'Invalid token' });
        return null;
    }
    return user.id;
}
