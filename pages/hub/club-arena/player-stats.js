/* Club Arena Player Stats — Loads SPA via iframe */
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import ClubArenaEmbed from '../../../src/components/club-arena/ClubArenaEmbed';

export default function ClubArenaPlayer StatsPage() {
    return (
        <>
            <SEOHead title="Player Stats | Smarter.Poker" />
            <UniversalHeader />
            <ClubArenaEmbed spaRoute="stats" />
        </>
    );
}
