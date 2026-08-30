import PokerNearMeLocationPage from '../../../../../src/components/poker-near-me/PokerNearMeLocationPage';
import { aggregateVenueCities, fetchPokerVenueLocation, resolveStateSlug, venueLocationCanonical } from '../../../../../src/lib/poker-near-me/locationPages';

export async function getServerSideProps({ params, req, res }) {
  const state = resolveStateSlug(params?.state);
  if (!state) return { notFound: true };
  if (params.state !== state.slug) {
    return { redirect: { destination: `/hub/poker-near-me/in/${state.slug}`, permanent: true } };
  }
  try {
    const result = await fetchPokerVenueLocation({ req, state: state.code });
    if (!result.venues.length && !result.degraded) return { notFound: true };
    res.setHeader('Cache-Control', result.degraded ? 'no-store' : 'public, s-maxage=300, stale-while-revalidate=1800');
    return { props: { ...result, state, cities: aggregateVenueCities(result.venues, state.code) } };
  } catch (_) {
    res.statusCode = 503;
    res.setHeader('Retry-After', '60');
    return { props: { venues: [], state, cities: [], degraded: true, dataSource: 'unavailable', dataRevision: null, snapshot: null, fetchedAt: null } };
  }
}
export default function PokerStatePage({ state, ...props }) {
  return (
    <PokerNearMeLocationPage
      {...props}
      stateCode={state.code}
      stateName={state.name}
      title={`Poker Rooms in ${state.name}`}
      description={`Explore casino poker rooms and cardrooms across ${state.name}, with direct venue profiles, room details, schedules, and live discovery tools.`}
      canonical={venueLocationCanonical(state.code)}
    />
  );
}
