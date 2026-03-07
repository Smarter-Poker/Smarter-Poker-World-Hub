/**
 * GTO - GTO Scenarios Trivia
 * Route: /hub/trivia/gto
 */

import StrategyTrivia from '../../../src/components/trivia/StrategyTrivia';
import useTrainingBus from '../../../src/hooks/useTrainingBus';

export default function GTOPage() {
    const bus = useTrainingBus('trivia-gto');
    return <StrategyTrivia mode="gto" />;
}
