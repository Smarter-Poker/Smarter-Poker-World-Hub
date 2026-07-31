/**
 * ICM - ICM Scenarios Trivia
 * Route: /hub/trivia/icm
 */

import SEOHead from '../../../src/components/seo/SEOHead';
import StrategyTrivia from '../../../src/components/trivia/StrategyTrivia';
import TriviaErrorBoundary from '../../../src/components/trivia/TriviaErrorBoundary';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';

export default function ICMPage() {
    useTrainingBus('trivia-icm');
    return (
        <TriviaErrorBoundary pageName="Trivia — ICM & Chip EV">
            <SEOHead
                title="ICM Trivia — Tournament Equity & Chip EV"
                description="Test Your ICM Knowledge With Tournament Equity And Chip EV Decisions On Smarter.Poker."
                canonical="/hub/trivia/icm"
                noindex={true}
            />
            <div style={{ paddingBottom: 70 }}>
                <StrategyTrivia mode="icm" />
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
