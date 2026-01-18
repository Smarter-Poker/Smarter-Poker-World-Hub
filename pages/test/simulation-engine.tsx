/**
 * 🧪 SIMULATION ENGINE TEST PAGE
 * 
 * Tests The Architect (ScenarioGenerator) and The Director (Visual Replay)
 * to ensure mathematical integrity and visual accuracy.
 */

import { Director } from '../../../src/components/training/Director';
import type { GameConfig } from '../../../src/types/poker';

export default function SimulationTest() {
    const config: GameConfig = {
        bigBlind: 100,
        ante: 10,
        startStack: 2000
    };

    return (
        <div style={{ width: '100%', height: '100vh', overflow: 'hidden' }}>
            <Director
                config={config}
                onScenarioComplete={(correct) => {
                    console.log('Scenario complete:', correct);
                }}
            />
        </div>
    );
}
