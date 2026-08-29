import PokerNearMeLocationPage from '../../../../../src/components/poker-near-me/PokerNearMeLocationPage';
import { cityTitleToSlug, citySlugToTitle } from '../../../../../src/lib/home-games/locationUtils';
import { fetchPokerVenueLocation, resolveStateSlug, venueLocationCanonical } from '../../../../../src/lib/poker-near-me/locationPages';

export async function getServerSideProps({ params, req, res }) {
  const state = resolveStateSlug(params?.state);
  if (!state) return { notFound: true };
  const requestedCity = citySlugToTitle(params?.city);
  if (!requestedCity) return { notFound: true };

  try {
    const result = await fetchPokerVenueLocation({ req, state: state.code, city: requestedCity });
    if (!result.venues.length && !result.degraded) return { notFound: true };
    const canonicalCity = result.venues[0]?.city || requestedCity;
    const canonicalPath = `/hub/poker-near-me/in/${state.slug}/${cityTitleToSlug(canonicalCity)}`;
    if (`/hub/poker-near-me/in/${params.state}/${params.city}` !== canonicalPath) {
      return { redirect: { destination: canonicalPath, permanent: true } };
    }
    res.setHeader('Cache-Control', result.degraded ? 'no-store' : 'public, s-maxage=300, stale-while-revalidate=1800');
    return { props: { ...result, state, city: canonicalCity } };
  } catch (_) {
    res.statusCode = 503;
    res.setHeader('Retry-After', '60');
    return { props: { venues: [], state, city: requestedCity, degraded: true, fetchedAt: null } };
  }
}
export default function PokerCityPage({ state, city, ...props }) {
  return (
    <PokerNearMeLocationPage
      {...props}
      stateCode={state.code}
      city={city}
      title={`Poker Rooms in ${city}, ${state.name}`}
      description={`Find casino poker rooms and cardrooms in ${city}, ${state.name}. Compare venue profiles, schedules, room details, and current discovery signals.`}
      canonical={venueLocationCanonical(state.code, city)}
    />
  );
}
