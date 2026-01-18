/**
 * 🧪 HEADS-UP DISPLAY TEST PAGE
 * 
 * Tests the Adaptive Table System with tableSize={2}.
 * Verifies:
 * - Only Hero and Villain 1 appear
 * - Button logic is correct (Dealer = SB in HU)
 * - Scenarios are specific to 1v1 play
 */

import { useState, useCallback } from 'react';
import { Director } from '../../../src/components/training/Director';
import { GameGuard } from '../../../src/lib/GameGuard';
import type { GameConfig } from '../../../src/types/poker';

export default function HeadsUpTest() {
    const [resetKey, setResetKey] = useState(0);

    // Heads-Up configuration
    const config: GameConfig = {
        bigBlind: 50,
        ante: 0,
        startStack: 1500,
        tableSize: 2  // 👈 HEADS-UP MODE
    };

    const handleGameReset = useCallback(() => {
        console.log('🛡️ GameGuard: Auto-recovering from crash...');
        setResetKey(prev => prev + 1);
    }, []);

    return (
        <div style={{ width: '100%', height: '100vh', overflow: 'hidden' }}>
            {/* Test Info Banner */}
            <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                padding: '8px 16px',
                background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                color: '#fff',
                fontSize: '14px',
                fontWeight: 600,
                zIndex: 10000,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <span>🧪 TEST: Heads-Up Display (tableSize=2)</span>
                <span>✓ BTN=SB • ✓ 2 Players Only • ✓ Wide Ranges</span>
            </div>

            <div style={{ paddingTop: '40px', height: '100%' }}>
                <GameGuard onReset={handleGameReset}>
                    <Director
                        key={resetKey}
                        config={config}
                        onScenarioComplete={(correct, xp, diamonds) => {
                            console.log('HU Scenario complete:', { correct, xp, diamonds });
                        }}
                    />
                </GameGuard>
            </div>
        </div>
    );
}
