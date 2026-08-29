import PokerNearMeLocationPage from '../../../../src/components/poker-near-me/PokerNearMeLocationPage';
import { aggregateVenueStates, fetchPokerVenueLocation, venueLocationCanonical } from '../../../../src/lib/poker-near-me/locationPages';

export async function getServerSideProps({ req, res }) {
  try {
    const result = await fetchPokerVenueLocation({ req });
    res.setHeader('Cache-Control', result.degraded ? 'no-store' : 'public, s-maxage=300, stale-while-revalidate=1800');
    return { props: {
      venues: [],
      resultCount: result.venues.length,
      states: aggregateVenueStates(result.venues),
      degraded: result.degraded,
      fetchedAt: result.fetchedAt,
    } };
  } catch (_) {
    res.statusCode = 503;
    res.setHeader('Retry-After', '60');
    return { props: { venues: [], resultCount: 0, states: [], degraded: true, fetchedAt: null } };
  }
}

export default function PokerLocationsIndex(props) {
  return (
    <PokerNearMeLocationPage
      {...props}
      title="Poker Rooms Near You Across the United States"
      description="Browse verified casino poker rooms and cardrooms by state, then move into city-level venue profiles, schedules, and live player signals."
      canonical={venueLocationCanonical()}
    />
  );
}
