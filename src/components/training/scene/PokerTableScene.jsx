/**
 * Poker Table Scene — Using Golden Template (TrainingGameTable)
 * ═══════════════════════════════════════════════════════════════════
 * Uses the EXACT Golden Template clone - TrainingGameTable.jsx
 * ═══════════════════════════════════════════════════════════════════
 */

import React, { useMemo } from 'react';
import TrainingGameTable from '../../poker/TrainingGameTable';

// =============================================================================
// MAIN COMPONENT — Adapter for GoldenTemplateTable
// =============================================================================

function PokerTableScene({
    seatCount = 6,
    seats = [],
    currentState = {},
    heroCards = null,
    gameTitle = '',
    debugMode = false,
}) {
    const {
        street = 'preflop',
        board = [],
        potBB = 0,
        activePlayerSeatId = null,
        dealerSeatId = 0,
        stacksAfter = [],
    } = currentState;

    // Transform seats to GoldenTemplate format
    const players = useMemo(() => {
        const positions = ['HERO', 'SB', 'BB', 'UTG', 'MP', 'CO', 'HJ', 'LJ', 'BTN'];
        return seats.map((seat, i) => {
            const stackInfo = stacksAfter.find(s => s.seatId === seat.seatId);
            return {
                id: seat.seatId || `p${i}`,
                name: i === 0 ? 'HERO' : (seat.position || positions[i] || `P${i + 1}`),
                stack: stackInfo?.stackBB ?? seat.startingStackBB ?? 100,
                isFolded: seat.isFolded || false,
            };
        });
    }, [seats, stacksAfter]);

    // Format hero cards for GoldenTemplate
    const formattedHeroCards = useMemo(() => {
        if (!heroCards || heroCards.length === 0) return [];
        return heroCards;
    }, [heroCards]);

    return (
        <div style={styles.container}>
            <TrainingGameTable
                heroCards={formattedHeroCards}
                communityCards={board}
                pot={potBB}
                timer={15}
                questionNumber={1}
                totalQuestions={20}
                gameTitle={gameTitle || 'GTO Training'}
            />

            {/* Debug overlay */}
            {debugMode && (
                <div style={styles.debug}>
                    Street: {street} | Pot: {potBB}BB | Active: S{activePlayerSeatId}
                </div>
            )}
        </div>
    );
}

const styles = {
    container: {
        position: 'relative',
        width: '100%',
        height: '100%',
    },
    debug: {
        position: 'absolute',
        bottom: 8,
        right: 8,
        background: 'rgba(0,0,0,0.8)',
        color: '#0f0',
        fontSize: 10,
        fontFamily: 'monospace',
        padding: '4px 8px',
        borderRadius: 4,
        zIndex: 500,
    },
};

export default React.memo(PokerTableScene);
