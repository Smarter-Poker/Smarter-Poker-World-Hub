/**
 * MTT - MTT Scenarios Trivia
 * Route: /hub/trivia/mtt
 */

import SEOHead from '../../../src/components/seo/SEOHead';
import StrategyTrivia from '../../../src/components/trivia/StrategyTrivia';
import TriviaErrorBoundary from '../../../src/components/trivia/TriviaErrorBoundary';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';

export default function MTTPage() {
    useTrainingBus('trivia-mtt');
    return (
        <TriviaErrorBoundary pageName="Trivia — MTT Scenarios">
            <SEOHead
                title="MTT Trivia — Tournament Scenarios"
                description="Test Your Multi-Table Tournament Knowledge With Real MTT Situations And Decisions On Smarter.Poker."
                canonical="/hub/trivia/mtt"
                noindex={true}
            />
            <div style={{ paddingBottom: 70 }}>
                <StrategyTrivia mode="mtt" />
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
