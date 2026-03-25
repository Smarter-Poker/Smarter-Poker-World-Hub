/**
 * ICM - ICM Scenarios Trivia
 * Route: /hub/trivia/icm
 */

import StrategyTrivia from '../../../src/components/trivia/StrategyTrivia';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';

export default function ICMPage() {
    useTrainingBus('trivia-icm');
    return <div style={{ paddingBottom: 70 }}><StrategyTrivia mode="icm" /><BottomNavBar /></div>;
}
