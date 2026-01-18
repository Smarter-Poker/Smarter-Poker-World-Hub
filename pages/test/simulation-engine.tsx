/**
 * 🧪 SIMULATION ENGINE TEST PAGE
 * 
 * Tests The Architect (ScenarioGenerator) and The Director (Visual Replay)
 * to ensure mathematical integrity and visual accuracy.
 * 
 * 🛡️ Wrapped with GameGuard for crash recovery
 */

import { useState, useCallback } from 'react';
import { Director } from '../../../src/components/training/Director';
import { GameGuard } from '../../../src/lib/GameGuard';
import type { GameConfig } from '../../../src/types/poker';

export default function SimulationTest() {
    const [resetKey, setResetKey] = useState(0);

    const config: GameConfig = {
        bigBlind: 100,
        ante: 10,
        startStack: 2000
    };

    // 🔄 Auto-recovery: regenerate game state on crash
    const handleGameReset = useCallback(() => {
        console.log('🛡️ GameGuard: Auto-recovering from crash...');
        setResetKey(prev => prev + 1);
    }, []);

    return (
        <div style={{ width: '100%', height: '100vh', overflow: 'hidden' }}>
            <GameGuard onReset={handleGameReset}>
                <Director
                    key={resetKey}
                    config={config}
                    onScenarioComplete={(correct, xp, diamonds) => {
                        console.log('Scenario complete:', { correct, xp, diamonds });
                    }}
                />
            </GameGuard>
        </div>
    );
}
