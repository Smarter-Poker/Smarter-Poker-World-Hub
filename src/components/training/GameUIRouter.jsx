/**
 * 🎯 GAME UI ROUTER — Routes to Game-Specific UIs
 * ═══════════════════════════════════════════════════════════════════════════
 * Dynamically loads the appropriate game-specific UI component based on gameId
 * Falls back to generic MillionaireQuestion for games without custom UIs
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React from 'react';
import MillionaireQuestion from './MillionaireQuestion';

// Import game-specific UIs
import MTTDeepStackUI from './games/MTTDeepStackUI';
import CashCBetAcademyUI from './games/CashCBetAcademyUI';
import PsychologyTiltControlUI from './games/PsychologyTiltControlUI';
import SpinsICMCalculatorUI from './games/SpinsICMCalculatorUI';
import AdvancedSolverMimicryUI from './games/AdvancedSolverMimicryUI';

// Game ID to Component mapping
const GAME_UI_MAP = {
    'mtt-007': MTTDeepStackUI,
    'mtt-018': MTTDeepStackUI, // Reuse for Button Warfare
    'cash-002': CashCBetAcademyUI,
    'cash-018': CashCBetAcademyUI, // Reuse for Blind vs Blind
    'spins-003': SpinsICMCalculatorUI,
    'spins-007': SpinsICMCalculatorUI, // Reuse for 50/50 Survival
    'psy-003': PsychologyTiltControlUI,
    'psy-012': PsychologyTiltControlUI, // Reuse for Bankroll Psychology
    'adv-001': AdvancedSolverMimicryUI,
    'adv-017': AdvancedSolverMimicryUI, // Reuse for Capped Ranges
};

export default function GameUIRouter({
    gameId,
    question,
    level,
    questionNumber,
    totalQuestions,
    onAnswer,
    showFeedback,
    feedbackResult,
    explanation
}) {
    // Get the appropriate UI component for this game
    const UIComponent = GAME_UI_MAP[gameId] || MillionaireQuestion;

    return (
        <UIComponent
            question={question}
            level={level}
            questionNumber={questionNumber}
            totalQuestions={totalQuestions}
            onAnswer={onAnswer}
            showFeedback={showFeedback}
            feedbackResult={feedbackResult}
            explanation={explanation}
        />
    );
}
