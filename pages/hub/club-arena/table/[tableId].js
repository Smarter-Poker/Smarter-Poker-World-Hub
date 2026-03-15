/* Club Arena Table — Loads SPA via iframe (full-screen immersive) */
import { useRouter } from 'next/router';
import SEOHead from '../../../../src/components/seo/SEOHead';
import ClubArenaEmbed from '../../../../src/components/club-arena/ClubArenaEmbed';
import useTrainingBus from '../../../../src/hooks/useTrainingBus';
import HubErrorBoundary from '../../../../src/components/ui/HubErrorBoundary';

export default function ClubArenaTablePage() {
    useTrainingBus('club-arena-table');
    const router = useRouter();
    const { tableId } = router.query;

    // Forward club context so SPA doesn't have to re-derive it from tableId
    const clubId = router.query.club || router.query.clubId;

    if (!tableId) return null;

    const query = {};
    if (clubId) query.club = clubId;

    return (
        <HubErrorBoundary name="Club Arena Table">
            <SEOHead title="Poker Table | Smarter.Poker" />
            {/* NO UniversalHeader — table is full-screen immersive */}
            <ClubArenaEmbed
                spaRoute={`table/${tableId}`}
                query={query}
                style={{
                    top: 0,
                    height: '100vh',
                }}
            />
        </HubErrorBoundary>
    );
}
