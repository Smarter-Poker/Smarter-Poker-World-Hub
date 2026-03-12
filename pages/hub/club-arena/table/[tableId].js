/* Club Arena Table — Loads SPA via iframe (full-screen immersive) */
import { useRouter } from 'next/router';
import SEOHead from '../../../../src/components/seo/SEOHead';
import ClubArenaEmbed from '../../../../src/components/club-arena/ClubArenaEmbed';
import HubErrorBoundary from '../../../../src/components/ui/HubErrorBoundary';

export default function ClubArenaTablePage() {
    const router = useRouter();
    const { tableId } = router.query;

    if (!tableId) return null;

    return (
        <HubErrorBoundary name="Club Arena Table">
            <SEOHead title="Poker Table | Smarter.Poker" />
            {/* NO UniversalHeader — table is full-screen immersive */}
            <ClubArenaEmbed
                spaRoute={`table/${tableId}`}
                style={{
                    top: 0,
                    height: '100vh',
                }}
            />
        </HubErrorBoundary>
    );
}
