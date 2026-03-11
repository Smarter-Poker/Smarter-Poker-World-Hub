/* Club Arena Messages — Loads SPA via iframe */
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import ClubArenaEmbed from '../../../src/components/club-arena/ClubArenaEmbed';
import useTrainingBus from '../../../src/hooks/useTrainingBus';

export default function ClubArenaMessagesPage() {
        useTrainingBus('club-arena-messages');
return (
        <>
            <SEOHead title="Messages | Smarter.Poker" />
            <UniversalHeader />
            <ClubArenaEmbed spaRoute="messages" />
        </>
    );
}
