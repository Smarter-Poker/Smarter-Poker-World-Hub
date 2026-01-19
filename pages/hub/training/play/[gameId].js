/**
 * 🎮 TRAINING PLAY PAGE — GOD MODE ARCHITECTURE
 * ═══════════════════════════════════════════════════════════════════════════
 * Loads quiz from god-mode-service and renders GodModeTrainingTable
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { supabase } from '../../../../src/lib/supabase';
import GodModeTrainingTable from '../../../../src/components/training/GodModeTrainingTable';
import { getGameById } from '../../../../src/data/TRAINING_LIBRARY';
import { getClinicIdForGame } from '../../../../src/data/GAME_TO_CLINIC_MAP';
import { TRAINING_CLINICS } from '../../../../src/data/TRAINING_CLINICS';

export default function TrainingPlayPage() {
    const router = useRouter();
    const { gameId } = router.query;

    const [questions, setQuestions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [currentLevel, setCurrentLevel] = useState(1);
    const [userId, setUserId] = useState(null);

    // Get game metadata
    const game = gameId ? getGameById(gameId) : null;
    const gameName = game?.name || 'Training';
    const clinicId = gameId ? (getClinicIdForGame(gameId) || 'clinic-01') : null;

    // Get clinic data
    const clinic = clinicId ? TRAINING_CLINICS.find(c => c.id === clinicId) : null;
    const levelData = clinic?.levels?.[currentLevel - 1];
    const levelName = levelData?.name || clinic?.title || gameName;

    // Load user session
    useEffect(() => {
        const getUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                setUserId(user.id);
            }
        };
        getUser();
    }, []);

    // Load questions when game and user are ready
    useEffect(() => {
        if (!gameId || !clinicId) return;

        const loadQuestions = async () => {
            setLoading(true);
            setError(null);

            try {
                // First try: Load from god-mode-service (solved_spots_gold)
                // For now, fall back to clinic questions

                if (levelData?.questions) {
                    // Transform clinic questions to god-mode format
                    const transformedQuestions = levelData.questions.map((q, i) => ({
                        id: q.id || `q${i}`,
                        question_number: i + 1,
                        board_cards: [],
                        street: 'Preflop',
                        stack_depth: q.stackDepth || 100,
                        topology: 'HU',
                        hero_cards: q.heroCards || ['As', 'Kh'],
                        villain_action: q.villainAction || '',
                        correct_action: q.correctAction,
                        explanation: q.explanation || '',
                        lawId: q.lawId,
                        position: q.position || 'BTN',
                        // Strategy matrix (simplified for preflop)
                        strategy_matrix: {
                            [q.heroCards?.join('') || 'AsKh']: {
                                best_action: q.correctAction,
                                max_ev: 1.0,
                                ev_loss: 0,
                                actions: {
                                    Fold: { ev: q.correctAction === 'fold' ? 1.0 : 0.2, freq: q.correctAction === 'fold' ? 1.0 : 0, ev_loss: q.correctAction === 'fold' ? 0 : 0.8 },
                                    Call: { ev: q.correctAction === 'call' ? 1.0 : 0.5, freq: q.correctAction === 'call' ? 1.0 : 0.3, ev_loss: q.correctAction === 'call' ? 0 : 0.5 },
                                    Raise: { ev: q.correctAction === 'raise' ? 1.0 : 0.6, freq: q.correctAction === 'raise' ? 1.0 : 0.2, ev_loss: q.correctAction === 'raise' ? 0 : 0.4 }
                                },
                                is_mixed: false
                            }
                        },
                        macro_metrics: {
                            pot_size: 3.5,
                            spr: 10
                        }
                    }));

                    setQuestions(transformedQuestions);
                    console.log(`✅ Loaded ${transformedQuestions.length} questions for ${levelName}`);
                } else {
                    setError('No questions found for this level');
                }

            } catch (err) {
                console.error('Error loading questions:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        loadQuestions();
    }, [gameId, clinicId, currentLevel]);

    // Handle level completion
    const handleLevelComplete = (results) => {
        console.log('Level complete:', results);

        // Check if passed (85%+)
        const accuracy = (results.score / results.total) * 100;
        if (accuracy >= 85 && clinic?.levels && currentLevel < clinic.levels.length) {
            // Could unlock next level here
        }
    };

    // Loading state
    if (!router.isReady || loading) {
        return (
            <>
                <Head>
                    <title>Loading... — PokerIQ Training</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
                </Head>
                <div style={{
                    minHeight: '100vh',
                    background: 'linear-gradient(to bottom, #0a0a15, #1a1a2e)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#00d4ff'
                }}>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 48, marginBottom: 16 }}>🎮</div>
                        <div style={{ fontSize: 18, fontWeight: 600 }}>Loading {gameName}...</div>
                        <div style={{ fontSize: 14, color: '#64748b', marginTop: 8 }}>
                            Preparing Level {currentLevel}
                        </div>
                    </div>
                </div>
            </>
        );
    }

    // Error state
    if (error) {
        return (
            <>
                <Head>
                    <title>Error — PokerIQ Training</title>
                </Head>
                <div style={{
                    minHeight: '100vh',
                    background: '#0a1628',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ef4444'
                }}>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
                        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
                            Failed to load quiz
                        </div>
                        <div style={{ fontSize: 14, color: '#94a3b8', marginBottom: 24 }}>
                            {error}
                        </div>
                        <button
                            onClick={() => router.push('/hub/training')}
                            style={{
                                padding: '12px 24px',
                                background: '#2563eb',
                                border: 'none',
                                borderRadius: 8,
                                color: '#fff',
                                cursor: 'pointer'
                            }}
                        >
                            Return to Training Hub
                        </button>
                    </div>
                </div>
            </>
        );
    }

    return (
        <>
            <Head>
                <title>{gameName} — PokerIQ Training</title>
                <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
            </Head>

            <GodModeTrainingTable
                questions={questions}
                levelName={levelName}
                onLevelComplete={handleLevelComplete}
            />
        </>
    );
}
