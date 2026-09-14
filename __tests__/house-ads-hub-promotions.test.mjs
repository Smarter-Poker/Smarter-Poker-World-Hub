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
/* THE HUB HOME CARRIES NO ADVERT (Dan 2026-08-29). HubPromoStrip is deleted;
   every rule it used to be pinned on is pinned on the rail below, which is the
   surviving Hub surface. See "no advert is mounted on the Hub home". */
const RAIL = 'src/components/ads/HubPromoRail.jsx';
const PROMOS_PAGE = 'pages/hub/promotions.js';
const PAGE = 'pages/hub/index.js';

test('the Hub ad client and rail both exist', () => {
    for (const f of [LIB, RAIL]) {
        assert.ok(existsSync(join(ROOT, f)), `${f} is missing`);
    }
});

test('no advert is mounted on the Hub home', () => {
    /* Dan 2026-08-29, verbatim: "DO NOT PUT ADS IN RANDOM PLACES OR OVERLAPPING
       IMAGES EVER."

       HubPromoStrip was mounted here on 2026-08-28 behind a comment reasoning
       that the 3D carousel is position:fixed "so nothing moves". That is
       exactly why it was wrong: a fixed carousel is not in the flow, so a strip
       placed in the flow does not sit above it in an empty band, it sits ON it.
       In production it covered the featured cards, which are the page.

       This asserts the absence, because the mistake was easy to make once and
       will be easy to make again. */
    // A comment may name the component and say why it is gone; a code path
    // must not reference it. The page carries exactly such a comment.
    const code = read(PAGE)
        .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, '')
        .replace(/^\s*\/\/.*$/gm, '');
    assert.ok(!existsSync(join(ROOT, 'src/components/ui/HubPromoStrip.js')), 'the strip is back');
    assert.doesNotMatch(code, /HubPromoStrip/);
    assert.doesNotMatch(code, /HubPromoRail/, 'the rail belongs on /hub/promotions, not the home');
    assert.doesNotMatch(code, /hub_promotions/);
});

test('the rail is actually rendered on the promotions page, not merely defined', () => {
    // The estate's recurring bug shape is a component that exists and is
    // imported by nothing.
    const page = read(PROMOS_PAGE);
    assert.match(page, /import\s+HubPromoRail\s+from\s+'\.\.\/\.\.\/src\/components\/ads\/HubPromoRail'/);
    assert.match(page, /<HubPromoRail\b/, 'HubPromoRail is imported but never rendered');
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

test('the click is logged before the navigation that would unmount the rail', () => {
    const rail = read(RAIL);
    const click = rail.indexOf('logHubClick(ad.adId)');
    const push = rail.indexOf('router.push(target)');
    assert.ok(click > -1, 'the rail does not log a click at all');
    assert.ok(push > -1, 'the rail does not navigate');
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

    const rail = read(RAIL);
    const click = rail.indexOf('logHubClick(ad.adId)');
    const assign = rail.indexOf('window.location.assign(target)');
    const push = rail.indexOf('router.push(target)');
    assert.ok(assign > -1, 'no hard navigation for destinations outside the Next router');
    assert.ok(click < assign, 'the click must be logged before a full page navigation');
    assert.ok(assign < push, 'the SPA case must be handled before falling through to router.push');
});

test('an ad destination is checked before a browser is sent to it', () => {
    const lib = read(LIB);
    assert.match(lib, /export function isSafeHubDestination/);
    assert.match(lib, /url\.startsWith\('\/\/'\)/, 'a protocol-relative URL is another site');
    const rail = read(RAIL);
    assert.match(rail, /isSafeHubDestination\(ad\.targetUrl\)/);
});

test('a dismissal expires with the page load and is counted', () => {
    const rail = read(RAIL);
    assert.ok(
        !rail.includes('localStorage') && !rail.includes('sessionStorage'),
        'a persisted dismissal is the absorbing state PR #1505 was about'
    );
    assert.match(rail, /logHubAdEvent\(ad\.adId, 'dismiss'\)/);
});

test('VIP suppression is absent, in both directions', () => {
    // Dan 2026-08-27: "even vips will see ads remove that for now."
    const both = read(LIB) + read(RAIL);
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
    for (const f of [LIB, RAIL]) {
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
    assert.match(rail, /leavesTheNextRouter\(target\)/);
    assert.match(rail, /window\.location\.assign\(target\)/);

    const click = rail.indexOf('logHubClick(ad.adId)');
    const assign = rail.indexOf('window.location.assign(target)');
    const push = rail.indexOf('router.push(target)');
    assert.ok(click > -1 && click < assign, 'the click must be logged before navigating');
    assert.ok(assign < push, 'the SPA case must be handled before falling through to router.push');
});

test('the rail picture is still a link, even though a tap opens the popup', () => {
    // A screen reader, a middle click and "copy link address" all want an href.
    const rail = read('src/components/ads/HubPromoRail.jsx');
    assert.match(rail, /<a\s+className="promo-picture"\s+href=\{href\}/);
    assert.match(rail, /const target = isSafeHubDestination\(ad\.targetUrl\) \? ad\.targetUrl : null;/);
    assert.match(rail, /const href = target \|\| '\/hub';/);
});

test('a click is attention, and the route reports what followed it', () => {
    /* vip_upsell having clicks says nothing about whether anybody subscribed.
       fn_ad_conversions asks whether the same player did the thing the
       campaign promotes within 24 hours - correlation inside a window, not
       proof of cause, which is why the field is clicksFollowedBy. */
    const route = read('pages/api/club-arena/house-ads.js');
    assert.match(route, /rpc\('fn_ad_conversions'/);
    assert.match(route, /clicksFollowedBy/);
    /* NULL, never 0, where no outcome is defined for the campaign. A confident
       zero reads as "converts nobody" when the truth is "success is undefined
       here". */
    assert.match(route, /r\.clicks_followed_by == null \? null : Number\(r\.clicks_followed_by\)/);
    assert.match(route, /let conversions = null;/);
});

test('the route reports reach in people, and admits a partial list', () => {
    /* IMPRESSIONS ARE NOT PEOPLE. The lobby logs one impression per advert per
       page load, so a player reloading thirty times is thirty impressions and
       one person. Production the day this shipped: spins_jackpot had 65
       impressions on lobby_strip and five viewers. */
    const route = read('pages/api/club-arena/house-ads.js');
    assert.match(route, /viewers: Number\(r\.viewers\) \|\| 0/);
    assert.match(route, /clickers: Number\(r\.clickers\) \|\| 0/);

    /* THE LAST TWO SILENT CEILINGS. The catalog read stops at 200 rows and
       placements at 1,000. The limits are fine; presenting a partial list as
       the whole one is not - the same shape as the 50,000-row stats ceiling
       that under-counted silently for as long as it existed. */
    assert.match(route, /\{ count: 'exact' \}/);
    assert.match(route, /truncated: \{/);
    // null when nothing was cut, a number only when the list really is short.
    assert.match(route, /adsTotal != null && \(ads \|\| \[\]\)\.length < adsTotal \? adsTotal : null/);
});

test('the route carries a trend, because a lifetime total cannot show decay', () => {
    /* Every other figure is a lifetime number, so a campaign that worked for
       three weeks and has done nothing since reads the same as one working
       today. lastEventAt catches a surface that stopped dead; it says nothing
       about one quietly halving. */
    const route = read('pages/api/club-arena/house-ads.js');
    assert.match(route, /rpc\('fn_ad_daily', \{ p_days: 14 \}\)/);
    assert.match(route, /let daily = null;/);
    // Oldest first, so a caller can read it left to right.
    assert.match(route, /series\.sort\(\(a, b\) => String\(a\.day\)\.localeCompare\(String\(b\.day\)\)\)/);
});

test('a placement can be added, changed and removed through the route', () => {
    /* POST created the advert plus exactly ONE placement and PATCH never
       touched ad_placement, so a campaign could be made live on one surface
       and never moved. Every multi-slot placement in production had been
       written by an agent in a migration. */
    const route = read('pages/api/club-arena/house-ads.js');
    assert.match(route, /req\.method === 'POST' && String\(req\.query\.kind\) === 'placement'/);
    assert.match(route, /req\.method === 'PATCH' && String\(req\.query\.kind\) === 'placement'/);
    assert.match(route, /req\.method === 'DELETE' && String\(req\.query\.kind\) === 'placement'/);

    /* Each failure says what happened rather than 500ing. The unique key and
       the club foreign key both became reachable from a browser today, so
       their error codes are the ones an operator will actually hit. */
    assert.match(route, /already has a placement on that slot/);
    assert.match(route, /That club does not exist/);
    assert.match(route, /That placement no longer exists/);

    /* Removing the LAST placement leaves the campaign running nowhere, which
       looks perfectly healthy in the list. */
    assert.match(route, /orphaned/);
});

test('an ad image is same-origin, refused before it is stored and before it renders', () => {
    /* The fetch happens on render, without the viewer doing anything, so an
       external host would hand every player's IP and user agent to a third
       party chosen by whoever typed the URL into the panel. */
    /* The check moved from cleanImageUrl into readSitePath on 2026-08-29, and
       stopped being silent while it did. cleanImageUrl returned null for an
       outside host, so the row saved, the panel said "Saved." and the field
       came back empty; the same rule now refuses with a 400 that names the
       value, and covers target_url as well. */
    const route = read('pages/api/club-arena/house-ads.js');
    assert.match(route, /function readSitePath/);
    assert.doesNotMatch(route, /function cleanImageUrl/);
    assert.match(route, /!url\.startsWith\('\/'\) \|\| url\.startsWith\('\/\/'\)/);

    const lib = read('src/lib/hubAds.js');
    assert.match(lib, /export function isSafeAdImage/);
    assert.match(lib, /imageUrl: r\.image_url == null \? null : String\(r\.image_url\)/);

    const rail = read('src/components/ads/HubPromoRail.jsx');
    assert.match(rail, /isSafeAdImage\(ad\.imageUrl\)/);
    // A broken-image icon in a promotion is worse than no promotion.
    assert.match(rail, /onError=\{\(\) =>/);
});

test('the weight floor matches the constraint the database now carries', () => {
    /* ad_catalog_weight_positive refuses a zero. Clamping to 1 here means the
       panel says "1" rather than the save failing on a constraint the operator
       cannot see. */
    const route = read('pages/api/club-arena/house-ads.js');
    assert.match(route, /patch\.weight = Math\.max\(1, Math\.min\(1000/);
});

test('an unknown slot is refused, never quietly turned into lobby_strip', () => {
    /* THIS IS A REGRESSION TEST FOR MY OWN CODE. The first version of the
       placement routes normalised an unrecognised slot to 'lobby_strip' and an
       unrecognised audience to 'all', on the reasoning that the panel only
       sends values from its own selects. On PATCH that reasoning relocates a
       LIVE placement to a surface nobody named, answers "Saved", and leaves
       the panel disagreeing with the database - the silent-wrong-write shape
       this estate keeps paying for. */
    const route = read('pages/api/club-arena/house-ads.js');

    // The defaulting normalisers must be gone, not merely unused.
    assert.doesNotMatch(route, /function normaliseSlot/);
    assert.doesNotMatch(route, /function normaliseAudience/);

    // Their replacements answer null for "not acceptable", which cannot be
    // written to a NOT NULL column by accident.
    assert.match(route, /function readSlot\(value\) \{\s*const s = String\(value\);\s*return SLOTS\.has\(s\) \? s : null;/);
    assert.match(route, /function readAudience\(value\) \{\s*const s = String\(value\);\s*return AUDIENCES\.has\(s\) \? s : null;/);

    // And every caller refuses rather than defaults.
    const refusals = route.match(/Not A Known Slot/g) || [];
    assert.ok(refusals.length >= 3, `expected a refusal at all three call sites, found ${refusals.length}`);
    assert.match(route, /Not A Known Audience/);
});

test('the create path validates the placement BEFORE it writes the ad', () => {
    /* Refusing after ad_catalog has been inserted would leave a live ad row
       with no placement - running nowhere, looking healthy in the list - and
       hand the operator a 400 for a campaign that was in fact half created. */
    const route = read('pages/api/club-arena/house-ads.js');
    const validate = route.indexOf("const slot = b.slot === undefined ? 'lobby_strip' : readSlot(b.slot)");
    const insert = route.indexOf(".from('ad_catalog')\n                .insert({");
    assert.ok(validate > -1, 'the create path no longer reads the slot up front');
    assert.ok(insert > -1, 'could not find the ad_catalog insert');
    assert.ok(validate < insert, 'the slot is validated AFTER the ad is written, which strands a placement-less ad');

    // Absent still means "use the default" - an ad with no placement runs
    // nowhere, so the create path must keep defaulting when nothing is sent.
    assert.match(route, /b\.slot === undefined \? 'lobby_strip'/);
    assert.match(route, /b\.audience === undefined \? 'all'/);
});

/* ═══════════════════════════════════════════════════════════════════════════
   2026-08-29 — A CLICK THAT WENT NOWHERE WAS STILL A CLICK

   Both Hub clients logged the click and THEN asked whether the destination was
   one they would follow. `target_url` had no check on this side at all, so an
   `https://` typed into the panel was stored, served, rendered as a tappable
   promotion, counted, and refused at the last moment by the browser that got
   it. The ad looked live everywhere an operator could see it and was dead
   everywhere a player could - and the events it produced are worse than no
   events, because they inflate the click-through rate an operator reads when
   deciding what to run next, on exactly the campaigns that are broken.
   ═══════════════════════════════════════════════════════════════════════════ */

test('the destination is validated where it is written, not only where it is followed', () => {
    const route = read('pages/api/club-arena/house-ads.js');
    // Create and edit both refuse, and both name the value they refused.
    assert.match(route, /const targetUrl = readSitePath\(b\.target_url\)/);
    assert.match(route, /const t = readSitePath\(b\.target_url\)/);
    // Four here; the placement verbs add two more, pinned separately below.
    assert.ok(
        (route.match(/Not A Site Path: /g)?.length || 0) >= 4,
        'target and image, on both ad verbs'
    );
    // The stored value is the checked one, never the raw column.
    assert.match(route, /target_url: targetUrl,/);
    assert.doesNotMatch(route, /target_url: clean\(b\.target_url/);
});

test('readSitePath rejects what every client already rejects', () => {
    const route = read('pages/api/club-arena/house-ads.js');
    const fn = route.slice(route.indexOf('function readSitePath'));
    // Protocol-relative and backslash included: browsers normalise
    // /\evil.example toward //evil.example.
    assert.match(fn, /url\.startsWith\('\/\/'\)/);
    assert.match(fn, /url\.includes\('\\\\'\)/);
});

test('a refusal is a 400, not a null the operator has to notice', () => {
    /* The old cleanImageUrl returned null for an outside host: 200, "Saved.",
       and an empty field. Silently writing something other than what was asked
       for is the failure shape this file's own readSlot comment exists to end. */
    const route = read('pages/api/club-arena/house-ads.js');
    const fn = route.slice(route.indexOf('function readSitePath'), route.indexOf('export default'));
    assert.match(fn, /return false;/, 'present-but-refused must be distinguishable from absent');
});

test('the click is logged only where a click went somewhere', () => {
    const rail = read(RAIL);
    const proceed = rail.slice(rail.indexOf('const proceed = () => {'), rail.indexOf('const dismiss = () => {'));
    const railGuard = proceed.indexOf('if (!target) return;');
    const railClick = proceed.indexOf('logHubClick(ad.adId)');
    assert.ok(railGuard > -1 && railClick > railGuard, 'the rail logs before it checks');
});

test('the create path floors weight at 1, like the edit path already did', () => {
    /* Number('') is 0 and Number.isFinite(0) is true, so a cleared weight box
       passed the guard and hit ad_catalog_weight_positive - a 500 reading
       "Could not create that ad", naming nothing. */
    const route = read('pages/api/club-arena/house-ads.js');
    assert.match(route, /const weight = Number\.isFinite\(Number\(b\.weight\)\)\s*\?\s*Math\.max\(1,/);
    assert.doesNotMatch(route, /Math\.max\(0, Math\.min\(1000/);
});

test('an insert that could not be read back is not a bare 500', () => {
    /* .maybeSingle() answers an unreadable row with { data: null, error: null }.
       created.id then threw, and the catch turned an ad that may well have been
       written into "Internal server error". */
    const route = read('pages/api/club-arena/house-ads.js');
    assert.match(route, /if \(!created\?\.id\)/);
    assert.match(route, /could not be read back/);
});

/* ═══════════════════════════════════════════════════════════════════════════
   2026-08-29 — "LINKS TO" COULD NOT CHANGE WHERE THE AD WENT

   fn_resolve_ads serves COALESCE(pl.target_url, c.target_url), and eight of the
   eighteen live placements carry an override - every hub_promotions row and
   both session_summary rows. vip_upsell reads /vip on the campaign and serves
   /hub/vip-membership on the Hub.

   This route never selected that column and neither placement verb wrote it, so
   the panel's only destination control was the campaign's, and editing it on
   any of those eight answered "Saved." and changed nothing on the surface
   actually serving.
   ═══════════════════════════════════════════════════════════════════════════ */

test('the placement read includes the override the resolver prefers', () => {
    const route = read('pages/api/club-arena/house-ads.js');
    assert.match(route, /'id, ad_id, slot, club_id, audience, daily_cap, is_active, target_url, image_url'/);
});

test('both placement verbs write the override, through the same check', () => {
    const route = read('pages/api/club-arena/house-ads.js');
    // Create.
    assert.match(route, /const newTarget = readSitePath\(b\.target_url\)/);
    assert.match(route, /target_url: newTarget,/);
    // Edit, keyed on !== undefined so that "clear it" and "leave it alone"
    // stay different instructions on the wire.
    const patch = route.slice(route.indexOf("String(req.query.kind) === 'placement'"));
    assert.match(patch, /if \(b\.target_url !== undefined\) \{/);
    assert.doesNotMatch(patch, /if \(b\.target_url\) \{/);
});

test('a placement destination is refused by the same rule as the campaign one', () => {
    /* The resolver hands whichever of the two it serves to the same client, so
       a rule that applied to only one of them would be no rule at all. */
    const route = read('pages/api/club-arena/house-ads.js');
    assert.equal(
        route.match(/Not A Site Path: /g)?.length,
        10,
        'target, image AND poster on the ad verbs, plus target AND image on both placement verbs'
    );
});

test('the creative lives on the placement, and the API reads and writes it (2026-09-03)', () => {
    /* One picture cannot serve a 6:1 strip and a 3:1 session summary. The
       resolver serves COALESCE(pl.image_url, c.image_url); a panel that
       could not read or write the placement's own picture would be editing a
       fallback and calling it the creative. */
    const route = read('pages/api/club-arena/house-ads.js');
    assert.match(route, /'id, ad_id, slot, club_id, audience, daily_cap, is_active, target_url, image_url'/);
    const create = route.slice(
        route.indexOf("String(req.query.kind) === 'placement'"),
        route.indexOf("String(req.query.kind) === 'placement'", route.indexOf("String(req.query.kind) === 'placement'") + 1)
    );
    assert.match(create, /const newImage = readSitePath\(b\.image_url\);/);
    assert.match(create, /image_url: newImage,/);
    const patch = route.slice(route.lastIndexOf("String(req.query.kind) === 'placement'"));
    assert.match(patch, /if \(b\.image_url !== undefined\) \{/);
    assert.match(patch, /patch\.image_url = img;/);
});

test('uploaded creatives resolve on this origin: /ad-creatives/* is rewritten to the bucket', () => {
    /* The three same-origin locks (ad_catalog CHECK, readSitePath here,
       isSafeAdImage at render) all insist on a rooted path. A club owner's
       upload lands in the ad-creatives storage bucket, whose public URL is on
       supabase.co. This rewrite is the only reason `/ad-creatives/club/<id>/
       <file>` is a real picture and not a 404 behind a passing check. */
    const config = read('next.config.js');
    assert.match(
        config,
        /source: '\/ad-creatives\/:path\*',\s*destination:\s*'https:\/\/kuklfnapbkmacvwxktbh\.supabase\.co\/storage\/v1\/object\/public\/ad-creatives\/:path\*'/
    );
    // In afterFiles: a real file under public/ad-creatives would still win, and none may exist.
    const after = config.slice(config.indexOf('afterFiles:'), config.indexOf('fallback:'));
    assert.ok(after.includes('/ad-creatives/:path*'), 'the ad-creatives rewrite is not in afterFiles');
    assert.equal(existsSync(join(ROOT, 'public/ad-creatives')), false, 'public/ad-creatives would shadow the bucket');
});

test('the ad click redirect accepts a code and never a url (2026-09-09)', () => {
    /* A sponsor sends traffic to their own site. The address is stored on the
       campaign and reached through an opaque code, so every same-origin check
       on ad destinations still sees a rooted path - and this route, which is
       the one place an outside address is emitted, cannot be turned into an
       open redirect because it accepts no address to begin with. */
    const route = read('pages/api/c/[code].js');
    /* Comments are stripped before the forbidding assertions below. The route's
       own docblock NAMES `?url=` and `?next=` in order to say it does not
       accept them, and a test that forbade explaining the rule would be a test
       against writing the reason down. */
    const code = route.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

    // No URL enters this route. If any of these appear, it has become the
    // exact thing OWASP names: a redirector that obeys its caller.
    assert.doesNotMatch(code, /req\.query\.(url|next|return_to|redirect|dest|to)\b/);
    assert.doesNotMatch(code, /\?url=|\?next=|\?return_to=/);

    // The destination comes from the database, by code.
    assert.match(route, /rpc\('fn_ad_click_redirect'/);
    assert.match(route, /p_click_code: code/);

    // The code shape is checked before anything reaches the query.
    assert.match(route, /\/\^\[A-Za-z0-9_-\]\{6,40\}\$\//);

    // Belt and braces over the column's own CHECK: only https ever leaves.
    assert.match(route, /\^https:\\\/\\\/\[A-Za-z0-9\]/);

    // A cached redirect is a click that silently stops being counted.
    assert.match(route, /no-store/);

    // Only two Location values are possible: the approved address, or a path
    // on this site. There is no third branch.
    const locations = route.match(/setHeader\('Location', ([^)]+)\)/g) || [];
    assert.equal(locations.length, 2, 'exactly two Location values may exist');
    assert.ok(locations.some((l) => l.includes('FALLBACK')));
    assert.ok(locations.some((l) => l.includes('result.url')));
    assert.match(route, /const FALLBACK = '\/hub\/club-arena';/);

    // service_role only, and it says why rather than falling back to a role
    // the database will refuse anyway.
    assert.match(route, /SUPABASE_SERVICE_ROLE_KEY/);
    assert.doesNotMatch(route, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);

    // The short path resolves, in afterFiles beside the creatives rewrite.
    const config = read('next.config.js');
    assert.match(config, /source: '\/c\/:code',\s*destination: '\/api\/c\/:code',/);
    const after = config.slice(config.indexOf('afterFiles:'), config.indexOf('fallback:'));
    assert.ok(after.includes("'/c/:code'"), 'the click rewrite is not in afterFiles');
});

/* ═══════════════════════════════════════════════════════════════════════════
   THE STANDARD (Dan 2026-09-13): an advert is a responsive fluid picture and
   nothing else, and a tap opens it full screen. Club Arena pins the same two
   rules in tests/an-advert-is-a-picture.law.test.ts; these are the Hub's.
   ═══════════════════════════════════════════════════════════════════════════ */

test('the Hub advert is a responsive fluid picture, contained, and nothing else (2026-09-13)', () => {
    const rail = read(RAIL);
    // The box is 100% wide and owns the shape; the picture is contained.
    assert.match(rail, /const RATIO = '16 \/ 9';/);
    assert.match(rail, /style=\{\{ aspectRatio: RATIO \}\}/);
    const picture = rail.slice(rail.indexOf('.promo-picture {'), rail.indexOf('.promo-dots {'));
    assert.match(picture, /width: 100%;/);
    assert.match(picture, /object-fit: contain;/);
    assert.doesNotMatch(rail, /object-fit: cover/);
    // No text card on the surface: the headline is the accessible name, not a rendered line.
    assert.doesNotMatch(rail, /promo-headline|promo-sub|promo-glyph|promo-body|ad\.glyph/);
    // A pictureless advert is dropped, never rendered as text; a broken file drops its advert.
    assert.match(rail, /rows\.filter\(\(a\) => isSafeAdImage\(a\.imageUrl\)\)/);
    assert.match(rail, /onError=\{\(\) => dropBroken\(ad\.adId\)\}/);
    // Three rotating, as the lobby strip and the session summary.
    assert.match(rail, /const ROTATE_MS = 7000;/);
});

test('a tap on the Hub advert opens it full screen, and the button does the going (2026-09-13)', () => {
    const rail = read(RAIL);
    // The tap only opens the popup; it logs nothing.
    const activate = rail.slice(rail.indexOf('const activate = (e) => {'), rail.indexOf('const proceed = () => {'));
    assert.match(activate, /setOpen\(true\)/);
    assert.doesNotMatch(activate, /logHubClick|router\.push|window\./);
    // Full screen, a dialog, the poster contained and reading its own shape.
    assert.match(rail, /role="dialog"/);
    assert.match(rail, /aria-modal="true"/);
    assert.match(rail, /\.ad-interstitial \{[\s\S]*?position: fixed;[\s\S]*?inset: 0;/);
    const pic = rail.slice(rail.indexOf('.ad-interstitial__picture img {'));
    assert.match(pic, /object-fit: contain;/);
    assert.match(rail, /setRatio\(`\$\{img\.naturalWidth\} \/ \$\{img\.naturalHeight\}`\)/);
    assert.match(rail, /isSafeAdImage\(ad\.posterUrl\)/);
    // The rotation holds while the popup is up.
    assert.match(rail, /if \(openRef\.current\) return;/);
    // Escape closes, focus lands on Close, scroll is locked.
    assert.match(rail, /e\.key === 'Escape'/);
    assert.match(rail, /closeRef\.current\?\.focus\(\)/);
    assert.match(rail, /document\.body\.style\.overflow = 'hidden'/);
    // Closing without going is a dismiss, never a click.
    const dismiss = rail.slice(rail.indexOf('const dismiss = () => {'), rail.indexOf('const href ='));
    assert.match(dismiss, /'dismiss'/);
    assert.doesNotMatch(dismiss, /logHubClick/);
    assert.match(rail, /onClose=\{dismiss\}/);
    assert.match(rail, /onProceed=\{proceed\}/);
});

test('a sponsor destination leaves in a new tab through /c/<code>, counted by the redirect and never here (2026-09-13)', () => {
    const lib = read(LIB);
    assert.match(lib, /export const AD_CLICK_PREFIX = '\/c\/';/);
    assert.match(lib, /export function isExternalAdClick/);
    assert.match(lib, /posterUrl: r\.poster_url == null \? null : String\(r\.poster_url\)/);
    const rail = read(RAIL);
    const proceed = rail.slice(rail.indexOf('const proceed = () => {'), rail.indexOf('const dismiss = () => {'));
    assert.match(proceed, /window\.open\(target, '_blank', 'noopener,noreferrer'\)/);
    // The external branch returns BEFORE the click is logged: the redirect counts it.
    assert.match(proceed, /if \(external\) \{[\s\S]*?return;\s*\}\s*logHubClick\(ad\.adId\)/);
});

test('the catalog carries a poster, and the API reads and writes it by the same rule as every ad URL (2026-09-13)', () => {
    const route = read('pages/api/club-arena/house-ads.js');
    assert.match(route, /cta_label, image_url, poster_url, experiment_key, is_active/);
    assert.match(route, /const posterUrl = readSitePath\(b\.poster_url\);/);
    assert.match(route, /poster_url: posterUrl,/);
    assert.match(route, /if \(b\.poster_url !== undefined\) \{/);
    assert.match(route, /patch\.poster_url = poster;/);
});

test('the popup carries the sponsor\'s door (2026-09-13)', () => {
    // Everybody who sees an advert is a prospective advertiser. The door is
    // the Club Arena advertise route, outside the Next router: a real link.
    const rail = read(RAIL);
    assert.match(rail, /href="\/hub\/club-arena\/advertise"/);
    assert.match(rail, /Advertise With Us/);
});

test('an advert knows where it is: the Hub passes the edge-resolved country, and /api/geo returns nothing else (2026-09-14)', () => {
    const lib = read(LIB);
    // One memoised same-origin read, handed to the resolver as p_country.
    assert.match(lib, /fetch\('\/api\/geo', \{ credentials: 'omit', cache: 'no-store' \}\)/);
    assert.match(lib, /p_country: await playerCountry\(\)/);
    // Unknown is null, never a guess.
    assert.match(lib, /return \/\^\[A-Z\]\{2\}\$\/\.test\(c\) \? c : null;/);
    // The route answers from the edge header alone and is cached by nobody.
    assert.ok(existsSync(join(ROOT, 'pages/api/geo.js')), 'pages/api/geo.js is missing');
    const geo = read('pages/api/geo.js');
    assert.match(geo, /req\.headers\['x-vercel-ip-country'\]/);
    assert.match(geo, /'no-store, max-age=0'/);
    assert.match(geo, /res\.status\(200\)\.json\(\{ country \}\)/);
    assert.doesNotMatch(geo, /x-forwarded-for|x-real-ip|x-vercel-ip-city|x-vercel-ip-latitude|getServerUser/);
});
