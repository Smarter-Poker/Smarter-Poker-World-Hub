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

function VenueCard({ venue }) {
  const [image, setImage] = useState(venue.cover_photo_url || venue.profile_photo_url || FALLBACK);
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
  fetchedAt,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const trackedRef = useRef(false);
  const currentPath = canonical.replace('https://smarter.poker', '');
  const placeLabel = city ? `${city}, ${stateName || stateCode}` : stateName || stateCode || 'United States';
  const directoryCount = Number.isFinite(Number(resultCount)) ? Number(resultCount) : venues.length;
  const stateCanonical = city ? canonical.slice(0, canonical.lastIndexOf('/')) : canonical;

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
    });
  }, [city, currentPath, directoryCount, stateCode, title]);

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
    fetchedAt,
  }), [canonical, cities, city, description, directoryCount, fetchedAt, stateCode, stateName, states, title, venues]);

  return (
    <div className="pnm-location-listing">
      <SEOHead title={title} description={description} canonical={canonical} noindex={directoryCount === 0} />
      <Head><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializePokerJsonLd(structuredData) }} /></Head>
      <UniversalHeader pageDepth={2} onMenuClick={() => setMenuOpen(true)} />
      <PokerNearMeFamilyNav />
      <HamburgerMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />

      <DeepRouteSignalDeck
        kind="location"
        eyebrow="Regional poker network"
        title={title}
        description={description}
        image="/images/pnm-phase-4/location-command-grid-v1.webp"
        imageAlt={`Poker discovery map for ${placeLabel}`}
        breadcrumbs={[
          { label: 'Poker Near Me', href: '/hub/poker-near-me/lobby' },
          ...(stateCode ? [{ label: 'United States', href: '/hub/poker-near-me/in' }] : []),
          ...(city ? [{ label: stateName || stateCode, href: stateCanonical.replace('https://smarter.poker', '') }] : []),
          { label: city || stateName || stateCode || 'Locations' },
        ]}
        status={degraded ? 'Cached directory mode' : 'Venue directory synchronized'}
        statusTone={degraded ? 'modeled' : 'live'}
        freshness={{ label: degraded ? 'Last available directory snapshot' : 'Checked during this request', dateTime: fetchedAt || undefined }}
        metrics={[
          { label: 'Poker venues', value: directoryCount },
          { label: stateCode ? 'Cities represented' : 'States represented', value: stateCode ? new Set(venues.map((venue) => venue.city).filter(Boolean)).size : states.length },
          { label: 'Directory check', value: fetchedAt ? new Date(fetchedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : 'Current request' },
        ]}
        actions={<Link href="/hub/poker-near-me/map">Open live map</Link>}
      />

      <PokerNearMeRecentRail currentHref={currentPath} />

      <main className="pnm-location-listing__main">
        <p className="pnm-location-listing__summary" role="status">
          {degraded ? 'Showing the last available directory snapshot. ' : ''}
          {directoryCount} {directoryCount === 1 ? 'venue' : 'venues'} found for {placeLabel}.
        </p>

        {states.length > 0 && (
          <section aria-labelledby="pnm-states-heading">
            <header className="pnm-location-listing__section-head">
              <span>Regional index</span>
              <h2 id="pnm-states-heading">Browse poker venues by state</h2>
              <p>Move from the national network into verified room profiles, city indexes, and live discovery tools.</p>
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
              <span>Verified room signals</span>
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
            <h2 id="pnm-empty-title">No verified venue profiles yet</h2>
            <p>Try the live map or a nearby state while the directory expands.</p>
            <Link href="/hub/poker-near-me/map">Explore the map</Link>
          </section>
        )}
      </main>
    </div>
  );
}
