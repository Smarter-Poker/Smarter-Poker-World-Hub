/**
 * MTT - MTT Scenarios Trivia
 * Route: /hub/trivia/mtt
 */

import StrategyTrivia from '../../../src/components/trivia/StrategyTrivia';
import useTrainingBus from '../../../src/hooks/useTrainingBus';

export default function MTTPage() {
    const bus = useTrainingBus('trivia-mtt');
    return <StrategyTrivia mode="mtt" />;
}
