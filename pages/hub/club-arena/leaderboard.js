/* Club Arena Leaderboard — Loads SPA via iframe */
import { useRouter } from 'next/router';
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import ClubArenaEmbed from '../../../src/components/club-arena/ClubArenaEmbed';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import HubErrorBoundary from '../../../src/components/ui/HubErrorBoundary';

export default function ClubArenaLeaderboardPage() {
    useTrainingBus('club-arena-leaderboard');
    const router = useRouter();
    const query = { ...router.query };

    return (
        <HubErrorBoundary name="Club Arena">
            <SEOHead title="Leaderboard | Smarter.Poker" />
            <UniversalHeader />
            <ClubArenaEmbed spaRoute="leaderboard" query={query} />
        </HubErrorBoundary>
    );
}
