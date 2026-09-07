import React from 'react';

interface PokerQuizProps {
    onClose?: () => void;
    onEarnDiamonds?: (amount: number) => void;
}

const VERIFIED_QUIZ_ROUTE = '/hub/training/quiz-gauntlet?source=jarvis';

/**
 * Jarvis does not ship quiz answer keys or award currency in the browser. The
 * verified Training Arena owns question delivery, grading, feedback,
 * progression, and any ledger-backed reward.
 */
export function PokerQuiz({ onClose }: PokerQuizProps) {
    const openVerifiedQuiz = () => {
        if (typeof window !== 'undefined') window.location.assign(VERIFIED_QUIZ_ROUTE);
    };

    return (
        <div style={{
            background: 'linear-gradient(155deg, rgba(19, 31, 45, 0.99), rgba(3, 10, 18, 0.99))',
            border: '1px solid rgba(106, 220, 255, 0.45)',
            borderRadius: '12px',
            padding: '18px',
            maxWidth: '450px',
            color: '#eefaff',
            boxShadow: '0 16px 40px rgba(0, 0, 0, 0.48), inset 0 1px rgba(255, 255, 255, 0.08)'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                <div>
                    <div style={{ color: '#78ddff', fontSize: '10px', letterSpacing: '0.16em' }}>
                        Verified Training
                    </div>
                    <h4 style={{ margin: '6px 0 8px', fontSize: '17px' }}>Poker Quiz Gauntlet</h4>
                </div>
                {onClose && (
                    <button
                        type="button"
                        aria-label="Close Poker Quiz Launcher"
                        onClick={onClose}
                        style={{ background: 'none', border: 0, color: '#bfefff', fontSize: '20px', cursor: 'pointer' }}
                    >
                        ×
                    </button>
                )}
            </div>
            <p style={{ margin: '0 0 16px', color: 'rgba(238, 250, 255, 0.76)', fontSize: '12px', lineHeight: 1.55 }}>
                Questions, answer order, grading, explanations, progress, and rewards are verified by the Training Arena.
            </p>
            <button
                type="button"
                onClick={openVerifiedQuiz}
                style={{
                    width: '100%', padding: '12px 14px', border: '1px solid #8fe8ff', borderRadius: '8px',
                    background: 'linear-gradient(180deg, #49cfff, #087eaa)', color: '#031018', fontSize: '12px',
                    fontWeight: 800, cursor: 'pointer', boxShadow: '0 8px 22px rgba(28, 183, 234, 0.25)'
                }}
            >
                Open Verified Quiz Gauntlet
            </button>
        </div>
    );
}
