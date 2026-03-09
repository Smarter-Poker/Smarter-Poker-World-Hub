/**
 * GAME UI ROUTER — Routes to Game-Specific UIs
 * ═══════════════════════════════════════════════════════════════════════════
 * UPDATED: GTO Wizard-style training with GTOW scoring
 * All poker games use UniversalDynamicTable with action buttons + frequency bars
 * Psychology/Scenario games still use specialized UIs
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React from 'react';

// Import game-specific UIs
import UniversalDynamicTable from './games/UniversalDynamicTable';
import PsychologyTiltControlUI from './games/PsychologyTiltControlUI';

// Game ID to Game Type mapping (for table configuration)
const GAME_TYPE_MAP = {
    // Cash Games (6-Max)
    'cash-001': '6max', 'cash-002': '6max', 'cash-003': '6max',
    'cash-004': '6max', 'cash-005': '6max', 'cash-006': '6max',
    'cash-007': '6max', 'cash-008': '6max', 'cash-009': '6max',
    'cash-010': '6max', 'cash-011': '6max', 'cash-012': '6max',
    'cash-013': '6max', 'cash-014': '6max', 'cash-015': '6max',
    'cash-016': '6max', 'cash-017': '6max', 'cash-018': '6max',
    'cash-019': '6max', 'cash-020': '6max',

    // MTT Games (9-Max default, with exceptions)
    'mtt-001': 'mtt', 'mtt-002': 'mtt', 'mtt-003': 'mtt',
    'mtt-004': 'mtt', 'mtt-005': 'mtt', 'mtt-006': 'mtt',
    'mtt-007': 'mtt', 'mtt-008': 'mtt', 'mtt-009': 'mtt',
    'mtt-010': 'mtt', 'mtt-011': 'mtt', 'mtt-012': 'mtt',
    'mtt-013': 'mtt', 'mtt-014': 'mtt',
    'mtt-015': 'heads-up', // Heads Up Duel (2-max)
    'mtt-016': 'mtt', 'mtt-017': 'mtt', 'mtt-018': 'mtt',
    'mtt-019': 'mtt', 'mtt-020': 'mtt',

    // Spins/SNG Games (3-Max)
    'spins-001': 'spins', 'spins-002': 'spins', 'spins-003': 'spins',
    'spins-004': 'spins', 'spins-005': 'spins', 'spins-006': 'spins',
    'spins-007': 'spins', 'spins-008': 'spins', 'spins-009': 'spins',
    'spins-010': 'spins', 'spins-011': 'spins', 'spins-012': 'spins',
    'spins-013': 'spins', 'spins-014': 'spins', 'spins-015': 'spins',
    'spins-016': 'spins', 'spins-017': 'spins', 'spins-018': 'spins',
    'spins-019': 'spins', 'spins-020': 'spins',

    // Advanced Games (6-Max default, with exceptions)
    'adv-001': '6max', 'adv-002': '6max', 'adv-003': '6max',
    'adv-004': '6max', 'adv-005': '6max', 'adv-006': '6max',
    'adv-007': 'heads-up', // Indifference Theory (2-max)
    'adv-008': '6max', 'adv-009': '6max',
    'adv-010': '6max', 'adv-011': '6max', 'adv-012': '6max',
    'adv-013': '6max', 'adv-014': '6max', 'adv-015': '6max',
    'adv-016': '6max', 'adv-017': '6max', 'adv-018': '6max',
    'adv-019': '6max', 'adv-020': '6max',
};

// Psychology games use specialized UI (no table needed)
const PSYCHOLOGY_GAMES = [
    'psy-001', 'psy-002', 'psy-003', 'psy-004', 'psy-005',
    'psy-006', 'psy-007', 'psy-008', 'psy-009', 'psy-010',
    'psy-011', 'psy-012', 'psy-013', 'psy-014', 'psy-015',
    'psy-016', 'psy-017', 'psy-018', 'psy-019', 'psy-020',
];

export default function GameUIRouter({
    gameId,
    gameName,
    streak,
    question,
    level,
    questionNumber,
    totalQuestions,
    onAnswer,
    showFeedback,
    feedbackResult,
    explanation,
    // GTOW scoring props (new)
    moveClassification = null,
    evLoss = 0,
    gtoFrequencies = null,
    gtowScore = 100,
    totalSessionEVLoss = 0,
    sessionMistakes = 0,
    // UI-2: Manual advance callback
    onNextHand = null,
    // Multi-street props
    isMultiStreetActive = false,
    currentStreet = 'flop',
    // Quit/Back
    onExit = null,
    // Phase 2: Adaptive difficulty
    difficultyLevel = 0,
}) {
    // Determine which UI to use based on game type
    const isPsychologyGame = PSYCHOLOGY_GAMES.includes(gameId) || gameId?.startsWith('psy-');
    const gameType = GAME_TYPE_MAP[gameId] || '6max'; // Default to 6-max

    // Psychology games use specialized UI with no poker table
    if (isPsychologyGame) {
        return (
            <PsychologyTiltControlUI
                question={question}
                level={level}
                questionNumber={questionNumber}
                totalQuestions={totalQuestions}
                onAnswer={onAnswer}
                showFeedback={showFeedback}
                feedbackResult={feedbackResult}
                explanation={explanation}
                onNextHand={onNextHand}
            />
        );
    }

    // ALL poker games use GTO Wizard-style dynamic table
    return (
        <UniversalDynamicTable
            question={question}
            level={level}
            questionNumber={questionNumber}
            totalQuestions={totalQuestions}
            onAnswer={onAnswer}
            showFeedback={showFeedback}
            feedbackResult={feedbackResult}
            explanation={explanation}
            gameType={gameType}
            gameTitle={gameName}
            streak={streak || 0}
            // GTOW scoring props
            moveClassification={moveClassification}
            evLoss={evLoss}
            gtoFrequencies={gtoFrequencies}
            gtowScore={gtowScore}
            totalSessionEVLoss={totalSessionEVLoss}
            sessionMistakes={sessionMistakes}
            // UI-2: Manual advance
            onNextHand={onNextHand}
            // Multi-street props
            isMultiStreetActive={isMultiStreetActive}
            currentStreet={currentStreet}
            // Quit/Back
            onExit={onExit}
            // Phase 2: Adaptive difficulty
            difficultyLevel={difficultyLevel}
        />
    );
}
