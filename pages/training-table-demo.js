/**
 * 🎮 TRAINING GAME TABLE DEMO
 * 
 * Vertical oval table matching the reference design for training games
 */

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import SEOHead from '../src/components/seo/SEOHead';

const TrainingGameTable = dynamic(
    () => import('../src/components/poker/TrainingGameTable'),
    { ssr: false }
);

export default function TrainingTableDemo() {
    const [timer, setTimer] = useState(15);
    const [questionNumber, setQuestionNumber] = useState(1);
    const [feedback, setFeedback] = useState(null);
    const [communityCards, setCommunityCards] = useState([]);
    const [showDemoControls, setShowDemoControls] = useState(false);

    // Timer countdown
    useEffect(() => {
        if (feedback) return undefined;
        const interval = setInterval(() => {
            setTimer(t => t > 0 ? t - 1 : 15);
        }, 1000);
        return () => clearInterval(interval);
    }, [feedback]);

    useEffect(() => {
        // The demo is a public visual reference, so its first impression must be
        // the table itself. Developer dealing controls are opt-in instead of
        // floating over every production visit.
        setShowDemoControls(new URLSearchParams(window.location.search).has('debug'));
    }, []);

    const dealFlop = () => setCommunityCards(['Ks', 'Qh', '7d']);
    const dealTurn = () => setCommunityCards(['Ks', 'Qh', '7d', '2c']);
    const dealRiver = () => setCommunityCards(['Ks', 'Qh', '7d', '2c', 'As']);
    const resetCards = () => setCommunityCards([]);
    const answerLabels = {
        fold: 'Fold',
        call: 'Call',
        raise: 'Raise To 6 BB',
        allIn: 'Raise All-In',
    };
    const handleDecision = (action) => {
        if (feedback) return;
        const correctAction = 'raise';
        setFeedback({
            isCorrect: action === correctAction,
            selectedLabel: answerLabels[action],
            correctLabel: answerLabels[correctAction],
            explanation: 'A♥ K♥ is a premium value hand. Raising to 6 BB builds the pot while keeping dominated hands in range; moving all-in for 20 BB folds out too much worse equity.',
        });
    };
    const handleNext = () => {
        setFeedback(null);
        setTimer(15);
        setQuestionNumber((current) => current >= 20 ? 1 : current + 1);
    };

    return (
        <>
            <SEOHead
                title="Training Table Demo"
                description="Demo Training Poker Table."
                noindex={true}
            />

            <TrainingGameTable
                heroCards={['Ah', 'Kh']}
                communityCards={communityCards}
                pot={0}
                timer={timer}
                questionNumber={questionNumber}
                totalQuestions={20}
                gameTitle="ICM FUNDAMENTALS"
                questionText="Action Folds To The Cutoff, Who Raises To 2.5 BB. You Are On The Button With A♥ K♥ At 20 BB Effective. What Is Your Best Action?"
                xp={1250}
                diamonds={500}
                actionLabels={answerLabels}
                feedback={feedback}
                onFold={() => handleDecision('fold')}
                onCall={() => handleDecision('call')}
                onRaise={() => handleDecision('raise')}
                onAllIn={() => handleDecision('allIn')}
                onNext={handleNext}
                onBack={() => window.history.back()}
            />

            {/* Demo controls */}
            {showDemoControls && <div style={{
                position: 'fixed',
                top: 80,
                right: 10,
                background: 'rgba(0,0,0,0.85)',
                borderRadius: 8,
                padding: 12,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                zIndex: 9999,
            }}>
                <button onClick={dealFlop} style={{ padding: '6px 10px', fontSize: 11 }}>Deal Flop</button>
                <button onClick={dealTurn} style={{ padding: '6px 10px', fontSize: 11 }}>Deal Turn</button>
                <button onClick={dealRiver} style={{ padding: '6px 10px', fontSize: 11 }}>Deal River</button>
                <button onClick={resetCards} style={{ padding: '6px 10px', fontSize: 11 }}>Reset</button>
            </div>}
        </>
    );
}
