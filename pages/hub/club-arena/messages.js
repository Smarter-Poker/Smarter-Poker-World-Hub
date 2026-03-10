/* Club Arena Messages — Loads SPA via iframe */
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import ClubArenaEmbed from '../../../src/components/club-arena/ClubArenaEmbed';

export default function ClubArenaMessagesPage() {
    return (
        <>
            <SEOHead title="Messages | Smarter.Poker" />
            <UniversalHeader />
            <ClubArenaEmbed spaRoute="messages" />
        </>
    );
}
