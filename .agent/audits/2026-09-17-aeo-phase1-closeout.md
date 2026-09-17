# AEO Phase 1 — Closeout Audit (2026-09-17)

Agent: claude-aeo (Antigravity handoff)  
Branch: `agent/claude-aeo/fix/hero-priority-and-sitemap`  
Scope: Answer Engine Optimisation — crawler honesty, sitemap correctness, IndexNow, BreadcrumbList, Google Search Console property verification.

---

## What shipped

### AEO commit series (all on this branch)

| Commit | Description |
|--------|-------------|
| `ebcc72d` | Honest crawler policy (`robots.txt` parity across all named bots); evidence-based sitemap `<lastmod>`; landing page with descriptive copy; IndexNow pipeline |
| `fdc63f1` | Public arena routes (`/hub/club-arena/legal/*`, `/hub/club-arena/help`) point at their prerendered files |
| `800e89a` | Landing doors are crawlable `<a>` links; hero image has `fetchpriority="high"` and is not lazy; hotspots have accessible names; `Organization` schema names its entity; IndexNow uses a single date range |
| `9caa79c` | Document independent protected publication through Vercel (no local build required) |
| `849fc6e` | Hero `fetchpriority` reaches the DOM on React 18 (`dangerouslySetInnerHTML` strategy); sitemap lists only arena routes a crawler can read |
| `ac504f4` | `BreadcrumbList` on every public Club Commander sub-page (`/hub/commander/{venues,tournaments,home-games,leagues,faq,responsible-gaming}`) |
| `4fe4198` | Sitemap parity: only prerenderable/public arena routes listed; account-only pages removed; law test extended |

### Files added to `public/`

- `public/ebee30927d6f8e9d19a8deb450a4359e.txt` — Google Search Console HTML file verification token. The file contains exactly `ebee30927d6f8e9d19a8deb450a4359e` (one line, no extension). Google fetches `https://smarter.poker/ebee30927d6f8e9d19a8deb450a4359e.txt` and expects that exact content.

---

## What requires owner action after this merges

### 1 — Google Search Console property verification

**Why the agent cannot do this:** GSC requires an authenticated Google session — no API path exists to add or verify a property on behalf of another account.

**Steps (owner, one-time):**

1. Open [https://search.google.com/search-console/welcome](https://search.google.com/search-console/welcome) and sign in with the Smarter.Poker Google account.
2. Click **Add property → URL prefix** and enter `https://smarter.poker`.
3. Choose **HTML file** verification. Google will show the token `ebee30927d6f8e9d19a8deb450a4359e`. The file is already live once this PR merges and Vercel deploys (Vercel Git integration, triggered by the merge to `main`). Confirm it is reachable: `curl -s https://smarter.poker/ebee30927d6f8e9d19a8deb450a4359e.txt` should return `ebee30927d6f8e9d19a8deb450a4359e`.
4. Click **Verify** in the GSC wizard.
5. Once verified, go to **Sitemaps** in the left nav and submit `https://smarter.poker/sitemap.xml`.

### 2 — Bing Webmaster Tools verification

**Why the agent cannot do this:** BWT requires an authenticated Microsoft account; no API path exists for property creation.

**Steps (owner, one-time):**

1. Open [https://www.bing.com/webmasters/](https://www.bing.com/webmasters/) and sign in.
2. Add site `https://smarter.poker`.
3. Choose **XML file** verification (preferred) or **meta tag** verification.
   - XML file: Bing provides a `BingSiteAuth.xml` file to place at `https://smarter.poker/BingSiteAuth.xml`. Add it to `public/BingSiteAuth.xml` in a new PR, push, let Vercel deploy, then click **Verify** in BWT.
   - Meta tag: Bing provides `<meta name="msvalidate.01" content="<token>">`. Add it to the `<Head>` block in `pages/_document.js` in a new PR, push, deploy, verify.
4. Once verified, submit `https://smarter.poker/sitemap.xml` in the **Sitemaps** section.

**Recommendation:** XML file approach — it is self-contained and does not touch `_document.js`.

---

## Known limitation — arena soft 404s (Phase 2 item)

**Observed behaviour:** Unknown `/hub/club-arena/*` paths (e.g. `/hub/club-arena/no-such-page`) return HTTP 200 with the Club Arena landing shell. A signed-out crawler receives the landing shell and follows any links on it; there is no HTTP 404 signal.

**Root cause:** The Club Arena SPA is served through a single Next.js rewrite rule. World Hub (`pages/hub/club-arena.js`) forwards every request under `/hub/club-arena/*` to the Club Arena origin (`https://ca-static.smarter.poker`), which returns the SPA shell for all paths it does not recognise. The World Hub rewrite layer has no knowledge of the valid route list inside the arena's React Router.

**Why it is deferred:** Correcting this would require the arena to expose its full route manifest to World Hub, or for World Hub to maintain a copy of the arena's route list. Either approach couples two separate repositories and must be updated every time a new arena route is added. The risk of the sitemap advertising an unknown arena path is negligible: the sitemap deliberately lists only the four known-good prerendered paths (`/hub/club-arena`, `/hub/club-arena/help`, `/hub/club-arena/legal/tos`, `/hub/club-arena/legal/privacy`, `/hub/club-arena/legal/fair-gaming`, `/hub/club-arena/legal/promotions`). Crawlers that follow links from those pages may discover and cache a soft 404, but those pages do not link to non-existent arena paths.

**Phase 2 resolution options:**
- Teach the Club Arena `app/not-found` route to emit a `404` status at the origin so the rewrite layer propagates it.
- Add a World Hub API route that checks a bundled arena-route manifest and returns 404 for paths not in the list.

**This limitation is documented here; no code fix is included in this PR.**

---

## Verification checklist

- [x] `public/ebee30927d6f8e9d19a8deb450a4359e.txt` committed and pushed (`ebcc72d`)
- [x] `robots.txt` all named bots carry identical `Disallow` list as `*` — pinned by `__tests__/robots-crawler-policy.law.test.mjs`
- [x] Sitemap removes account-only pages (messenger, notifications, settings, store cart/orders/wishlist, reels saved/my-reels, trivia settings) — pinned by `__tests__/club-commander-and-poker-arena-are-discoverable.law.test.mjs`
- [x] Only known-prerenderable arena routes in sitemap (4 legal docs + help + landing)
- [x] BreadcrumbList on all 6 public Commander sub-pages — pinned by law test
- [x] `<lastmod>` uses actual file `mtime` for static pages (evidence-based, not `new Date()`) — pinned by `__tests__/sitemap-lastmod-is-evidence.law.test.mjs`
- [x] IndexNow workflow (`__tests__/indexnow-submit.test.mjs`) and script (`scripts/indexnow-submit.mjs`) committed
- [ ] Google Search Console property verified (owner action required — see above)
- [ ] Bing Webmaster Tools property verified (owner action required — see above)
- [ ] Soft 404 for unknown arena paths (Phase 2, documented above)
