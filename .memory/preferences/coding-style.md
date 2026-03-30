# Preferences: Coding Style

**User:** Dan
**Updated:** 2026-03-29

## Supabase Patterns

- Always use getSupabase() lazy init, never module-level createClient
- Use `.maybeSingle()` for optional rows, never `.single()` (which throws on no rows)
- Import from `src/lib/supabaseServerClient`, not `@supabase/supabase-js`

## Error Handling

- Comprehensive try/catch with outer safety net
- `[EndpointName]` console.error tags for log filtering
- Human-readable error messages in API responses
- `res.headersSent` guard on final catch

## API Response Shape

- Always `{ success: boolean }` at top level
- Include descriptive `message` field for user-facing responses
- Include `error` field for failures
- Diamond amounts shown with emoji: `${amount} diamond`

## Anti-Farming Safeguards

- Account age checks (1+ hour minimum for rewards)
- Calendar day dedup (CST timezone for daily boundaries)
- Unique constraint as final dedup (race condition safe)
- IP/session dedup via client-side sessionStorage

## Code Style

- Descriptive JSDoc comments with visual separators (═══)
- Named constants for magic numbers (LOGIN_REWARD.MIN, etc.)
- Rate limiting on all mutative endpoints
- CDN cache headers on read-only endpoints (s-maxage, stale-while-revalidate)

## Testing

- Playwright for E2E tests with `0xx-*.spec.ts` naming
- Vitest for unit tests
- Tests should be auditable — no phantom routes, verify against actual codebase
- Skip Vercel-only tests in localhost with `test.skip(isLocalhost)`
