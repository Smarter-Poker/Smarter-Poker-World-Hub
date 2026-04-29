# Video Upload "Invalid Compact JWS" — TRUE root cause

**Date:** 2026-04-29
**Severity:** P0 — every video post failed
**Resolution commit:** `f27acc2131` (v3.4)
**Verified:** Live on production (`https://smarter.poker`) via computer-use end-to-end test on Dan's browser

## What was breaking

Every video upload via `bgUpload.start()` produced this error chain:

```
[bgUpload] STORAGE REJECTED AUTH
[SharedPostCreator] Upload error: Error: Upload failed: tus: unexpected response
  while creating upload, originated from request (method: POST,
  url: https://kuklfnapbkmacvwxktbh.storage.supabase.co/storage/v1/upload/resumable,
  response code: 400, response text: {"statusCode":"403","code":"AccessDenied",
  "error":"Unauthorized","message":"Invalid Compact JWS — please try again."
```

## What was NOT the cause (false leads)

Three separate hypotheses were investigated and disproven empirically before the
real bug was found. Each was plausible, each was wrong:

1. **Empty Bearer race** (v3.1) — `getAccessToken()` was claimed to return null
   under load. Patched with retry/refresh fallback. Did not help.

2. **Web Locks contention** (v3.3) — observed `[bgUpload] SDK auth path threw,
   falling through to localStorage: Lock 'lock:smarter-poker-auth' was released
   because another request stole it`. Patched _ensureBearer to retry the SDK 3×
   on lock contention, then later to read localStorage in a retry loop with
   JWT-exp validation. Did not help.

3. **`SUPABASE_ANON_KEY` undefined import** (v3.4-pre) — `backgroundVideoUpload.js`
   imported `SUPABASE_ANON_KEY` from `./authUtils`, but `authUtils` never exported
   that symbol. So `setRequestHeader('apikey', undefined)` was sending the literal
   string `"undefined"` on the wire. Patched by inlining the anon key from
   `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY` with hardcoded fallback. **Did not
   help on its own** — the apikey was now valid but Storage still returned 400.

## What was actually the cause

The `tus.Upload({ ... })` constructor was given an `onBeforeRequest` hook that
re-set the Authorization header on every request:

```js
onBeforeRequest: async (req) => {
    const fresh = await _ensureBearer();
    if (_isJWT(fresh)) {
        req.setHeader('Authorization', `Bearer ${fresh}`);
    }
    req.setHeader('apikey', SUPABASE_ANON_KEY);
    if (meta.token) req.setHeader('x-signature', meta.token);
}
```

**`tus-js-client@4.3.1`'s `req.setHeader` APPENDS to existing header values
rather than replacing them.** The constructor's `headers` option had already set
`Authorization: Bearer <jwt>`. When `onBeforeRequest` re-set it, the actual
header on the wire became:

```
Authorization: Bearer <jwt>, Bearer <jwt>
```

Supabase Storage parses that as a malformed JWS and rejects with "Invalid
Compact JWS".

## How it was empirically isolated

After the v3.3 deploy still failed, I drove a side-by-side test on Dan's actual
browser via the Chrome MCP:

| variant | result |
| --- | --- |
| Direct `fetch()` with all 7 headers | **201** |
| Direct `XMLHttpRequest` with all 7 headers, `withCredentials=false` | **201** |
| `tus.Upload({ headers, ...no onBeforeRequest })` | **201** |
| `tus.Upload({ headers, ...sync onBeforeRequest no-op })` | **201** |
| `tus.Upload({ headers, ...async onBeforeRequest no-op })` | **201** |
| `tus.Upload({ headers, ...onBeforeRequest setHeader('apikey') only })` | **201** |
| `tus.Upload({ headers, ...onBeforeRequest setHeader('x-signature') only })` | **201** |
| `tus.Upload({ headers, ...onBeforeRequest setHeader('Authorization') })` | **400 / Invalid Compact JWS** |
| `tus.Upload({ headers, ...onBeforeRequest setHeader(all three) })` | **400 / Invalid Compact JWS** |

The bug isolates cleanly to "calling `req.setHeader('Authorization', ...)`
inside `onBeforeRequest` when `headers.Authorization` is already set on the
constructor".

## The fix

Removed the `onBeforeRequest` hook entirely. The constructor `headers` option is
honored for every chunk, so Authorization, apikey, x-upsert and x-signature all
land cleanly on every request. Token refresh during a long upload is a deferred
follow-up and must be implemented WITHOUT setHeader-based re-binding (e.g.,
abort + recreate the upload with the new token, or upgrade tus-js-client).

The `apikey` undefined-import fix from `34e849532d` is kept — it was a real bug
even though it wasn't the surface error, and the inline `process.env`-with-
fallback is more robust than relying on a non-existent re-export.

## Lessons

- **Don't trust the initial console message.** The v3.3 lock-contention warning
  was real but it was a SYMPTOM of unrelated code, not the cause of the JWS
  rejection. Multiple debug iterations chased it.
- **Reproduce in isolation.** The cycle that finally worked was: drop the
  full bgUpload code, build the smallest possible `tus.Upload({...})` call that
  also fails, then strip features one by one until the failure mode flips.
  That made the "onBeforeRequest is the trigger" finding obvious in 3 minutes.
- **`req.setHeader` is not idempotent in tus-js-client.** Whenever you re-set
  a header that the constructor already sets, you get appended, not replaced.
  This is documented in tus-js-client v3+ release notes but is easy to miss.

## Verification

- Production `/api/health` serves `f27acc21` at 06:50:10Z 2026-04-29.
- End-to-end test from Dan's browser: TUS POST → **201** with Location header,
  PATCH chunk → **204**, post `cce967c6` landed in social_posts table.
- Console no longer prints `STORAGE REJECTED AUTH` or `Invalid Compact JWS`.
