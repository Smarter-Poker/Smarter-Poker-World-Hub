/**
 * GTO - GTO Scenarios Trivia
 * Route: /hub/trivia/gto
 */

import SEOHead from '../../../src/components/seo/SEOHead';
import StrategyTrivia from '../../../src/components/trivia/StrategyTrivia';
import TriviaErrorBoundary from '../../../src/components/trivia/TriviaErrorBoundary';
import useTrainingBus from '../../../src/hooks/useTrainingBus';

export default function GTOPage() {
    useTrainingBus('trivia-gto');
    return (
        <TriviaErrorBoundary pageName="Trivia - GTO Master">
            <SEOHead
                title="GTO Trivia - Solver-Based Scenarios"
                description="Test Your GTO Knowledge With Solver-Based Strategy Scenarios On Smarter.Poker."
                canonical="/hub/trivia/gto"
                noindex={true}
            />
            {/* Reserves room for the fixed BottomNavBar (was an inline
                height override on .strategy-trivia that clipped the console
                foot under the nav bar on mobile). */}
            <div className="strategy-trivia-page">
                <StrategyTrivia mode="gto" />
            </div>
        </TriviaErrorBoundary>
    );
}
