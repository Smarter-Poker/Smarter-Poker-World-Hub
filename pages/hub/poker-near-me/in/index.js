import PokerNearMeLocationPage from '../../../../src/components/poker-near-me/PokerNearMeLocationPage';
import SmarterAccountUnlockGate from '../../../../src/components/seo/SmarterAccountUnlockGate';
import SmarterConversionCta from '../../../../src/components/seo/SmarterConversionCta';
import { aggregateVenueStates, fetchPokerVenueLocation, venueLocationCanonical, venuesWithoutAState } from '../../../../src/lib/poker-near-me/locationPages';
import { VENUE_COUNT_LABEL } from '../../../../src/lib/venueCount.mjs';

export async function getServerSideProps({ req, res, query }) {
  try {
    const result = await fetchPokerVenueLocation({ req });
    const states = aggregateVenueStates(result.venues);
    const acceptHeader = String(req?.headers?.accept || '');
    const isMarkdownRequested =
      acceptHeader.includes('text/markdown') ||
      query?.format === 'md' ||
      req?.url?.includes('format=md');
    if (isMarkdownRequested) {
      const { renderLocationDirectoryMarkdown } = await import('../../../../src/lib/seo/markdownIngestion.mjs');
      const mdContent = renderLocationDirectoryMarkdown({
        title: 'Live Poker Rooms By State And City',
        description: 'Browse Verified Casino Poker Rooms And Cardrooms By State, Then Move Into City-Level Venue Profiles, Schedules, And Live Player Signals.',
        canonicalUrl: venueLocationCanonical(),
        states,
        resultCount: result.venues.length,
      });
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Vary', 'Accept');
      res.write(mdContent);
      res.end();
      return { props: {} };
    }
    res.setHeader('Cache-Control', result.degraded ? 'no-store' : 'public, s-maxage=300, stale-while-revalidate=1800');
    return { props: {
      venues: [],
      resultCount: result.venues.length,
      states,
      unplacedVenues: venuesWithoutAState(result.venues),
      degraded: result.degraded,
      dataSource: result.dataSource,
      dataRevision: result.dataRevision,
      snapshot: result.snapshot,
      fetchedAt: result.fetchedAt,
    } };
  } catch (_) {
    res.statusCode = 503;
    res.setHeader('Retry-After', '60');
    return { props: { venues: [], resultCount: 0, states: [], unplacedVenues: [], degraded: true, dataSource: 'unavailable', dataRevision: null, snapshot: null, fetchedAt: null } };
  }
}

export default function PokerLocationsIndex(props) {
  return (
    <PokerNearMeLocationPage
      {...props}
      title="Live Poker Rooms By State And City"
      description="Browse verified casino poker rooms and cardrooms by state, then move into city-level venue profiles, schedules, and live player signals."
      canonical={venueLocationCanonical()}
      conversionCta={(
        <div style={{ display: 'grid', gap: 18 }}>
          <SmarterAccountUnlockGate
            variant="live-venue-intel"
            context="pnm-locations-index"
            title="See Live Waitlists, Peak Hours & Room Alerts Across All 50 States"
            redirectPath="/hub/poker-near-me/in"
          />
          <SmarterConversionCta
            eyebrow="Free US Poker Directory Account"
            title="Find Live Poker Rooms & Track Sessions Nationwide Free"
            description="Create A Free Smarter.Poker Account To Save Favorite Cardrooms, Check In Live, And Track Your Cash Game Profit."
            primaryLabel="Create Free Account"
            primaryHref="/auth/signup?redirect=%2Fhub%2Fpoker-near-me%2Fin&src=pnm-locations-index"
            secondaryLabel="Sign In"
            secondaryHref="/auth/login?redirect=%2Fhub%2Fpoker-near-me%2Fin"
            highlights={['100% Free Account', `${VENUE_COUNT_LABEL} Poker Rooms`, 'Bankroll Tracker']}
          />
        </div>
      )}
    />
  );
}
