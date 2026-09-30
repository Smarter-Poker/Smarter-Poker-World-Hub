/* Venue photography is served from each casino's own domain: 192 of 478 venues
   across 104 distinct hosts, measured 2026-09-30. img-src can never list that
   set, because every new venue brings a new domain, so the platform mirrors the
   images into a Supabase bucket instead.

   The mirror was already complete. What was not complete was the reading: one
   span on the Poker Near Me directory drew `cover_photo_url || profile_photo_url`
   and skipped `logo_url`, so it hotlinked a casino for venues whose art we
   already hold. Every img-src violation left on that route came from it.

   These pin both halves: the guard that makes an unmirrored image degrade
   rather than violate, and the readers that prefer the mirror. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { safeImageUrl, imgSrcDirective, IMAGE_SOURCES } = require('../src/lib/security/imageHosts.js');
const read = (p) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

test('the guard allows the mirror and refuses a casino domain', () => {
    assert.ok(safeImageUrl('https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/venue-logos/1828.png'));
    assert.ok(safeImageUrl('/images/pnm-console/painted-controls-v1/icon-search.png'));
    assert.ok(safeImageUrl('data:image/png;base64,AAAA'));
    assert.ok(safeImageUrl('https://server.arcgisonline.com/tile/1/2/3'));
    // the real hosts measured on the venues route
    for (const h of [
        'https://pokeratlas-images-production.s3.amazonaws.com/venues/x.jpg',
        'https://www.shrtpoker.com/wp-content/x.png',
        'https://dkr2rmsityotp.cloudfront.net/x.jpg',
        'https://thelodgepokerclub.com/wp-content/x.jpg',
        'https://primesocialtx.com/x.jpg',
        'https://static.wixstatic.com/media/x.jpg',
    ]) assert.equal(safeImageUrl(h), null, `${h} must not render`);
    for (const junk of [null, undefined, '', '   ', 'javascript:alert(1)', 'not a url', 'ftp://x.test/a.png'])
        assert.equal(safeImageUrl(junk), null);
});

test('a protocol-relative URL is refused rather than guessed at', () => {
    // 11 venues carry these. They never rendered anyway; they must not start.
    assert.equal(safeImageUrl('//images.squarespace-cdn.com/content/v1/x.jpg'), null);
});

test('the policy and the guard read the same list, so they cannot drift', () => {
    const CONFIG = read('next.config.js');
    assert.match(CONFIG, /require\('\.\/src\/lib\/security\/imageHosts'\)/, 'the config must compose from the shared list');
    assert.match(CONFIG, /imgSrcDirective\(\),/, 'and use it for img-src');
    assert.doesNotMatch(CONFIG, /"img-src 'self'/, 'no second hand-written copy of the directive');
    // every https source in the list is one the guard also accepts
    for (const src of IMAGE_SOURCES.filter((x) => x.startsWith('https://') && !x.includes('*')))
        assert.ok(safeImageUrl(`${src}/x.png`), `${src} is in the policy so the guard must allow it`);
    assert.match(imgSrcDirective(), /^img-src 'self' data: blob: /);
});

test('every venue art reader prefers the mirror', () => {
    const UTILS = read('src/components/poker-near-me/pnm-utils.js');
    assert.match(UTILS, /safeImageUrl\(venue\.logo_url\)/, 'the shared resolver guards its candidates');
    assert.match(UTILS, /safeImageUrl\(venue\.profile_photo_url\)/);

    const MAP = read('src/components/poker-near-me/mapPresentation.js');
    assert.match(MAP, /safeImageUrl\(venue\?\.logo_url\)/, 'markers and popups build raw HTML, so they need it most');

    const SEARCH = read('src/components/poker-near-me/GlobalSearchOverlay.jsx');
    assert.match(SEARCH, /safeImageUrl\(item\.logo_url\)/);

    const TAB = read('pages/hub/poker-near-me/[pnmTab].js');
    assert.match(TAB, /style=\{getVenueLogoUrl\(venue\)/, 'the directory art must read the mirror, not the raw fields');
    assert.doesNotMatch(
        TAB,
        /backgroundImage: `url\(\$\{JSON\.stringify\(venue\.cover_photo_url/,
        'the hotlinking background must not come back',
    );

    const VENUE = read('pages/hub/venues/[id].js');
    assert.match(VENUE, /src=\{getVenueLogoUrl\(venue\)\}/, 'and so must the detail hero');
});
