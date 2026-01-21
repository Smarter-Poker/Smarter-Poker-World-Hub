import React, { useState } from 'react';
import dynamic from 'next/dynamic';

// Dynamic import to avoid SSR issues with Phaser
const PokerGame = dynamic(
    () => import('../src/components/game/PokerGame'),
    { ssr: false }
);

/**
 * POKER ROOM DEMO PAGE
 * 
 * Demonstrates the Phaser 3 game engine integration
 * with React for GTO poker training (matching reference design)
 */
export default function PokerRoomDemo() {
    const [eventLog, setEventLog] = useState([]);

    const addLog = (message) => {
        setEventLog(prev => [
            ...prev.slice(-9),
            { time: new Date().toLocaleTimeString(), message }
        ]);
    };

    const handleFold = () => {
        addLog('Action: FOLD');
        console.log('Fold clicked');
    };

    const handleCall = () => {
        addLog('Action: CALL');
        console.log('Call clicked');
    };

    const handleRaise = () => {
        addLog('Action: RAISE to 8bb');
        console.log('Raise clicked');
    };

    const handleAllIn = () => {
        addLog('Action: ALL-IN');
        console.log('All-In clicked');
        // Trigger card deal animation
        if (window.pokerGameAPI) {
            window.pokerGameAPI.dealCards([1, 2, 3, 4, 5, 6, 7, 8]);
        }
    };

    return (
        <div className="w-full h-screen overflow-hidden">
            <PokerGame
                gameTitle="ICM FUNDAMENTALS"
                questionText="You Are On The Button (Last To Act). The Player To Your Right Bets 2.5 Big Blinds. What Is Your Best Move?"
                questionNumber={1}
                totalQuestions={20}
                heroStack={45}
                timerSeconds={15}
                xp={1250}
                diamonds={500}
                onFold={handleFold}
                onCall={handleCall}
                onRaise={handleRaise}
                onAllIn={handleAllIn}
            />
        </div>
    );
}
