/**
 * App Router migration pilot — /api/test
 *
 * Phase 4.5 of the optimization plan. Plan §4.5 (line 417): App
 * Router migration is "very long term" and "future-proofing".
 * This is the first route migrated to establish the pattern.
 *
 * Why /api/test:
 *   - Smallest existing route in the monolith (3 LOC)
 *   - 0 callers (not depended on by any other code)
 *   - Trivial behavior: returns {ok: true}
 *
 * App Router conventions used here:
 *   - File path: app/api/test/route.ts (was pages/api/test.js)
 *   - Named export per HTTP method (GET, POST, etc.) instead of
 *     default-export with req.method dispatch
 *   - Returns native Response/NextResponse instead of Express-style
 *     res.json()
 *
 * Pages Router and App Router can co-exist in the same Next.js
 * project. This pilot does NOT remove pages/. The pages/api/test.js
 * file is deleted in this same commit so Next.js doesn't see two
 * routes claiming the same URL.
 *
 * Pattern for follow-up migrations:
 *   pages/api/X.js (default export)  →  app/api/X/route.ts (named exports)
 *   pages/Y.js (default export)      →  app/Y/page.tsx (default export)
 *   pages/Z/[id].js                  →  app/Z/[id]/page.tsx
 */

export async function GET() {
  return Response.json({
    ok: true,
    runtime: 'app-router',
    migrated_at: '2026-04-26',
    pilot: 'Phase 4.5 - first App Router route',
  });
}
