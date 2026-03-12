/* Club Arena Union Dashboard — Loads SPA via iframe */
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import ClubArenaEmbed from '../../../src/components/club-arena/ClubArenaEmbed';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import HubErrorBoundary from '../../../src/components/ui/HubErrorBoundary';

export default function ClubArenaUnionDashboardPage() {
    useTrainingBus('arena-union-dashboard');

    return (
        <HubErrorBoundary name="Club Arena">
            <SEOHead title="Union Dashboard | Smarter.Poker" />
            <UniversalHeader />
            <ClubArenaEmbed spaRoute="unions" />
        </HubErrorBoundary>
    );
}
