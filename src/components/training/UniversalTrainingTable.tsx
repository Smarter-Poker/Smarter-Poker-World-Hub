/**
 * 🎮 UNIVERSAL TRAINING TABLE — SCORCHED EARTH REWRITE
 * ═══════════════════════════════════════════════════════════════════════════
 * HARD RULES:
 * - NO <script> tags
 * - NO dangerouslySetInnerHTML
 * - NO external CSS files (including Tailwind)
 * - 100% React state-driven
 * - Data ONLY from TRAINING_CLINICS
 * - INLINE STYLES ONLY
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
            <div style={{
                width: '100%',
                height: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#0f172a',
                color: '#fff'
            }}>
                <div style={{ textAlign: 'center' }}>
                    <h1 style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 16 }}>Error: Clinic Not Found</h1>
                    <p style={{ color: '#9ca3af' }}>Game ID: {gameId}</p>
                    <p style={{ color: '#6b7280', marginTop: 8 }}>Available clinics: clinic-01 to clinic-28</p>
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

    // PHASE 3: VISUAL ANCHORS - Fixed positioning with INLINE STYLES
    return (
        <div style={{
            width: '100%',
            height: '100vh',
            background: 'linear-gradient(to bottom, #0f172a, #1e293b)',
            position: 'relative',
            overflow: 'hidden'
        }}>
            {/* Title Bar */}
            <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: 64,
                background: 'rgba(15, 23, 42, 0.8)',
                backdropFilter: 'blur(8px)',
                borderBottom: '1px solid rgba(0, 212, 255, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 50
            }}>
                <h1 style={{ fontSize: 20, fontWeight: 'bold', color: '#fff' }}>{clinic.title || clinic.name}</h1>
            </div>

            {/* Poker Table */}
            <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: 700,
                height: 400,
                background: 'linear-gradient(135deg, #166534, #14532d)',
                borderRadius: '50%',
                border: '8px solid #78350f',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
            }}>
                {/* Table Center - Pot */}
                <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    textAlign: 'center'
                }}>
                    <div style={{ color: '#facc15', fontSize: 24, fontWeight: 'bold' }}>POT: {pot}BB</div>
                </div>

                {/* Board Cards */}
                <div style={{
                    position: 'absolute',
                    top: '35%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    display: 'flex',
                    gap: 8
                }}>
                    {boardCards.map((card, i) => (
                        <Card key={i} card={card} />
                    ))}
                </div>
            </div>

            {/* VILLAIN - Top Center */}
            <div style={{
                position: 'absolute',
                top: 40,
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8
            }}>
                <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>VILLAIN</div>
                <div style={{ display: 'flex', gap: 8 }}>
                    {villainCards.map((card, i) => (
                        <Card key={i} card={card} size="small" />
                    ))}
                </div>
                {villainAction && (
                    <div style={{
                        background: '#dc2626',
                        color: '#fff',
                        padding: '8px 16px',
                        borderRadius: 8,
                        fontWeight: 'bold',
                        fontSize: 14
                    }}>
                        {villainAction}
                    </div>
                )}
            </div>

            {/* HERO - Bottom Center */}
            <div style={{
                position: 'absolute',
                bottom: 40,
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8
            }}>
                <div style={{ display: 'flex', gap: 8 }}>
                    {heroCards.map((card, i) => (
                        <Card key={i} card={card} />
                    ))}
                </div>
                <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>YOU</div>
            </div>

            {/* Action Buttons - Bottom */}
            {showActions && (
                <div style={{
                    position: 'absolute',
                    bottom: 128,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    display: 'flex',
                    gap: 16
                }}>
                    <button
                        onClick={() => handleAction('fold')}
                        style={{
                            padding: '12px 24px',
                            background: '#dc2626',
                            border: 'none',
                            borderRadius: 8,
                            color: '#fff',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            transition: 'transform 0.1s'
                        }}
                    >
                        FOLD
                    </button>
                    <button
                        onClick={() => handleAction('call')}
                        style={{
                            padding: '12px 24px',
                            background: '#2563eb',
                            border: 'none',
                            borderRadius: 8,
                            color: '#fff',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            transition: 'transform 0.1s'
                        }}
                    >
                        CALL
                    </button>
                    <button
                        onClick={() => handleAction('raise')}
                        style={{
                            padding: '12px 24px',
                            background: '#16a34a',
                            border: 'none',
                            borderRadius: 8,
                            color: '#fff',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            transition: 'transform 0.1s'
                        }}
                    >
                        RAISE
                    </button>
                </div>
            )}
        </div>
    );
}

// Card Component - Pure CSS, no images, INLINE STYLES
function Card({ card, size = 'medium' }: { card: string; size?: 'small' | 'medium' }) {
    const isBack = card === '??' || !card;

    const dimensions = size === 'small'
        ? { width: 48, height: 64 }
        : { width: 64, height: 96 };

    if (isBack) {
        return (
            <div style={{
                ...dimensions,
                background: 'linear-gradient(135deg, #dc2626, #991b1b)',
                borderRadius: 8,
                border: '2px solid #fff',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }}>
                <span style={{ color: '#fff', fontSize: 24, fontWeight: 'bold' }}>?</span>
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

    const isRed = suit === 'h' || suit === 'd';

    return (
        <div style={{
            ...dimensions,
            background: '#fff',
            borderRadius: 8,
            border: '2px solid #1f2937',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center'
        }}>
            <span style={{
                fontSize: size === 'small' ? 18 : 24,
                fontWeight: 'bold',
                color: isRed ? '#dc2626' : '#000'
            }}>
                {rank}
            </span>
            <span style={{
                fontSize: size === 'small' ? 16 : 20,
                color: isRed ? '#dc2626' : '#000'
            }}>
                {suitSymbols[suit] || suit}
            </span>
        </div>
    );
}
