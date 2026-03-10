/* Club Arena Players — Loads SPA via iframe */
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import ClubArenaEmbed from '../../../src/components/club-arena/ClubArenaEmbed';

export default function ClubArenaPlayersPage() {
    return (
        <>
            <SEOHead title="Players | Smarter.Poker" />
            <UniversalHeader />
            <ClubArenaEmbed spaRoute="players" />
        </>
    );
}
