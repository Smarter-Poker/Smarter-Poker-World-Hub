// NO VENUE PICTURE REACHES THE DOM UNGUARDED.
//
// Venue, club and series photography is served from each operator's own
// domain, 104 distinct hosts across 478 venues as measured on 2026-09-30, and
// an img-src allow-list can never cover that set. The platform mirrors the art
// instead, and `safeImageUrl` is what makes the policy safe to ENFORCE: an
// unmirrored host is not rendered at all and the caller draws the monogram or
// painted plate it already has.
//
// The rule kept being half-applied. mapPresentation guarded four readers and
// missed the tour pin; GlobalSearchOverlay guarded two and missed the tour
// result; the daily tournaments API put an unmirrored profile_photo_url into a
// field named logo_url, so every reader downstream trusted the name. These
// pin the shared components that most callers funnel through, so a new caller
// is guarded without having to remember, and pin the readers that render an
// image themselves.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// The components every card, mark and hero funnels through. Guarding here is
// what makes the rule hold for callers that have not been written yet.
const SHARED = [
    ['src/components/poker-near-me/PokerIdentityMark.jsx', 'safeSrc'],
    ['src/components/poker-near-me/DeepRouteSignalDeck.jsx', 'safeImage'],
];

for (const [file, localName] of SHARED) {
    test(`${path.basename(file)} guards its own image, so callers cannot forget`, () => {
        const src = read(file);
        assert.match(src, /from '\.\.\/\.\.\/lib\/security\/imageHosts\.js'/,
            'must import the guard');
        assert.match(src, new RegExp(`const ${localName}\\s*=\\s*safeImageUrl\\(`),
            'must derive a guarded value');
        assert.ok(!/<img\s[^>]*src=\{(src|image)\}/.test(src),
            'must not render the raw prop');
    });
}

test('the search overlay guards every holder, including the tour result', () => {
    const src = read('src/components/poker-near-me/GlobalSearchOverlay.jsx');
    assert.match(src, /function LogoHolder\([^)]*\) \{[\s\S]{0,400}?src = safeImageUrl\(src\)/,
        'LogoHolder must guard its own src');
});

test('every map reader uses the guarded helper, not the raw column', () => {
    const src = read('src/components/poker-near-me/mapPresentation.js');
    assert.ok(!/escapeHtml\(venue\.logo_url\)/.test(src),
        'a raw logo_url must not be painted into Leaflet HTML');
    assert.ok(src.split('escapeHtml(venueLogo(venue))').length - 1 >= 5,
        'every icon and popup builder reads through venueLogo');
});

// Readers that render an image themselves rather than through a shared
// component. Each must both test and render the guarded value, so an
// unmirrored host falls through to the painted fallback instead of src="".
const DIRECT = [
    'src/components/poker-near-me/RichTourCard.jsx',
    'src/components/poker-near-me/TourCard.js',
    'src/components/poker-near-me/PokerTourCard.jsx',
    'src/components/poker-near-me/NewSeriesVenueCard.jsx',
    'src/components/poker-near-me/DailyTournamentsPanel.jsx',
    'src/components/poker-near-me/VenueCard.js',
    'pages/hub/home-games/[slug].js',
    'pages/hub/home-games/[slug]/dashboard.js',
    'pages/hub/home-games/in/[state]/[city].js',
    'pages/hub/home-games/in/[state]/index.js',
    'pages/hub/home-games/near-me.js',
];

for (const file of DIRECT) {
    test(`${file} guards the picture it renders`, () => {
        const src = read(file);
        assert.match(src, /safeImageUrl/, 'must use the guard');
        // No raw photo column may be handed straight to src=.
        const raw = /src=\{\s*[A-Za-z_$][\w$.?]*\.(logo_url|profile_photo_url|cover_photo_url|cover_url|avatar_url|host_avatar_url|image_url)\s*\}/;
        assert.ok(!raw.test(src), 'a raw photo column must not be rendered directly');
        // Nothing may resolve to the empty string, which re-requests the page.
        assert.ok(!/src=\{safeImageUrl\([^)]*\)\s*\|\|\s*''\}/.test(src),
            "an unguarded value must skip the <img>, never render src=''");
    });
}

test('the venue page guards the scraped news picture and quotes it', () => {
    const src = read('pages/hub/venues/[id].js');
    assert.ok(!/backgroundImage: 'url\(' \+ article\.image_url/.test(src),
        'string concatenation into url() let a ) end the token early');
    assert.match(src, /safeImageUrl\(article\.image_url\)/, 'the scraped image must be guarded');
});

test('the share card points at the mirror, not at a casino', () => {
    const src = read('pages/hub/venues/[id].js');
    assert.ok(!/image: toAbsoluteImageUrl\(venue\.profile_photo_url\)/.test(src),
        'profile_photo_url is third party for 185 of 194 venues and must not lead');
    assert.match(src, /image: toAbsoluteImageUrl\(getVenueLogoUrl\(venue\)\)/,
        'the mirrored logo comes first');
});

test('a field named logo_url cannot carry an unmirrored URL off the tournaments API', () => {
    const src = read('pages/api/poker/daily-tournaments.js');
    assert.ok(!/logoMap\.set\(v\.id, v\.logo_url \|\| v\.profile_photo_url/.test(src),
        'the API must not launder profile_photo_url into the logo_url key');
    assert.match(src, /safeImageUrl\(v\.logo_url\) \|\| safeImageUrl\(v\.profile_photo_url\)/,
        'both candidates must be guarded before they are named logo_url');
});

test('the guard actually refuses a casino host and keeps the mirror', async () => {
    const { safeImageUrl } = await import('../src/lib/security/imageHosts.js');
    assert.equal(safeImageUrl('https://pokeratlas-images-production.s3.amazonaws.com/a.png'), null);
    assert.equal(safeImageUrl('https://www.google.com/s2/favicons?domain=x&sz=256'), null,
        'the enrichment script writes this shape into logo_url; it is not allow-listed');
    assert.equal(safeImageUrl('//thelodgepokerclub.com/x.png'), null, 'protocol-relative is not same-origin');
    assert.ok(safeImageUrl('https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/venue-logos/1828.png'));
    assert.equal(safeImageUrl('/images/venues/1828.png'), '/images/venues/1828.png');
});
