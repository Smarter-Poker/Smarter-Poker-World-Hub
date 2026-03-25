/**
 * GTO - GTO Scenarios Trivia
 * Route: /hub/trivia/gto
 */

import StrategyTrivia from '../../../src/components/trivia/StrategyTrivia';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';

export default function GTOPage() {
    useTrainingBus('trivia-gto');
    return <div style={{ paddingBottom: 70 }}><StrategyTrivia mode="gto" /><BottomNavBar /></div>;
}
