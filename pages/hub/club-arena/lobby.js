/* Club Arena Lobby — Loads SPA via iframe */
import { useRouter } from 'next/router';
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import ClubArenaEmbed from '../../../src/components/club-arena/ClubArenaEmbed';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import HubErrorBoundary from '../../../src/components/ui/HubErrorBoundary';

export default function ClubArenaLobbyPage() {
        useTrainingBus('club-arena-lobby');
const router = useRouter();
    const { clubId } = router.query;
    const spaRoute = clubId ? `clubs/${clubId}` : 'lobby';

    return (
        <HubErrorBoundary name="Club Arena">
            <SEOHead title="Club Lobby | Smarter.Poker" />
            <UniversalHeader />
            <ClubArenaEmbed spaRoute={spaRoute} />
        </HubErrorBoundary>
    );
}
