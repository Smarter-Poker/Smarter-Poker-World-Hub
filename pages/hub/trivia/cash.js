/**
 * CASH - CASH Scenarios Trivia
 * Route: /hub/trivia/cash
 */

import SEOHead from '../../../src/components/seo/SEOHead';
import StrategyTrivia from '../../../src/components/trivia/StrategyTrivia';
import TriviaErrorBoundary from '../../../src/components/trivia/TriviaErrorBoundary';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';

export default function CASHPage() {
    useTrainingBus('trivia-cash');
    return (
        <TriviaErrorBoundary pageName="Trivia — Cash Game">
            <SEOHead
                title="Cash Game Trivia — Deep Stack Scenarios"
                description="Test Your Cash Game Knowledge With Deep Stack Scenarios, Implied Odds, And Table Dynamics On Smarter.Poker."
                canonical="/hub/trivia/cash"
                noindex={true}
            />
            <div style={{ paddingBottom: 70 }}>
                <StrategyTrivia mode="cash" />
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
