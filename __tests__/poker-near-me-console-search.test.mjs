/**
 * Poker Near Me lobby and global search on the painted #ClubArenaConsole
 * system (2026-09-21). Source contracts for the defects this pass fixed, and
 * pins for the behaviour it had to keep.
 *
 * Defects these would have caught:
 *  - GlobalSearchOverlay drew a ClockIcon and three more vector glyphs, tinted
 *    gradient pills, rounded logo wells and glass backdrops; recent searches
 *    each carried a generic vector magnifier.
 *  - The overlay's own Tab trap counted controls inside the inert search
 *    surface, so Tab from the nested detail's last control tried to focus an
 *    inert button and stuck. useAccessibleDialog then re-applied the
 *    aria-hidden it had recorded, hiding the whole search surface from
 *    assistive tech after the first detail closed.
 *  - At 430px and below the Search button was absolutely positioned 52px
 *    under the header: below the viewport at 390x844, over the first result
 *    on wider phones.
 *  - A failed venue request printed "No Results Found".
 *  - The lobby's Voice control was a flat CSS box; a CSS-generated
 *    "POKER NEAR ME / DISCOVERY DECK" eyebrow repeated the family nav; the
 *    search well faded in after a 0.3s delay; unknown counts printed as 0.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const SEARCH = 'src/components/poker-near-me/GlobalSearchOverlay.jsx';
const SEARCH_CSS = 'src/styles/worlds/poker-near-me-console-search.css';
const OVERLAY = 'src/components/poker-near-me/lobby/LobbyOverlay.jsx';
const LOBBY = 'pages/hub/poker-near-me/lobby.js';
const LOBBY_CSS = 'src/styles/worlds/poker-near-me-lobby.css';
const VOICE = 'src/components/poker-near-me/VoiceSearch.jsx';

const GENERIC_CHROME = /<svg\b|(?:linear|radial|conic)-gradient\(|borderRadius|boxShadow|backdropFilter|WebkitBackdropFilter/;

test('global search is printed on painted console art, with no vector glyphs or fake materials', () => {
  const src = stripComments(read(SEARCH));
  assert.doesNotMatch(src, GENERIC_CHROME);
  assert.doesNotMatch(src, /ClockIcon|CardsIcon|MapIcon|TrophyIcon|TOUR_COLORS|VENUE_TYPE_STYLES/);
  assert.match(src, /import PokerNearMeConsole, \{ PokerNearMeConsoleIcon, PokerNearMePanelShell \} from '\.\/PokerNearMeConsole'/);
  // Result cards are the kit's three-slice result panel; the detail is one console.
  assert.match(src, /<PokerNearMePanelShell as="div" className=\{isSelected \? 'gso-result is-selected' : 'gso-result'\}/);
  assert.match(src, /<PokerNearMeConsole[\s\S]*?titleId="gso-detail-title"[\s\S]*?plates=\{plates\}/);
  // Recent searches print text only on the well: no per-row glyph of any kind.
  const recents = src.slice(src.indexOf('label="Recent Searches"'), src.indexOf('label="Cities"'));
  assert.ok(recents.length > 0 && recents.length < 1200, 'the recent-search block is found');
  assert.match(recents, /<span className="gso-well-row__text">\{formatStoredQuery\(rec\)\}<\/span>/);
  assert.doesNotMatch(recents, /PokerNearMeConsoleIcon|<svg/);
  // Stored lower-case queries print in Title Case with acronyms whole (WSOP).
  assert.match(src, /if \(QUERY_ACRONYMS\.has\(lower\)\) return lower\.toUpperCase\(\);/);
  // A missing logo is one complete pictogram, never a holder inside a holder.
  assert.match(src, /if \(\(!src \|\| failed\) && icon\) \{\s*return <PokerNearMeConsoleIcon name=\{icon\}/);
  // Copy printed from counts is Title Case.
  assert.doesNotMatch(src, /result\{totalResults !== 1 \? 's' : ''\}|venues - Tap A Pin|Search result map|Matching poker rooms/);
  assert.match(src, /\{totalResults === 1 \? 'Result' : 'Results'\}/);
  // The map scrolls with the results instead of pinning a clipped frame above them.
  const body = src.slice(src.indexOf('className="gso-console-body"'));
  assert.match(body, /<div className="pnm-global-search-map gso-map">/);
});

test('the nested detail never counts inert controls, and closing it restores the surface and focus', () => {
  const src = read(SEARCH);
  // The overlay trap skips anything inside an inert or aria-hidden ancestor.
  assert.match(src, /el => \(el\.offsetParent !== null \|\| el === document\.activeElement\)\s*&& !el\.closest\('\[inert\], \[aria-hidden="true"\]'\)/);
  // The opener is remembered before the surface goes inert ...
  assert.match(src, /const openDetail = useCallback\(\(item, type, opener\) => \{[\s\S]*?detailReturnFocusRef\.current = opener[\s\S]*?setDetailItem\(\{ item, type \}\)/);
  assert.match(src, /onClick=\{\(venue, e\) => openDetail\(venue, 'venue', e\?\.currentTarget\)\}/);
  // ... and when the detail clears, the stale aria-hidden is removed and focus returns.
  assert.match(src, /useEffect\(\(\) => \{\s*if \(detailItem\) return;[\s\S]*?surface\.removeAttribute\('aria-hidden'\);\s*surface\.removeAttribute\('inert'\);[\s\S]*?opener\.focus\(\);[\s\S]*?\}, \[detailItem\]\);/);
  // Pinned by the casino-realism contract and kept literally.
  assert.match(src, /className="gso-search-surface"[\s\S]*?aria-hidden=\{detailItem \? 'true' : undefined\}[\s\S]*?inert=\{detailItem \? '' : undefined\}/);
  assert.match(src, /function DetailModal[\s\S]*?useAccessibleDialog\(\{[\s\S]*?open: Boolean\(item\)/);
  assert.match(src, /ref=\{initialFocusRef\}[\s\S]*?aria-label="Close details"/);
});

test('the Search plate flows under the well on phones and is a real 44px target', () => {
  const css = read(SEARCH_CSS);
  const src = read(SEARCH);
  assert.doesNotMatch(css, /bottom:\s*-52px/);
  assert.doesNotMatch(css, /\.gso-console-submit\s*\{[^}]*position:\s*absolute/);
  assert.match(css, /@media \(max-width: 600px\) \{[\s\S]*?\.gso-console-header \{[\s\S]*?grid-template-columns: 48px minmax\(0, 1fr\);[\s\S]*?\.gso-console-submit \{\s*grid-column: 2;\s*justify-self: end;/);
  assert.match(css, /\.gso-console-submit \{[^}]*height: 44px;[^}]*min-height: 44px;/);
  // Rendered in DOM order after the field; disabled (steel plate) for an empty query.
  assert.match(src, /<\/form>\s*\{\/\*[\s\S]*?\*\/\}\s*<button type="button" className="gso-console-submit" onClick=\{handleSubmit\} disabled=\{!localQuery\.trim\(\)\}>/);
  assert.match(css, /\.gso-console-submit:disabled \{[^}]*button-secondary\.png/);
  // Clear keeps its 44px target inside the well.
  assert.match(css, /\.gso-console-form \.gso-clear \{[^}]*width: 44px !important;[^}]*height: 44px !important;/);
});

test('search states: loading announces, no results is not an error, an error is not "no results"', () => {
  const src = read(SEARCH);
  assert.match(src, /const \[searchError, setSearchError\] = useState\(false\);/);
  assert.match(src, /console\.warn\('\[GlobalSearch\] Venue search failed:', err\);\s*setVenueResults\(\[\]\);\s*setSearchError\(true\);/);
  assert.match(src, /\{!isLoading && searchError && \([\s\S]*?role="alert"[\s\S]*?Venue Search Unavailable[\s\S]*?handleSubmit\(null, localQuery\)/);
  assert.match(src, /\{!isLoading && !searchError && !hasResults && \([\s\S]*?No Results Found/);
  assert.match(src, /className="gso-skeletons" role="status" aria-live="polite"/);
});

test('global search keeps every behaviour it had', () => {
  const src = read(SEARCH);
  for (const pin of [
    /useModalHistory\(!!isOpen, onClose\)/,
    /safe-area-inset-top/,
    /acquireScrollLock\('PokerNearMeGlobalSearch'\)/,
    /if \(e\.key === 'Escape' && !e\.defaultPrevented\) \{\s*if \(detailItem\) setDetailItem\(null\);\s*else onClose\?\.\(\);/,
    /dispatchEvent\(new Event\('pnm:close-map-fullscreen'\)\)/,
    /localStorage\.setItem\('pnm_recent_searches'/,
    /trackSearchEvent\('abandoned_search_query'/,
    /role="combobox" aria-expanded=\{phase === 'input'\} aria-autocomplete="list"/,
    /aria-activedescendant=\{activeDescendantId\}/,
    /role="dialog" aria-modal="true" aria-label="Search Poker Venues, Tours, and Series"/,
    /openNativeMaps\(\{[\s\S]*?mode: 'directions',/,
    /onNavigate=\{\(path\) => \{ setDetailItem\(null\); onClose\?\.\(\); router\.push\(path\); \}\}/,
    /const url = `\/api\/poker\/venues\?\$\{params\.toString\(\)\}`/,
    /key=\{venueResults\.length < 20 \? 'gso-map-nocluster' : 'gso-map-cluster'\}/,
    /href=\{`tel:\$\{phone\}`\}/,
  ]) assert.match(src, pin, String(pin));
});

test('search stylesheet is scoped, painted, hover-free and beats the legacy command layer', () => {
  const css = read(SEARCH_CSS);
  assert.doesNotMatch(css, /(?:linear|radial|conic)-gradient\(|:hover|backdrop-filter:\s*blur/);
  assert.doesNotMatch(css, /border-radius:\s*[1-9]/);
  for (const art of ['search-well.png', 'button-primary.png', 'button-secondary.png', 'utility-well.png']) {
    assert.match(css, new RegExp(art.replace('.', '\\.')));
  }
  // Every rule targets the overlay through its dialog scope (0,3,1 or more).
  const selectors = [...css.matchAll(/^([^@\s/}][^{]*)\{/gm)].map((m) => m[1].trim())
    .filter((s) => !/^(from|to|\d+%)/.test(s));
  const unscoped = selectors.filter((s) => !s.includes(".gso-console-overlay[role='dialog']") && s !== '.gso-visually-hidden');
  assert.deepEqual(unscoped, []);
  // The well keeps the art's own ratio and prints on the painted face.
  assert.match(css, /\.gso-console-search-well \{[^}]*aspect-ratio: 1829 \/ 313;[^}]*padding: 2\.41cqw 6\.73cqw 4\.98cqw 6\.78cqw;/);
  // The detail sits on black: a transparent console body never shows art through.
  assert.match(css, /\.gso-detail-console \{[^}]*background: #010306 !important;/);
});

test('lobby: painted Voice plate, no duplicate eyebrow, no delayed fade, honest counts', () => {
  const css = read(LOBBY_CSS);
  const overlay = read(OVERLAY);
  const lobby = read(LOBBY);
  // The eyebrow was CSS generated content; no rule may print it again.
  assert.doesNotMatch(stripComments(css), /DISCOVERY DECK/i);
  assert.doesNotMatch(css, /\.lobby-topbar::before/);
  assert.doesNotMatch(css, /(?:linear|radial|conic)-gradient\(|:hover/);
  assert.doesNotMatch(css, /\.lobby-search-form \{[^}]*opacity: 0/);
  assert.match(css, /body\.world-poker-near-me \.pnm-lobby-page \.lobby-command-row \.lobby-voice-btn \{[^}]*button-secondary\.png[^}]*\}/);
  assert.match(css, /\.lobby-command-row \.lobby-gps-btn \{[^}]*background: none !important;/);
  assert.match(css, /\.lobby-card-scroll picture img \{[^}]*filter: none;/);
  assert.match(css, /\.pnm-lobby-page \.lobby-hotspot:focus-visible \{[^}]*outline: 2px solid #8fd4ff;/);
  // Pins held by the phase 11 and mobile contracts.
  assert.match(css, /min-width: 44px !important/);
  assert.match(css, /min-height: 44px !important/);
  assert.match(css, /\.pnm-lobby-page \{[^}]*touch-action: pan-y;/s);

  assert.match(overlay, /<span className="lobby-voice-btn__label">Voice<\/span>/);
  assert.match(overlay, /aria-label="Voice search"/);
  // CLS reservation and the eager, high-priority grid stay; the attribute is the DOM spelling.
  assert.match(overlay, /src="\/images\/lobby-pods\/poker-near-me-grid\.webp"[\s\S]*?loading="eager"[\s\S]*?fetchpriority="high"[\s\S]*?width=\{1024\}[\s\S]*?height=\{1024\}/);
  assert.doesNotMatch(overlay, /fetchPriority=/);
  // Unknown or unanswered counts are words in muted ink, never 0 and never coloured.
  assert.doesNotMatch(overlay, /liveGameCount \|\| 0|dailyCount \|\| 0|style=\{\{ color: stat\.color \}\}/);
  assert.match(overlay, /stat\.value == null \? 'Loading' : String\(stat\.value\)/);
  assert.match(overlay, /pnc-ink--\$\{isCount \? stat\.ink : 'muted'\}/);
  assert.doesNotMatch(overlay, /text-transform: uppercase;\s*\}\s*`\}<\/style>/);

  assert.doesNotMatch(lobby, /'Est\. Tables'|'Cash Tables'/);
  assert.match(lobby, /\? 'Estimated Tables'/);
  assert.match(lobby, /\? 'Live \+ Estimated Tables'/);
  assert.match(lobby, /setPlatformCountsStatus\('ready'\)/);
  assert.match(lobby, /setDailyCountStatus\('ready'\)/);
  assert.match(lobby, /venueCount=\{totalVenueCount > 0 \? totalVenueCount : \(platformCountsStatus === 'loading' \? null : 'Unknown'\)\}/);
  // The first paint is painted art, not a generic shimmer card.
  assert.doesNotMatch(lobby, /className="pnm-skel"/);
});

test('lobby keeps its route, SEO, sounds, telemetry and sheets', () => {
  const lobby = read(LOBBY);
  for (const pin of [
    /<HubPageSummary page="poker-near-me" \/>/,
    /canonical="\/hub\/poker-near-me\/lobby"/,
    /jsonLd=\{LOBBY_JSON_LD\}/,
    /<section id="pnm-lobby-main"/,
    /Skip To Poker Near Me Choices/,
    /import \{ playClickSound, playPanelOpenSound, playPanelCloseSound \}/,
    /useModalHistory\(showVoiceSearch, closeVoiceSearch\)/,
    /useScrimDismiss\(closeVoiceSearch\)/,
    /className="pnm-sheet-scrim"/,
    /className="sp-icon-btn pnm-sheet__close"/,
    /<VoiceSearch variant="embedded" onResult=\{handleVoiceResult\} \/>/,
    /onSearchBarClick=\{\(\) => setShowGlobalSearch\(true\)\}/,
    /onVoiceClick=\{\(\) => setShowVoiceSearch\(true\)\}/,
  ]) assert.match(lobby, pin, String(pin));
  // The voice sheet is one painted console with the painted close holder.
  assert.match(lobby, /className="pnm-sheet pnm-voice-sheet"[\s\S]*?<PokerNearMeConsole[\s\S]*?titleId="pnm-voice-title"[\s\S]*?pill="English"[\s\S]*?<PokerNearMeConsoleIcon name="close" \/>/);
  assert.doesNotMatch(lobby, /&times;/);
  // Lobby status toasts are printed on the painted panel, in Title Case.
  assert.match(lobby, /className="pnm-lobby-toast pnm-lobby-toast--location"/);
  assert.match(lobby, /className="pnm-lobby-toast pnm-lobby-toast--geofence"/);
  assert.match(lobby, /'Geofence Alerts Could Not Start On This Device\.'/);
  assert.match(lobby, /aria-label="Dismiss geofence notice"/);
});

test('VoiceSearch prints on painted plates and keeps speech behaviour', () => {
  const src = stripComments(read(VOICE));
  assert.doesNotMatch(src, /<svg\b|(?:linear|radial|conic)-gradient\(|:hover|border-radius:\s*[1-9]|hsl\(/);
  assert.match(src, /button-primary\.png/);
  assert.match(src, /search-well\.png/);
  assert.match(src, /<PokerNearMePanelShell as="div" className="voice-popover"/);
  assert.match(src, /aria-label=\{listening \? 'Stop Listening' : \(embedded \? 'Start Listening' : 'Voice Search'\)\}/);
  for (const pin of [
    /window\.SpeechRecognition \|\| window\.webkitSpeechRecognition/,
    /recognition\.interimResults = true;/,
    /recognitionRef\.current\.abort\(\)/,
    /onResult\(result\);/,
    /setError\('Microphone Permission Denied'\)/,
  ]) assert.match(src, pin, String(pin));
});
