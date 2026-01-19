/**
 * 🎮 UNIVERSAL TRAINING TABLE — SCORCHED EARTH REWRITE
 * ═══════════════════════════════════════════════════════════════════════════
 * HARD RULES:
 * - NO <script> tags
 * - NO dangerouslySetInnerHTML
 * - NO external CSS files
 * - 100% React state-driven
 * - Data ONLY from TRAINING_CLINICS
 * - Fixed absolute positioning
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect } from 'react';
import { TRAINING_CLINICS } from '../../data/TRAINING_CLINICS';

interface UniversalTrainingTableProps {
    gameId: string;
    onAnswer?: (action: string) => void;
}

export default function UniversalTrainingTable({ gameId, onAnswer }: UniversalTrainingTableProps) {
    // PHASE 1: DATA LOCK - Find the clinic
    const clinic = TRAINING_CLINICS.find(c => c.id === gameId);

    // PHASE 1: FORCE CHECK - Fail fast if clinic not found
    if (!clinic) {
        return (
            <div className="w-full h-screen flex items-center justify-center bg-slate-900 text-white">
                <div className="text-center">
                    <h1 className="text-2xl font-bold mb-4">Error: Clinic Not Found</h1>
                    <p className="text-gray-400">Game ID: {gameId}</p>
                </div>
            </div>
        );
    }

    // PHASE 2: STATE ENGINE - Pure React state (NO external logic)
    const [heroCards, setHeroCards] = useState<string[]>(['??', '??']);
    const [villainCards, setVillainCards] = useState<string[]>(['??', '??']);
    const [villainAction, setVillainAction] = useState<string>('');
    const [boardCards, setBoardCards] = useState<string[]>([]);
    const [pot, setPot] = useState(0);
    const [showActions, setShowActions] = useState(false);

    // PHASE 2: THE SCRIPT - Read ONLY from clinic data
    useEffect(() => {
        // T+0ms: Initialize from clinic starting state
        if (clinic.startingState) {
            setHeroCards(clinic.startingState.heroCards || ['Ah', 'Kh']);
            setPot(clinic.startingState.pot || 12);
            setBoardCards(clinic.startingState.board || []);
        }

        // T+1000ms: Show villain action from first question
        const timer = setTimeout(() => {
            if (clinic.questions && clinic.questions[0]) {
                const firstQuestion = clinic.questions[0];
                setVillainAction(firstQuestion.villainAction || 'Bets 2.5BB');
                setShowActions(true);
            }
        }, 1000);

        return () => clearTimeout(timer);
    }, [clinic]);

    // Action handlers
    const handleAction = (action: string) => {
        console.log('Player action:', action);
        onAnswer?.(action);
    };

    // PHASE 3: VISUAL ANCHORS - Fixed positioning with Tailwind
    return (
        <div className="w-full h-screen bg-gradient-to-b from-slate-900 to-slate-800 relative overflow-hidden">
            {/* Title Bar */}
            <div className="absolute top-0 left-0 right-0 h-16 bg-slate-900/80 backdrop-blur-sm border-b border-cyan-500/30 flex items-center justify-center z-50">
                <h1 className="text-xl font-bold text-white">{clinic.title}</h1>
            </div>

            {/* Poker Table */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] bg-gradient-to-br from-green-800 to-green-900 rounded-[50%] border-8 border-amber-900 shadow-2xl">
                {/* Table Center - Pot */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
                    <div className="text-yellow-400 text-2xl font-bold">POT: {pot}BB</div>
                </div>

                {/* Board Cards */}
                <div className="absolute top-[35%] left-1/2 -translate-x-1/2 flex gap-2">
                    {boardCards.map((card, i) => (
                        <Card key={i} card={card} />
                    ))}
                </div>
            </div>

            {/* VILLAIN - Top Center */}
            <div className="absolute top-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
                <div className="text-white text-sm font-semibold">VILLAIN</div>
                <div className="flex gap-2">
                    {villainCards.map((card, i) => (
                        <Card key={i} card={card} size="small" />
                    ))}
                </div>
                {villainAction && (
                    <div className="bg-red-500 text-white px-4 py-2 rounded-lg font-bold text-sm">
                        {villainAction}
                    </div>
                )}
            </div>

            {/* HERO - Bottom Center */}
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
                <div className="flex gap-2">
                    {heroCards.map((card, i) => (
                        <Card key={i} card={card} />
                    ))}
                </div>
                <div className="text-white text-sm font-semibold">YOU</div>
            </div>

            {/* Action Buttons - Bottom */}
            {showActions && (
                <div className="absolute bottom-32 left-1/2 -translate-x-1/2 flex gap-4">
                    <button
                        onClick={() => handleAction('fold')}
                        className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition-all"
                    >
                        FOLD
                    </button>
                    <button
                        onClick={() => handleAction('call')}
                        className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-all"
                    >
                        CALL
                    </button>
                    <button
                        onClick={() => handleAction('raise')}
                        className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg transition-all"
                    >
                        RAISE
                    </button>
                </div>
            )}
        </div>
    );
}

// Card Component - Pure CSS, no images
function Card({ card, size = 'medium' }: { card: string; size?: 'small' | 'medium' }) {
    const isBack = card === '??' || !card;

    const sizes = {
        small: 'w-12 h-16',
        medium: 'w-16 h-24'
    };

    if (isBack) {
        return (
            <div className={`${sizes[size]} bg-gradient-to-br from-red-600 to-red-800 rounded-lg border-2 border-white shadow-lg flex items-center justify-center`}>
                <span className="text-white text-2xl font-bold">?</span>
            </div>
        );
    }

    // Parse card (e.g., "Ah" = Ace of hearts)
    const rank = card.slice(0, -1);
    const suit = card.slice(-1);

    const suitSymbols: Record<string, string> = {
        'h': '♥',
        'd': '♦',
        'c': '♣',
        's': '♠'
    };

    const suitColors: Record<string, string> = {
        'h': 'text-red-600',
        'd': 'text-red-600',
        'c': 'text-black',
        's': 'text-black'
    };

    return (
        <div className={`${sizes[size]} bg-white rounded-lg border-2 border-gray-800 shadow-lg flex flex-col items-center justify-center`}>
            <span className={`text-2xl font-bold ${suitColors[suit] || 'text-black'}`}>
                {rank}
            </span>
            <span className={`text-xl ${suitColors[suit] || 'text-black'}`}>
                {suitSymbols[suit] || suit}
            </span>
        </div>
    );
}
