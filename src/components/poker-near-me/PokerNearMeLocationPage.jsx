import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Head from 'next/head';
import SEOHead from '../seo/SEOHead';
import UniversalHeader from '../ui/UniversalHeader';
import HamburgerMenu from '../ui/HamburgerMenu';
import PokerNearMeFamilyNav from './PokerNearMeFamilyNav';
import DeepRouteSignalDeck from './DeepRouteSignalDeck';
import PokerNearMeRecentRail from './PokerNearMeRecentRail';
import { PokerNearMePanelShell } from './PokerNearMeConsole';
import { rememberPokerPlace, capturePokerNearMeEvent } from '../../lib/poker-near-me/activity';
import { buildLocationDirectorySchema, serializePokerJsonLd } from '../../lib/poker-near-me/structuredData';
import {
  buildLiveCashGameIndex,
  cashGameCountLabel,
  findLiveCashGameEntry,
  isModeledCashGameData,
} from '../../lib/poker-near-me/liveCashGameData';

/**
 * How many rooms get a full card before the rest become an index.
 *
 * Measured at 390px before this: /hub/poker-near-me/in/tx rendered 86 full
 * cards and stood 48,304px tall, which is 57 phone screens of scrolling to
 * reach the footer. A card is about 450px; an index row is about 52px. The
 * first rooms keep their cards, every remaining room keeps a real, visible,
 * server-rendered link, and nothing is hidden behind a toggle.
 */
const DIRECTORY_CARD_LIMIT = 12;

const REGION_VISUALS = Object.freeze({
  pacific: '/images/pnm-phase-12/location-pacific-command-v1.webp',
  southwest: '/images/pnm-phase-12/location-southwest-command-v1.webp',
  heartland: '/images/pnm-phase-12/location-heartland-command-v1.webp',
  atlantic: '/images/pnm-phase-12/location-atlantic-command-v1.webp',
  national: '/images/pnm-phase-4/location-command-grid-v1.webp',
});

const PACIFIC_STATES = new Set(['AK', 'CA', 'HI', 'ID', 'OR', 'WA']);
const SOUTHWEST_STATES = new Set(['AZ', 'CO', 'NM', 'NV', 'TX', 'UT']);
const ATLANTIC_STATES = new Set([
  'CT', 'DC', 'DE', 'FL', 'GA', 'MA', 'MD', 'ME', 'NC', 'NH', 'NJ', 'NY',
  'PA', 'RI', 'SC', 'VA', 'VT', 'WV',
]);

export function pokerLocationVisual(stateCode) {
  const code = String(stateCode || '').toUpperCase();
  if (!code) return { region: 'national', image: REGION_VISUALS.national };
  if (PACIFIC_STATES.has(code)) return { region: 'Pacific', image: REGION_VISUALS.pacific };
  if (SOUTHWEST_STATES.has(code)) return { region: 'Southwest', image: REGION_VISUALS.southwest };
  if (ATLANTIC_STATES.has(code)) return { region: 'Atlantic', image: REGION_VISUALS.atlantic };
  return { region: 'Heartland', image: REGION_VISUALS.heartland };
}

function formatUtcDate(value) {
  if (!value || Number.isNaN(Date.parse(value))) return null;
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * A LOGO IS NOT A ROOM (2026-09-29).
 *
 * The card's media band is a 16:8.5 photographic well that covers. It used to
 * be filled with `cover_photo_url || profile_photo_url`, and a profile photo
 * is the venue's wordmark, not a picture of the room. Measured against the
 * bundled directory: 398 venues, ZERO with a cover photo and 191 with a
 * profile photo, so every card that showed anything showed a logo blown up to
 * the card's width. On /hub/poker-near-me/in/tx/austin that printed "LODGE
 * CARD CLUB" and "RED STAR CARD ROOM" as billboards, and Shuffle 512's 180px
 * favicon was scaled past four times its own size.
 *
 * Only a real cover photograph goes in the band now. Without one the band is
 * the approved painted plate the stylesheet already carries, which needs no
 * request and never lies about what the room looks like. The wordmark is not
 * redrawn anywhere: a venue's own art belongs at its own size, and the venue
 * profile is where it has room.
 */
function VenueCard({ venue }) {
  const cover = String(venue.cover_photo_url || '').trim();
  const [image, setImage] = useState(cover);
  const updatedLabel = formatUtcDate(venue.updated_at);
  const cashGameLabel = cashGameCountLabel(venue.live_data);
  const modeled = isModeledCashGameData(venue.live_data);
  const catalog = venue.live_data?.data_mode === 'catalog';
  const unavailable = venue.live_data?.live_count_known === false && !catalog;
  return (
    <PokerNearMePanelShell className={`pnm-location-card${image ? '' : ' pnm-location-card--plate'}`}>
      <Link href={`/hub/venues/${venue.id}`} aria-label={`View ${venue.name}`}>
        <div className="pnm-location-card__media">
          {image ? (
            <img
              src={image}
              alt=""
              loading="lazy"
              onError={() => setImage('')}
              onLoad={(event) => {
                const { naturalWidth, naturalHeight } = event.currentTarget;
                const photographic = naturalWidth >= 480
                  && naturalHeight >= 240
                  && naturalWidth / Math.max(1, naturalHeight) >= 1.2;
                if (!photographic) setImage('');
              }}
            />
          ) : null}
        </div>
        <div className="pnm-location-card__body">
          <span>{String(venue.venue_type || 'Poker room').replace(/_/g, ' ')}</span>
          <h2>{venue.name}</h2>
          <p>{[venue.city, venue.state].filter(Boolean).join(', ')}</p>
          <div className="pnm-location-card__facts">
            {cashGameLabel && (
              <span className="pnm-location-card__cash" data-modeled={modeled ? 'true' : 'false'} data-catalog={catalog ? 'true' : 'false'} data-unavailable={unavailable ? 'true' : 'false'}>
                {cashGameLabel}
              </span>
            )}
            {venue.is_featured && <span>Featured Room</span>}
            {venue.trust_score > 0 && <span>Trust {Math.round(venue.trust_score)}</span>}
            {venue.location_quality?.status === 'verified' && <span>Location Verified</span>}
            {updatedLabel && <span>Updated {updatedLabel}</span>}
            <span>Open Venue Profile</span>
          </div>
        </div>
      </Link>
    </PokerNearMePanelShell>
  );
}

/**
 * The overflow of any directory grid, printed as rows on the console glass
 * with an engraved rule between them. Server rendered, visible without
 * JavaScript, keyboard operable, and every row is a real link: the grid gets
 * shorter, the directory loses nothing.
 */
function DirectoryIndex({ headingId, heading, items }) {
  if (!items.length) return null;
  return (
    <PokerNearMePanelShell
      as="section"
      className="pnm-location-index"
      aria-labelledby={headingId}
    >
      <h3 id={headingId} className="pnm-location-index__heading">{heading}</h3>
      <ul className="pnm-location-index__list">
        {items.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className="pnm-location-index__link">
              <span className="pnm-location-index__name">{item.name}</span>
              {item.meta ? <span className="pnm-location-index__where">{item.meta}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </PokerNearMePanelShell>
  );
}

export default function PokerNearMeLocationPage({
  title,
  description,
  canonical,
  stateCode,
  stateName,
  city,
  venues = [],
  resultCount,
  states = [],
  unplacedVenues = [],
  cities = [],
  degraded = false,
  dataSource = 'unavailable',
  dataRevision,
  snapshot,
  fetchedAt,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [liveCashIndex, setLiveCashIndex] = useState({});
  const trackedRef = useRef(false);
  const currentPath = canonical.replace('https://smarter.poker', '');
  const placeLabel = city ? `${city}, ${stateName || stateCode}` : stateName || stateCode || 'United States';
  const directoryCount = Number.isFinite(Number(resultCount)) ? Number(resultCount) : venues.length;
  const stateCanonical = city ? canonical.slice(0, canonical.lastIndexOf('/')) : canonical;
  const hero = pokerLocationVisual(stateCode);
  const sourceTimestamp = degraded ? snapshot?.generated_at : fetchedAt;
  const sourceDateLabel = formatUtcDate(sourceTimestamp);
  const sourceLabel = degraded
    ? `Published directory snapshot${sourceDateLabel ? ` from ${sourceDateLabel}` : ''}`
    : 'Checked during this request';

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const load = () => fetch('/api/poker/live-tables', { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`Cash game feed returned ${response.status}`)))
      .then((payload) => { if (active) setLiveCashIndex(buildLiveCashGameIndex(payload)); })
      .catch((error) => {
        if (error?.name !== 'AbortError') console.warn('[PokerNearMeLocationPage] Cash game feed unavailable:', error?.message || error);
      });
    load();
    const timer = setInterval(load, 15 * 60 * 1000);
    return () => {
      active = false;
      controller.abort();
      clearInterval(timer);
    };
  }, []);

  const venuesWithCashGames = useMemo(() => venues.map((venue) => ({
    ...venue,
    live_data: findLiveCashGameEntry(venue, liveCashIndex) || venue.live_data || null,
  })), [liveCashIndex, venues]);

  useEffect(() => {
    if (trackedRef.current) return;
    trackedRef.current = true;
    rememberPokerPlace({ href: currentPath, title, subtitle: `${directoryCount} poker venues`, kind: 'location' });
    capturePokerNearMeEvent('location_page_viewed', {
      route_family: city ? 'city' : stateCode ? 'state' : 'country',
      route: currentPath,
      state: stateCode,
      city,
      result_count: directoryCount,
      source: dataSource,
      data_revision: dataRevision,
      complete: !degraded,
    });
  }, [city, currentPath, dataRevision, dataSource, degraded, directoryCount, stateCode, title]);

  const cardVenues = useMemo(
    () => venuesWithCashGames.slice(0, DIRECTORY_CARD_LIMIT),
    [venuesWithCashGames],
  );
  const indexVenues = useMemo(
    () => venuesWithCashGames.slice(DIRECTORY_CARD_LIMIT),
    [venuesWithCashGames],
  );

  const structuredData = useMemo(() => buildLocationDirectorySchema({
    title,
    description,
    canonical,
    stateCode,
    stateName,
    city,
    venues,
    states,
    cities,
    resultCount: directoryCount,
    fetchedAt: sourceTimestamp,
  }), [canonical, cities, city, description, directoryCount, sourceTimestamp, stateCode, stateName, states, title, venues]);

  return (
    <div className="pnm-location-listing" data-pnm-realism="machined-v2">
      <SEOHead
        title={title}
        description={description}
        canonical={canonical}
        ogImage={`https://smarter.poker${hero.image}`}
        noindex={directoryCount === 0}
      />
      <Head><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializePokerJsonLd(structuredData) }} /></Head>
      <UniversalHeader pageDepth={2} onMenuClick={() => setMenuOpen(true)} />
      <PokerNearMeFamilyNav />
      <HamburgerMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />

      <DeepRouteSignalDeck
        kind="location"
        eyebrow="Regional poker network"
        title={title}
        headTitle={placeLabel}
        description={description}
        image={hero.image}
        imageAlt={stateCode
          ? `Fictional ${hero.region} poker discovery console artwork for ${placeLabel}`
          : `Fictional national poker discovery console artwork for ${placeLabel}`}
        breadcrumbs={[
          { label: 'Poker Near Me', href: '/hub/poker-near-me/lobby' },
          ...(stateCode ? [{ label: 'United States', href: '/hub/poker-near-me/in' }] : []),
          ...(city ? [{ label: stateName || stateCode, href: stateCanonical.replace('https://smarter.poker', '') }] : []),
          { label: city || stateName || stateCode || 'Locations' },
        ]}
        status={degraded ? 'Published snapshot mode' : 'Live directory synchronized'}
        statusTone={degraded ? 'modeled' : 'live'}
        freshness={{ label: sourceLabel, dateTime: sourceTimestamp || undefined }}
        metrics={[
          { label: 'Poker venues', value: directoryCount },
          { label: stateCode ? 'Cities represented' : 'States represented', value: stateCode ? new Set(venues.map((venue) => venue.city).filter(Boolean)).size : states.length },
          { label: degraded ? 'Snapshot date' : 'Directory check', value: sourceDateLabel || 'Current request' },
        ]}
        actions={<Link href="/hub/poker-near-me/map">Open Live Map</Link>}
      />

      <PokerNearMeRecentRail currentHref={currentPath} />

      <main className="pnm-location-listing__main">
        <p className="pnm-location-listing__summary" role="status">
          {degraded ? `Showing the published directory snapshot${sourceDateLabel ? ` from ${sourceDateLabel}` : ''}. ` : ''}
          {directoryCount} {directoryCount === 1 ? 'venue' : 'venues'} Found For {placeLabel}.
        </p>

        {states.length > 0 && (
          <section aria-labelledby="pnm-states-heading">
            <header className="pnm-location-listing__section-head">
              <span>Regional Index</span>
              <h2 id="pnm-states-heading">Browse Poker Venues By State</h2>
              <p>Move From The National Network Into Room Profiles, City Indexes, And Live Discovery Tools.</p>
            </header>
            <div className="pnm-location-listing__states">
              {states.slice(0, DIRECTORY_CARD_LIMIT).map((state) => (
                <PokerNearMePanelShell as={Link} key={state.code} href={state.href} className="pnm-location-listing__state">
                  <span>{state.name}</span><small>{state.venueCount} Venues · {state.cityCount} Cities</small>
                </PokerNearMePanelShell>
              ))}
            </div>
            <DirectoryIndex
              headingId="pnm-state-index-heading"
              heading="Every Other State With Poker Rooms"
              items={states.slice(DIRECTORY_CARD_LIMIT).map((state) => ({
                href: state.href,
                name: state.name,
                meta: `${state.venueCount} Venues · ${state.cityCount} Cities`,
              }))}
            />
          </section>
        )}

        {/* A venue that belongs to no state still needs a road in. These two
            carry "MULTI" because they run across several, so no state or city
            index could ever list them, and they were reachable from nowhere
            (AEO phase 3, 2026-09-19). */}
        {unplacedVenues.length > 0 && (
          <section aria-labelledby="pnm-unplaced-heading">
            <header className="pnm-location-listing__section-head">
              <span>National Programmes</span>
              <h2 id="pnm-unplaced-heading">Poker Series That Run In More Than One State</h2>
              <p>These Run Across Several States Rather Than From One Room, So They Sit Outside The State Index.</p>
            </header>
            <div className="pnm-location-listing__states">
              {unplacedVenues.map((venue) => (
                <PokerNearMePanelShell as={Link} key={venue.href} href={venue.href} className="pnm-location-listing__state">
                  <span>{venue.name}</span>{venue.where && <small>{venue.where}</small>}
                </PokerNearMePanelShell>
              ))}
            </div>
          </section>
        )}

        {cities.length > 0 && (
          <section aria-labelledby="pnm-cities-heading">
            <header className="pnm-location-listing__section-head">
              <span>City Circuits</span>
              <h2 id="pnm-cities-heading">Browse Poker Venues By City</h2>
              <p>Open A Focused Local Directory Without Losing The Wider {stateName || stateCode} Network.</p>
            </header>
            <div className="pnm-location-listing__states">
              {cities.slice(0, DIRECTORY_CARD_LIMIT).map((entry) => (
                <PokerNearMePanelShell as={Link} key={entry.href} href={entry.href} className="pnm-location-listing__state">
                  <span>{entry.name}</span><small>{entry.venueCount} Venues</small>
                </PokerNearMePanelShell>
              ))}
            </div>
            <DirectoryIndex
              headingId="pnm-city-index-heading"
              heading={`Every Other City With Poker Rooms In ${stateName || stateCode}`}
              items={cities.slice(DIRECTORY_CARD_LIMIT).map((entry) => ({
                href: entry.href,
                name: entry.name,
                meta: `${entry.venueCount} Venues`,
              }))}
            />
          </section>
        )}

        {venues.length > 0 && (
          <section aria-labelledby="pnm-venues-heading">
            <header className="pnm-location-listing__section-head">
              <span>Directory Room Signals</span>
              <h2 id="pnm-venues-heading">Poker Venues In {placeLabel}</h2>
              <p>Open A Room Profile For Schedules, Games, Venue Details, And Current Discovery Signals.</p>
            </header>
            <div className="pnm-location-listing__grid">
              {cardVenues.map((venue) => <VenueCard key={venue.id} venue={venue} />)}
            </div>

            {/* EVERY ROOM KEEPS A ROAD IN (2026-09-29). The rooms past the
                card limit are printed as rows on the console glass, an
                engraved rule between them, exactly as the standard asks for
                a list of figures. They are server rendered, visible without
                JavaScript, and crawlable: nothing is behind a toggle and
                nothing is dropped. */}
            <DirectoryIndex
              headingId="pnm-venue-index-heading"
              heading={`Every Other Poker Venue In ${placeLabel}`}
              items={indexVenues.map((venue) => ({
                href: `/hub/venues/${venue.id}`,
                name: venue.name,
                meta: [venue.city, venue.state].filter(Boolean).join(', '),
              }))}
            />
          </section>
        )}

        {directoryCount === 0 && (
          <section className="pnm-empty-state" aria-labelledby="pnm-empty-title">
            <h2 id="pnm-empty-title">No Venue Profiles Found Yet</h2>
            <p>Try The Live Map Or A Nearby State While The Directory Expands.</p>
            <Link href="/hub/poker-near-me/map">Explore The Map</Link>
          </section>
        )}
      </main>
    </div>
  );
}
