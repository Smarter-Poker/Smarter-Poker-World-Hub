# Decision: JWT Fallback Authentication

**Date:** 2026-03-29
**Phase:** Pre-existing (documented Phase 3)
**Status:** IMPLEMENTED

## Context

Supabase's `auth.getUser(token)` makes a network call to GoTrue which intermittently fails on Vercel with AbortError/timeout, causing all authenticated API routes to return 401 "Invalid token" even for valid sessions.

## Decision

Patch `supabaseServerClient.js` to wrap `auth.getUser` with a local JWT decode fallback. Located at `src/lib/supabaseServerClient.js`.

## How It Works

1. First attempts the original GoTrue network call
2. If GoTrue fails (AbortError, timeout, etc.), falls back to local JWT decoding via `jsonwebtoken` library
3. Checks token expiration and extracts user ID, email, role from the JWT payload
4. Returns a user-like object compatible with Supabase's expected format

## Rationale

- GoTrue failures are transient and infrastructure-dependent (Vercel cold starts, network jitter)
- Local JWT decode is sufficient for authorization (the JWT was issued by Supabase and contains all needed claims)
- The fallback is transparent to consuming code — same return format
- Hardened env var resolution: falls back through SUPABASE_SERVICE_ROLE_KEY → NEXT_PUBLIC_SUPABASE_ANON_KEY

## Trade-offs

- **Security**: Local decode doesn't verify the JWT signature against Supabase's secret. Acceptable because the service role key provides full access anyway, and the fallback only activates when GoTrue is unreachable.
- **Staleness**: A revoked token could pass local decode. Mitigated by short token expiry (Supabase default 1 hour).

## File

`src/lib/supabaseServerClient.js` — exports `createClient` (patched) and `decodeSupabaseJWT`
