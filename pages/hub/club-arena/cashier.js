/* Club Arena Cashier — Loads SPA via iframe */
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import ClubArenaEmbed from '../../../src/components/club-arena/ClubArenaEmbed';

export default function ClubArenaCashierPage() {
    return (
        <>
            <SEOHead title="Cashier | Smarter.Poker" />
            <UniversalHeader />
            <ClubArenaEmbed spaRoute="cashier" />
        </>
    );
}
