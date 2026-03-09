import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';

// Pseudo-MDF based bluff-catching scenarios
const SCENARIOS = [
    {
        id: 1,
        board: 'A♠ K♦ 7♣ 4♥ 2♠',
        heroHand: 'K♠ Q♠',
        villainAction: 'Bets $100 into $150 pot',
        potSize: 150,
        betSize: 100,
        description: 'Villain triple barrels. The board ran out dry. Do you call down with second pair top kicker?',
        optimal: 'FOLD',
        explanation: 'The bet is 66% pot. Your MDF (Minimum Defense Frequency) is 150/(150+100) = 60%. While you need to defend 60% of your range, KQs is near the bottom of your bluff-catchers vs a triple barrel. You have many better Ax hands.'
    },
    {
        id: 2,
        board: 'J♠ T♥ 8♦ 2♣ 2♥',
        heroHand: 'A♠ J♦',
        villainAction: 'Bets $200 into $100 pot',
        potSize: 100,
        betSize: 200,
        description: 'Villain overbets the river 2x pot after draws miss. You have top pair top kicker.',
        optimal: 'CALL',
        explanation: 'Overbet of 200% pot means you only need to defend 33% of your range (100/(100+200)). An overbet often depolarizes their range (nuts or nothing). Missing straight draws make this an excellent bluff-catcher.'
    },
    {
        id: 3,
        board: '6♠ 5♠ 4♥ K♦ A♣',
        heroHand: '7♠ 7♦',
        villainAction: 'Bets $50 into $100 pot',
        potSize: 100,
        betSize: 50,
        description: 'Villain bets half pot on the river. All draws got there or bricked. You hold third pair.',
        optimal: 'FOLD',
        explanation: 'MDF is 100/(100+50) = 67%. While you need to defend wide vs a small bet, 77 blocks busted straight draws (78s, 89) and loses to value hands like weak Ax/Kx that bet small. Pure fold.'
    }
];

export default function BluffCatcherTrainer() {
    const router = useRouter();
    useTrainingBus('bluff-catcher');

    const [currentScenarioIndex, setCurrentScenarioIndex] = useState(0);
    const [score, setScore] = useState(0);
    const [showFeedback, setShowFeedback] = useState(false);
    const [lastAnswer, setLastAnswer] = useState(null);
    const [streak, setStreak] = useState(0);

    const scenario = SCENARIOS[currentScenarioIndex];

    const handleAction = async (action) => {
        const isCorrect = action === scenario.optimal;
        setLastAnswer({
            action,
            isCorrect,
            explanation: scenario.explanation
        });
        setShowFeedback(true);

        if (isCorrect) {
            setScore(prev => prev + 10);
            setStreak(prev => prev + 1);
        } else {
            setStreak(0);
        }

        // Save session data
        try {
            await fetch('/api/training/save-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    gameId: 'bluff-catcher',
                    stats: {
                        score: isCorrect ? 10 : 0,
                        correct: isCorrect ? 1 : 0,
                        total_answered: 1,
                        streak: isCorrect ? streak + 1 : 0
                    }
                })
            });
        } catch (e) {
            console.error('Failed to save session:', e);
        }
    };

    const nextScenario = () => {
        setShowFeedback(false);
        setLastAnswer(null);
        setCurrentScenarioIndex((prev) => (prev + 1) % SCENARIOS.length);
    };

    // Calculate generic MDF
    const mdf = scenario ? ((scenario.potSize / (scenario.potSize + scenario.betSize || 1)) * 100).toFixed(0) : 0;
    const requiredEquity = scenario ? ((scenario.betSize / (scenario.potSize + scenario.betSize * 2 || 1)) * 100).toFixed(0) : 0;

    return (
        <PageTransition>
            <Head>
                <title>Bluff-Catching Trainer | Smarter.Poker</title>
            </Head>
            <UniversalHeader />

            <div style={styles.container}>
                <div style={styles.header}>
                    <button onClick={() => router.push('/hub/training')} style={styles.backButton}>← Hub</button>
                    <div>
                        <h1 style={styles.title}>BLUFF-CATCHER</h1>
                        <p style={styles.subtitle}>Minimum Defense Frequency & Hand Reading</p>
                    </div>
                    <div style={styles.statsPanel}>
                        <div style={styles.statBox}>
                            <div style={styles.statLabel}>SCORE</div>
                            <div style={styles.statValue}>{score}</div>
                        </div>
                        <div style={styles.statBox}>
                            <div style={styles.statLabel}>STREAK</div>
                            <div style={{ ...styles.statValue, color: '#f97316' }}>🔥 {streak}</div>
                        </div>
                    </div>
                </div>

                <div style={styles.boardArea}>
                    <div style={styles.infoBadge}>SCENARIO {currentScenarioIndex + 1}/{SCENARIOS.length}</div>

                    <div style={styles.scenarioDesc}>{scenario.description}</div>

                    <div style={styles.potInfo}>
                        <div style={styles.potValue}>Pot: ${scenario.potSize}</div>
                        <div style={styles.betValue}>Villain Bets: ${scenario.betSize}</div>
                    </div>

                    <div style={styles.cardsRow}>
                        <div style={styles.cardGroup}>
                            <div style={styles.cardGroupLabel}>BOARD</div>
                            <div style={styles.boardCards}>{scenario.board}</div>
                        </div>
                        <div style={styles.cardGroup}>
                            <div style={styles.cardGroupLabel}>HERO CARDS</div>
                            <div style={styles.heroCards}>{scenario.heroHand}</div>
                        </div>
                    </div>

                    <div style={styles.mathPanel}>
                        <div style={styles.mathItem}>
                            <span>Pot Odds (Req. Equity):</span>
                            <span style={{ color: '#00d4ff' }}>{requiredEquity}%</span>
                        </div>
                        <div style={styles.mathItem}>
                            <span>MDF (Min Defense Freq):</span>
                            <span style={{ color: '#4ade80' }}>{mdf}%</span>
                        </div>
                    </div>

                    {!showFeedback ? (
                        <div style={styles.actionsBox}>
                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => handleAction('CALL')}
                                style={{ ...styles.actionBtn, background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}
                            >
                                CALL
                            </motion.button>
                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => handleAction('FOLD')}
                                style={{ ...styles.actionBtn, background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}
                            >
                                FOLD
                            </motion.button>
                        </div>
                    ) : (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                            style={{ ...styles.feedbackBox, border: lastAnswer.isCorrect ? '2px solid #4ade80' : '2px solid #ef4444' }}
                        >
                            <h3 style={{ color: lastAnswer.isCorrect ? '#4ade80' : '#ef4444', margin: '0 0 8px 0', fontSize: 24, textTransform: 'uppercase', fontFamily: 'Orbitron, sans-serif' }}>
                                {lastAnswer.isCorrect ? 'CORRECT' : 'INCORRECT'}
                            </h3>
                            <p style={{ color: '#fff', fontSize: 16, marginBottom: 16 }}>
                                You chose to {lastAnswer.action}. Optimal GTO play is {scenario.optimal}.
                            </p>
                            <p style={{ color: '#94a3b8', fontSize: 14, lineHeight: 1.6, background: 'rgba(0,0,0,0.3)', padding: 16, borderRadius: 8 }}>
                                {lastAnswer.explanation}
                            </p>
                            <motion.button
                                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                                onClick={nextScenario}
                                style={styles.nextBtn}
                            >
                                NEXT SCENARIO ➔
                            </motion.button>
                        </motion.div>
                    )}
                </div>
            </div>
        </PageTransition>
    );
}

const styles = {
    container: {
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #05050A 0%, #0A0A15 100%)',
        padding: '24px 4vw 80px',
        color: '#fff',
        fontFamily: "'Inter', sans-serif"
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 32,
        paddingBottom: 24,
        borderBottom: '1px solid rgba(255,255,255,0.05)'
    },
    backButton: {
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        color: '#fff',
        padding: '8px 16px',
        borderRadius: 8,
        cursor: 'pointer',
        fontSize: 14,
        fontWeight: 600
    },
    title: {
        margin: '0 0 4px 0',
        fontSize: 28,
        fontWeight: 900,
        fontFamily: 'Orbitron, sans-serif',
        letterSpacing: 1,
        color: '#ef4444'
    },
    subtitle: {
        margin: 0,
        color: '#94a3b8',
        fontSize: 14
    },
    statsPanel: {
        display: 'flex',
        gap: 16
    },
    statBox: {
        background: 'rgba(255,255,255,0.05)',
        padding: '8px 16px',
        borderRadius: 12,
        textAlign: 'center'
    },
    statLabel: {
        fontSize: 10,
        color: '#94a3b8',
        fontWeight: 700,
        letterSpacing: 1
    },
    statValue: {
        fontSize: 20,
        fontWeight: 800,
        fontFamily: 'Orbitron, sans-serif',
        color: '#fff'
    },
    boardArea: {
        maxWidth: 800,
        margin: '0 auto',
        background: 'rgba(10, 15, 30, 0.6)',
        border: '1px solid rgba(0, 212, 255, 0.15)',
        borderRadius: 24,
        padding: 32,
        position: 'relative',
        boxShadow: '0 10px 40px rgba(0,0,0,0.5)'
    },
    infoBadge: {
        position: 'absolute',
        top: -12,
        left: '50%',
        transform: 'translateX(-50%)',
        background: '#00d4ff',
        color: '#000',
        padding: '4px 16px',
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 800,
        letterSpacing: 1
    },
    scenarioDesc: {
        fontSize: 18,
        textAlign: 'center',
        margin: '24px 0',
        lineHeight: 1.5,
        color: '#e2e8f0'
    },
    potInfo: {
        display: 'flex',
        justifyContent: 'center',
        gap: 24,
        marginBottom: 32,
        background: 'rgba(0,0,0,0.3)',
        padding: 16,
        borderRadius: 12
    },
    potValue: { fontSize: 20, fontWeight: 700, color: '#fbbf24' },
    betValue: { fontSize: 20, fontWeight: 700, color: '#ef4444' },
    cardsRow: {
        display: 'flex',
        justifyContent: 'space-between',
        gap: 24,
        marginBottom: 32
    },
    cardGroup: {
        flex: 1,
        background: 'rgba(255,255,255,0.03)',
        padding: 20,
        borderRadius: 16,
        textAlign: 'center',
        border: '1px solid rgba(255,255,255,0.05)'
    },
    cardGroupLabel: {
        fontSize: 11,
        color: '#94a3b8',
        fontWeight: 700,
        letterSpacing: 2,
        marginBottom: 12
    },
    boardCards: {
        fontSize: 32,
        letterSpacing: 4,
        color: '#fff'
    },
    heroCards: {
        fontSize: 32,
        letterSpacing: 4,
        color: '#00d4ff'
    },
    mathPanel: {
        display: 'flex',
        justifyContent: 'space-around',
        background: 'rgba(0, 212, 255, 0.05)',
        border: '1px solid rgba(0, 212, 255, 0.2)',
        padding: 16,
        borderRadius: 12,
        marginBottom: 32
    },
    mathItem: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        fontSize: 12,
        color: '#94a3b8',
        gap: 4,
        fontWeight: 600
    },
    actionsBox: {
        display: 'flex',
        gap: 16
    },
    actionBtn: {
        flex: 1,
        padding: '20px',
        borderRadius: 16,
        border: 'none',
        color: '#fff',
        fontSize: 20,
        fontWeight: 900,
        fontFamily: 'Orbitron, sans-serif',
        cursor: 'pointer',
        boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
        textShadow: '0 2px 4px rgba(0,0,0,0.3)'
    },
    feedbackBox: {
        background: 'rgba(0,0,0,0.4)',
        padding: 24,
        borderRadius: 16,
        textAlign: 'center'
    },
    nextBtn: {
        marginTop: 24,
        padding: '12px 32px',
        background: '#00d4ff',
        color: '#000',
        border: 'none',
        borderRadius: 12,
        fontSize: 16,
        fontWeight: 800,
        cursor: 'pointer',
        fontFamily: 'Orbitron, sans-serif'
    }
};
