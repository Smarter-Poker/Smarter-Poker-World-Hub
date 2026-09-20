# Phase 1.8 — Club Arena static assets → Cloudflare R2

## Why

Vercel bandwidth is the #1 cost driver on this deploy (task #34, pre-cache-fix
audit pegged us at 229 GB / $36.95 / month and climbing). Most of that traffic
is static media served out of `public/hub/club-arena/`:

| Directory     | Files | Size   |
|---------------|-------|--------|
| `cards/`      | 172   | 30 MB  |
| `club-logos/` | 50    | 25 MB  |
| `images/`     | 136   | 31 MB  |
| `videos/`     | 1     |  4 MB  |
| **Total**     | 359   | 90 MB  |

Plus a handful of root-level images (~5 MB). These assets change rarely
(card backs, preset club logos, UI panels, intro video) but are fetched on
every CA session cold start, so they saturate Vercel bandwidth despite
Phase 1.4/1.9 cache-header fixes.

Moving them to Cloudflare R2 gets us:

1. **Egress savings.** R2 has no egress fees. Vercel does. Projected saving:
   ~$25/mo at current traffic, linear growth as traffic grows.
2. **Smaller deploys.** 90 MB less to upload to Vercel every build → faster CI.
3. **Longer edge cache.** R2 public buckets support 1-year immutable caching
   behind Cloudflare's CDN automatically.

## Non-goals

- **NOT moving `/hub/club-arena/assets/`** — that's the Vite content-hashed
  JS/CSS/WebP bundle, which is managed by the build and rotates every release.
  Leaving it on Vercel keeps the deploy atomic.
- **NOT moving the root SPA shell** (`index.html`, `manifest.json`, `sw-bus.js`,
  `offline.html`). These need to live next to the Next.js routing fabric.
- **NOT a code refactor.** CA source references assets via literal path strings
  like `/cards/backs/red.webp`. We keep those. The routing change is entirely
  at the Vercel edge via `rewrites`.

## Architecture

```
  Client:  GET /hub/club-arena/cards/backs/red.webp
                           │
                           ▼
  Vercel edge:  matches rewrite → proxy to cdn.smarter.poker
                           │
                           ▼
  Cloudflare R2:  serves from smarter-poker-cdn bucket
                           │
                           ▼
  Response:  Cache-Control: public, max-age=31536000, immutable
             Content-Type: image/webp
```

Browser sees `https://smarter.poker/hub/club-arena/cards/backs/red.webp` —
no client-side code change, no URL leakage of the R2 origin, no CORS fuss.

## Two-phase rollout

### Phase A — Upload (reversible, zero user impact)

1. Provision R2 bucket + public access (one-time):
   ```bash
   wrangler r2 bucket create smarter-poker-cdn
   # Then in Cloudflare dashboard: R2 → smarter-poker-cdn → Settings →
   # Public Access → Enable. Note the resulting *.r2.dev URL.
   ```
2. Create `cdn.smarter.poker` CNAME → the R2 public URL (via Cloudflare DNS).
3. Run the upload script:
   ```bash
   cd Smarter-Poker-World-Hub
   ./scripts/migrate-ca-assets-to-r2.sh --dry-run   # verify inventory
   ./scripts/migrate-ca-assets-to-r2.sh             # upload for real
   ```
4. Confirm a file is reachable:
   ```bash
   curl -sI https://cdn.smarter.poker/hub/club-arena/cards/backs/red.webp
   # expect: 200, content-type: image/webp
   # expect: cache-control: public, max-age=31536000, immutable
   ```

At this point both origins serve the same bytes. Users still hit Vercel.
Safe to sit on this state indefinitely.

### Phase B — Cut over (atomic, quickly reversible)

1. Add `rewrites` block to `vercel.json`:
   ```json
   "rewrites": [
     { "source": "/hub/club-arena/cards/:path*",      "destination": "https://cdn.smarter.poker/hub/club-arena/cards/:path*" },
     { "source": "/hub/club-arena/club-logos/:path*", "destination": "https://cdn.smarter.poker/hub/club-arena/club-logos/:path*" },
     { "source": "/hub/club-arena/images/:path*",     "destination": "https://cdn.smarter.poker/hub/club-arena/images/:path*" },
     { "source": "/hub/club-arena/videos/:path*",     "destination": "https://cdn.smarter.poker/hub/club-arena/videos/:path*" }
   ]
   ```
2. Push to main. Vercel rebuilds and the rewrites go live atomically.
3. Smoke-test on prod:
   ```bash
   curl -sI https://smarter.poker/hub/club-arena/cards/backs/red.webp
   # Still returns 200 with immutable Cache-Control, but now from R2.
   ```
4. Monitor Vercel bandwidth dashboard for 24 hours — expect ~80% drop on
   the `/hub/club-arena/*` path family.

Rollback: revert the `rewrites` addition in vercel.json. Traffic falls back
to the still-intact local files in `public/hub/club-arena/`. No data loss.

### Phase C — Prune local copies (only after Phase B is proven)

After 48h of clean R2 serving + no 404s in application logs on CA asset paths:

```bash
git rm -r public/hub/club-arena/cards \
          public/hub/club-arena/club-logos \
          public/hub/club-arena/images \
          public/hub/club-arena/videos
git commit -m "chore(ca-assets): Phase 1.8 — remove local copies now served from R2"
git push origin main
```

Next Vercel deploy is ~90 MB smaller. Build time drops accordingly.

## Operational notes

- **Cache-busting.** Asset filenames are stable (card backs are named by
  color, club logos by preset number, etc.), so the `max-age=31536000, immutable`
  header is appropriate. If we ever need to force a refresh (e.g., replace
  `red.webp` with a corrected image), rename the file — don't overwrite. R2
  will serve the new name, the old name 404s, nothing caches stale bytes.
- **New assets.** CI should run the upload script on every main build that
  adds or changes a file under the migrated directories. This can be a
  dedicated Vercel build step, a GitHub Action, or a git pre-push hook on
  the asset maintainer's machine. Short-term: manual re-run. Long-term: add
  to `.github/workflows/build-safety-gate.yml` after confirming idempotency.
- **DR.** The local copies stay in git history forever. Worst-case R2
  outage, we revert the `rewrites` block and serve from Vercel in minutes.

## Status

| Phase | Description                          | Done? | Task |
|-------|--------------------------------------|-------|------|
| A.1   | Upload script committed              | ✅    | #44  |
| A.2   | Migration plan doc                   | ✅    | #44  |
| A.3   | R2 bucket + CNAME provisioned        | ❌    | #44  |
| A.4   | Upload run + smoke-tested            | ❌    | #44  |
| B     | vercel.json rewrites + deploy        | ❌    | #44  |
| C     | Prune local copies                   | ❌    | #44  |

Phases A.3 onwards require Cloudflare account access, so they're the
operator's manual step. The script makes them a single command each.
