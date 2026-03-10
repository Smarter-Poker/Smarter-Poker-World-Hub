/* Club Arena Lobby — Loads SPA via iframe */
import { useRouter } from 'next/router';
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import ClubArenaEmbed from '../../../src/components/club-arena/ClubArenaEmbed';

export default function ClubArenaLobbyPage() {
    const router = useRouter();
    const { clubId } = router.query;
    const spaRoute = clubId ? `clubs/${clubId}` : 'lobby';

    return (
        <>
            <SEOHead title="Club Lobby | Smarter.Poker" />
            <UniversalHeader />
            <ClubArenaEmbed spaRoute={spaRoute} />
        </>
    );
}
