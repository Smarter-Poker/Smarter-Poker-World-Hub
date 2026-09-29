/**
 * Poker Near Me result cards, the venue check-in dialog, venue reviews,
 * venue comparison and the shared identity mark on the #ClubArenaConsole
 * painted system (2026-09-21).
 *
 * Source contracts. Each one would have caught a defect that shipped before
 * this pass, or pins behaviour the re-render had to keep:
 *   - VenueCard injected a 460-line generic stylesheet (VC3_CARD_STYLES) and
 *     opened a rounded, shadowed, flat-button check-in sheet;
 *   - the card body inset (6cqw on phones) painted list boxes over the inner
 *     line of panel-mid.png's rails, which end at 8.8% of the slice;
 *   - the right-hand status stack squeezed the venue name to 56px;
 *   - a catalog-only room wore a pulsing green "live" dot;
 *   - "+N More", "N Here Today" and the rating row were clickable <div>/<span>
 *     elements no keyboard could reach; RichTourCard's Details was a <span>;
 *   - RichTourCard / PokerTourCard printed LIVE NOW for a schedule date match;
 *   - SeriesCard printed a bare "0" for zero counts;
 *   - VenueReviews / VenueCompare / PokerIdentityMark drew SVG icon families,
 *     gradients, radii and shadows.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
// Absence checks run on code only: the fix comments name what they removed.
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const DIR = 'src/components/poker-near-me';
const CSS_PATH = 'src/styles/worlds/poker-near-me-console-cards.css';

function pngSize(rel) {
  const buf = fs.readFileSync(path.join(ROOT, rel));
  assert.equal(buf.toString('ascii', 12, 16), 'IHDR', `${rel} is a PNG`);
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

test('VenueCard no longer injects the generic VC3 stylesheet or the generic check-in sheet', () => {
  const card = code(read(`${DIR}/VenueCard.js`));
  assert.doesNotMatch(card, /VC3_CARD_STYLES|VC3_STYLE_ID|vc3-venue-card-styles/);
  assert.doesNotMatch(card, /document\.createElement\('style'\)/);
  assert.doesNotMatch(card, /vc3-checkin-(?:backdrop|modal|handle|header|close|cancel|submit|actions|done|error)/);
  assert.doesNotMatch(card, /border-radius|box-shadow|backdrop-filter|linear-gradient|radial-gradient/);
  assert.doesNotMatch(card, /✓|✕|×/, 'no glyph icons in the card or its dialog');
  // Inline colours outside the schema are gone; tones are data attributes.
  assert.doesNotMatch(card, /style=\{\{[^}]*\bcolor:/);
  assert.doesNotMatch(card, /#4ade80|#60a5fa|#22c55e|#f59e0b|#fbbf24/);
});

test('the check-in popup is the painted console dialog with the full dialog contract', () => {
  const card = read(`${DIR}/VenueCard.js`);
  assert.match(card, /import PokerNearMeConsole, \{ PokerNearMeConsoleIcon, PokerNearMePanelShell \} from '\.\/PokerNearMeConsole';/);
  assert.match(card, /createPortal\(\(\s*<div\s+className="pnm-console-dialog-overlay pnm-checkin-dialog-overlay"\s+role="presentation"/);
  assert.match(card, /className="pnm-console-dialog-shell pnm-checkin-dialog"\s+role="dialog"\s+aria-modal="true"\s+aria-labelledby="pnm-venue-checkin-title"\s+aria-describedby="pnm-venue-checkin-description"\s+aria-busy=\{checkinBusy\}\s+tabIndex=\{-1\}/);
  assert.match(card, /<PokerNearMeConsole[\s\S]*?crest="locator"[\s\S]*?title="Check In"[\s\S]*?titleId="pnm-venue-checkin-title"/);
  // Two actions or none: both painted plates while composing, the flat cap once done.
  assert.match(card, /foot=\{checkinDone \? 'foot' : 'plates'\}/);
  assert.match(card, /plates=\{checkinDone \? undefined : \{\s*secondary: \{\s*label: 'Cancel',\s*onClick: closeCheckin,\s*disabled: checkinBusy,/);
  assert.match(card, /label: checkinBusy \? 'Posting\.\.\.' : 'Post',\s*ink: 'white',\s*onClick: handleCheckinSubmit,\s*disabled: checkinBusy \|\| !checkinMsg\.trim\(\),\s*'aria-label': checkinBusy \? 'Posting Check-In' : 'Post Check-In',/);
  assert.match(card, /className="pnm-console-dialog__close"\s+onClick=\{closeCheckin\}\s+disabled=\{checkinBusy\}\s+aria-label="Close Check-In Dialog"/);
  assert.match(card, /<p className="pnm-console-dialog__error" role="alert">\{checkinError\}<\/p>/);
  assert.match(card, /role="status">Checked In<\/p>/);
  assert.match(card, /maxLength=\{280\}/);
  assert.match(card, /\{checkinMsg\.length\}\/280/);
  // Status bar clearance for the full-screen scrim (overlays law) is real inline style.
  assert.match(card, /style=\{\{ paddingTop: 'max\(12px, env\(safe-area-inset-top, 0px\)\)' \}\}/);
});

test('check-in dialog behaviour survived: history, scrim, Escape, trap, focus, scroll lock, busy', () => {
  const card = read(`${DIR}/VenueCard.js`);
  assert.match(card, /useModalHistory\(checkinModal, closeCheckin\)/);
  assert.match(card, /const checkinScrim = useScrimDismiss\(closeCheckin\);/);
  // Portal events bubble through the React tree to the card's own onClick; the
  // scrim must stop that so dismissing never also opens the venue page.
  assert.match(card, /onClick=\{\(e\) => \{[\s\S]{0,260}?e\.stopPropagation\(\);\s*if \(!checkinBusy\) checkinScrim\.onClick\(e\);/);
  assert.match(card, /if \(!checkinBusyRef\.current\) setCheckinModal\(false\);/);
  assert.match(card, /checkinBusyRef\.current = checkinBusy;/);
  assert.match(card, /const releaseScrollLock = acquireScrollLock\('VenueCardCheckinDialog'\);/);
  assert.match(card, /releaseScrollLock\(\);/);
  assert.doesNotMatch(card, /document\.body\.style\.overflow/);
  assert.match(card, /checkinOpenerRef\.current = document\.activeElement;/);
  assert.match(card, /try \{ opener\.focus\(\); \} catch/);
  assert.match(card, /'a\[href\], button:not\(\[disabled\]\), textarea:not\(\[disabled\]\), input:not\(\[disabled\]\), select:not\(\[disabled\]\), \[tabindex\]:not\(\[tabindex="-1"\]\)'/);
  assert.match(card, /useEffect\(\(\) => \{\s*if \(!checkinModal \|\| !checkinBusy[\s\S]*?root\.focus\(\)/, 'a busy post keeps focus inside the dialog');
});

test('check-in logic, API calls, auth gating, errors and analytics are unchanged', () => {
  const card = read(`${DIR}/VenueCard.js`);
  assert.match(card, /const handleCheckinOpen = \(e\) => \{\s*e\.stopPropagation\(\);\s*if \(!requireOnlineNow\(toast\)\) return;\s*triggerHaptic\('light'\);/);
  assert.match(card, /const handleCheckinSubmit = async \(\) => \{\s*if \(checkinBusy \|\| !checkinMsg\.trim\(\)\) return;\s*if \(!requireOnlineNow\(toast\)\) return;\s*triggerHaptic\('success'\);/);
  assert.match(card, /const token = getAccessToken\(\);\s*if \(!token\) \{ if \(onNavigate\) onNavigate\('\/auth\/login'\); return; \}/);
  assert.match(card, /fetch\('\/api\/poker\/checkins', \{\s*method: 'POST',/);
  assert.match(card, /venue_id: venueIdInt,\s*user_name: userDisplayName,\s*message: checkinMsg\.trim\(\),/);
  assert.match(card, /fetch\('\/api\/social\/create-post', \{/);
  assert.match(card, /post_type: 'checkin',/);
  assert.match(card, /if \(res\.status === 429\) \{\s*let msg = 'You already checked in here within the last 4 hours\.';/);
  assert.match(card, /let msg = `Check-in failed \(\$\{res\.status\}\)`;/);
  assert.match(card, /setCheckinDone\(true\);\s*setTimeout\(\(\) => setCheckinModal\(false\), 1500\);/);
  assert.match(card, /setCheckinError\('Could not reach the server\. Please try again\.'\);/);
  assert.match(card, /finally \{ setCheckinBusy\(false\); \}/);
});

test('every venue card action stays wired and keyboard operable', () => {
  const card = read(`${DIR}/VenueCard.js`);
  assert.match(card, /className=\{'vc3-fav' \+ \(isFavorited \? ' active' : ''\)\}\s*onClick=\{\(e\) => \{ e\.stopPropagation\(\); triggerHaptic\('light'\); onFavorite && onFavorite\(e\); \}\}/);
  assert.match(card, /aria-pressed=\{!!isFavorited\}/);
  assert.match(card, /safeHref\('https:\/\/' \+ venue\.website\)/);
  assert.match(card, /target="_blank" rel="noopener noreferrer" className="vc3-icon-btn"/);
  assert.match(card, /href=\{'tel:' \+ venue\.phone\}/);
  assert.match(card, /PokerNearMeConsoleIcon name="phone"/);
  assert.match(card, /openNativeMaps\(\{ address: \[venue\.address, venue\.name, venue\.city, venue\.state\]/);
  assert.match(card, /aria-label=\{`Get directions to/);
  assert.match(card, /openNativeMaps\(\{ address: mapsAddress, mode: 'search' \}\)/);
  assert.match(card, /<button type="button" className="pnm-card-plate pnm-card-plate--secondary pnm-console-card__checkin-plate" onClick=\{handleCheckinOpen\}/);
  assert.match(card, /<button type="button" className="pnm-card-plate pnm-card-plate--primary pnm-console-card__details-plate" onClick=\{e => \{ e\.stopPropagation\(\); onNavigate && onNavigate\(detailUrl\); \}\}/);
  assert.match(card, /onNavigate\('\/hub\/messenger\?to=' \+ venue\.host_id/);
  assert.match(card, /onNavigate\(detailUrl \+ '\?tab=tournaments'\)/);
  assert.match(card, /onNavigate\(detailUrl \+ '#checkins'\)/);
  assert.match(card, /onNavigate\(detailUrl \+ '\?action=review'\)/);
  // The formerly unreachable controls are real buttons now.
  assert.doesNotMatch(card, /<div className="vc3-more-badge"/);
  assert.doesNotMatch(card, /<span className="vc3-badge vc3-badge-checkin" onClick/);
  assert.doesNotMatch(card, /<div className="vc3-rating-row" onClick/);
  assert.equal((card.match(/<button type="button" className="vc3-more-badge pnm-console-card__text-action"/g) || []).length, 4);
  // Plate labels are fitted to the plate face by the console's measuring hook.
  assert.match(card, /<PnmPlateLabel label="Check In" \/>/);
  assert.match(card, /<PnmPlateLabel label="Details" \/>/);
  assert.match(read(`${DIR}/TourCard.js`), /const fitRef = usePnmConsoleFitText\(label, 1\.04, 0\.6\);/);
});

test('venue card layout: status leaves the header, the name owns the full glass width', () => {
  const card = read(`${DIR}/VenueCard.js`);
  assert.doesNotMatch(card, /vc3-right-stack/);
  assert.match(card, /<div className="pnm-console-card__status-line">[\s\S]*?className="vc3-distance"[\s\S]*?vc3-open-pill[\s\S]*?vc3-hours-compact/);
  assert.match(card, /data-media-state=\{logoUrl && !logoError \? 'image' : 'fallback'\}/);
  assert.match(card, /<span className="vc3-game-name" title=\{displayName\}>\{displayName\}<\/span>/, 'names wrap instead of being cut at 25 characters');
  // The empty cash column no longer repeats the open/closed state the status line prints.
  assert.match(card, /if \(!os \|\| os\.unknown\) return 'No Live Data';[\s\S]{0,420}?return 'No Cash Games Listed';/);
});

test('cash-game provenance prints as honest HTML text (law 7)', () => {
  const card = read(`${DIR}/VenueCard.js`);
  assert.match(card, /cashGameCountLabel/);
  assert.match(card, /Modeled From Saved Cash-Game Data/);
  assert.match(card, /const cashGameMode = catalogCashGames\s*\?\s*'catalog'\s*:\s*unavailableCashGames\s*\?\s*'unavailable'\s*:\s*modeledCashGames\s*\?\s*'estimated'/);
  assert.match(card, /<div className="pnm-console-card__provenance" data-mode=\{cashGameMode\}>\s*\{cashGameMode === 'live' && <span className="pnm-console-card__signal" aria-hidden="true" \/>\}/);
  assert.doesNotMatch(card, /vc3-live-dot|vc3-badge-live|vc3-badge-modeled/, 'no live dot on catalog or modeled data');
  assert.match(card, /modeledCashGames && hasLiveData \? `Estimated: \$\{crowd\.label\}` : crowd\.label/);
  assert.match(card, /'Live Count Unknown'/);
  assert.match(card, /\{g\?\.is_simulated \? 'Approx\. ' : ''\}/);

  const css = read(CSS_PATH);
  assert.match(css, /\.pnm-console-card__provenance\[data-mode='live'\] \{ color: #c8ffd2; \}/);
  assert.match(css, /\.pnm-console-card__provenance:is\(\[data-mode='estimated'\], \[data-mode='catalog'\], \[data-mode='unavailable'\]\) \{ color: #9aa5b3; \}/);
});

test('tour and series cards: truthful stop labels, real controls, sanitised links, no stray zeros', () => {
  const rich = read(`${DIR}/RichTourCard.jsx`);
  assert.doesNotMatch(code(rich), /LIVE NOW|NEXT STOP/);
  assert.match(rich, /currentStopType === 'current' \? 'Current Stop' : 'Next Stop'/);
  assert.doesNotMatch(rich, /<span className="action-btn primary">/);
  assert.match(rich, /<button\s+type="button"\s+className="action-btn primary"\s+onClick=\{\(event\) => \{\s*event\.stopPropagation\(\);\s*onNavigate\?\.\(detailUrl\);/);
  assert.match(rich, /safeExternalHref\(displayTour\.official_website\) && \(/);
  assert.match(rich, /lower\.startsWith\('javascript:'\) \|\| lower\.startsWith\('data:'\) \|\| lower\.startsWith\('vbscript:'\)/);
  assert.match(rich, /\{logoUrl && !logoFailed && <span className="pnm-console-card__tag" data-tone=\{tourTone\}>/, 'the tour code prints once');

  const pin = code(read(`${DIR}/PokerTourCard.jsx`));
  assert.doesNotMatch(pin, /LIVE NOW/);
  assert.doesNotMatch(pin, /<span className="tour-action-btn/);

  const series = read(`${DIR}/SeriesCard.js`);
  assert.match(series, /\{Number\(s\.total_events\) > 0 && <span className="tag events">/);
  assert.match(series, /\{s\.main_event_buyin != null && s\.main_event_buyin !== '' && <span className="tag buyin">/);
  assert.match(series, /\{Number\(s\.main_event_guaranteed\) > 0 && \(/);
  assert.match(series, /labelize\(s\.series_type\)/);

  const featured = read(`${DIR}/NewSeriesVenueCard.jsx`);
  assert.doesNotMatch(featured, /parentElement\.style\.display/);
  assert.match(featured, /onError=\{\(\) => setFailedLogoUrl\(resolvedLogoUrl\)\}/);
  assert.doesNotMatch(featured, /NEW ADDITION/);

  const tour = read(`${DIR}/TourCard.js`);
  assert.match(tour, /<button[\s\S]*className="action-btn primary"/);
  assert.match(tour, /onError=\{\(\) => setLogoFailed\(true\)\}/);
  assert.match(tour, /aria-pressed=\{!!isFavorited\}/);
  assert.match(tour, /if \(trimmed\.startsWith\('javascript:'\)/);

  for (const file of ['TourCard.js', 'RichTourCard.jsx', 'NewSeriesVenueCard.jsx', 'SeriesCard.js', 'PokerTourCard.jsx', 'VenueCard.js']) {
    const src = code(read(`${DIR}/${file}`));
    assert.doesNotMatch(src, /'violet'/, `${file}: tones are console inks only`);
    assert.doesNotMatch(src, /<svg\b/, `${file}: no vector icon family`);
    assert.doesNotMatch(src, /className="pnm-console-card__action-icon"[\s\S]{0,40}(?:Details|Website|Source|View Events)/, `${file}: no framed icon inside a painted plate`);
  }
});

test('card stylesheet: rails stay clear, plates keep their ratio, artwork is never enlarged', () => {
  const css = read(CSS_PATH);
  assert.doesNotMatch(css, /(?:linear|radial|conic)-gradient|(?:^|[;{\s])border(?:-radius)?\s*:|box-shadow\s*:|backdrop-filter\s*:|:hover/im);
  // panel-mid.png's rails end at 8.8% of the slice; the glass starts at 10.5%.
  assert.match(css, /--pnm-card-inset: 10\.5cqw;/);
  assert.match(css, /\.pnm-console-card > \.pnc-panel__body \{[^}]*padding: 2px var\(--pnm-card-inset\) 6px;/);
  assert.doesNotMatch(css, /max\(16px, 6cqw\)/);
  assert.match(css, /aspect-ratio: 348 \/ 114;/);
  assert.match(css, /button-secondary\.png'\) center \/ contain no-repeat/);
  assert.match(css, /button-primary\.png/);
  assert.equal(pngSize('public/images/pnm-console/painted-controls-v1/button-primary.png').join('x'), '348x114');
  assert.equal(pngSize('public/images/pnm-console/painted-controls-v1/utility-well.png').join('x'), '1105x1133');
  assert.equal(pngSize('public/images/pnm-console/painted-controls-v1/search-well.png').join('x'), '1829x313');
  assert.match(css, /img:is\(\.pnm-console-card__logo, \.tour-logo-img, \.vc3-logo-img\) \{[^}]*max-width: 96px;[^}]*object-fit: scale-down;/);
  assert.match(css, /aspect-ratio: 1105 \/ 1133;/);
  assert.match(css, /--pnm-command-inset: 0 0 transparent;/);
  assert.match(css, /\.pnm-console-card\.pnm-console-card :is\(\.action-btn, \.hex-btn-small, \.tour-action-btn, \.pnm-card-plate\) \{[^}]*min-height: 44px;/);
  assert.match(css, /\.pnm-console-card\.pnm-console-card \.pnm-console-card__text-action \{[^}]*min-height: 44px;/);
  assert.match(css, /\.pnm-console-card--venue \.vc3-header \{[^}]*grid-template-areas:\s*'logo save'\s*'identity identity';/);
});

test('dialog layers: 16px fields, bottom-anchored on phones, opaque glass', () => {
  const css = read(CSS_PATH);
  assert.match(css, /\.pnm-checkin-dialog \.pnm-console-dialog__content textarea \{[^}]*font-size: max\(16px, 3\.4cqw\);/);
  assert.match(css, /\.pnm-reviews-dialog \.pnm-console-dialog__content textarea \{[^}]*font-size: max\(16px, 3\.4cqw\);/);
  assert.match(css, /@media \(max-width: 600px\) \{[\s\S]*?\.pnm-checkin-dialog-overlay \{\s*align-items: end;/);
  assert.match(css, /@media \(max-width: 600px\) \{[\s\S]*?\.pnm-reviews-dialog-overlay \{\s*align-items: end;/);
  assert.match(css, /\.pnm-console-dialog-overlay\.pnm-checkin-dialog-overlay \{\s*background: #000308;/);
  // The shared shell centres itself with margin:auto; only the top margin may
  // take the free space for the phone bottom-sheet position to be real.
  assert.match(css, /\.pnm-checkin-dialog-overlay > \.pnm-console-dialog-shell\.pnm-checkin-dialog \{\s*margin: auto auto 0;/);
  assert.match(css, /\.pnm-reviews-dialog-overlay > \.pnm-console-dialog-shell\.pnm-reviews-dialog \{\s*margin: auto auto 0;/);
  assert.match(css, /\.pnm-console-dialog-overlay\.pnm-reviews-dialog-overlay \{\s*background: #000308;/);
});

test('VenueReviews is the painted console dialog and keeps every data path', () => {
  const src = read(`${DIR}/VenueReviews.jsx`);
  assert.doesNotMatch(code(src), /<svg\b|<style|linear-gradient|border-radius|×|★/);
  assert.match(src, /useModalHistory\(!!isOpen, onClose\)/);
  assert.match(src, /const scrim = useScrimDismiss\(onClose\);/);
  assert.match(src, /className="pnm-console-dialog-shell pnm-reviews-dialog"\s+role="dialog"\s+aria-modal="true"\s+aria-labelledby="pnm-venue-reviews-title"/);
  assert.match(src, /<PokerNearMeConsole[\s\S]*?titleId="pnm-venue-reviews-title"/);
  assert.match(src, /foot=\{writeFormOpen \? 'plates' : 'foot'\}/, 'two plates while writing, the flat cap otherwise');
  assert.match(src, /onClick: submitReview,\s*disabled: !canSubmit,/);
  assert.match(src, /aria-label="Close Reviews"/);
  assert.match(src, /style=\{\{ paddingTop: 'max\(12px, env\(safe-area-inset-top, 0px\)\)' \}\}/);
  assert.match(src, /const releaseScrollLock = acquireScrollLock\('VenueReviewsDialog'\);/);
  assert.doesNotMatch(src, /document\.body\.style\.overflow/);
  assert.match(src, /const focusables = root\.querySelectorAll\(FOCUSABLE\);/);
  assert.match(src, /const submitReview = async \(\) => \{[\s\S]*?if \(!requireOnlineNow\(toast\)\) return;/);
  assert.match(src, /const voteReview = async \(reviewId, action\) => \{\s*if \(!requireOnlineNow\(toast\)\) return;/);
  assert.match(src, /\/api\/poker\/reviews\?venue_id=\$\{venueId\}&limit=\$\{PAGE_SIZE\}&offset=0&sort=/);
  assert.match(src, /method: 'PATCH'/);
  assert.match(src, /new CustomEvent\('pnm:review-submitted'/);
  assert.match(src, /role="radiogroup" aria-label=\{label\}/);
  assert.match(src, /role="radio"\s+aria-checked=\{star === rating\}/);
  assert.match(src, /Not Helpful/);
});

test('VenueCompare prints on its host glass with honest provenance inks', () => {
  const src = read(`${DIR}/VenueCompare.jsx`);
  assert.doesNotMatch(code(src), /style=\{\{|<svg\b|gradient|#c9a85a|#52d18b|×/);
  assert.match(src, /buildLiveCashGameIndex/);
  assert.match(src, /fetch\('\/api\/poker\/live-tables'\)/);
  assert.match(src, /if \(prev\.length >= 3\) return prev; \/\/ Max 3/);
  assert.match(src, /aria-pressed=\{isSelected\}/);
  assert.match(src, /data-mode=\{cashGameMode\(live\)\}/);
  assert.match(src, /aria-label=\{`Remove \$\{v\.name\}`\}/);
  const css = read(CSS_PATH);
  assert.match(css, /--pnm-compare-well-w: min\(100%, 560px\);/);
  assert.match(css, /padding: 0 calc\(var\(--pnm-compare-well-w\) \* 0\.075\);/);
  assert.match(css, /aspect-ratio: 1829 \/ 313;/);
});

test('PokerIdentityMark prints artwork bare and initials in the painted well', () => {
  const src = read(`${DIR}/PokerIdentityMark.jsx`);
  assert.doesNotMatch(code(src), /<style jsx|gradient|border-radius|box-shadow/);
  assert.match(src, /data-media-state=\{showImage \? 'image' : 'fallback'\}/);
  assert.match(src, /onError=\{\(\) => setImageFailed\(true\)\}/);
  assert.match(src, /pnm-identity-mark__halo/);
  const css = read(CSS_PATH);
  assert.match(css, /\.pnm-identity-mark__halo \{[^}]*utility-well\.png/);
  assert.match(css, /\.pnm-identity-mark\[data-media-state\] img \{[^}]*object-fit: scale-down;/);
});
