/* Club Arena Catch-All — Routes ALL Club Arena paths through the SPA iframe
 *
 * Specific pages (lobby.js, tournaments.js, etc.) take priority in Next.js routing.
 * This catch-all handles every OTHER Club Arena route so they no longer 404.
 *
 * Examples:
 *   /hub/club-arena/promotions      → spaRoute="promotions"
 *   /hub/club-arena/profile          → spaRoute="profile"
 *   /hub/club-arena/friends          → spaRoute="friends"
 *   /hub/club-arena/clubs/abc/settings → spaRoute="clubs/abc/settings"
 */
import { useRouter } from 'next/router';
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import ClubArenaEmbed from '../../../src/components/club-arena/ClubArenaEmbed';
import useTrainingBus from '../../../src/hooks/useTrainingBus';

// Map route segments to page titles for SEO
const ROUTE_TITLES = {
    promotions: 'Promotions',
    profile: 'Profile',
    settings: 'Settings',
    friends: 'Friends',
    notifications: 'Notifications',
    rakeback: 'Rakeback',
    wallet: 'Wallet',
    help: 'Help Center',
    achievements: 'Achievements',
    vip: 'VIP',
    bonuses: 'Bonuses',
    stats: 'Player Stats',
    search: 'Search',
    invite: 'Invite',
    waitlist: 'Waitlist',
    clubs: 'Clubs',
    unions: 'Unions',
    lobby: 'Lobby',
    transactions: 'Transactions',
};

export default function ClubArenaCatchAll() {
    useTrainingBus('club-arena');
    const router = useRouter();
    const { slug } = router.query;

    // Build spaRoute from the slug segments
    // slug is an array like ['promotions'] or ['clubs', 'abc123', 'settings']
    // or undefined for the bare /hub/club-arena/ index
    const spaRoute = Array.isArray(slug) ? slug.join('/') : '';

    // Determine page title from the first segment
    const firstSegment = Array.isArray(slug) ? slug[0] : '';
    const pageTitle = ROUTE_TITLES[firstSegment] || firstSegment
        ? `${(ROUTE_TITLES[firstSegment] || firstSegment.charAt(0).toUpperCase() + firstSegment.slice(1))} | Smarter.Poker`
        : 'Club Arena | Smarter.Poker';

    // Pass query params through (excluding slug which is the route)
    const query = { ...router.query };
    delete query.slug;

    return (
        <>
            <SEOHead title={pageTitle} />
            <UniversalHeader />
            <ClubArenaEmbed spaRoute={spaRoute} query={query} />
        </>
    );
}
