# Audit — Video upload "Invalid Compact JWS" (empty Bearer race)

**Captured:** 2026-04-28 / 2026-04-29
**Symptom:** Video upload via SharedPostCreator and EnhancedPostCreator
returns `400 {"code":"AccessDenied","message":"Invalid Compact JWS"}` from
`https://kuklfnapbkmacvwxktbh.storage.supabase.co/storage/v1/upload/resumable`
~7 seconds after the user clicks Post. Previous 8 commits over 6 days did
not resolve it.

**Status:** SHIPPED, deployed, empirically verified on production.

---

## Root cause (empirically verified against live TUS endpoint)

`src/lib/backgroundVideoUpload.js` `_uploadWithTus` constructed the auth
header as `` `Bearer ${getAccessToken() || ''}` ``. When `getAccessToken()`
returned null/empty, the literal string `Bearer ` shipped on the wire,
Supabase Storage's JWS parser rejected it with `Invalid Compact JWS`, and
the upload failed before the (correct) `x-signature` token was even read.

`getAccessToken()` is a synchronous localStorage read. Its own author
documented (in `useRequireAuth` comments) that it "races with Supabase SDK
token refresh." Concrete failure scenarios:

- Supabase SDK mid-refresh (network round-trip in flight; localStorage
  write pending)
- Cross-tab logout cleared the entry between prefetch and Post
- iOS PWA standalone mode uses a separate localStorage scope from Safari;
  cookie auth carries the session in but localStorage starts empty
- iOS Safari memory pressure on background tabs evicts localStorage
- Stale shape from older SDK version (`{ currentSession: { access_token } }`
  vs current `{ access_token }`)

---

## Empirical proof (curl against live `/upload/resumable`)

| Authorization | apikey | x-signature | HTTP | Body |
|---|---|---|---|---|
| valid user JWT | — | real signed token | **201** | TUS Location |
| valid user JWT | anon | — *(no signature at all)* | **201** | TUS Location |
| anon | anon | real signed token | 403 | RLS denial |
| `Bearer ` empty | — | real signed token | 400 | **Invalid Compact JWS** ← THE BUG |
| — none | — | real signed token | 400 | Invalid Compact JWS |

Conclusions:
- Authorization with valid user JWT is necessary and sufficient.
- `x-signature` is not the auth mechanism, just an additional path-binding
  constraint that is checked AFTER Authorization passes.
- `apikey` is harmless to send (matches docs) but not strictly required.

---

## Fix (commit `4a0d481bd2`, deployed and verified)

`src/lib/backgroundVideoUpload.js`:

- Added `_ensureBearer()` helper at module top:
  ```js
  async function _ensureBearer() {
      let token = getAccessToken();
      if (token) return token;
      try {
          const { supabase } = await import('./supabase');
          const { data } = await supabase.auth.refreshSession();
          token = data?.session?.access_token || null;
      } catch (_) {}
      return token;
  }
  ```
- `_uploadWithTus` is now `async` and awaits `_ensureBearer()` before
  constructing `tusHeaders`. If the token is unrecoverable (offline, hard
  logout, etc.), it rejects with a user-readable error rather than
  shipping `Bearer ` on the wire.
- `tusHeaders` now includes `apikey: SUPABASE_ANON_KEY` for parity with
  the Supabase reference implementation.
- `onBeforeRequest` is now `async` and re-runs `_ensureBearer()` on every
  chunk PATCH so multi-minute uploads survive token rotation.

`pages/api/social/upload-url.js`:
- `createSignedUploadUrl(storagePath, { upsert: true })` — token claim now
  matches the client's `x-upsert: true` header.
- Response now includes `signedUrl` (was removed in a prior change; broke
  `thumbnailUploader.js` for ~6 weeks).

`pages/api/social/create-post.js`:
- Direct-insert fallback now includes `thumbnail_url` (was being silently
  dropped when the `fn_create_social_post` RPC failed).

---

## SQL migrations applied

- `20260428_drop_dead_social_media_policies.sql` — removed two policies on
  `storage.objects` that referenced `bucket_id 'social_media'` (UNDERSCORE)
  vs the actual `'social-media'` (HYPHEN). Dead since creation.
- `20260429_add_heic_mime_types.sql` — added `image/heic` and `image/heif`
  to `social-media` and `stories` bucket allowed_mime_types so iPhone
  Photos uploads no longer 415.
- `20260429_tighten_storage_upload_rls.sql` — replaced the blanket
  `"Authenticated users can upload"` policy (`WITH CHECK true`) with a
  bucket-scoped allowlist. Path-prefix checks in upload-url.js could not
  protect against curl-crafted requests directly to Supabase; this closes
  that surface.

---

## Live verification on production

- `4a0d481b` deployed at 2026-04-29T00:59 UTC
- `/api/health` confirmed serving the new SHA
- TUS POST with the deployed header set returns **HTTP 201**
- API response now exposes `signedUrl` (length 511)
- Token payload includes `"upsert":true`
- HEIC fix (commit `0411d21c80`) pending Vercel deploy of `56b54b7f` (the
  next downstream commit); will land in the next Vercel build cycle.

---

## Adjacent bugs intentionally NOT fixed in this audit (open)

These were identified but deferred to keep the fix small and reviewable:

1. `_uploadWithRetry` XHR fallback in `backgroundVideoUpload.js` is dead
   code now that all upload-url responses include `tusEndpoint`. Removable.
2. `SharedPostCreator` and `EnhancedPostCreator` have inconsistent
   ghost-post wiring (only EPC calls `ghostPost.create()` directly). Extract
   a shared `useUploadFlow` hook.
3. HEIC photos render natively on Safari/iOS but NOT on Chrome/Firefox
   desktop. Need server-side HEIC→JPEG conversion via `sharp` or
   `heic-convert` for cross-browser feed rendering.
4. `start()` listener-clearing ordering is correct but fragile — a future
   refactor that adds an `await` before the synchronous listener-clear
   would silently break the call-site invariant.

---

## Why the previous 8 commits didn't fix it

The team correctly identified that Supabase Storage uses a JWS-validated
auth flow, but kept toggling between "JWT only" (`46460d3c`), "presigned
only" (none of the commits did this), and "JWT + signature" (`4bb5eeb6`).
None of them addressed the actual race: the JWT being asked for can be
empty at the moment of upload, regardless of which header carries it. The
fix had to live INSIDE the moment of header construction (active refresh),
not in the choice of headers.

Commit `58d661ee` also pushed unresolved `<<<<<<< Updated upstream` markers
in `backgroundVideoUpload.js`; production was broken differently for that
window. `1fb4dcc8` removed them but picked the both-headers branch, which
then failed via the empty-Bearer race documented here.

---

## How to verify in the future

To reproduce the fix verification:

```bash
# Get a real signed token
ACCESS_TOKEN=$(curl -s -X POST "https://kuklfnapbkmacvwxktbh.supabase.co/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"email":"<test-account>","password":"<pw>"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('access_token',''))")

SIGNED=$(curl -s -X POST "https://smarter.poker/api/social/upload-url" \
  -H "Content-Type: application/json" -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{"fileName":"v.mp4","fileSize":1024,"mimeType":"video/mp4","folder":"videos"}')
TOKEN=$(echo "$SIGNED" | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
SPATH=$(echo "$SIGNED" | python3 -c "import sys,json;print(json.load(sys.stdin)['path'])")

B64() { printf '%s' "$1" | base64 | tr -d '\n'; }
META="bucketName $(B64 social-media),objectName $(B64 "$SPATH"),contentType $(B64 video/mp4),cacheControl $(B64 3600)"

curl -s -o /dev/null -w "HTTP %{http_code}\n" -X POST \
  "https://kuklfnapbkmacvwxktbh.storage.supabase.co/storage/v1/upload/resumable" \
  -H "Tus-Resumable: 1.0.0" -H "Upload-Length: 1024" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "apikey: $ANON_KEY" \
  -H "x-signature: $TOKEN" -H "x-upsert: true" \
  -H "Upload-Metadata: $META"
# Expected: HTTP 201
```

To reproduce the BUG (sanity check that empty Bearer still fails — it does):

```bash
# Same as above but with: -H "Authorization: Bearer "
# Expected: HTTP 400, body contains "Invalid Compact JWS"
```
