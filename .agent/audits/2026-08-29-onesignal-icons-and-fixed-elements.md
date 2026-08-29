# 2026-08-29 — Three things nobody could see by looking

A sweep for stubs, gaps and dead wiring after the service-worker and footer
work (#946, #952). All three below were found by measuring rather than reading,
and none of them produce a visible symptom.

## 1. OneSignal was still loading on every Club Arena session

Retired 2026-08-19, replaced with self-hosted VAPID. The loader was left
behind. Confirmed on production, on a live page:

```js
typeof window.OneSignal   // "function"
script[src*=onesignal]    // cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js (x2)
```

Club Arena's `index.html` injected the v16 SDK three seconds after every page
load, and the SDK then requested `api.onesignal.com/sync/<app-id>/web` —
announcing every visit to a vendor the platform no longer uses.

Removed there (club-arena PR). On this side:

- `pages/_document.js` carried `<link rel="dns-prefetch" href="cdn.onesignal.com">`
  with the comment "OneSignal push SDK — loaded on every page". No hub page had
  loaded it since the retirement; it was warming DNS for a host nothing
  contacted.
- The CSP kept `cdn.onesignal.com` in `script-src` and `api.onesignal.com` +
  `onesignal.com` in `connect-src`. Three allowances that would have been
  carried into any enforced policy for a script nothing loads. Gone.

**`public/OneSignalSDKWorker.js` stays.** It is a deliberate tombstone: browsers
that installed the old OneSignal worker fetch that exact URL on their update
check, and the content there makes them unregister and hand the origin back to
`/sw.js`. Deleting it would strand those workers. It is no longer precached, so
it costs nothing.

Server-side OneSignal naming in `src/lib/commander/pushNotifications.js` and
`src/lib/onesignal-server.js` is a compatibility shim that was already rewired
to VAPID on 2026-08-19 — checked, working, left alone.

## 2. Manifest icons that lied about themselves

`public/manifest.json` declared:

```json
{ "src": "/icons/icon-512.png", "sizes": "512x512", "purpose": "any maskable" }
```

and the file was **1024x1024, 657 KB**. Chrome validates a manifest icon's real
dimensions against `sizes` and ignores the entry when they disagree, so the
install prompt was choosing from fewer icons than the manifest appeared to
offer — and every install downloaded four times the pixels it asked for.
`commander-icon-512.png` was 640x640 for the same declaration.

Worse, three assets served as `.png` were **JPEGs**:

| file | was | why it matters |
| --- | --- | --- |
| `icons/icon-192.png` | JPEG | declared `"type": "image/png"`, `"purpose": "any maskable"` — a JPEG has no alpha to mask against |
| `icons/apple-touch-icon-180.png` | JPEG | served as image/png from the extension |
| `default-avatar.png` | JPEG | app-wide fallback, and on the service worker's precache shell list |

Content-Type is set from the extension, so the server was announcing
`image/png` over JPEG bytes on all three.

All corrected at their declared sizes and recompressed. **980 KB saved across
ten icons**, `icon-512.png` alone going 657 KB → 137 KB at an RMSE of 0.75%
against a plain downscale.

`icons/sp40/` — 21 PNGs at 1024x1024, ~12 MB — was left alone deliberately.
Nothing in either repo references it, it is no longer precached, and so nothing
fetches it; pngquant only found 4% in it, which is not worth 21 binary diffs.
It is dead weight in the repo, not on any wire.

## 3. The hub had the Club Arena footer bug too

Same mechanism as club-arena's `ClubBottomNav`: `overflow-x: hidden` makes an
element a scroll container on *both* axes (CSS Overflow 3 — the `visible` axis
computes to `auto`), and WebKit then resolves `position: fixed` descendants
against it rather than the viewport.

`.pnm-page` carried it while the same stylesheet positions three fixed elements
inside: the favourite-venue live toast at `top: 80px`, which scrolls away with
the content instead of staying put, and two full-bleed `inset: 0` backgrounds,
which size to the whole scroll height rather than the screen. Same shape in
`.preflop-subpage`, `.bankroll-page`, `body.world-poker-near-me` and the
training setup console.

All paired with `overflow-x: clip`. `src/index.css`'s body is exempt and stays
as it is: it declares `overflow-y: auto` explicitly, so it is a scroller on
purpose.

## Guards, and how they are wired

Three new test files, added to **both** `npm run prebuild` and CHECK 8 of
`build-safety-gate.yml` — the workflow runs an explicit list, not `prebuild`, so
a test that is only in `package.json` never runs in CI:

- `__tests__/manifest-icons.test.mjs` — every manifest icon exists, is the size
  it claims (read straight from the PNG IHDR chunk, no image library), is under
  250 KB, and a file named `.png` is a PNG.
- `__tests__/fixed-elements-stay-fixed.test.mjs` — no stylesheet under
  `styles/` or `src/styles/` sets `overflow-x: hidden` without pairing it with
  `clip`, unless it declares an explicit `overflow-y`.
- `__tests__/public-shell-precache.test.mjs` — carried over from #946, now also
  running in CI rather than only in prebuild.

Every one of these was written after the bug it catches, and two of them caught
something on their first run: the widened footer law found `.lobby-table-wrap`
in club-arena, and the manifest test found the JPEG-named-`.png` icons.
