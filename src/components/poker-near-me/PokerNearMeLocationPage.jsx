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
            {venue.is_featured && <span>Featured Room</span>}
            {venue.trust_score > 0 && <span>Trust {Math.round(venue.trust_score)}</span>}
            {venue.location_quality?.status === 'verified' && <span>Location Verified</span>}
            {updatedLabel && <span>Updated {updatedLabel}</span>}
            <span>Open Venue Profile</span>
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
              {states.map((state) => (
                <Link key={state.code} href={state.href} className="pnm-location-listing__state">
                  <span>{state.name}</span><small>{state.venueCount} Venues · {state.cityCount} Cities</small>
                </Link>
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
              {cities.map((entry) => (
                <Link key={entry.href} href={entry.href} className="pnm-location-listing__state">
                  <span>{entry.name}</span><small>{entry.venueCount} Venues</small>
                </Link>
              ))}
            </div>
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
              {venues.map((venue) => <VenueCard key={venue.id} venue={venue} />)}
            </div>
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
