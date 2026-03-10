/* Club Arena Union Dashboard — Loads SPA via iframe */
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import ClubArenaEmbed from '../../../src/components/club-arena/ClubArenaEmbed';

export default function ClubArenaUnion DashboardPage() {
    return (
        <>
            <SEOHead title="Union Dashboard | Smarter.Poker" />
            <UniversalHeader />
            <ClubArenaEmbed spaRoute="unions" />
        </>
    );
}
