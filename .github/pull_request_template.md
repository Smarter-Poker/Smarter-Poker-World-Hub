## Description
<!-- Brief description of what this PR does -->

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Performance improvement
- [ ] CI/CD improvement
- [ ] Documentation update

## Checklist
- [ ] TypeScript compiles without errors (`npx tsc --noEmit`)
- [ ] Build succeeds (`npm run build`)
- [ ] Tested locally on smarter.poker
- [ ] No console errors introduced
- [ ] No new `alert()` calls (use toast system)
- [ ] Supabase queries use `.maybeSingle()` not `.single()`
- [ ] No raw `createClient()` at module scope (use `getSupabase()`)

## Auth-Critical Path Checklist
*Required if this PR modifies any of: `pages/auth/**`, `pages/api/auth/**`,
`middleware.ts`, `config/geo-blocks.json`, `next.config.js`, the auth-trigger
functions, or the `__tests__/auth-routes-exist*` / `signup-hardening*` tests.*

The Sentinel Tripwire workflow will auto-comment if you touched any of these.

- [ ] I ran `node --test __tests__/auth-routes-exist.test.mjs __tests__/signup-hardening.test.mjs` locally and all 9 pass
- [ ] If I changed `geo-blocks.json` or `middleware.ts`, I added a test that proves `/auth/*` is still reachable from a restricted-state region
- [ ] If I removed a guard, I added a replacement that protects the same failure class
- [ ] If I touched a trigger function, I queried `signup_health_view` after to confirm `errors_1h = 0`
- [ ] I read `docs/SIGNUP_RUNBOOK.md` and understand the historical failure modes
- [ ] Auth-Owner has been requested as a reviewer

## Screenshots
<!-- If UI changes, paste screenshots here -->
