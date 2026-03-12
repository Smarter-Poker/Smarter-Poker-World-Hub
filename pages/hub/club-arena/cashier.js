/* Club Arena Cashier — Loads SPA via iframe */
import { useRouter } from 'next/router';
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import ClubArenaEmbed from '../../../src/components/club-arena/ClubArenaEmbed';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import HubErrorBoundary from '../../../src/components/ui/HubErrorBoundary';

export default function ClubArenaCashierPage() {
    useTrainingBus('club-arena-cashier');
    const router = useRouter();
    const query = { ...router.query };

    return (
        <HubErrorBoundary name="Club Arena">
            <SEOHead title="Cashier | Smarter.Poker" />
            <UniversalHeader />
            <ClubArenaEmbed spaRoute="cashier" query={query} />
        </HubErrorBoundary>
    );
}
