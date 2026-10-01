// A VENUE PAGE SHARES ITS OWN CARD, AND ASKS NOTHING IT CANNOT HAVE.
//
// Two defects measured on production, both on the largest route family on
// the site (478 venue pages, most of their traffic signed out).
//
// 1. EVERY VENUE SHARED THE SAME PICTURE. next/head deduplicates meta by
//    `key`, and by name/httpEquiv/charSet/itemProp. It does NOT deduplicate
//    by `property`. SEOHead keys its tags `og-image`, `twitter-card`; this
//    page keyed the same tags `og:image`, `twitter:card`. Different keys
//    never collide, so BOTH rendered, SEOHead's first because children come
//    after it, and every scraper reads the first. The venue's own logo was
//    in the HTML the whole time, second, ignored. Two twitter:card tags and
//    two different site names shipped the same way.
//
// 2. A SIGNED-OUT VISIT PAID FOR A CALL THAT COULD ONLY FAIL. Who's Here
//    needs a session and answers 401 without one, and it ran for everybody.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const PAGE = fs.readFileSync(path.join(ROOT, 'pages/hub/venues/[id].js'), 'utf8');
const SHARED = fs.readFileSync(
    path.join(ROOT, 'vendor/commander-shared/src/components/seo/SEOHead.js'), 'utf8');

// The keys SEOHead owns. A page that emits any of these tags under a
// DIFFERENT key gets two of them, which is the whole bug.
const OWNED = [...SHARED.matchAll(/<meta key="([^"]+)" (?:property|name)="([^"]+)"/g)]
    .map(([, key, tag]) => ({ key, tag }));

test('the shared head component really does own these tags', () => {
    const tags = OWNED.map((o) => o.tag);
    for (const required of ['og:image', 'og:title', 'og:url', 'og:site_name', 'twitter:card', 'twitter:image']) {
        assert.ok(tags.includes(required), `SEOHead must emit ${required}`);
    }
});

test('the venue page emits no tag the shared head already owns', () => {
    for (const { tag } of OWNED) {
        const emitted = new RegExp(`<meta[^>]*(?:property|name)="${tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`);
        assert.ok(!emitted.test(PAGE),
            `the page re-emits ${tag}; SEOHead already does, and next/head will keep both`);
    }
});

test('a page meta that duplicates a shared tag must at least reuse its key', () => {
    // Belt and braces: if a future edit does add one back, a colliding key is
    // the only shape that cannot produce two tags.
    for (const m of PAGE.matchAll(/<meta key="([^"]+)" (?:property|name)="([^"]+)"/g)) {
        const [, key, tag] = m;
        const owned = OWNED.find((o) => o.tag === tag);
        if (owned) {
            assert.equal(key, owned.key,
                `${tag} is keyed "${key}" here and "${owned.key}" in SEOHead: both will render`);
        }
    }
});

test('the share image and card type are passed as props', () => {
    assert.match(PAGE, /ogImage=\{seo\.image \|\| undefined\}/,
        'the venue image must reach SEOHead as a prop, not a sibling meta');
    assert.match(PAGE, /twitterCard="summary"/,
        'the mirrored art is a wordmark between 154x173 and 371x136; a large '
        + 'image card prints mostly empty bars');
});

test('the share image is the mirrored logo, never the third-party column', () => {
    assert.match(PAGE, /image: toAbsoluteImageUrl\(getVenueLogoUrl\(venue\)\)/,
        'the mirror leads');
    assert.ok(!/image: toAbsoluteImageUrl\(venue\.profile_photo_url\)/.test(PAGE),
        'profile_photo_url is third party for 185 of the 194 venues that carry one');
});

test("Who's Here is never asked for without a session", () => {
    // Every call to the authenticated route must sit behind an auth check.
    const calls = [...PAGE.matchAll(/checkins\/whos-here/g)];
    assert.ok(calls.length >= 2, 'there are several call sites; this guard covers them all');
    assert.match(PAGE, /if \(!authUser\) \{ setWhosHere\(/,
        'the mount effect must return early when signed out');
    assert.match(PAGE, /if \(getAuthUser\(\)\) \{\s*\n\s*fetch\('\/api\/poker\/checkins\/whos-here/,
        'the realtime refresh must check too: a signed-out viewer sees other '
        + 'people check in');
});

test('signing out leaves the panel empty rather than stale', () => {
    assert.match(PAGE, /if \(!authUser\) \{ setWhosHere\(\{ total: 0, people: \[\], friends: \[\] \}\); return; \}/,
        'the early return must clear the panel, not leave another venue’s people in it');
});
