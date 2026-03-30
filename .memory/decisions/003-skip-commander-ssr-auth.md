# Decision: Skip Commander SSR Auth (Phase 5)

**Date:** 2026-03-29
**Phase:** 5 (SKIPPED)
**Status:** DEFERRED

## Context

The Commander admin panel at /commander uses a client-side PIN gate overlay. The HTML content is visible in the page source without authentication — the PIN check only hides it visually via JavaScript.

## Decision

Skip Phase 5 (moving PIN validation from client-side overlay to getServerSideProps) as HIGH RISK.

## Rationale

- Modifying the auth flow for admin pages could lock out admins if done incorrectly
- No staging environment to test SSR auth changes safely
- The current client-side gate, while not secure against source inspection, does prevent casual access
- The /commander/admin route already has a separate PIN gate
- Protected admin API routes (/api/admin/*) use x-admin-secret middleware — the actual data is secure

## Risk Assessment

- **If SSR auth breaks**: Admins locked out of Commander entirely, requiring code revert and redeploy
- **If SSR auth has edge cases**: Some admin routes may become inaccessible on certain browsers or session states
- **Current exposure**: HTML is visible but no sensitive data is rendered without API calls (which ARE authenticated)

## Future Plan

Implement when:
1. A staging environment is available for testing
2. The auth flow can be verified against multiple admin accounts
3. A rollback plan is in place (feature flag or gradual rollout)
