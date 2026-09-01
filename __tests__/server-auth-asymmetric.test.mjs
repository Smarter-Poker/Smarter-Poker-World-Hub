/**
 * MOVED — this file is a tombstone, not a test suite.
 *
 * The contents of this file now live in
 *   __tests__/server-auth-getclaims-fallback.test.mjs
 * under a name that describes what they actually cover: the getClaims
 * fallback plumbing in src/lib/serverAuth.js, with a stubbed client and a
 * token that is not a JWT. The old name read as "asymmetric JWT verification
 * is covered" and was green throughout the 2026-09-01 ES256 outage.
 *
 * Real cryptographic coverage lives in
 *   __tests__/jwt-verification-contract.test.mjs
 *
 * This stub deliberately declares no tests. It is safe to `git rm` — it only
 * exists because the tooling used to open this PR can add and update files
 * but cannot delete them. Nothing references this path any more:
 * package.json's `test:leak-engine` now points at the new filename.
 */
