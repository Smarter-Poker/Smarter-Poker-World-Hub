/**
 * GTO - GTO Scenarios Trivia
 * Route: /hub/trivia/gto
 */

import SEOHead from '../../../src/components/seo/SEOHead';
import StrategyTrivia from '../../../src/components/trivia/StrategyTrivia';
import TriviaErrorBoundary from '../../../src/components/trivia/TriviaErrorBoundary';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';

export default function GTOPage() {
    useTrainingBus('trivia-gto');
    return (
        <TriviaErrorBoundary pageName="Trivia — GTO Master">
            <SEOHead
                title="GTO Trivia — Solver-Based Scenarios"
                description="Test Your GTO Knowledge With Solver-Based Strategy Scenarios On Smarter.Poker."
                canonical="/hub/trivia/gto"
                noindex={true}
            />
            <div style={{ paddingBottom: 70 }}>
                <StrategyTrivia mode="gto" />
                {/* Reserve room for the fixed BottomNavBar — StrategyTrivia's
                    100dvh + overflow:hidden root otherwise puts the game's
                    bottom action row underneath the nav bar on mobile. */}
                <style>{`
                    .strategy-trivia {
                        height: calc(100vh - 70px);
                        height: calc(100dvh - 70px);
                    }
                `}</style>
                <BottomNavBar />
            </div>
        </TriviaErrorBoundary>
    );
}
