/**
 * MTT - MTT Scenarios Trivia
 * Route: /hub/trivia/mtt
 */

import StrategyTrivia from '../../../src/components/trivia/StrategyTrivia';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';

export default function MTTPage() {
    useTrainingBus('trivia-mtt');
    return <div style={{ paddingBottom: 70 }}><StrategyTrivia mode="mtt" /><BottomNavBar /></div>;
}
