/**
 * ICM - ICM Scenarios Trivia
 * Route: /hub/trivia/icm
 */

import StrategyTrivia from '../../../src/components/trivia/StrategyTrivia';
import useTrainingBus from '../../../src/hooks/useTrainingBus';

export default function ICMPage() {
    useTrainingBus('trivia-icm');
    return <StrategyTrivia mode="icm" />;
}
