/* Club Arena Marketplace — Loads SPA via iframe */
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import ClubArenaEmbed from '../../../src/components/club-arena/ClubArenaEmbed';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import HubErrorBoundary from '../../../src/components/ui/HubErrorBoundary';

export default function ClubArenaMarketplacePage() {
        useTrainingBus('club-arena-marketplace');
return (
        <HubErrorBoundary name="Club Arena">
            <SEOHead title="Marketplace | Smarter.Poker" />
            <UniversalHeader />
            <ClubArenaEmbed spaRoute="search" />
        </HubErrorBoundary>
    );
}
