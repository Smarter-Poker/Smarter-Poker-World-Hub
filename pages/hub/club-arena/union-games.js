/* Club Arena Union Games — Loads SPA via iframe */
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import ClubArenaEmbed from '../../../src/components/club-arena/ClubArenaEmbed';

export default function ClubArenaUnion GamesPage() {
    return (
        <>
            <SEOHead title="Union Games | Smarter.Poker" />
            <UniversalHeader />
            <ClubArenaEmbed spaRoute="unions" />
        </>
    );
}
