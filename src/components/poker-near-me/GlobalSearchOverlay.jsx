/**
 * GlobalSearchOverlay.jsx — v3
 *
 * Google-style full-screen search overlay for Poker Near Me.
 *
 * v3 Fixes:
 *  - Live venue suggestions WHILE TYPING (debounced API, shows top 5 matches)
 *  - Map is OUTSIDE the scrollable body → cards always render below it
 *  - All result cards (venue/tour/series) open full-screen detail modal — no navigation
 *  - ESC closes detail modal first, then overlay
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useModalHistory } from '../../hooks/useModalHistory';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { fuzzyMatchScore } from './pnm-utils';
import { openNativeMaps } from '../../utils/openNativeMaps';
import { acquireScrollLock } from '../../lib/scrollLock';
import useAccessibleDialog from '../../hooks/useAccessibleDialog';
import PokerNearMeConsole, { PokerNearMeConsoleIcon, PokerNearMePanelShell } from './PokerNearMeConsole';

const VenueMap = dynamic(
  () => import('./VenueMap').catch(() => () => null),
  { ssr: false }
);

// ─── Popular city suggestions ───
const POPULAR_CITIES = [
  'Las Vegas, NV', 'Los Angeles, CA', 'Phoenix, AZ', 'Houston, TX', 'Miami, FL',
  'New York, NY', 'Chicago, IL', 'Denver, CO', 'Atlanta, GA', 'Seattle, WA',
  'San Francisco, CA', 'Dallas, TX', 'Orlando, FL', 'San Diego, CA', 'Tampa, FL',
  'Portland, OR', 'Nashville, TN', 'Austin, TX', 'New Orleans, LA', 'Philadelphia, PA',
  'Detroit, MI', 'Minneapolis, MN', 'Boston, MA', 'Sacramento, CA', 'Reno, NV',
  'Atlantic City, NJ', 'Biloxi, MS', 'Tunica, MS', 'Cherokee, NC', 'Tulsa, OK',
  'Oklahoma City, OK', 'Kansas City, MO', 'Salt Lake City, UT', 'Memphis, TN',
  'Charlotte, NC', 'Pittsburgh, PA', 'Cincinnati, OH', 'Cleveland, OH', 'Columbus, OH',
  'Shreveport, LA', 'Laughlin, NV', 'Henderson, NV',
];

// Venue kinds print in lit-blue console ink. The old per-kind tinted pills
// (gold, cyan, violet, pink, green) are gone: the console separates kinds with
// words, not colour, and pink is outside the Smarter.Poker schema.
const VENUE_TYPE_LABELS = {
  casino: 'Casino',
  card_room: 'Poker Club',
  poker_club: 'Poker Club',
  charity: 'Charity',
  tour_stop: 'Tour Stop',
  series: 'Series',
};
const venueTypeLabel = (venueType) => VENUE_TYPE_LABELS[venueType] || VENUE_TYPE_LABELS.card_room;

// ─── Natural Language Query Parser ───────────────────────────────────────────
// Parses queries like "tournaments next month in Illinois" into structured intents
const US_STATES = {
  alabama:'AL', alaska:'AK', arizona:'AZ', arkansas:'AR', california:'CA', colorado:'CO',
  connecticut:'CT', delaware:'DE', florida:'FL', georgia:'GA', hawaii:'HI', idaho:'ID',
  illinois:'IL', indiana:'IN', iowa:'IA', kansas:'KS', kentucky:'KY', louisiana:'LA',
  maine:'ME', maryland:'MD', massachusetts:'MA', michigan:'MI', minnesota:'MN', mississippi:'MS',
  missouri:'MO', montana:'MT', nebraska:'NE', nevada:'NV', 'new hampshire':'NH',
  'new jersey':'NJ', 'new mexico':'NM', 'new york':'NY', 'north carolina':'NC',
  'north dakota':'ND', ohio:'OH', oklahoma:'OK', oregon:'OR', pennsylvania:'PA',
  'rhode island':'RI', 'south carolina':'SC', 'south dakota':'SD', tennessee:'TN',
  texas:'TX', utah:'UT', vermont:'VT', virginia:'VA', washington:'WA',
  'west virginia':'WV', wisconsin:'WI', wyoming:'WY',
};
// Also accept abbreviations directly
const STATE_ABBREVS = Object.values(US_STATES || {});
// Everyday 2-letter words that collide with state codes — never treated as a state
// unless the user typed them in uppercase.
const LOCATIVE_STOPWORDS = ['me', 'it', 'my', 'no', 'so', 'to', 'on', 'as', 'of', 'is', 'be', 'do', 'we', 'us', 'up', 'if', 'or', 'an', 'am'];

// ─── Intent application helpers ───────────────────────────────────────────────
const GAME_TYPE_PATTERNS = {
  PLO: /omaha|plo/i,
  NLH: /hold\s*'?\s*em|holdem|nlh|no[\s-]?limit/i,
  Mixed: /mixed|horse|stud|dealer/i,
};
const GAME_TYPE_LABELS = {
  tournament: 'Tournaments',
  cash: 'Cash Games',
  live: 'Live Games',
  PLO: 'PLO',
  NLH: "Hold'em",
  Mixed: 'Mixed Games',
};

// Parse 'YYYY-MM-DD' as a LOCAL date — new Date('2026-08-01') is UTC midnight, which
// reads back as the previous day in every US timezone.
function parseLocalDate(value) {
  if (!value) return null;
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

// Turn a parsed time window into a local date range: start inclusive, end exclusive
function timeWindowRange(timeWindow) {
  if (!timeWindow) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  switch (timeWindow) {
    case 'today': return { start: today, end: addDays(today, 1) };
    case 'tomorrow': return { start: addDays(today, 1), end: addDays(today, 2) };
    case 'this_week': return { start: today, end: addDays(today, 7 - today.getDay()) };
    case 'next_week': {
      const start = addDays(today, 7 - today.getDay());
      return { start, end: addDays(start, 7) };
    }
    case 'this_weekend': {
      const start = addDays(today, (6 - today.getDay() + 7) % 7);
      return { start, end: addDays(start, 2) };
    }
    case 'next_month': {
      return { start: new Date(now.getFullYear(), now.getMonth() + 1, 1), end: new Date(now.getFullYear(), now.getMonth() + 2, 1) };
    }
    default: return null;
  }
}

// Undated items are kept — we cannot judge them, and dropping them would hide results
function overlapsWindow(item, range) {
  if (!range) return true;
  const start = parseLocalDate(item?.start_date);
  if (!start) return true;
  const end = parseLocalDate(item?.end_date) || start;
  return start < range.end && end >= range.start;
}

function venueMatchesGameType(venue, gameType) {
  const pattern = GAME_TYPE_PATTERNS[gameType];
  if (!pattern) return true;
  const games = Array.isArray(venue?.games_offered) ? venue.games_offered : [];
  return games.some(g => pattern.test(String(g)));
}

function parseNaturalLanguageQuery(raw) {
  const q = (raw || '').toLowerCase().trim();
  const result = { location: null, stateCode: null, timeWindow: null, gameType: null, isNaturalLanguage: false, cleanQuery: raw };
  if (!q) return result;

  // Detect game type intent
  if (/\bplo8?\b|\bomaha\b/.test(q)) { result.gameType = 'PLO'; result.isNaturalLanguage = true; }
  else if (/\bnlh\b|\bt[exas ]*holdem\b|\bno limit\b/.test(q)) { result.gameType = 'NLH'; result.isNaturalLanguage = true; }
  else if (/\bmixed\b|\bhorse\b/.test(q)) { result.gameType = 'Mixed'; result.isNaturalLanguage = true; }
  else if (/\btournament[s]?\b|\btourney[s]?\b/.test(q)) { result.gameType = 'tournament'; result.isNaturalLanguage = true; }
  else if (/\bcash\s+game[s]?\b/.test(q)) { result.gameType = 'cash'; result.isNaturalLanguage = true; }
  else if (/\blive\s+game[s]?\b/.test(q)) { result.gameType = 'live'; result.isNaturalLanguage = true; }

  // Detect time window
  if (/\bnext\s+month\b/.test(q)) { result.timeWindow = 'next_month'; result.isNaturalLanguage = true; }
  else if (/\bthis\s+week\b/.test(q)) { result.timeWindow = 'this_week'; result.isNaturalLanguage = true; }
  else if (/\bnext\s+week\b/.test(q)) { result.timeWindow = 'next_week'; result.isNaturalLanguage = true; }
  else if (/\bthis\s+weekend\b|\bweekend\b/.test(q)) { result.timeWindow = 'this_weekend'; result.isNaturalLanguage = true; }
  else if (/\btoday\b/.test(q)) { result.timeWindow = 'today'; result.isNaturalLanguage = true; }
  else if (/\btomorrow\b/.test(q)) { result.timeWindow = 'tomorrow'; result.isNaturalLanguage = true; }

  // Detect location — full state name first
  for (const [name, code] of Object.entries(US_STATES || {})) {
    if (q.includes(name)) { result.stateCode = code; result.location = name; result.isNaturalLanguage = true; break; }
  }
  // Then 2-letter abbreviation (e.g. "in IL", " IL ")
  // Matching ANY bare 2-letter token turned everyday words into states:
  // "poker in vegas" -> IN (Indiana), "me"/"or"/"ok"/"hi"/"la"/"de"/"pa" likewise.
  // A token now only counts as a state code when it either follows a locative preposition
  // ("in IL", "near NV") or is UPPERCASE in the user's raw (un-lowercased) query.
  if (!result.stateCode) {
    const candidates = [];
    const locative = /\b(?:in|near|around|at)\s+([a-z]{2})\b/g;
    let m;
    while ((m = locative.exec(q)) !== null) {
      // "poker near me" must not resolve to ME (Maine) — an uppercase "ME" in the raw
      // query still resolves via the pass below.
      if (LOCATIVE_STOPWORDS.includes(m[1])) continue;
      candidates.push(m[1].toUpperCase());
    }
    const rawUpper = String(raw || '').match(/\b[A-Z]{2}\b/g) || [];
    for (const token of rawUpper) candidates.push(token);
    for (const abbr of candidates) {
      if (STATE_ABBREVS.includes(abbr)) { result.stateCode = abbr; result.location = abbr; result.isNaturalLanguage = true; break; }
    }
  }

  // Build a clean keyword-only query for the API (strip NL words)
  if (result.isNaturalLanguage) {
    let clean = q
      .replace(/\bnext\s+month\b|\bthis\s+week\b|\bnext\s+week\b|\bthis\s+weekend\b|\bweekend\b|\btoday\b|\btomorrow\b/g, '')
      .replace(/\btournament[s]?\b|\btourney\b|\bcash\s+games?\b|\blive\s+games?\b/g, '')
      .replace(/\b(in|at|near|around|for|the|show|me|all|find|with)\b/g, '')
      .replace(/\s+/g, ' ').trim();
    // Remove the state name from the clean query too (it gets passed as a separate filter)
    if (result.location && result.location.length > 2) clean = clean.replace(new RegExp(result.location, 'gi'), '').trim();
    result.cleanQuery = clean || (result.stateCode || '');
  }

  return result;
}

// ─── Painted system ───
// Every well, holder, plate and panel slice below comes from the approved
// console kit (PokerNearMeConsole). No vector glyphs, tinted pills or CSS
// gradients: only live DOM text is printed, in the console inks.
// Stored recent searches are lower-case keys. They print in Title Case with
// poker and tour acronyms kept whole: "wsop" prints WSOP, not Wsop.
const QUERY_ACRONYMS = new Set(['wsop', 'wsopc', 'wpt', 'mspt', 'rgps', 'pgt', 'napt', 'fpn', 'nlh', 'plo', 'ept', 'hpt']);
function formatStoredQuery(value) {
  return String(value || '').replace(/[A-Za-z][A-Za-z'.]*/g, (word) => {
    const lower = word.toLowerCase();
    if (QUERY_ACRONYMS.has(lower)) return lower.toUpperCase();
    return word.charAt(0).toUpperCase() + word.slice(1);
  });
}

const TIME_WINDOW_LABELS = {
  today: 'Today',
  tomorrow: 'Tomorrow',
  this_week: 'This Week',
  next_week: 'Next Week',
  this_weekend: 'This Weekend',
  next_month: 'Next Month',
};

// Series date range, built on the file's existing local-date parser.
function formatDateRange(startValue, endValue) {
  const start = parseLocalDate(startValue);
  if (!start) return '';
  const end = parseLocalDate(endValue);
  const opts = { month: 'short', day: 'numeric', year: 'numeric' };
  if (!end || end.getTime() === start.getTime()) return start.toLocaleDateString('en-US', opts);
  const sameYear = start.getFullYear() === end.getFullYear();
  const startLabel = start.toLocaleDateString('en-US', sameYear ? { month: 'short', day: 'numeric' } : opts);
  return `${startLabel} - ${end.toLocaleDateString('en-US', opts)}`;
}

function formatMoney(value) {
  if (value == null || value === '') return '';
  const num = Number(String(value).replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(num) || num <= 0) return String(value);
  return '$' + num.toLocaleString('en-US');
}

// ═══════════════════════════════════════════════════════════
// DETAIL MODAL
// ═══════════════════════════════════════════════════════════
function DetailModal({ item, type, onClose, onNavigate }) {
  const { dialogRef, initialFocusRef } = useAccessibleDialog({
    open: Boolean(item),
    onClose,
  });
  if (!item) return null;
  const isVenue = type === 'venue';
  const isTour = type === 'tour';
  const isSeries = type === 'series';
  // SCHEMA FIX: `is_24_hours` and `hours_of_operation` do not exist on poker_venues
  // (real columns: `hours`, `hours_weekday`, `hours_weekend`) and /api/poker/venues
  // never synthesises them, so the Hours row never rendered for any venue.
  const venueHours = (item.hours === '24/7' || item.hours_weekday === '24/7')
    ? '24/7 Open'
    : (item.hours || item.hours_weekday || '');
  const seriesDates = isSeries ? formatDateRange(item.start_date, item.end_date) : '';
  // Deep link out of the overlay — result cards only ever opened this modal, so
  // /hub/series/[id], /hub/tours/[code] and /hub/venues/[id] were unreachable from search.
  const detailPath = isSeries
    ? (item.id != null ? `/hub/series/${encodeURIComponent(item.id)}` : '')
    : isTour
    ? (item.tour_code ? `/hub/tours/${encodeURIComponent(item.tour_code)}` : '')
    : (item.id != null ? `/hub/venues/${encodeURIComponent(item.id)}` : '');
  const kindLabel = isVenue ? venueTypeLabel(item.venue_type) : isTour ? (item.tour_code || 'Tour') : 'Series';
  const logo = item.logo_url || item.profile_photo_url || item.cover_photo_url || '';
  const city = [item.city, item.state].filter(Boolean).join(', ');
  const phone = item.phone || item.phone_number || '';
  const address = item.address || '';
  const website = item.website || item.website_url || '';
  const name = item.name || item.tour_name || item.series_name || '';
  const initials = (item.name || item.tour_name || item.series_name || 'V')
    .split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
  const trustScore = isVenue ? parseFloat(item.trust_score) : NaN;
  // Directions routes through the shared device-aware helper — the
  // hardcoded maps.apple.com link sent Android and desktop users
  // through Apple Maps regardless of platform or saved preference.
  const openDirections = address ? () => {
    const latNum = parseFloat(item.latitude ?? item.lat);
    const lngNum = parseFloat(item.longitude ?? item.lng);
    openNativeMaps({
      address: [item.name, address, city].filter(Boolean).join(' '),
      lat: Number.isFinite(latNum) ? latNum : undefined,
      lng: Number.isFinite(lngNum) ? lngNum : undefined,
      mode: 'directions',
    });
  } : null;
  const openFullDetails = detailPath && onNavigate ? () => onNavigate(detailPath) : null;
  // The console foot paints both action plates or neither. With both actions
  // available they take the plates; a lone action prints as a lit word.
  const plates = openDirections && openFullDetails
    ? {
      secondary: { label: 'Directions', onClick: openDirections },
      primary: { label: 'View Full Details', onClick: openFullDetails, ink: 'white' },
    }
    : undefined;
  const loneAction = plates
    ? null
    : openFullDetails
      ? { label: 'View Full Details', onClick: openFullDetails }
      : openDirections
        ? { label: 'Directions', onClick: openDirections }
        : null;

  return (
    <div
      ref={dialogRef}
      className="gso-detail-console"
      role="dialog"
      aria-modal="true"
      aria-labelledby="gso-detail-title"
      tabIndex={-1}
      style={{ position: 'absolute', inset: 0, zIndex: 10010, display: 'flex', flexDirection: 'column', animation: 'gso-modal-in 0.22s ease' }}
    >
      {/* Header */}
      <div className="gso-detail-console__header" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}>
        <button ref={initialFocusRef} type="button" onClick={onClose} className="gso-painted-icon-button sp-icon-btn" style={{ '--sp-btn-size': '44px' }} aria-label="Close details">
          <PokerNearMeConsoleIcon name="back" />
        </button>
      </div>
      {/* Body: one painted console. Its head names the kind of record, the
          body prints the live fields, the foot carries the two actions. */}
      <div className="gso-detail-console__scroll">
        <PokerNearMeConsole
          as="article"
          className="gso-detail-console__card"
          title={isVenue ? 'Venue Details' : isTour ? 'Tour Details' : 'Series Details'}
          titleId="gso-detail-title"
          pill={kindLabel}
          pillInk="blue"
          crest="locator"
          foot={plates ? 'plates' : 'foot'}
          plates={plates}
        >
          <div className="gso-detail__identity">
            <LogoHolder key={logo || initials} src={logo} text={initials} size="detail" />
            <div className="gso-detail__identity-copy">
              <p className="gso-detail__name pnc-ink--silver">{name}</p>
              {city ? <p className="gso-detail__city">{city}</p> : null}
            </div>
          </div>
          <dl className="gso-detail__rows">
            {address && <DetailRow label="Address" value={address} />}
            {phone && <DetailRow label="Phone" value={phone} href={`tel:${phone}`} />}
            {website && <DetailRow label="Website" value={website.replace(/^https?:\/\//, '')} href={website} />}
            {isVenue && venueHours && <DetailRow label="Hours" value={venueHours} />}
            {isVenue && item.games_offered?.length > 0 && <DetailRow label="Games" value={item.games_offered.slice(0, 6).join(' · ')} />}
            {isTour && item.regions?.length > 0 && <DetailRow label="Regions" value={item.regions.join(' · ')} />}
            {/* GAP FIX: a Series result used to open a panel with a title, a city and a
                badge — every field /api/poker/series returns was ignored. */}
            {isSeries && seriesDates && <DetailRow label="Dates" value={seriesDates} />}
            {isSeries && item.venue && <DetailRow label="Venue" value={item.venue} />}
            {isSeries && item.total_events > 0 && <DetailRow label="Events" value={`${item.total_events} Event${item.total_events === 1 ? '' : 's'}`} />}
            {isSeries && item.main_event_buyin && <DetailRow label="Main Event Buy-In" value={formatMoney(item.main_event_buyin)} />}
            {isSeries && item.main_event_guaranteed && <DetailRow label="Main Event Guarantee" value={formatMoney(item.main_event_guaranteed)} />}
            {Number.isFinite(trustScore) && trustScore > 0 && <DetailRow label="Trust Score" value={`${trustScore.toFixed(1)} Of 5`} />}
          </dl>
          {/* Tour stops */}
          {isTour && Array.isArray(item.stops_2026) && item.stops_2026.length > 0 && (
            <section className="gso-detail__stops" aria-labelledby="gso-detail-stops-title">
              <h3 id="gso-detail-stops-title" className="gso-detail__stops-title">2026 Stops</h3>
              <dl className="gso-detail__rows">
                {item.stops_2026.slice(0, 15).map((stop, i) => (
                  <DetailRow key={i} label={stop.name || stop.location} value={stop.dates || 'Dates Not Listed'} />
                ))}
              </dl>
            </section>
          )}
          {loneAction || phone ? (
            <div className="gso-detail__actions">
              {loneAction ? (
                <button type="button" className="gso-lit-action pnc-ink--white" onClick={loneAction.onClick}>{loneAction.label}</button>
              ) : null}
              {phone ? <a className="gso-lit-action pnc-ink--green" href={`tel:${phone}`}>Call</a> : null}
            </div>
          ) : null}
        </PokerNearMeConsole>
      </div>
    </div>
  );
}

// One label and one value per row on the glass: lit blue label, silver value.
function DetailRow({ label, value, href }) {
  const external = Boolean(href) && !href.startsWith('tel');
  return (
    <div className="gso-detail-row">
      <dt className="gso-detail-row__label">{label}</dt>
      <dd className="gso-detail-row__value">
        {href ? (
          <a className="gso-detail-row__link" href={href} target={external ? '_blank' : undefined} rel="noopener noreferrer">{value}</a>
        ) : value}
      </dd>
    </div>
  );
}

// A logo sits in the painted utility well. With no logo (or a broken one) a
// complete painted pictogram stands alone, so a holder never nests a holder.
function LogoHolder({ src, icon, text, size = 'result' }) {
  const [failed, setFailed] = useState(false);
  if ((!src || failed) && icon) {
    return <PokerNearMeConsoleIcon name={icon} className={`gso-holder gso-holder--${size} gso-holder--icon`} />;
  }
  return (
    <span className={`gso-holder gso-holder--${size}`} aria-hidden="true">
      {src && !failed
        ? <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
        : <span className="gso-holder__text">{text}</span>}
    </span>
  );
}

// ─── Result Cards ───
// Each result is the compact three-slice panel from the console kit (head,
// repeating rail, foot) with one full-width button printed on its glass.
function ResultPanel({ className, isSelected, onActivate, holder, name, kind, place }) {
  return (
    <PokerNearMePanelShell as="div" className={isSelected ? 'gso-result is-selected' : 'gso-result'} bodyClassName="gso-result__body">
      <button type="button" className={className} onClick={onActivate}>
        {holder}
        <span className="gso-result__copy">
          <span className="gso-result__name">{name}</span>
          <span className="gso-result__meta">
            <span className="gso-result__kind pnc-ink--blue">{kind}</span>
            {place ? <span className="gso-result__place">{place}</span> : null}
          </span>
        </span>
      </button>
    </PokerNearMePanelShell>
  );
}

function VenueResultCard({ venue, onClick, isSelected = false }) {
  const city = [venue.city, venue.state].filter(Boolean).join(', ');
  const logo = venue.logo_url || venue.profile_photo_url || '';
  return (
    <ResultPanel
      className="gso-result-card gso-result-card--venue"
      isSelected={isSelected}
      onActivate={(e) => onClick?.(venue, e)}
      holder={<LogoHolder key={logo || 'home'} src={logo} icon="home" />}
      name={venue.name}
      kind={venueTypeLabel(venue.venue_type)}
      place={city}
    />
  );
}

function TourResultCard({ tour, onClick, isSelected = false }) {
  return (
    <ResultPanel
      className="gso-result-card gso-result-card--tour"
      isSelected={isSelected}
      onActivate={(e) => onClick?.(tour, e)}
      holder={<LogoHolder key={tour.logo_url || tour.tour_code || 'tour'} src={tour.logo_url} text={tour.tour_code || 'Tour'} />}
      name={tour.tour_name || tour.tour_code}
      kind="Tour"
      place={tour.regions?.slice(0, 2).join(' · ') || 'Traveling Tour'}
    />
  );
}

function SeriesResultCard({ series, onClick, isSelected = false }) {
  const city = [series.city, series.state].filter(Boolean).join(', ');
  return (
    <ResultPanel
      className="gso-result-card gso-result-card--series"
      isSelected={isSelected}
      onActivate={(e) => onClick?.(series, e)}
      holder={<LogoHolder icon="calendar" />}
      name={series.name || series.series_name}
      kind="Series"
      place={city}
    />
  );
}

function SectionHeader({ icon, label, count }) {
  return (
    <div className="gso-section-head">
      {icon ? <PokerNearMeConsoleIcon name={icon} className="gso-section-head__icon" /> : null}
      <span className="gso-section-head__label">{label}</span>
      {count > 0 ? <span className="gso-section-head__count">{count}</span> : null}
    </div>
  );
}

function SearchSkeletons() {
  return (
    <div className="gso-skeletons" role="status" aria-live="polite">
      <span className="gso-visually-hidden">Searching</span>
      {[1, 2, 3, 4, 5].map(i => (
        <div className="gso-console-skeleton" key={i} aria-hidden="true" style={{ animationDelay: `${i * 0.1}s` }} />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function GlobalSearchOverlay({
  isOpen, onClose,
  searchQuery, onSearchChange,
  allTours = [], allSeries = [],
  searchHistory = [], onHistorySelect,
  cachedFetch, trackSearchEvent,
}) {
  const router = useRouter();
  const inputRef = useRef(null);
  const [phase, setPhase] = useState('input'); // 'input' | 'results'
  const [localQuery, setLocalQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [venueResults, setVenueResults] = useState([]);
  const [tourResults, setTourResults] = useState([]);
  const [seriesResults, setSeriesResults] = useState([]);
  const [citySuggestions, setCitySuggestions] = useState([]);
  const [recentSearches, setRecentSearches] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [detailItem, setDetailItem] = useState(null);
  const [nlIntent, setNlIntent] = useState(null); // parsed natural language intent
  const [userLocation, setUserLocation] = useState(null);
  // A failed venue request is an error state, never an empty result set.
  const [searchError, setSearchError] = useState(false);
  const debounceRef = useRef(null);
  // [BUG FIX] AbortController ref — cancels stale in-flight venue suggestion fetches
  const abortControllerRef = useRef(null);
  // Monotonic submit counter — only the newest submit may clear the loading flag
  const submitSeqRef = useRef(0);
  // A11Y: dialog element (focus trap) + the control that had focus before opening
  const dialogRef = useRef(null);
  const restoreFocusRef = useRef(null);
  // The search surface (made inert under the nested detail) and the control
  // that opened the detail, which takes focus back when the detail closes.
  const surfaceRef = useRef(null);
  const detailReturnFocusRef = useRef(null);
  // The one scrolling list. Switching between suggestions and results starts
  // it at the top instead of keeping the previous phase's scroll offset.
  const bodyRef = useRef(null);

  // Load recent searches and GPS from localStorage on mount
  useEffect(() => {
    const syncRecents = () => {
      try {
        const stored = localStorage.getItem('pnm_recent_searches');
        if (stored) setRecentSearches(JSON.parse(stored));
      } catch { /* ignore */ }
    };
    
    const syncGPS = () => {
      const gps = localStorage.getItem('sp-user-gps');
      if (gps) try { setUserLocation(JSON.parse(gps)); } catch { /* ignore */ }
    };

    // Initial load
    syncRecents();
    syncGPS();

    // [GSO1 FIX] Zombie listener bug: addEventListener was called with an anonymous arrow function
    // but cleanup called removeEventListener with named functions (syncRecents, syncGPS) —
    // two different function references, so the listener was NEVER actually removed.
    // Now we use stable named handlers for both attach and cleanup.
    const handleStorage = (e) => {
      if (e.key === 'pnm_recent_searches') syncRecents();
      if (e.key === 'sp-user-gps') syncGPS();
    };
    window.addEventListener('storage', handleStorage);
    window.addEventListener('pnm_recent_searches_updated', syncRecents);
    window.addEventListener('sp_user_gps_updated', syncGPS);
    
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('pnm_recent_searches_updated', syncRecents);
      window.removeEventListener('sp_user_gps_updated', syncGPS);
    };
  }, []);

  // Reset & focus when opened; abort in-flight fetches when closed
  useEffect(() => {
    if (isOpen) {
      setLocalQuery(searchQuery || '');
      if (searchQuery) {
        setPhase('results');
        setTimeout(() => handleSubmit(null, searchQuery), 10);
      } else {
        setPhase('input');
        setVenueResults([]); setTourResults([]); setSeriesResults([]);
        setCitySuggestions([]);
      }
      setDetailItem(null);
      setSearchError(false);
      setTimeout(() => inputRef.current?.focus(), 120);
    } else {
      // [BUG FIX] Cancel any pending debounce + in-flight fetch when overlay closes
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortControllerRef.current) { abortControllerRef.current.abort(); abortControllerRef.current = null; }

      // --- NEW: Search Analytics Telemetry for abandoned searches
      if (trackSearchEvent && localQuery && localQuery.trim().length > 2 && venueResults.length === 0 && tourResults.length === 0 && seriesResults.length === 0) {
          trackSearchEvent('abandoned_search_query', { query: localQuery, timestamp: Date.now() });
      }
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // ESC key
  useEffect(() => {
    const handleKey = (e) => {
      // Nested dialogs such as the fullscreen map own the first Escape. Their
      // capture-phase handler prevents the event; do not also dismiss the
      // entire search overlay on that same keypress.
      if (e.key === 'Escape' && !e.defaultPrevented) {
        if (detailItem) setDetailItem(null);
        else onClose?.();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose, detailItem]);

  // Lock body scroll
  useEffect(() => {
    if (!isOpen) return undefined;
    return acquireScrollLock('PokerNearMeGlobalSearch');
  }, [isOpen]);

  // Mobile phase 3: the phone back gesture closes the search instead of
  // leaving the page. The overlay stays full-screen on purpose (the input is
  // pinned under the status bar, above the keyboard); a bottom sheet would
  // put the field behind the keyboard.
  useModalHistory(!!isOpen, onClose);

  // A11Y FIX: the shell declares role="dialog" aria-modal="true" and locks body scroll, but
  // nothing constrained Tab — a keyboard or screen-reader user tabbing past the last result
  // landed on the scroll-locked page behind the overlay. Cycle Tab inside the dialog and
  // hand focus back to whatever opened it on close.
  useEffect(() => {
    if (!isOpen) return;
    if (typeof document !== 'undefined') {
      restoreFocusRef.current = document.activeElement;
    }
    const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const handleTab = (e) => {
      if (e.key !== 'Tab') return;
      const root = dialogRef.current;
      if (!root) return;
      // A nested detail makes the search surface inert and aria-hidden. Those
      // controls cannot take focus, so they can never be the wrap target:
      // counting them stranded Tab on the detail's last control.
      const items = Array.from(root.querySelectorAll(FOCUSABLE)).filter(
        el => (el.offsetParent !== null || el === document.activeElement)
          && !el.closest('[inert], [aria-hidden="true"]')
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!root.contains(active)) {
        e.preventDefault();
        first.focus();
        return;
      }
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleTab, true);
    return () => {
      document.removeEventListener('keydown', handleTab, true);
      const prev = restoreFocusRef.current;
      restoreFocusRef.current = null;
      if (prev && typeof prev.focus === 'function' && document.contains(prev)) {
        try { prev.focus(); } catch { /* ignore */ }
      }
    };
  }, [isOpen]);

  // In-memory fuzzy match tours
  const matchTours = useCallback((q) => {
    return allTours
      .map(t => {
        const score = Math.min(
          fuzzyMatchScore(q, t.tour_name),
          fuzzyMatchScore(q, t.tour_code),
          ...(Array.isArray(t.regions) ? t.regions.map(r => fuzzyMatchScore(q, r)) : [Infinity]),
          ...(Array.isArray(t.stops_2026) ? t.stops_2026.map(s => Math.min(fuzzyMatchScore(q, s.location), fuzzyMatchScore(q, s.name))) : [Infinity])
        );
        return { item: t, score };
      })
      .filter(t => t.score <= 2) // Threshold
      .sort((a, b) => a.score - b.score)
      .map(t => t.item)
      .slice(0, 8);
  }, [allTours]);

  // In-memory fuzzy match series
  const matchSeries = useCallback((q) => {
    return allSeries
      .map(s => {
        const score = Math.min(
          fuzzyMatchScore(q, s.name),
          fuzzyMatchScore(q, s.series_name),
          fuzzyMatchScore(q, s.city),
          fuzzyMatchScore(q, s.state),
          fuzzyMatchScore(q, s.venue_name)
        );
        return { item: s, score };
      })
      .filter(s => s.score <= 2) // Threshold
      .sort((a, b) => a.score - b.score)
      .map(s => s.item)
      .slice(0, 8);
  }, [allSeries]);

  // Handle typing — live suggestions for ALL types
  const handleInputChange = useCallback((e) => {
    const val = e.target.value;
    setLocalQuery(val);
    onSearchChange?.(val);
    // Typing invalidates any arrowed-to row — Enter must not fire a stale selection
    setSelectedIndex(-1);
    setSearchError(false);

    if (!val.trim()) {
      setPhase('input');
      setVenueResults([]); setTourResults([]); setSeriesResults([]);
      setCitySuggestions([]);
      return;
    }

    // Immediate: city typeahead
    const lower = val.toLowerCase();
    setCitySuggestions(POPULAR_CITIES.filter(c => c.toLowerCase().includes(lower)).slice(0, 4));

    // Immediate: in-memory tours + series
    setTourResults(matchTours(val.trim()));
    setSeriesResults(matchSeries(val.trim()));

    // Debounced: venue API for live suggestions
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.trim().length >= 2) {
      debounceRef.current = setTimeout(async () => {
        // Cancel any previous in-flight request to prevent stale results
        if (abortControllerRef.current) abortControllerRef.current.abort();
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;
        try {
          const params = new URLSearchParams({ limit: '5', offset: '0', sort: 'trust' });
          if (val.trim()) params.set('search', val.trim());
          if (userLocation?.lat && userLocation?.lng) {
            params.set('lat', userLocation.lat);
            params.set('lng', userLocation.lng);
          }
          const url = `/api/poker/venues?${params.toString()}`;
          let data;
          if (cachedFetch) {
            data = await cachedFetch(url);
          } else {
            const r = await fetch(url, { signal });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            data = await r.json();
          }
          if (signal.aborted) return; // [BUG FIX] Prevent stale state updates if aborted
          const venues = data?.data || data?.venues || (Array.isArray(data) ? data : []);
          setVenueResults(venues.slice(0, 5));
        } catch (err) {
          if (err?.name !== 'AbortError') console.warn('[GlobalSearch] Venue suggestion fetch failed:', err);
        }
      }, 280);
    }
  }, [onSearchChange, matchTours, matchSeries, cachedFetch, userLocation]);

  // Full search on submit — supports natural language queries
  const handleSubmit = useCallback(async (e, overrideQuery) => {
    e?.preventDefault?.();
    const rawQuery = (overrideQuery || localQuery).trim();
    if (!rawQuery) return;
    inputRef.current?.blur();
    setPhase('results');
    setIsLoading(true);
    setSearchError(false);
    // BUG FIX: an aborted search used to `return` from inside the try block, skipping
    // setIsLoading(false) — the skeleton loaders then spun forever (typing one more
    // character after submitting aborts the submit's controller via the input debounce).
    // The sequence guard makes sure only the newest submit ever clears the flag.
    const mySeq = ++submitSeqRef.current;
    const isCurrentSubmit = () => submitSeqRef.current === mySeq;
    setCitySuggestions([]);
    setDetailItem(null);

    // Parse for natural language intent
    const intent = parseNaturalLanguageQuery(rawQuery);
    setNlIntent(null);
    setSelectedIndex(-1);
    const apiQuery = intent.isNaturalLanguage ? intent.cleanQuery : rawQuery;

    // Track which detected intents actually shaped the results — only those get a chip,
    // so the header never claims a filter that was never applied.
    const applied = { stateCode: !!intent.stateCode, timeWindow: false, gameType: false };

    // Build venue API URL — inject state filter if detected
    const params = new URLSearchParams({ limit: '200', offset: '0', sort: 'trust' });
    if (apiQuery) params.set('search', apiQuery);
    if (intent.stateCode) params.set('state', intent.stateCode);
    // The venues API supports tournaments=true — honour a "tournaments" intent server-side
    if (intent.gameType === 'tournament') { params.set('tournaments', 'true'); applied.gameType = true; }
    if (userLocation?.lat && userLocation?.lng) {
      params.set('lat', userLocation.lat);
      params.set('lng', userLocation.lng);
    }
    const venueUrl = `/api/poker/venues?${params.toString()}`;

    // Cancel any previous in-flight request to prevent stale results
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    try {
      let data;
      if (cachedFetch) {
        data = await cachedFetch(venueUrl);
      } else {
        const r = await fetch(venueUrl, { signal });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        data = await r.json();
      }
      if (signal.aborted) {
        // Stale response — drop the results, but never strand the loading flag.
        if (isCurrentSubmit()) setIsLoading(false);
        return;
      }
      const venues = data?.data || data?.venues || (Array.isArray(data) ? data : []);
      // Apply a specific game-type intent (PLO / Hold'em / Mixed) against games_offered.
      // Only keep the narrowed list when it still has results — sparse game data must not
      // wipe out an otherwise good search.
      let list = venues;
      if (GAME_TYPE_PATTERNS[intent.gameType]) {
        const narrowed = list.filter(v => venueMatchesGameType(v, intent.gameType));
        if (narrowed.length > 0) { list = narrowed; applied.gameType = true; }
      }
      setVenueResults(list);
    } catch (err) {
      if (err?.name !== 'AbortError') {
        console.warn('[GlobalSearch] Venue search failed:', err);
        setVenueResults([]);
        setSearchError(true);
      } else {
        // Aborted mid-flight — same rule as above: clear the spinner, keep the results.
        if (isCurrentSubmit()) setIsLoading(false);
        return;
      }
    }

    // For tours/series — use the full raw query for broader matching
    const range = timeWindowRange(intent.timeWindow);
    let matchedSeries = matchSeries(rawQuery);
    if (range) {
      matchedSeries = matchedSeries.filter(s => overlapsWindow(s, range));
      applied.timeWindow = true;
    }
    setTourResults(matchTours(rawQuery));
    setSeriesResults(matchedSeries);
    setNlIntent(intent.isNaturalLanguage && (applied.stateCode || applied.timeWindow || applied.gameType)
      ? { ...intent, applied }
      : null);
    if (isCurrentSubmit()) setIsLoading(false);

    // Save to recents
    const normalized = rawQuery.toLowerCase();
    setRecentSearches(prev => {
      const next = [normalized, ...prev.filter(q => q !== normalized)].slice(0, 5);
      try { 
        localStorage.setItem('pnm_recent_searches', JSON.stringify(next)); 
        window.dispatchEvent(new Event('pnm_recent_searches_updated'));
      } catch { /* ignore */ }
      return next;
    });

  }, [localQuery, cachedFetch, matchTours, matchSeries, userLocation]);

  const handleSuggestionClick = useCallback((s) => {
    setLocalQuery(s); onSearchChange?.(s); handleSubmit(null, s);
  }, [onSearchChange, handleSubmit]);

  const handleHistoryClick = useCallback((q) => {
    setLocalQuery(q); onSearchChange?.(q); handleSubmit(null, q); onHistorySelect?.(q);
  }, [onSearchChange, handleSubmit, onHistorySelect]);

  const openDetail = useCallback((item, type, opener) => {
    // A search-result map can be fullscreen. Close that nested surface before
    // mounting the detail layer so the detail dialog is never trapped behind
    // the map's fixed stacking context and only one focus trap owns the page.
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('pnm:close-map-fullscreen'));
    }
    // Remember what opened the detail (the result button, or the input for an
    // arrowed-to row) before the surface under it goes inert.
    detailReturnFocusRef.current = opener
      || (typeof document !== 'undefined' ? document.activeElement : null);
    setDetailItem({ item, type });
  }, []);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [phase]);

  // Closing the nested detail returns focus to the result that opened it.
  // useAccessibleDialog restores the aria-hidden value it recorded when the
  // detail mounted, which was the surface's own hidden state, so the surface
  // is re-exposed here as well: it must not stay hidden from assistive tech.
  useEffect(() => {
    if (detailItem) return;
    const surface = surfaceRef.current;
    if (surface) {
      surface.removeAttribute('aria-hidden');
      surface.removeAttribute('inert');
    }
    const opener = detailReturnFocusRef.current;
    detailReturnFocusRef.current = null;
    if (opener && opener.isConnected && dialogRef.current?.contains(opener) && typeof opener.focus === 'function') {
      opener.focus();
    }
  }, [detailItem]);

  const getSelectableItems = useCallback(() => {
    if (phase === 'results') return [];
    if (!localQuery.trim()) return recentSearches.map(r => ({ type: 'recent', data: r }));
    return [
      ...citySuggestions.map(c => ({ type: 'city', data: c })),
      ...venueResults.map(v => ({ type: 'venue', data: v })),
      ...tourResults.map(t => ({ type: 'tour', data: t })),
      ...seriesResults.map(s => ({ type: 'series', data: s }))
    ];
  }, [phase, localQuery, recentSearches, citySuggestions, venueResults, tourResults, seriesResults]);

  const handleKeyDown = useCallback((e) => {
    const items = getSelectableItems();
    if (items.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < items.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : items.length - 1));
    } else if (e.key === 'Enter') {
      if (selectedIndex >= 0 && selectedIndex < items.length && phase === 'input') {
        e.preventDefault();
        const item = items[selectedIndex];
        if (item.type === 'recent' || item.type === 'city') {
          handleSuggestionClick(item.data);
        } else {
          openDetail(item.data, item.type);
        }
      }
    }
  }, [getSelectableItems, selectedIndex, phase, handleSuggestionClick, openDetail]);

  // Suggestion lists refresh asynchronously (debounced venue fetch, in-memory rematch) —
  // drop the highlight so Enter can never activate an item the user never arrowed to.
  useEffect(() => {
    setSelectedIndex(-1);
  }, [citySuggestions, venueResults, tourResults, seriesResults, recentSearches]);

  // Index offsets must mirror getSelectableItems() ordering: cities, venues, tours, series
  const cityOffset = 0;
  const venueOffset = citySuggestions.length;
  const tourOffset = venueOffset + venueResults.length;
  const seriesOffset = tourOffset + tourResults.length;

  const totalResults = venueResults.length + tourResults.length + seriesResults.length;
  const hasResults = totalResults > 0;

  // UX FIX: this panel used to render TWO sections both headed "Recent Searches" — the local
  // `pnm_recent_searches` list and the account-backed `searchHistory` prop — with overlapping
  // entries, and only the first was keyboard-selectable. The account list is now deduped
  // against the local one and labelled for what it is.
  const accountHistory = useMemo(() => {
    const seen = new Set((recentSearches || []).map(r => String(r).toLowerCase().trim()));
    const out = [];
    (searchHistory || []).forEach(item => {
      const q = (item && item.search_query) || item;
      if (!q || typeof q !== 'string') return;
      const key = q.toLowerCase().trim();
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push(item);
    });
    return out.slice(0, 8);
  }, [searchHistory, recentSearches]);

  // A11Y: id of the row the arrow keys currently point at (recents / cities are the rows
  // that carry ids — the richer result cards keep their visual selected state).
  const activeDescendantId = (() => {
    if (selectedIndex < 0 || phase !== 'input') return undefined;
    if (!localQuery.trim()) return selectedIndex < recentSearches.length ? `gso-opt-${selectedIndex}` : undefined;
    return selectedIndex < citySuggestions.length ? `gso-opt-${selectedIndex}` : undefined;
  })();

  if (!isOpen) return null;

  // Only intents that were actually applied are printed.
  const appliedIntentLabels = nlIntent
    ? [
      nlIntent.applied?.gameType && (GAME_TYPE_LABELS[nlIntent.gameType] || nlIntent.gameType),
      nlIntent.applied?.timeWindow && (TIME_WINDOW_LABELS[nlIntent.timeWindow] || nlIntent.timeWindow),
      nlIntent.applied?.stateCode && `In ${nlIntent.stateCode}`,
    ].filter(Boolean)
    : [];
  const venueWord = venueResults.length === 1 ? 'Venue' : 'Venues';

  return (
    <>
      <style>{`
        @keyframes gso-in {
          from { opacity: 0; transform: translateY(-12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes gso-modal-in {
          from { opacity: 0; transform: translateY(30px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* ───── OVERLAY SHELL ───── */}
      <div
        ref={dialogRef}
        className="gso-console-overlay"
        style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', flexDirection: 'column', fontFamily: 'Inter,system-ui,-apple-system,sans-serif', animation: 'gso-in 0.22s ease', overflow: 'hidden' }}
        role="dialog" aria-modal="true" aria-label="Search Poker Venues, Tours, and Series"
      >

        <div
          ref={surfaceRef}
          className="gso-search-surface"
          aria-hidden={detailItem ? 'true' : undefined}
          inert={detailItem ? '' : undefined}
        >

        {/* ───── HEADER ───── */}
        {/* Header sits below the status bar so the close control is reachable on a phone (mobile phase 0b).
            On a phone the Search plate wraps onto its own row in normal flow. It
            used to be absolutely positioned 52px under the header: at 390px that
            put it below the bottom of the viewport, and on wider phones over the
            first suggestion. */}
        <div className="gso-console-header" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}>
          <button type="button" className="gso-back sp-icon-btn" onClick={onClose} aria-label="Close" style={{ '--sp-btn-size': '44px' }}>
            <PokerNearMeConsoleIcon name="back" />
          </button>

          <form className="gso-console-form" onSubmit={handleSubmit}>
            <div className="gso-console-search-well">
              <PokerNearMeConsoleIcon name="search" className="gso-console-search-icon" />
              <input
                ref={inputRef} type="text" value={localQuery} onChange={handleInputChange} onKeyDown={handleKeyDown}
                placeholder="Search City, Venue, Tour, Series, Tournament..."
                autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
                role="combobox" aria-expanded={phase === 'input'} aria-autocomplete="list"
                aria-controls="gso-suggestions" aria-activedescendant={activeDescendantId}
                aria-label="Search City, Venue, Tour, Series, Or Tournament"
                enterKeyHint="search"
                className="gso-console-input"
              />
              {localQuery && (
                <button type="button" className="gso-clear"
                  onClick={() => { setLocalQuery(''); onSearchChange?.(''); setPhase('input'); setVenueResults([]); setTourResults([]); setSeriesResults([]); setCitySuggestions([]); setSearchError(false); inputRef.current?.focus(); }}
                  aria-label="Clear"><PokerNearMeConsoleIcon name="close" /></button>
              )}
            </div>
          </form>

          {/* Always present so the header never jumps on the first keystroke;
              an empty query leaves it disabled on the steel plate. */}
          <button type="button" className="gso-console-submit" onClick={handleSubmit} disabled={!localQuery.trim()}>
            <span className="gso-console-submit__label">Search</span>
          </button>
        </div>

        {/* ───── SCROLLABLE BODY ───── */}
        <div ref={bodyRef} className="gso-console-body">

          {/* INPUT phase — suggestions */}
          {phase === 'input' && (
            <div id="gso-suggestions" className="gso-console-list">

              {/* Recent searches */}
              {!localQuery.trim() && recentSearches.length > 0 && (
                <div className="gso-section">
                  <SectionHeader icon="search" label="Recent Searches" count={recentSearches.length} />
                  <div className="gso-well-list" role="listbox" aria-label="Recent Searches">
                    {recentSearches.map((rec, i) => (
                      <button key={`${rec}-${i}`} id={`gso-opt-${i}`} role="option" aria-selected={selectedIndex === i}
                        type="button"
                        className={selectedIndex === i ? 'gso-city-btn is-selected' : 'gso-city-btn'} onClick={() => handleHistoryClick(rec)}>
                        <span className="gso-well-row__text">{formatStoredQuery(rec)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* City suggestions */}
              {localQuery.trim().length > 0 && citySuggestions.length > 0 && (
                <div className="gso-section">
                  <SectionHeader icon="location" label="Cities" count={citySuggestions.length} />
                  <div className="gso-well-list" role="listbox" aria-label="City Suggestions">
                    {citySuggestions.map((city, ci) => (
                      <button key={city} id={`gso-opt-${cityOffset + ci}`} role="option" aria-selected={selectedIndex === cityOffset + ci}
                        type="button"
                        className={selectedIndex === cityOffset + ci ? 'gso-city-btn is-selected' : 'gso-city-btn'} onClick={() => handleSuggestionClick(city)}>
                        <span className="gso-well-row__text">{city}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Live venue suggestions (API-backed) */}
              {localQuery.trim().length >= 2 && venueResults.length > 0 && (
                <div className="gso-section">
                  <SectionHeader icon="home" label="Venues" count={venueResults.length} />
                  <div className="gso-result-list">
                    {venueResults.map((v, vi) => <VenueResultCard key={v.id} venue={v} isSelected={selectedIndex === venueOffset + vi} onClick={(venue, e) => openDetail(venue, 'venue', e?.currentTarget)} />)}
                  </div>
                </div>
              )}

              {/* Live tour suggestions */}
              {tourResults.length > 0 && (
                <div className="gso-section">
                  <SectionHeader icon="trophy" label="Tours" count={tourResults.length} />
                  <div className="gso-result-list">
                    {tourResults.map((t, ti) => <TourResultCard key={t.id || t.tour_code} tour={t} isSelected={selectedIndex === tourOffset + ti} onClick={(tour, e) => openDetail(tour, 'tour', e?.currentTarget)} />)}
                  </div>
                </div>
              )}

              {/* Live series suggestions */}
              {seriesResults.length > 0 && (
                <div className="gso-section">
                  <SectionHeader icon="calendar" label="Series" count={seriesResults.length} />
                  <div className="gso-result-list">
                    {seriesResults.map((s, sei) => <SeriesResultCard key={s.id || s.name} series={s} isSelected={selectedIndex === seriesOffset + sei} onClick={(series, e) => openDetail(series, 'series', e?.currentTarget)} />)}
                  </div>
                </div>
              )}

              {/* Account-backed history (deduped against the local recents above) */}
              {accountHistory.length > 0 && !localQuery && (
                <div className="gso-section">
                  <SectionHeader icon="saved" label="Saved To Your Account" />
                  <div className="gso-well-list">
                    {accountHistory.map((item, i) => (
                      <button key={item.id || i} type="button" className="gso-hist-btn" onClick={() => handleHistoryClick(item.search_query || item)}>
                        <span className="gso-well-row__text">{formatStoredQuery(item.search_query || item)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {!localQuery && accountHistory.length === 0 && recentSearches.length === 0 && (
                <div className="gso-empty">
                  <PokerNearMeConsoleIcon name="search" className="gso-empty__icon" />
                  <p className="gso-empty__title">Search Anything</p>
                  <p className="gso-empty__copy">City, State, Venue, Casino, Tournament, Series, Or Tour Name</p>
                </div>
              )}
            </div>
          )}

          {/* RESULTS phase — full list below the map */}
          {phase === 'results' && (
            <div className="gso-console-list">

              {isLoading && <SearchSkeletons />}

              {/* A failed venue request is not an empty directory: say so, and
                  offer the same search again instead of "No Results Found". */}
              {!isLoading && searchError && (
                <div className="gso-empty gso-empty--error" role="alert">
                  <PokerNearMeConsoleIcon name="alert" className="gso-empty__icon" />
                  <p className="gso-empty__title">Venue Search Unavailable</p>
                  <p className="gso-empty__copy">
                    {hasResults
                      ? 'Venues Could Not Be Loaded. The Tours And Series Below Still Match.'
                      : 'The Venue Directory Could Not Be Reached. Check Your Connection And Try Again.'}
                  </p>
                  <button type="button" className="gso-retry" onClick={() => handleSubmit(null, localQuery)}>
                    <span className="gso-retry__label">Try Again</span>
                  </button>
                </div>
              )}

              {!isLoading && !searchError && !hasResults && (
                <div className="gso-empty" role="status">
                  <PokerNearMeConsoleIcon name="search" className="gso-empty__icon" />
                  <p className="gso-empty__title">No Results Found</p>
                  <p className="gso-empty__copy">Try A Different City, Venue Name, Or Tour</p>
                </div>
              )}

              {!isLoading && hasResults && (
                <div className="gso-summary" role="status">
                  <p className="gso-summary__line">
                    <span className="gso-summary__count">{totalResults} {totalResults === 1 ? 'Result' : 'Results'}</span>
                    {' For '}
                    <span className="gso-summary__query">{`"${localQuery}"`}</span>
                  </p>
                  {appliedIntentLabels.length > 0 ? (
                    <p className="gso-summary__scope">
                      <span>Smart Search</span>
                      {appliedIntentLabels.map(label => <span key={label} className="gso-summary__intent">{label}</span>)}
                    </p>
                  ) : (
                    <p className="gso-summary__scope"><span>Global Search</span></p>
                  )}
                </div>
              )}

              {/* ───── MAP — under the summary, inside the one scroller. Pinned
                   above the list it took 360-520px with its own inner scroll, so its
                   frame was cut off and, on a 390px-tall landscape phone, the header and
                   map left the results no height at all. Result cards still render below it. ───── */}
              {phase === 'results' && !isLoading && venueResults.length > 0 && (
                <div className="pnm-global-search-map gso-map">
                  <VenueMap
                    // WIRING FIX: `disableClustering` is only read inside VenueMap's
                    // initialise-map effect (deps: [mapReady]), so the value in force on the
                    // FIRST search governed every later one — a 200-result search kept the
                    // unclustered layer. Keying on the mode remounts the map when it flips.
                    key={venueResults.length < 20 ? 'gso-map-nocluster' : 'gso-map-cluster'}
                    venues={venueResults}
                    // GAP FIX: the overlay reads GPS from localStorage and already sends it to
                    // the venue API — passing null here suppressed the "you are here" pin AND
                    // VenueMap's distance map, so no result popup could show its distance.
                    userLocation={userLocation}
                    mapEyebrow="Search Result Map"
                    mapTitle="Matching Poker Rooms"
                    mapDetail={`${venueResults.length} ${venueResults.length === 1 ? 'Location' : 'Locations'} From This Search`}
                    onVenueClick={v => openDetail(v, 'venue')}
                    onOpenIframeModal={(url, title) => {
                      const match = url.match(/\/hub\/venues\/([^?#]+)/);
                      if (match) {
                        const found = venueResults.find(v => String(v.id) === match[1]);
                        if (found) { openDetail(found, 'venue'); return; }
                      }
                      const found = venueResults.find(v => v.name === title);
                      if (found) openDetail(found, 'venue');
                    }}
                    fullHeight={false}
                    hideLegend={true}
                    disableClustering={venueResults.length < 20}
                  />
                  <p className="gso-map__hint">{venueResults.length} {venueWord}. Tap A Pin For Details.</p>
                </div>
              )}

              {/* Venues */}
              {!isLoading && venueResults.length > 0 && (
                <div className="gso-section">
                  <SectionHeader icon="home" label="Venues" count={venueResults.length} />
                  <div className="gso-result-list">
                    {venueResults.map(v => <VenueResultCard key={v.id} venue={v} onClick={(venue, e) => openDetail(venue, 'venue', e?.currentTarget)} />)}
                  </div>
                </div>
              )}

              {/* Tours */}
              {!isLoading && tourResults.length > 0 && (
                <div className="gso-section">
                  <SectionHeader icon="trophy" label="Poker Tours" count={tourResults.length} />
                  <div className="gso-result-list">
                    {tourResults.map(t => <TourResultCard key={t.id || t.tour_code} tour={t} onClick={(tour, e) => openDetail(tour, 'tour', e?.currentTarget)} />)}
                  </div>
                </div>
              )}

              {/* Series */}
              {!isLoading && seriesResults.length > 0 && (
                <div className="gso-section">
                  <SectionHeader icon="calendar" label="Poker Series" count={seriesResults.length} />
                  <div className="gso-result-list">
                    {seriesResults.map(s => <SeriesResultCard key={s.id || s.name} series={s} onClick={(series, e) => openDetail(series, 'series', e?.currentTarget)} />)}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        </div>

        {/* ───── DETAIL MODAL — inside overlay at z:10010 ───── */}
        {detailItem && (
          <DetailModal
            item={detailItem.item}
            type={detailItem.type}
            onClose={() => setDetailItem(null)}
            onNavigate={(path) => { setDetailItem(null); onClose?.(); router.push(path); }}
          />
        )}
      </div>
    </>
  );
}
