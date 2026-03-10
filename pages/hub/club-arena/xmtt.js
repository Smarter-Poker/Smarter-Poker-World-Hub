/* Club Arena XMTT — Loads SPA via iframe */
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import ClubArenaEmbed from '../../../src/components/club-arena/ClubArenaEmbed';

export default function ClubArenaXMTTPage() {
    return (
        <>
            <SEOHead title="XMTT | Smarter.Poker" />
            <UniversalHeader />
            <ClubArenaEmbed spaRoute="tournament-lobby" />
        </>
    );
}
