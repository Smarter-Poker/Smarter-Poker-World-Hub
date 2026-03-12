/* Club Arena Union Games — Loads SPA via iframe */
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import ClubArenaEmbed from '../../../src/components/club-arena/ClubArenaEmbed';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import HubErrorBoundary from '../../../src/components/ui/HubErrorBoundary';

export default function ClubArenaUnionGamesPage() {
    useTrainingBus('arena-union-games');

    return (
        <HubErrorBoundary name="Club Arena">
            <SEOHead title="Union Games | Smarter.Poker" />
            <UniversalHeader />
            <ClubArenaEmbed spaRoute="unions" />
        </HubErrorBoundary>
    );
}
