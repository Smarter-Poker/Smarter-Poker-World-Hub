import PokerNearMeLocationPage from '../../../../../src/components/poker-near-me/PokerNearMeLocationPage';
import { aggregateVenueCities, fetchPokerVenueLocation, resolveStateSlug, venueLocationCanonical } from '../../../../../src/lib/poker-near-me/locationPages';

import { firstThatFits } from '../../../../../src/lib/seo/titleFit';
// AEO phase 3 (2026-09-18): one template with nothing measuring it. The
// longest live combination, "Poker Rooms in Multiple Locations, North
// Carolina", rendered at 65 characters once SEOHead appends the brand, so
// a result cut it. The state name steps down to its code rather than the
// city being lost.

export async function getServerSideProps({ params, req, res, query }) {
  const rawState = String(params?.state || '').replace(/\.md$/i, '');
  const state = resolveStateSlug(rawState);
  if (!state) return { notFound: true };
  if (rawState !== state.slug) {
    return { redirect: { destination: `/hub/poker-near-me/in/${state.slug}`, permanent: true } };
  }
  try {
    const result = await fetchPokerVenueLocation({ req, state: state.code });
    if (!result.venues.length && !result.degraded) return { notFound: true };
    const cities = aggregateVenueCities(result.venues, state.code);
    const acceptHeader = String(req?.headers?.accept || '');
    const isMarkdownRequested =
      acceptHeader.includes('text/markdown') ||
      query?.format === 'md' ||
      String(params?.state || '').endsWith('.md') ||
      req?.url?.includes('format=md');
    if (isMarkdownRequested) {
      const { renderLocationDirectoryMarkdown } = await import('../../../../../src/lib/seo/markdownIngestion.mjs');
      const mdContent = renderLocationDirectoryMarkdown({
        title: `Poker Rooms In ${state.name}`,
        description: `Explore Casino Poker Rooms And Cardrooms Across ${state.name}, With Direct Venue Profiles, Room Details, Schedules, And Live Discovery Tools.`,
        canonicalUrl: venueLocationCanonical(state.code),
        stateCode: state.code,
        stateName: state.name,
        venues: result.venues,
        cities,
        resultCount: result.venues.length,
      });
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Vary', 'Accept');
      res.write(mdContent);
      res.end();
      return { props: {} };
    }
    res.setHeader('Cache-Control', result.degraded ? 'no-store' : 'public, s-maxage=300, stale-while-revalidate=1800');
    return { props: { ...result, state, cities } };
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
      title={firstThatFits([
        `Poker Rooms In ${state.name}`,
        `Poker Rooms In ${state.code}`,
      ])}
      description={`Explore casino poker rooms and cardrooms across ${state.name}, with direct venue profiles, room details, schedules, and live discovery tools.`}
      canonical={venueLocationCanonical(state.code)}
    />
  );
}
