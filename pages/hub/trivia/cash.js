/**
 * CASH - CASH Scenarios Trivia
 * Route: /hub/trivia/cash
 */

import StrategyTrivia from '../../../src/components/trivia/StrategyTrivia';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';

export default function CASHPage() {
    useTrainingBus('trivia-cash');
    return <><StrategyTrivia mode="cash" /><BottomNavBar /></>;
}
