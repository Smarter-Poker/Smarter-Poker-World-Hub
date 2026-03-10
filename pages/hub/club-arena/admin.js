/* Club Arena Admin — Loads SPA via iframe */
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import ClubArenaEmbed from '../../../src/components/club-arena/ClubArenaEmbed';

export default function ClubArenaAdminPage() {
    return (
        <>
            <SEOHead title="Admin | Smarter.Poker" />
            <UniversalHeader />
            <ClubArenaEmbed spaRoute="admin" />
        </>
    );
}
