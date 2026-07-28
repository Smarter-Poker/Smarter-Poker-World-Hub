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
 *
 * CONTRACT: returns `true` only when the caller presented the correct secret,
 * `false` when it presented a wrong/absent one (call sites turn that into 401).
 * When CRON_SECRET itself is not configured this THROWS — callers surface that
 * as a 500, because a misconfiguration must never become an authorization
 * decision. Do NOT "simplify" the throw back into `return true`.
 */

export function validateCronAuth(req) {
    const cronSecret = process.env.CRON_SECRET;

    // SECURITY: a missing CRON_SECRET is a server misconfiguration, not an
    // authorization decision.
    //
    // This previously FAILED OPEN — `if (!cronSecret) return true` meant an
    // unset (or misspelled) CRON_SECRET silently disabled authentication on
    // every cron route in this repo and accepted any anonymous caller.
    //
    // We THROW rather than return a richer value on purpose: every call site
    // uses the `if (!validateCronAuth(req)) return 401` shape, so a throw still
    // fails CLOSED at any call site that was missed. Returning an object here
    // would make `!result` permanently false and authorize every caller.
    if (!cronSecret) {
        console.warn('[cron-auth] CRON_SECRET is not configured — rejecting cron request');
        throw new Error('Cron authentication is not configured');
    }

    // Check x-cron-secret header (external cron services like cron-job.org)
    if (req.headers['x-cron-secret'] === cronSecret) return true;

    // Check Authorization Bearer header (Vercel's built-in cron)
    if (req.headers['authorization'] === `Bearer ${cronSecret}`) return true;

    // Check query parameter fallback (some services only support URL params)
    if (req.query?.secret === cronSecret) return true;

    return false;
}
