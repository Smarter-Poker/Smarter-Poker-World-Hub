/**
 * ICM - ICM Scenarios Trivia
 * Route: /hub/trivia/icm
 */

import SEOHead from '../../../src/components/seo/SEOHead';
import StrategyTrivia from '../../../src/components/trivia/StrategyTrivia';
import TriviaErrorBoundary from '../../../src/components/trivia/TriviaErrorBoundary';
import useTrainingBus from '../../../src/hooks/useTrainingBus';

export default function ICMPage() {
    useTrainingBus('trivia-icm');
    return (
        <TriviaErrorBoundary pageName="Trivia - ICM & Chip EV">
            <SEOHead
                title="ICM Trivia - Tournament Equity & Chip EV"
                description="Test Your ICM Knowledge With Tournament Equity And Chip EV Decisions On Smarter.Poker."
                canonical="/hub/trivia/icm"
                noindex={true}
            />
            {/* Reserves room for the fixed BottomNavBar (was an inline
                height override on .strategy-trivia that clipped the console
                foot under the nav bar on mobile). */}
            <div className="strategy-trivia-page">
                <StrategyTrivia mode="icm" />
            </div>
        </TriviaErrorBoundary>
    );
}
