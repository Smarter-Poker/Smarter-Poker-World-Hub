import PokerNearMeLocationPage from '../../../../src/components/poker-near-me/PokerNearMeLocationPage';
import { aggregateVenueStates, fetchPokerVenueLocation, venueLocationCanonical, venuesWithoutAState } from '../../../../src/lib/poker-near-me/locationPages';

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
    />
  );
}
