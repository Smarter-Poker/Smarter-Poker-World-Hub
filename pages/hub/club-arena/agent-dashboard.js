/* Club Arena Agent Dashboard — Loads SPA via iframe */
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import ClubArenaEmbed from '../../../src/components/club-arena/ClubArenaEmbed';

export default function ClubArenaAgent DashboardPage() {
    return (
        <>
            <SEOHead title="Agent Dashboard | Smarter.Poker" />
            <UniversalHeader />
            <ClubArenaEmbed spaRoute="agent-management" />
        </>
    );
}
