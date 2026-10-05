import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import TriviaErrorBoundary from '../../../src/components/trivia/TriviaErrorBoundary';
import PvpCompetitiveExperience from '../../../src/components/trivia/pvp/PvpCompetitiveExperience';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { triviaPvpPageReleaseResult } from '../../../src/lib/trivia/pvpReleaseControl.mjs';

// The route remains private until both the Phase 5 database contract and its
// server release flag are enabled. Horse eligibility has its own independent
// flag and is shown exactly as the server exposes it.
export function getServerSideProps() {
    return triviaPvpPageReleaseResult(process.env);
}

export default function PvPPage({ pvpHorsesEnabled = false }) {
    useTrainingBus('trivia-pvp');
    const { user, loading } = useAvatar();

    return (
        <TriviaErrorBoundary pageName="Head To Head Trivia">
            <SEOHead
                title="Head To Head Poker Trivia"
                description="Play Server-Graded Head To Head Poker Trivia With A Server-Quoted Diamond Stake, Human-First Matchmaking, Shared Questions And A Durable Settlement Record."
                canonical="/hub/trivia/pvp"
            />
            <div
                className="trivia-console-standalone trivia-pvp-page"
                data-trivia-surface="pvp"
            >
                <UniversalHeader pageDepth={2} />
                <main className="trivia-pvp-shell" aria-labelledby="pvp-title">
                    <PvpCompetitiveExperience
                        key={user?.id || 'signed-out'}
                        user={user}
                        authLoading={loading}
                        pvpHorsesEnabled={pvpHorsesEnabled}
                    />
                </main>
                <HubPageSummary page="trivia-pvp" />
            </div>
        </TriviaErrorBoundary>
    );
}
