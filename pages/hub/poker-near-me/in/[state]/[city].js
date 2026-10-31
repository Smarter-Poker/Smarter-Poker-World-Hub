import PokerNearMeLocationPage from '../../../../../src/components/poker-near-me/PokerNearMeLocationPage';
import { cityTitleToSlug, citySlugToTitle } from '../../../../../src/lib/home-games/locationUtils';
import { fetchPokerVenueLocation, resolveStateSlug, venueLocationCanonical } from '../../../../../src/lib/poker-near-me/locationPages';

import { firstThatFits } from '../../../../../src/lib/seo/titleFit';
// AEO phase 3 (2026-09-18): one template with nothing measuring it. The
// longest live combination, "Poker Rooms in Multiple Locations, North
// Carolina", rendered at 65 characters once SEOHead appends the brand, so
// a result cut it. The state name steps down to its code rather than the
// city being lost.

export async function getServerSideProps({ params, req, res, query }) {
  const state = resolveStateSlug(params?.state);
  if (!state) return { notFound: true };
  const rawCitySlug = String(params?.city || '').replace(/\.md$/i, '');
  const requestedCity = citySlugToTitle(rawCitySlug);
  if (!requestedCity) return { notFound: true };

  try {
    const result = await fetchPokerVenueLocation({ req, state: state.code, city: requestedCity });
    if (!result.venues.length && !result.degraded) return { notFound: true };
    const canonicalCity = result.venues[0]?.city || requestedCity;
    const canonicalPath = `/hub/poker-near-me/in/${state.slug}/${cityTitleToSlug(canonicalCity)}`;
    if (`/hub/poker-near-me/in/${params.state}/${rawCitySlug}` !== canonicalPath) {
      return { redirect: { destination: canonicalPath, permanent: true } };
    }
    const acceptHeader = String(req?.headers?.accept || '');
    const isMarkdownRequested =
      acceptHeader.includes('text/markdown') ||
      query?.format === 'md' ||
      String(params?.city || '').endsWith('.md') ||
      req?.url?.includes('format=md');
    if (isMarkdownRequested) {
      const { renderLocationDirectoryMarkdown } = await import('../../../../../src/lib/seo/markdownIngestion.mjs');
      const mdContent = renderLocationDirectoryMarkdown({
        title: `Poker Rooms In ${canonicalCity}, ${state.name}`,
        description: `Find Casino Poker Rooms And Cardrooms In ${canonicalCity}, ${state.name}. Compare Venue Profiles, Schedules, Room Details, And Current Discovery Signals.`,
        canonicalUrl: venueLocationCanonical(state.code, canonicalCity),
        stateCode: state.code,
        stateName: state.name,
        city: canonicalCity,
        venues: result.venues,
        resultCount: result.venues.length,
      });
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Vary', 'Accept');
      res.write(mdContent);
      res.end();
      return { props: {} };
    }
    res.setHeader('Cache-Control', result.degraded ? 'no-store' : 'public, s-maxage=300, stale-while-revalidate=1800');
    return { props: { ...result, state, city: canonicalCity } };
  } catch (_) {
    res.statusCode = 503;
    res.setHeader('Retry-After', '60');
    return { props: { venues: [], state, city: requestedCity, degraded: true, dataSource: 'unavailable', dataRevision: null, snapshot: null, fetchedAt: null } };
  }
}
export default function PokerCityPage({ state, city, ...props }) {
  return (
    <PokerNearMeLocationPage
      {...props}
      stateCode={state.code}
      stateName={state.name}
      city={city}
      title={firstThatFits([
        `Poker Rooms In ${city}, ${state.name}`,
        `Poker Rooms In ${city}, ${state.code}`,
        `Poker Rooms In ${city}`,
      ])}
      description={`Find casino poker rooms and cardrooms in ${city}, ${state.name}. Compare venue profiles, schedules, room details, and current discovery signals.`}
      canonical={venueLocationCanonical(state.code, city)}
    />
  );
}
