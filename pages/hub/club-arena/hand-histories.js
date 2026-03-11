/* Club Arena Hand Histories — Loads SPA via iframe */
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import ClubArenaEmbed from '../../../src/components/club-arena/ClubArenaEmbed';
import useTrainingBus from '../../../src/hooks/useTrainingBus';

export default function ClubArenaHandHistoriesPage() {
    useTrainingBus('arena-hand-histories');

    return (
        <>
            <SEOHead title="Hand Histories | Smarter.Poker" />
            <UniversalHeader />
            <ClubArenaEmbed spaRoute="hands" />
        </>
    );
}
