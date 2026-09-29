/**
 * CASH - CASH Scenarios Trivia
 * Route: /hub/trivia/cash
 */

import SEOHead from '../../../src/components/seo/SEOHead';
import StrategyTrivia from '../../../src/components/trivia/StrategyTrivia';
import TriviaErrorBoundary from '../../../src/components/trivia/TriviaErrorBoundary';
import useTrainingBus from '../../../src/hooks/useTrainingBus';

export default function CASHPage() {
    useTrainingBus('trivia-cash');
    return (
        <TriviaErrorBoundary pageName="Trivia - Cash Game">
            <SEOHead
                title="Cash Game Trivia - Deep Stack Scenarios"
                description="Test Your Cash Game Knowledge With Deep Stack Scenarios, Implied Odds, And Table Dynamics On Smarter.Poker."
                canonical="/hub/trivia/cash"
                noindex={true}
            />
            {/* Reserves room for the fixed BottomNavBar (was an inline
                height override on .strategy-trivia that clipped the console
                foot under the nav bar on mobile). */}
            <div className="strategy-trivia-page">
                <StrategyTrivia mode="cash" />
            </div>
        </TriviaErrorBoundary>
    );
}
