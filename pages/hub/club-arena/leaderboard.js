/* Club Arena Leaderboard — Loads SPA via iframe */
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import ClubArenaEmbed from '../../../src/components/club-arena/ClubArenaEmbed';
import useTrainingBus from '../../../src/hooks/useTrainingBus';

export default function ClubArenaLeaderboardPage() {
        useTrainingBus('club-arena-leaderboard');
return (
        <>
            <SEOHead title="Leaderboard | Smarter.Poker" />
            <UniversalHeader />
            <ClubArenaEmbed spaRoute="leaderboard" />
        </>
    );
}
