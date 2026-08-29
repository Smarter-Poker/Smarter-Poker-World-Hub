#!/usr/bin/env node
/**
 * check-sw-precache.mjs — every URL the root service worker precaches must
 * actually resolve, or web push is dead for the whole origin.
 *
 * WHY THIS EXISTS
 * ─────────────────────────────────────────────────────────────────────────
 * 2026-08-29. Dan, from an iPhone: "ENABLE NOTIFICATIONS ISN'T WORKING." Club
 * Arena's prompt showed "The notification service worker did not start."
 *
 * The cause was one line in an 827-entry precache manifest:
 *
 *     /_next/dynamic-css-manifest.json  ->  404
 *
 * Next emits that file as a build artifact and does not serve it under
 * /_next/. Workbox precaches the manifest ATOMICALLY, so a single 404 rejects
 * `install`; the root worker went `redundant` ~170ms after every register()
 * and `getRegistration('/')` returned undefined forever after. /sw.js is the
 * only worker on this origin with a `push` handler, so nobody on smarter.poker
 * — hub or Club Arena — could receive a notification, and nothing anywhere
 * reported it. The failure is entirely silent: the page looks fine, the
 * register() promise RESOLVES, and only an enrolment attempt ever notices.
 *
 * That is the class of bug this script closes. It is not about one filename.
 * Any future unserved `_next/*.json`, any asset dropped by a CDN rule, any
 * renamed public file still listed in the manifest produces the same silent
 * platform-wide outage.
 *
 * WHAT IT DOES
 * ─────────────────────────────────────────────────────────────────────────
 * Fetches the DEPLOYED /sw.js, parses the precache manifest out of it, and
 * requests every entry the way workbox does (revisioned entries carry
 * `?__WB_REVISION__=<rev>`). Exits non-zero listing anything that is not 2xx.
 *
 * It has to run against a deployment, not a checkout: next-pwa is configured
 * `disable: !process.env.VERCEL`, so no service worker is generated locally
 * and there is nothing to check until the site is live.
 *
 *   node scripts/ci/check-sw-precache.mjs [origin]
 *
 * Default origin: https://smarter.poker
 */

const origin = (process.argv[2] || 'https://smarter.poker').replace(/\/+$/, '');
const SW_URL = `${origin}/sw.js`;
const CONCURRENCY = 12;

/**
 * Ceiling on the total weight of the precache, in megabytes.
 *
 * Everything in the manifest is downloaded, in full, before `install`
 * resolves — and for a Club Arena player that install is triggered by the tap
 * on Enable Notifications, so this number is a wait a real person sits through
 * before they can subscribe. On 2026-08-29 it was 34.7 MB of `public/` (a
 * marketing slideshow, 31 dev review pages, a 1 MB unreferenced icon) and the
 * install took about 55 seconds on a fast desktop connection.
 *
 * The budget is not a style preference. A precache is atomic: the bigger it
 * is, the more likely a phone on cellular gives up part-way, and the more URLs
 * there are to 404 and take web push down origin-wide the way one did that
 * morning. Raise this only with a reason written next to it.
 */
const PRECACHE_BUDGET_MB = 12;

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

const swRes = await fetch(SW_URL, { cache: 'no-store' }).catch((e) => {
  fail(`could not fetch ${SW_URL} — ${e.message}`);
});
if (!swRes.ok) fail(`${SW_URL} returned ${swRes.status}`);

const source = await swRes.text();
const entries = [...source.matchAll(/\{url:"([^"]+)",revision:("[^"]*"|null)\}/g)].map((m) => ({
  url: m[1],
  revision: m[2] === 'null' ? null : m[2].slice(1, -1),
}));

if (entries.length === 0) {
  fail(
    `parsed 0 precache entries from ${SW_URL}. Either the worker stopped ` +
      `precaching (fine, delete this check) or the generated format changed ` +
      `and this parser is now blind — which is worse than no check at all.`
  );
}

const bad = [];
const sizes = [];
const queue = entries.slice();

async function drain() {
  while (queue.length) {
    const { url, revision } = queue.shift();
    const target = new URL(url, origin);
    // Mirror workbox: revisioned entries are requested with the cache-busting
    // search param, so we probe exactly what install() will request.
    if (revision) target.searchParams.set('__WB_REVISION__', revision);
    try {
      const res = await fetch(target.href, { cache: 'no-store', redirect: 'follow' });
      if (!res.ok) {
        bad.push(`${url} -> ${res.status}`);
        continue;
      }
      // Weigh what install() will actually pull down. content-length is absent
      // on some compressed responses; fall back to reading the body so a large
      // asset cannot hide from the budget by omitting the header.
      const declared = Number(res.headers.get('content-length') || 0);
      const bytes = declared || (await res.arrayBuffer().catch(() => new ArrayBuffer(0))).byteLength;
      sizes.push([url, bytes]);
    } catch (e) {
      bad.push(`${url} -> ${e.message}`);
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, drain));

if (bad.length) {
  console.error(
    `FAIL: ${bad.length} of ${entries.length} precache entries in ${SW_URL} do not resolve.\n` +
      `Workbox precaches atomically, so EVERY ONE of these kills install(), and a\n` +
      `root service worker that never activates means web push is dead origin-wide.\n`
  );
  for (const line of bad) console.error(`  ${line}`);
  process.exit(1);
}

const totalBytes = sizes.reduce((sum, [, bytes]) => sum + bytes, 0);
const totalMB = totalBytes / 1024 / 1024;

console.log(
  `OK: all ${entries.length} precache entries in ${SW_URL} resolve ` +
    `(${totalMB.toFixed(1)} MB, budget ${PRECACHE_BUDGET_MB} MB).`
);

if (totalMB > PRECACHE_BUDGET_MB) {
  sizes.sort((a, b) => b[1] - a[1]);
  console.error(
    `\nFAIL: the precache is ${totalMB.toFixed(1)} MB against a ${PRECACHE_BUDGET_MB} MB budget.\n` +
      `Every byte of this is downloaded before install() resolves, and for a Club Arena\n` +
      `player that install is what happens when they tap Enable Notifications. Either\n` +
      `exclude the new weight in next.config.js (workboxOptions.manifestTransforms,\n` +
      `which is an allowlist — public/ files are opt-in) or raise the budget WITH a\n` +
      `reason written beside it.\n\nHeaviest entries:`
  );
  for (const [url, bytes] of sizes.slice(0, 15)) {
    console.error(`  ${(bytes / 1024).toFixed(0).padStart(7)} KB  ${url}`);
  }
  process.exit(1);
}
