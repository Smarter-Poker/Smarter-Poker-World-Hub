/* Club Arena Leaderboard — Loads SPA via iframe */
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import ClubArenaEmbed from '../../../src/components/club-arena/ClubArenaEmbed';

export default function ClubArenaLeaderboardPage() {
    return (
        <>
            <SEOHead title="Leaderboard | Smarter.Poker" />
            <UniversalHeader />
            <ClubArenaEmbed spaRoute="leaderboard" />
        </>
    );
}
