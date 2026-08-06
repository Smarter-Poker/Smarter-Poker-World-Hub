/**
 * NEUTERED 2026-08-06 — this file used to carry live DDL for the money path.
 * ═══════════════════════════════════════════════════════════════════════════
 * It contained a `CREATE OR REPLACE FUNCTION add_diamonds_to_balance(...)`
 * definition. This one did at least REVOKE from PUBLIC/anon/authenticated
 * afterwards, unlike its sibling src/pages/api/hotfix_rpc.js — but redefining
 * the balance-mutating function over an HTTP endpoint is not something that
 * should be possible at all, and the two files disagreed about the function
 * body, so whichever ran last would have won.
 *
 * Never reachable: Next.js ignores `src/pages/` when a root `pages/` directory
 * exists, and this repo has one. Nothing imports it (verified by grep).
 *
 * The body is gone rather than the file because the GitHub MCP used to push
 * from this environment has no delete operation. From a normal checkout,
 * `git rm src/pages/api/hotfix_rpc.js src/pages/api/patch-db.js` finishes it.
 *
 * The authoritative definition of add_diamonds_to_balance and its grants lives
 * in supabase/migrations/. See .agent/workflows/migration-safety.md.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export default function handler(req, res) {
    return res.status(410).json({
        error: 'Gone. Schema changes belong in supabase/migrations/, not an HTTP endpoint.',
    });
}
