/**
 * 🔒 Cron Authentication Helper
 * Validates requests from external cron services (cron-job.org) and Vercel's built-in cron.
 *
 * Usage:
 *   import { validateCronAuth } from '../utils/cron-auth';
 *
 *   export default async function handler(req, res) {
 *     if (!validateCronAuth(req)) {
 *       return res.status(401).json({ error: 'Unauthorized' });
 *     }
 *     // ... handler logic
 *   }
 */

export function validateCronAuth(req) {
    const cronSecret = process.env.CRON_SECRET;

    // If no CRON_SECRET is configured, allow all requests (backwards compatible)
    if (!cronSecret) return true;

    // Check x-cron-secret header (external cron services like cron-job.org)
    if (req.headers['x-cron-secret'] === cronSecret) return true;

    // Check Authorization Bearer header (Vercel's built-in cron)
    if (req.headers['authorization'] === `Bearer ${cronSecret}`) return true;

    // Check query parameter fallback (some services only support URL params)
    if (req.query?.secret === cronSecret) return true;

    return false;
}
