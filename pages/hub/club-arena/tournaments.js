/* Club Arena Tournaments — Loads SPA via iframe */
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import ClubArenaEmbed from '../../../src/components/club-arena/ClubArenaEmbed';
import useTrainingBus from '../../../src/hooks/useTrainingBus';

export default function ClubArenaTournamentsPage() {
        useTrainingBus('club-arena-tournaments');
return (
        <>
            <SEOHead title="Tournaments | Smarter.Poker" />
            <UniversalHeader />
            <ClubArenaEmbed spaRoute="tournament-lobby" />
        </>
    );
}
