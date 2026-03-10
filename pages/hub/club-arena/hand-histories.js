/* Club Arena Hand Histories — Loads SPA via iframe */
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import ClubArenaEmbed from '../../../src/components/club-arena/ClubArenaEmbed';

export default function ClubArenaHand HistoriesPage() {
    return (
        <>
            <SEOHead title="Hand Histories | Smarter.Poker" />
            <UniversalHeader />
            <ClubArenaEmbed spaRoute="hands" />
        </>
    );
}
