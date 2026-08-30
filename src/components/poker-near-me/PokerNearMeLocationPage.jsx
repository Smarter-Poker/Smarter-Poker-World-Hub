import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Head from 'next/head';
import SEOHead from '../seo/SEOHead';
import UniversalHeader from '../ui/UniversalHeader';
import HamburgerMenu from '../ui/HamburgerMenu';
import PokerNearMeFamilyNav from './PokerNearMeFamilyNav';
import DeepRouteSignalDeck from './DeepRouteSignalDeck';
import PokerNearMeRecentRail from './PokerNearMeRecentRail';
import { rememberPokerPlace, capturePokerNearMeEvent } from '../../lib/poker-near-me/activity';
import { buildLocationDirectorySchema, serializePokerJsonLd } from '../../lib/poker-near-me/structuredData';

const FALLBACK = '/images/pnm-phase-4/venue-signal-fallback-v1.webp';

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

function VenueCard({ venue }) {
  const [image, setImage] = useState(venue.cover_photo_url || venue.profile_photo_url || FALLBACK);
  const updatedLabel = formatUtcDate(venue.updated_at);
  return (
    <article className="pnm-location-card">
      <Link href={`/hub/venues/${venue.id}`} aria-label={`View ${venue.name}`}>
        <div className="pnm-location-card__media">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="" loading="lazy" onError={() => setImage(FALLBACK)} />
        </div>
        <div className="pnm-location-card__body">
          <span>{String(venue.venue_type || 'Poker room').replace(/_/g, ' ')}</span>
          <h2>{venue.name}</h2>
          <p>{[venue.city, venue.state].filter(Boolean).join(', ')}</p>
          <div className="pnm-location-card__facts">
            {venue.is_featured && <span>Featured room</span>}
            {venue.trust_score > 0 && <span>Trust {Math.round(venue.trust_score)}</span>}
            {venue.location_quality?.status === 'verified' && <span>Location verified</span>}
            {updatedLabel && <span>Updated {updatedLabel}</span>}
            <span>Open venue profile</span>
          </div>
        </div>
      </Link>
    </article>
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
  cities = [],
  degraded = false,
  dataSource = 'unavailable',
  dataRevision,
  snapshot,
  fetchedAt,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
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
    <div className="pnm-location-listing">
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
        actions={<Link href="/hub/poker-near-me/map">Open live map</Link>}
      />

      <PokerNearMeRecentRail currentHref={currentPath} />

      <main className="pnm-location-listing__main">
        <p className="pnm-location-listing__summary" role="status">
          {degraded ? `Showing the published directory snapshot${sourceDateLabel ? ` from ${sourceDateLabel}` : ''}. ` : ''}
          {directoryCount} {directoryCount === 1 ? 'venue' : 'venues'} found for {placeLabel}.
        </p>

        {states.length > 0 && (
          <section aria-labelledby="pnm-states-heading">
            <header className="pnm-location-listing__section-head">
              <span>Regional index</span>
              <h2 id="pnm-states-heading">Browse poker venues by state</h2>
              <p>Move from the national network into room profiles, city indexes, and live discovery tools.</p>
            </header>
            <div className="pnm-location-listing__states">
              {states.map((state) => (
                <Link key={state.code} href={state.href} className="pnm-location-listing__state">
                  <span>{state.name}</span><small>{state.venueCount} venues · {state.cityCount} cities</small>
                </Link>
              ))}
            </div>
          </section>
        )}

        {cities.length > 0 && (
          <section aria-labelledby="pnm-cities-heading">
            <header className="pnm-location-listing__section-head">
              <span>City circuits</span>
              <h2 id="pnm-cities-heading">Browse poker venues by city</h2>
              <p>Open a focused local directory without losing the wider {stateName || stateCode} network.</p>
            </header>
            <div className="pnm-location-listing__states">
              {cities.map((entry) => (
                <Link key={entry.href} href={entry.href} className="pnm-location-listing__state">
                  <span>{entry.name}</span><small>{entry.venueCount} venues</small>
                </Link>
              ))}
            </div>
          </section>
        )}

        {venues.length > 0 && (
          <section aria-labelledby="pnm-venues-heading">
            <header className="pnm-location-listing__section-head">
              <span>Directory room signals</span>
              <h2 id="pnm-venues-heading">Poker venues in {placeLabel}</h2>
              <p>Open a room profile for schedules, games, venue details, and current discovery signals.</p>
            </header>
            <div className="pnm-location-listing__grid">
              {venues.map((venue) => <VenueCard key={venue.id} venue={venue} />)}
            </div>
          </section>
        )}

        {directoryCount === 0 && (
          <section className="pnm-empty-state" aria-labelledby="pnm-empty-title">
            <h2 id="pnm-empty-title">No venue profiles found yet</h2>
            <p>Try the live map or a nearby state while the directory expands.</p>
            <Link href="/hub/poker-near-me/map">Explore the map</Link>
          </section>
        )}
      </main>
    </div>
  );
}
