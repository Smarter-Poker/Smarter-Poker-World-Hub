/**
 * 🎮 TRAINING GAME TABLE DEMO
 * 
 * Vertical oval table matching the reference design for training games
 */

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Head from 'next/head';

const TrainingGameTable = dynamic(
    () => import('../src/components/poker/TrainingGameTable'),
    { ssr: false }
);

export default function TrainingTableDemo() {
    const [timer, setTimer] = useState(15);
    const [communityCards, setCommunityCards] = useState([]);

    // Timer countdown
    useEffect(() => {
        const interval = setInterval(() => {
            setTimer(t => t > 0 ? t - 1 : 15);
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    const dealFlop = () => setCommunityCards(['Ks', 'Qh', '7d']);
    const dealTurn = () => setCommunityCards(['Ks', 'Qh', '7d', '2c']);
    const dealRiver = () => setCommunityCards(['Ks', 'Qh', '7d', '2c', 'As']);
    const resetCards = () => setCommunityCards([]);

    return (
        <>
            <Head>
                <title>Training Game Table | Smarter.Poker</title>
            </Head>

            <TrainingGameTable
                heroCards={['Ah', 'Kh']}
                communityCards={communityCards}
                pot={0}
                timer={timer}
                questionNumber={1}
                totalQuestions={20}
                gameTitle="ICM FUNDAMENTALS"
                questionText="You Are On The Button (Last To Act). The Player To Your Right Bets 2.5 Big Blinds. What Is Your Best Move?"
                xp={1250}
                diamonds={500}
                onFold={() => console.log('FOLD')}
                onCall={() => console.log('CALL')}
                onRaise={() => console.log('RAISE')}
                onAllIn={() => console.log('ALL-IN')}
                onBack={() => window.history.back()}
            />

            {/* Demo controls */}
            <div style={{
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
            </div>
        </>
    );
}
