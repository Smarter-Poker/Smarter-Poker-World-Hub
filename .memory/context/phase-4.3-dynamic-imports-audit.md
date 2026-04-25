# Phase 4.3 — Dynamic Imports Audit

**Date:** 2026-04-25
**Repo:** Smarter-Poker-World-Hub
**Auditor:** Claude (Phase 4 ongoing optimization, Task #48)

## Tally

| Status | Count |
|---|---|
| Total API routes | 747 (post-2B.3) |
| Heavy-dep top-level imports | 6 |
| Convert to dynamic | 2 |
| Skip (already optimal or marginal gain) | 4 |

## Detailed analysis

### Heavy-dep candidates

| Route | LOC | Heavy import | Recommendation |
|---|---|---|---|
| pages/api/bankroll/tax-report.js | 376 | jspdf + jspdf-autotable | **Convert** — used at line 233 after auth gate |
| pages/api/bankroll/export-pdf.js | 222 | jspdf + jspdf-autotable | **Convert** — used at line 99 after auth gate |
| pages/api/social/upload.js | 177 | formidable | Skip — used immediately for multipart parsing, no defer benefit |
| pages/api/social/upload-comment-image.js | 107 | formidable | Skip — same as above |
| pages/api/og/hand-card.js | 300 | @vercel/og | Skip — @vercel/og is an OG-dedicated package, already minimal |
| pages/api/og/tournament-card.js | 127 | @vercel/og | Skip — same |

### Why the 2 jspdf routes are good candidates

Both routes have an auth + feature-gate flow BEFORE PDF generation:
1. `applyRateLimit` (returns 429 on cooldown)
2. `getSupabase().auth.getUser` (returns 401 on invalid token)
3. `checkFeatureAccess('bankroll_pro')` (returns 403 if not premium)
4. **THEN** PDF generation begins

If any of the first 3 fails, jspdf was loaded for nothing. Dynamic
import defers the ~200KB+ load until step 4 is reached.

Estimated bundle savings:
- jspdf: ~150KB
- jspdf-autotable: ~50KB
- Combined: ~200KB deferred from cold-start to PDF-generation hot path

### Why @vercel/og can't be optimized

Vercel's OG package returns an ImageResponse object that the runtime
inspects to know how to serialize. Moving it to dynamic import would
require restructuring the entire handler return shape. Not worth the
churn.

### Why formidable can't be optimized

formidable.IncomingForm() needs to start parsing the request body
before the handler even reads `req.method`. By the time you'd be in
position to dynamic-import it, the multipart frames have already been
streamed past. Moving it to dynamic import is a no-op.

## Execution plan

Convert both jspdf routes in this audit, single commit. Verify with:
- npm run build (no static-import errors)
- E2E test on /api/bankroll/export-pdf returning a valid PDF
- Sentry watch for 24h

Tracked as Task #48.
