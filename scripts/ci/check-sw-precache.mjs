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
      if (!res.ok) bad.push(`${url} -> ${res.status}`);
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

console.log(`OK: all ${entries.length} precache entries in ${SW_URL} resolve.`);
