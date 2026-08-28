/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  HOUSE ADS — the World Hub surface, and the rules it must not drift from
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Phase 1 (2026-08-27) built the ad spine in Club Arena and wired one surface.
 * Four declared slots pointed at nothing, and `hub_promotions` pointed at a
 * World Hub that had no ad surface whatsoever. This pins the Hub half.
 *
 * WHY EACH ASSERTION EXISTS — every one is a real failure mode, not a style
 * preference:
 *
 *  - MOUNTED. The estate's recurring bug shape is a component that exists and
 *    is imported by nothing. An ad surface nobody renders logs nothing, and
 *    the whole point of this system is that it can answer "did anyone look".
 *  - SERVER-SIDE TARGETING. Every eligibility rule lives in `fn_resolve_ads`.
 *    The day a paying advertiser arrives, an impression a browser decided to
 *    serve itself is a billing dispute.
 *  - IMPRESSION PER PAGE LOAD. The strip rotates on a timer; counting renders
 *    divides every campaign's click-through rate by a meaningless number.
 *  - CLICK LOGGED BEFORE NAVIGATION. On 2026-08-28 the system had 131
 *    impressions and zero clicks, and nobody could tell whether the path
 *    fired or nobody clicked. It fires — proven in a real browser that day.
 *    This keeps it that way.
 *  - DISMISS IS NOT PERSISTED. PR #1505: a per-id flag that never rotated
 *    became an absorbing state that killed every Spin and Heads-Up for twenty
 *    hours, silently. A suppression here expires with the page load and
 *    writes a countable row.
 *  - NO EMOJI. Bare emoji break the SWC compiler and fail the Vercel build.
 *
 * Run: node --test __tests__/house-ads-hub-promotions.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const LIB = 'src/lib/hubAds.js';
const STRIP = 'src/components/ui/HubPromoStrip.js';
const PAGE = 'pages/hub/index.js';

test('the Hub ad client and strip both exist', () => {
    for (const f of [LIB, STRIP]) {
        assert.ok(existsSync(join(ROOT, f)), `${f} is missing`);
    }
});

test('the strip is actually rendered on the Hub home, not merely defined', () => {
    const page = read(PAGE);
    assert.match(page, /import\s+HubPromoStrip\s+from\s+'\.\.\/\.\.\/src\/components\/ui\/HubPromoStrip'/);
    assert.match(page, /<HubPromoStrip\s*\/>/, 'HubPromoStrip is imported but never rendered');
    // An advert must never take the page down with it.
    assert.match(
        page,
        /HubErrorBoundary[^>]*name="Hub Promotions"[\s\S]{0,200}<HubPromoStrip/,
        'HubPromoStrip must be wrapped in a HubErrorBoundary'
    );
});

test('the Hub resolves ads through fn_resolve_ads on the hub_promotions slot', () => {
    const lib = read(LIB);
    assert.match(lib, /rpc\('fn_resolve_ads'/);
    assert.match(lib, /HUB_SLOT\s*=\s*'hub_promotions'/);
});

test('the client never decides its own eligibility', () => {
    const lib = read(LIB);
    // Targeting words that would mean the browser is filtering. Audience,
    // VIP status and frequency caps are all resolver concerns.
    for (const forbidden of ['is_vip', 'audience', 'daily_cap']) {
        assert.ok(
            !lib.includes(forbidden),
            `${LIB} references "${forbidden}" — targeting belongs in fn_resolve_ads`
        );
    }
});

test('impressions de-duplicate per page load, not per render', () => {
    const lib = read(LIB);
    assert.match(lib, /const seenThisLoad = new Set\(\)/);
    assert.match(lib, /seenThisLoad\.has\(key\)/);
    assert.match(lib, /seenThisLoad\.add\(key\)/);
});

test('clicks are not de-duplicated', () => {
    const lib = read(LIB);
    const clickFn = lib.slice(lib.indexOf('export function logHubClick'));
    assert.ok(
        !clickFn.slice(0, 300).includes('seenThisLoad'),
        'a viewer clicking twice really did click twice'
    );
});

test('the click is logged before the navigation that would unmount the strip', () => {
    const strip = read(STRIP);
    const click = strip.indexOf('logHubClick(visible.adId)');
    const push = strip.indexOf('router.push(visible.targetUrl)');
    assert.ok(click > -1, 'the strip does not log a click at all');
    assert.ok(push > -1, 'the strip does not navigate');
    assert.ok(click < push, 'the click must be logged BEFORE navigating away');
});

test('a Club Arena destination gets a real navigation, not a router push', () => {
    /* Club Arena is a static SPA under public/hub/club-arena/, not a Next
       page. next/router strips the trailing slash, matches nothing, and falls
       through to pages/hub/[orbId].js, which renders "Unknown World - This
       World is Being Built". Observed in production 2026-08-28: the click
       logged correctly (ad_event id 173) and then landed the player on a
       Coming Soon page. Two of the six Hub placements point there. */
    const lib = read(LIB);
    assert.match(lib, /export function leavesTheNextRouter/);
    assert.match(lib, /startsWith\('\/hub\/club-arena'\)/);

    const strip = read(STRIP);
    const click = strip.indexOf('logHubClick(visible.adId)');
    const assign = strip.indexOf('window.location.assign(visible.targetUrl)');
    const push = strip.indexOf('router.push(visible.targetUrl)');
    assert.ok(assign > -1, 'no hard navigation for destinations outside the Next router');
    assert.ok(click < assign, 'the click must be logged before a full page navigation');
    assert.ok(assign < push, 'the SPA case must be handled before falling through to router.push');
});

test('an ad destination is checked before a browser is sent to it', () => {
    const lib = read(LIB);
    assert.match(lib, /export function isSafeHubDestination/);
    assert.match(lib, /url\.startsWith\('\/\/'\)/, 'a protocol-relative URL is another site');
    const strip = read(STRIP);
    assert.match(strip, /isSafeHubDestination\(visible\.targetUrl\)/);
});

test('a dismissal expires with the page load and is counted', () => {
    const strip = read(STRIP);
    assert.ok(
        !strip.includes('localStorage') && !strip.includes('sessionStorage'),
        'a persisted dismissal is the absorbing state PR #1505 was about'
    );
    assert.match(strip, /logHubAdEvent\(visible\.adId, 'dismiss'\)/);
});

test('VIP suppression is absent, in both directions', () => {
    // Dan 2026-08-27: "even vips will see ads remove that for now."
    const both = read(LIB) + read(STRIP);
    assert.ok(!both.includes('isVip'), 'no VIP gate belongs in the client');
    assert.ok(!both.includes('is_vip'), 'no VIP gate belongs in the client');
    assert.ok(!both.includes('Ad-Free'), 'do not re-advertise an ad-free tier');
});

test('no emoji in either source file', () => {
    /* Geometric glyphs are fine and are exactly what the catalog uses:
       ◆ U+25C6, ◉ U+25C9, ◈ U+25C8, ▣ U+25A3, ▲ U+25B2 — and ★ U+2605, which
       sits inside the Miscellaneous Symbols block alongside real emoji. A
       range that swallowed U+2600-U+27BF would therefore fail on the house
       glyph set itself, which is why this matches the pictographic planes
       instead. Those are the ones that break the SWC compiler. */
    const emoji = /[\u{1F000}-\u{1FAFF}\u{FE0F}]/u;
    for (const f of [LIB, STRIP]) {
        assert.ok(!emoji.test(read(f)), `${f} contains an emoji`);
    }
});

test('the admin rollup counts in Postgres, per slot, with no silent ceiling', () => {
    /* The route used to read `.from('ad_event').select(...).limit(50000)` and
       tally in JavaScript. Two problems:

       - The limit was a ceiling with no signal. This table logs an impression
         per ad per page load, so 50,000 arrives; PostgREST returns the first
         50,000 and the route reports the total with complete confidence,
         under-counting a little more every day and never saying so.
       - The tally was keyed on ad_id alone, which was right when one slot
         existed. bbj_running now runs on four surfaces, and one blended number
         cannot tell an operator which of them is working. */
    const route = read('pages/api/club-arena/house-ads.js');
    assert.match(route, /rpc\('fn_ad_stats'\)/);
    /* Comments first. The comment above that RPC call quotes the old
       `.limit(50000)` line to explain why it went, so a naive substring search
       finds the explanation and fails on it. Strip the prose and read the
       code. */
    const code = route.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.ok(!code.includes('limit(50000)'), 'the 50,000-row ceiling is still there');
    assert.match(route, /statsBySlot/);
    // null still means COULD NOT COUNT, never zero.
    assert.match(route, /let stats = null;/);
    assert.match(route, /let statsBySlot = null;/);
});

test('there is ONE Hub ad client, and the rail uses it', () => {
    /* Two clients landed within three minutes of each other on 2026-08-28 -
       this session's strip and PR #903's rail - and both wrote hub_promotions,
       so the data could not tell the surfaces apart and the same logic was
       maintained twice.

       They are one client now. The strip's version won because it carries the
       destination safety check and leavesTheNextRouter, which the rail needed
       and did not have. */
    assert.ok(
        !existsSync(join(ROOT, 'src/services/adService.js')),
        'the duplicate Hub ad client is back'
    );
    const rail = read('src/components/ads/HubPromoRail.jsx');
    assert.match(rail, /from '\.\.\/\.\.\/lib\/hubAds'/);
    assert.ok(!rail.includes('services/adService'), 'the rail still imports the deleted client');
});

test('the rail does not send a Club Arena destination through the Next router', () => {
    /* Two of the six live Hub placements point at /hub/club-arena/, a static
       SPA that next/link cannot reach: the trailing slash is stripped, nothing
       matches, and pages/hub/[orbId].js renders "Unknown World". The strip hit
       this in production; the rail carried the identical defect. */
    const rail = read('src/components/ads/HubPromoRail.jsx');
    assert.ok(!rail.includes("from 'next/link'"), 'next/link cannot reach the Club Arena SPA');
    assert.match(rail, /leavesTheNextRouter\(ad\.targetUrl\)/);
    assert.match(rail, /window\.location\.assign\(ad\.targetUrl\)/);

    const click = rail.indexOf('logHubClick(ad.adId)');
    const assign = rail.indexOf('window.location.assign(ad.targetUrl)');
    const push = rail.indexOf('router.push(ad.targetUrl)');
    assert.ok(click > -1 && click < assign, 'the click must be logged before navigating');
    assert.ok(assign < push, 'the SPA case must be handled before falling through to router.push');
});

test('the rail card is still a link, even though it navigates by hand', () => {
    // A screen reader, a middle click and "copy link address" all want an href.
    const rail = read('src/components/ads/HubPromoRail.jsx');
    assert.match(rail, /<a className="promo-card" href=\{href\}/);
    assert.match(rail, /isSafeHubDestination\(ad\.targetUrl\) \? ad\.targetUrl : '\/hub'/);
});
