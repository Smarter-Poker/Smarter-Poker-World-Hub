/* Club Arena Marketplace — Loads SPA via iframe */
import { useRouter } from 'next/router';
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import ClubArenaEmbed from '../../../src/components/club-arena/ClubArenaEmbed';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import HubErrorBoundary from '../../../src/components/ui/HubErrorBoundary';

export default function ClubArenaMarketplacePage() {
    useTrainingBus('club-arena-marketplace');
    const router = useRouter();
    const query = { ...router.query };

    return (
        <HubErrorBoundary name="Club Arena">
            <SEOHead title="Marketplace | Smarter.Poker" />
            <UniversalHeader />
            <ClubArenaEmbed spaRoute="search" query={query} />
        </HubErrorBoundary>
    );
}
