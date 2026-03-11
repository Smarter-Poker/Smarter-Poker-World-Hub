/* Club Arena Players — Loads SPA via iframe */
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import ClubArenaEmbed from '../../../src/components/club-arena/ClubArenaEmbed';
import useTrainingBus from '../../../src/hooks/useTrainingBus';

export default function ClubArenaPlayersPage() {
        useTrainingBus('club-arena-players');
return (
        <>
            <SEOHead title="Players | Smarter.Poker" />
            <UniversalHeader />
            <ClubArenaEmbed spaRoute="players" />
        </>
    );
}
