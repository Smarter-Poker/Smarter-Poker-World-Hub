/**
 * #ClubArenaConsole deep-route contracts (2026-09-29).
 *
 * Source contracts for the deep Poker Near Me routes: the signal deck, the
 * location directories, the venue profile, and the series and tour surfaces.
 * Each assertion pins a defect that was measured in a render, not a taste.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));

test('the signal deck prints its description once', () => {
  const deck = read('src/components/poker-near-me/DeepRouteSignalDeck.jsx');
  // The console head used to be handed the same string the body prints, so
  // every deep route carried its description twice: once clipped inside a
  // painted band that does not wrap, and once as readable prose.
  assert.doesNotMatch(deck, /subtitle=\{description\}/);
  assert.match(deck, /subtitle=\{subtitle\}/);
  const descriptionPrints = deck.match(/\{description\}/g) || [];
  assert.equal(descriptionPrints.length, 1, 'description reaches the DOM exactly once');
  assert.match(deck, /<p className="pnm-deep-deck__description">\{description\}<\/p>/);
});

test('a phrase heading prints on the stage, not inside the painted band', () => {
  const deck = read('src/components/poker-near-me/DeepRouteSignalDeck.jsx');
  assert.match(deck, /headTitle = null/);
  assert.match(deck, /const stageHeading = Boolean\(headTitle/);
  assert.match(deck, /titleAs=\{stageHeading \? 'p' : 'h1'\}/);
  assert.match(deck, /title=\{stageHeading \? headTitle : title\}/);
  assert.match(deck, /<h1 id="pnm-deep-route-title" className="pnm-deep-deck__heading">\{title\}<\/h1>/);

  // One h1 per route either way: the painted band carries it when the
  // heading is a name, the stage carries it when the heading is a phrase.
  const page = read('src/components/poker-near-me/PokerNearMeLocationPage.jsx');
  assert.match(page, /headTitle=\{placeLabel\}/);
});

test('the painted head keeps its own lines against the pre-console stylesheets', () => {
  const css = read('src/styles/worlds/poker-near-me-console-deep.css');
  // poker-near-me.css and poker-near-me-command-surfaces.css still dress
  // `.pnm-deep-deck h1` as free display type. `text-wrap: balance` there
  // overrides the text-wrap-mode half of the chassis' `white-space: nowrap`,
  // and the fitted title wrapped inside a band that clips.
  assert.match(css, /\.pnc\.pnm-deep-deck \.pnc-zone[\s\S]{0,400}?white-space: nowrap !important/);
  assert.match(css, /\.pnc\.pnm-deep-deck \.pnc-zone[\s\S]{0,400}?text-wrap: nowrap !important/);
  assert.match(css, /\.pnc\.pnm-deep-deck \.pnc-zone[\s\S]{0,400}?max-width: none !important/);
});

test('the deep stylesheet loads a runtime-size crest, never the source master', () => {
  const css = read('src/styles/worlds/poker-near-me-console-deep.css');
  assert.doesNotMatch(css, /painted-chassis-v1\/source\//);
  assert.match(css, /painted-chassis-v1\/crest-locator-520\.webp/);

  const copy = 'public/images/pnm-console/painted-chassis-v1/crest-locator-520.png';
  const master = 'public/images/pnm-console/painted-chassis-v1/source/crest-locator.png';
  assert.ok(exists(copy), copy + ' is missing');
  assert.ok(exists(master), master + ' is missing');
  const copyBytes = fs.statSync(path.join(root, copy)).size;
  const masterBytes = fs.statSync(path.join(root, master)).size;
  assert.ok(copyBytes < 400000, 'runtime crest is ' + copyBytes + ' bytes');
  assert.ok(copyBytes < masterBytes / 3, 'the runtime crest is a real downscale of the master');
});

test('a tour code with no tour behind it is a real not found, never an invented page', () => {
  const page = read('pages/hub/tours/[code].js');
  // /hub/tours/NOPE123 used to answer 200 with "NOPE123 Poker Tour ... is a
  // Poker Tour Followed On Smarter.Poker": a soft 404 that states a tour
  // exists. The page now refuses to name a tour it cannot find.
  assert.match(page, /let identity = registryEntry \? 'known' : 'not-found'/);
  assert.match(page, /identity = 'unavailable'/);
  assert.match(page, /if \(identity !== 'known'\) \{/);
  assert.match(page, /res\.statusCode = 404/);
  assert.match(page, /res\.statusCode = 503/);
  assert.match(page, /'Cache-Control', 'public, s-maxage=60'/);
  assert.match(page, /'Retry-After', '120'/);
  assert.match(page, /title=\{missing \? 'Tour Not Found' : 'Tour Directory Unavailable'\}/);
  assert.match(page, /noindex=\{true\}/);
  assert.match(page, /<DeepRouteNotice/);
  // The API is not asked about a tour the catalog has already denied.
  assert.match(page, /const swrKey = code && identity === 'known'/);
});

test('the painted notice is a real chassis with real recovery links', () => {
  const deck = read('src/components/poker-near-me/DeepRouteSignalDeck.jsx');
  assert.match(deck, /export function DeepRouteNotice\(/);
  assert.match(deck, /foot="foot"/);
  assert.match(deck, /className="pnm-deep-notice__link"/);

  const css = read('src/styles/worlds/poker-near-me-console-deep.css');
  assert.match(css, /\.pnm-deep-notice__link \{[\s\S]*?min-height: 44px/);
  assert.match(css, /\.pnm-deep-notice__link:focus-visible/);
  assert.match(css, /\.pnm-deep-notice__links \{[\s\S]*?border-top: 1px solid #000/);
  assert.doesNotMatch(css, /\.pnm-deep-notice__link:hover/);
});

test('a venue logo never fills a photographic band', () => {
  // The bundled directory carries 398 venues, zero cover photos and 191
  // profile photos, and a profile photo is the room's wordmark. It used to
  // fill the 16:8.5 card band and the venue hero, cropped to fit.
  const card = read('src/components/poker-near-me/PokerNearMeLocationPage.jsx');
  assert.doesNotMatch(card, /cover_photo_url \|\| venue\.profile_photo_url/);
  assert.match(card, /const cover = String\(venue\.cover_photo_url \|\| ''\)\.trim\(\)/);
  assert.match(card, /naturalWidth \/ Math\.max\(1, naturalHeight\) >= 1\.2/);

  const venue = read('pages/hub/venues/[id].js');
  assert.doesNotMatch(venue, /image=\{venue\.cover_photo_url \|\| venue\.profile_photo_url\}/);
  assert.match(venue, /image=\{venue\.cover_photo_url \|\| null\}/);
});

test('the venue profile paints its waiting and not-found states', () => {
  const venue = read('pages/hub/venues/[id].js');
  assert.match(venue, /import DeepRouteSignalDeck, \{ DeepRouteNotice \}/);
  assert.match(venue, /title="Loading Venue"/);
  assert.match(venue, /title="Venue Not Found"/);
  assert.match(venue, /role="status" aria-live="polite"/);
  // A confirmed missing venue is still Next's own 404, not a page that
  // invents a room.
  assert.match(venue, /if \(!venue && confirmedMissing\) return \{ notFound: true \}/);
});

test('a directory keeps every link while staying a readable length', () => {
  const page = read('src/components/poker-near-me/PokerNearMeLocationPage.jsx');
  // Measured at 390px before this: /hub/poker-near-me/in/tx was 48,304px
  // tall with 86 full cards. The overflow is printed as rows, visible and
  // server rendered, so no venue link leaves the HTML.
  assert.match(page, /const DIRECTORY_CARD_LIMIT = 12/);
  assert.match(page, /function DirectoryIndex\(/);
  assert.match(page, /states\.slice\(DIRECTORY_CARD_LIMIT\)/);
  assert.match(page, /cities\.slice\(DIRECTORY_CARD_LIMIT\)/);
  assert.match(page, /venuesWithCashGames\.slice\(DIRECTORY_CARD_LIMIT\)/);
  assert.match(page, /venuesWithCashGames\.slice\(0, DIRECTORY_CARD_LIMIT\)/);
  // Nothing is hidden behind a toggle.
  assert.doesNotMatch(page, /<details/);
  assert.doesNotMatch(page, /display:\s*none/);

  const series = read('pages/hub/poker-series.js');
  assert.match(series, /const SERIES_PANEL_LIMIT = 12/);
  assert.match(series, /filteredSeries\.slice\(SERIES_PANEL_LIMIT\)/);
  // A separate class from the page's own A-to-Z `.series-index` section:
  // two different elements must not answer to one class name.
  assert.match(series, /className="series-more__link"/);
  assert.match(series, /className="series-index-link"/);
});

test('every directory index row is a real link at a real target size', () => {
  const css = read('src/styles/worlds/poker-near-me-console-deep.css');
  assert.match(css, /\.pnm-location-index__link \{[\s\S]*?min-height: 48px/);
  assert.match(css, /\.pnm-location-index__link \{[\s\S]*?border-top: 1px solid #000/);
  assert.match(css, /\.pnm-location-index__link:focus-visible/);
  assert.doesNotMatch(css, /\.pnm-location-index__link:hover/);
  // The desktop ceiling: a painted surface stops at the master's own width.
  assert.match(css, /\.pnm-location-index \{[\s\S]*?width: min\(100%, 1000px\)/);
});

test('the series directory row is painted, not a CSS card', () => {
  const page = read('pages/hub/poker-series.js');
  assert.match(page, /import \{ PokerNearMePanelShell, PokerNearMeConsoleIcon \}/);
  assert.match(page, /<PokerNearMePanelShell\s+key=\{series\.series_uid/);
  assert.doesNotMatch(page, /\.tour-card-premium::before/);
  assert.doesNotMatch(page, /\.tour-card-premium:hover/);
  assert.match(page, /body\.world-poker-near-me \.pnc-panel\.tour-card-premium \{[\s\S]*?background-image: none !important/);
  assert.match(page, /body\.world-poker-near-me \.pnc-panel\.tour-card-premium \{[\s\S]*?border-radius: 0 !important/);
  assert.match(page, /painted-controls-v1\/button-primary\.png/);
  assert.match(page, /painted-controls-v1\/button-secondary\.png/);
  assert.doesNotMatch(page, /\.tour-action-btn\.primary \{\s*background: linear-gradient/);
});

test('the save control clears the room-type label and meets the target floor', () => {
  const page = read('pages/hub/poker-series.js');
  // "Casino" printed underneath the heart on every row: the label sat at the
  // header's right with margin-left:auto, the control was absolutely
  // positioned over the same corner, and the control was 32px.
  assert.match(page, /\.tour-fav-btn \{[\s\S]*?width: 44px;\s*height: 44px/);
  assert.doesNotMatch(page, /\.tour-fav-btn:hover/);
  assert.match(page, /\.tour-card-header \{[\s\S]*?padding-right: 46px/);
  assert.match(page, /className="tour-region-tag tour-region-tag--type"/);
  assert.match(page, /aria-pressed=\{isFav \? 'true' : 'false'\}/);

  const tours = read('pages/hub/poker-tours.js');
  assert.match(tours, /\.tour-fav-btn \{[\s\S]*?width: 44px;\s*height: 44px/);
  assert.doesNotMatch(tours, /\.tour-fav-btn:hover/);
});

test('series and tour surfaces print figures as rows, never as rounded chips', () => {
  for (const file of ['pages/hub/poker-series.js', 'pages/hub/poker-tours.js']) {
    const page = read(file);
    assert.match(page, /\.tour-region-tag \{[\s\S]*?border-radius: 0/);
    assert.match(page, /\.tour-region-tag \{[\s\S]*?background: none/);
    assert.match(page, /\.tour-code-badge \{[\s\S]*?border-radius: 0/);
  }
});

test('the tour card is painted and carries no drawn icon family', () => {
  const card = read('src/components/poker-series/TourCard.js');
  assert.match(card, /import \{ PokerNearMePanelShell, PokerNearMeConsoleIcon \}/);
  assert.match(card, /<PokerNearMePanelShell/);
  assert.match(card, /<\/PokerNearMePanelShell>/);
  assert.doesNotMatch(card, /<svg/);
  assert.match(card, /<PokerNearMeConsoleIcon name="saved"/);
  assert.match(card, /<PokerNearMeConsoleIcon name="alert"/);
  // The real link the sitemap agrees with stays a link.
  assert.match(card, /href=\{detailHref\}/);
});

test('the series detail page is on the painted chassis, not on glass cards', () => {
  const page = read('pages/hub/series/[id].js');
  assert.match(page, /import \{ PokerNearMePanelShell, PokerNearMeConsoleIcon \}/);
  assert.doesNotMatch(page, /backdrop-filter: blur/);
  assert.doesNotMatch(page, /<div className="section-card">/);
  assert.doesNotMatch(page, /<div className="series-header">/);
  assert.doesNotMatch(page, /<div className="stats-grid">/);
  const opened = (page.match(/<PokerNearMePanelShell/g) || []).length;
  const closed = (page.match(/<\/PokerNearMePanelShell>/g) || []).length;
  assert.equal(opened, closed);
  assert.ok(opened >= 6, 'expected at least six painted panels, found ' + opened);
  assert.match(page, /painted-controls-v1\/button-primary\.png/);
  assert.match(page, /painted-controls-v1\/button-secondary\.png/);
  // A missing series keeps the branch it already had.
  assert.match(page, /title="Series Not Found"/);
  assert.match(page, /noindex=\{true\}/);
});

test('the deep surfaces keep their routes, canonicals and crawlable links', () => {
  for (const file of [
    'pages/hub/poker-near-me/in/index.js',
    'pages/hub/poker-near-me/in/[state]/index.js',
    'pages/hub/poker-near-me/in/[state]/[city].js',
    'pages/hub/venues/[id].js',
    'pages/hub/poker-tours.js',
    'pages/hub/tours/[code].js',
    'pages/hub/poker-series.js',
    'pages/hub/series/[id].js',
  ]) {
    assert.ok(exists(file), file);
  }
  const location = read('src/components/poker-near-me/PokerNearMeLocationPage.jsx');
  assert.match(location, /breadcrumbs=\{\[/);
  assert.match(location, /PokerNearMeFamilyNav/);
  assert.match(location, /serializePokerJsonLd/);
  assert.match(location, /canonical=\{canonical\}/);

  const tour = read('pages/hub/tours/[code].js');
  assert.match(tour, /canonical=\{seo\.canonical\}/);
  assert.match(tour, /jsonLd=\{tourSchema/);
  assert.match(tour, /PokerNearMeFamilyNav/);
});
