/**
 * MY CLUBS - RETIRED 2026-09-08. This route is a redirect.
 *
 * It rendered 1,127 lines that reimplemented, worse, a list Social Pages
 * already serves, and two of its three sections were broken.
 * Audit: .agent/audits/2026-09-08-my-clubs-page-audit.md
 *
 * 1. FOLLOWED VENUES never worked, not once. The filter was
 *    ALLOWED_TYPES = ['home_game', 'club', 'charity'], but this platform
 *    emits 'poker_club' and never 'club' (pages/api/poker/venues.js:1678),
 *    so all 208 poker clubs were dropped by a typo. The refresh path called
 *    /api/poker/venues?ids= (plural), which that route does not parse, so
 *    the unfiltered directory came back and 482 venues were assigned as
 *    "your clubs". /hub/pages -> Following reads the same page_followers
 *    rows correctly and covers tours and series too.
 * 2. CLUB ARENA CLUBS are a strict subset of the Arena lobby.
 * 3. HOME GAME GROUPS are mirrored as social pages, and
 *    pages/api/social/pages/index.js:259 already unions pages you own with
 *    clubs you are a member of.
 *
 * WHY A REDIRECT AND NOT A DELETED FILE
 *
 * Five things still point here, and a redirect satisfies every one of them
 * at once instead of needing five coordinated edits:
 *
 *   - the My Clubs card on the World Hub carousel. src/world/WorldHub.tsx
 *     routes a card by `/hub/${cardId}`, with no per-card override unless
 *     one is hardcoded, so the card reaches Social Pages through this file.
 *   - the "Clubs" tile in the my-clubs footer world.
 *   - src/config/hamburgerMenus.js:581.
 *   - the back link at pages/hub/home-games/[slug]/dashboard.js:452.
 *   - every bookmark a player already has.
 *
 * It also keeps the route resolving to a real file, which
 * __tests__/world-command-destinations.test.mjs (84 commands) and
 * __tests__/world-command-menu-law.test.mjs (203 routes) both require, so
 * no pinned count moves and no test needs touching in the same commit.
 *
 * permanent:false (307) is deliberate. A 308 is cached by the browser more
 * or less indefinitely, which would make this expensive to reverse.
 */

import UniversalHeader from '../../src/components/ui/UniversalHeader';

const MY_CLUBS_DESTINATION = '/hub/social-pages?tab=managed';

export async function getServerSideProps() {
    return {
        redirect: {
            destination: MY_CLUBS_DESTINATION,
            permanent: false,
        },
    };
}

// Never reached: getServerSideProps returns a redirect, so Next never renders
// this component or ships its HTML. It exists because a page file needs a
// default export, and it carries UniversalHeader because
// __tests__/global-header-approved.test.mjs requires every one of the 264
// modules under pages/hub to either render the shared header itself or be
// listed in HUB_ROUTES_WITHOUT_SHARED_HEADER in pages/_app.js. The two are
// mutually exclusive - the same test asserts a route cannot do both - and the
// fallback list is the wrong side of that choice here anyway: _app.js would
// then mount a header for a route that never paints. Owning it is the honest
// answer, and it costs nothing at runtime because this never runs.
export default function MyClubsRetired() {
    return <UniversalHeader pageDepth={1} />;
}
