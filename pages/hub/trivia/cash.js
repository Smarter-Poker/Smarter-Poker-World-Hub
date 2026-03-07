/**
 * CASH - CASH Scenarios Trivia
 * Route: /hub/trivia/cash
 */

import StrategyTrivia from '../../../src/components/trivia/StrategyTrivia';
import useTrainingBus from '../../../src/hooks/useTrainingBus';

export default function CASHPage() {
    const bus = useTrainingBus('trivia-cash');
    return <StrategyTrivia mode="cash" />;
}
