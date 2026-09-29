/**
 * MTT - MTT Scenarios Trivia
 * Route: /hub/trivia/mtt
 */

import SEOHead from '../../../src/components/seo/SEOHead';
import StrategyTrivia from '../../../src/components/trivia/StrategyTrivia';
import TriviaErrorBoundary from '../../../src/components/trivia/TriviaErrorBoundary';
import useTrainingBus from '../../../src/hooks/useTrainingBus';

export default function MTTPage() {
    useTrainingBus('trivia-mtt');
    return (
        <TriviaErrorBoundary pageName="Trivia - MTT Scenarios">
            <SEOHead
                title="MTT Trivia - Tournament Scenarios"
                description="Test Your Multi-Table Tournament Knowledge With Real MTT Situations And Decisions On Smarter.Poker."
                canonical="/hub/trivia/mtt"
                noindex={true}
            />
            {/* Reserves room for the fixed BottomNavBar (was an inline
                height override on .strategy-trivia that clipped the console
                foot under the nav bar on mobile). */}
            <div className="strategy-trivia-page">
                <StrategyTrivia mode="mtt" />
            </div>
        </TriviaErrorBoundary>
    );
}
