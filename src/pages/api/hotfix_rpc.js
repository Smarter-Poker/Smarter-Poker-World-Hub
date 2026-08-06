/**
 * NEUTERED 2026-08-06 — this file used to carry live DDL for the money path.
 * ═══════════════════════════════════════════════════════════════════════════
 * It contained a `CREATE OR REPLACE FUNCTION add_diamonds_to_balance(...)
 * SECURITY DEFINER` with NO accompanying REVOKE. Postgres grants EXECUTE to
 * PUBLIC by default, so had it ever run it would have recreated the
 * unlimited-mint hole that migration 20260726120000 was written to close: a
 * balance-mutating SECURITY DEFINER function callable by `anon` and
 * `authenticated` straight from the browser.
 *
 * It has never been reachable — Next.js ignores `src/pages/` when a root
 * `pages/` directory exists, and this repo has one. So it was a dormant
 * landmine, one directory rename away from becoming a live endpoint that
 * re-opens the hole. Nothing imports it (verified by grep across the repo).
 *
 * The body is gone rather than the file because the GitHub MCP used to push
 * from this environment has no delete operation. From a normal checkout,
 * `git rm src/pages/api/hotfix_rpc.js src/pages/api/patch-db.js` finishes the
 * job.
 *
 * Schema changes belong in supabase/migrations/ and are applied via the
 * Supabase MCP `apply_migration`, never over an HTTP endpoint.
 * See .agent/workflows/migration-safety.md.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export default function handler(req, res) {
    return res.status(410).json({
        error: 'Gone. Schema changes belong in supabase/migrations/, not an HTTP endpoint.',
    });
}
