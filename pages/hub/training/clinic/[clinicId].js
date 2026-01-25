/**
 * 🏥 CLINIC PLAY PAGE — Remediation Drills
 * ═══════════════════════════════════════════════════════════════════════════
 * Runs specialized training clinics for leak remediation.
 * - Loads clinic configuration from TRAINING_CLINICS
 * - Uses same template/iframe as regular training
 * - Awards 2.5x XP multiplier for remediation mode
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { motion } from 'framer-motion';
import { getClinicById, getRemediationXPMultiplier } from '../../../../src/data/TRAINING_CLINICS';
import useTrainingProgress from '../../../../src/hooks/useTrainingProgress';
import feedback, { EFFECT_STYLES, screenEffects } from '../../../../src/engine/HapticsFeedback';
import { WorldNavHeader } from '../../../../src/components/navigation/WorldNavHeader';
import UniversalHeader from '../../../../src/components/ui/UniversalHeader';

// Constants
const TIME_PER_QUESTION = 21;
const QUESTIONS_PER_CLINIC = 10;

export default function ClinicPlayPage() {
    const router = useRouter();
    const { clinicId } = router.query;
    const { recordSession } = useTrainingProgress();
    const iframeRef = useRef(null);

    // State
    const [clinic, setClinic] = useState(null);
    const [loading, setLoading] = useState(true);
    const [questionIndex, setQuestionIndex] = useState(0);
    const [correctCount, setCorrectCount] = useState(0);
    const [timeLeft, setTimeLeft] = useState(TIME_PER_QUESTION);
    const [showResult, setShowResult] = useState(false);
    const [selectedAnswer, setSelectedAnswer] = useState(null);
    const [isComplete, setIsComplete] = useState(false);
    const [streak, setStreak] = useState(0);
    const [xpEarned, setXpEarned] = useState(0);

    const timerRef = useRef(null);
    const xpMultiplier = clinic ? getRemediationXPMultiplier(clinic.id) : 2.5;

    // Load clinic on mount
    useEffect(() => {
        if (!clinicId) return;

        const foundClinic = getClinicById(clinicId);
        if (foundClinic) {
            setClinic(foundClinic);
            setLoading(false);
            console.log(`[CLINIC] Loaded: ${foundClinic.name} (${xpMultiplier}x XP)`);
        } else {
            console.warn('[CLINIC] Not found:', clinicId);
            setLoading(false);
        }
    }, [clinicId, xpMultiplier]);

    // Timer
    useEffect(() => {
        if (showResult || isComplete || loading || !clinic) return;

        // Use clinic-specific time limit if available
        const timeLimit = clinic.timeLimit || TIME_PER_QUESTION;

        timerRef.current = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 0.1) {
                    handleAnswer(null);
                    return 0;
                }
                return prev - 0.1;
            });
        }, 100);

        return () => clearInterval(timerRef.current);
    }, [questionIndex, showResult, isComplete, loading, clinic]);

    // Handle answer
    const handleAnswer = useCallback((optionId) => {
        if (showResult) return;
        clearInterval(timerRef.current);
        feedback.tap();

        // For clinic mode, we need clinic-specific question generation
        // For now, simulate with random correct/incorrect
        const isCorrect = optionId && Math.random() > 0.3;

        setSelectedAnswer(optionId);
        setShowResult(true);

        if (isCorrect) {
            feedback.correct();
            setCorrectCount(prev => prev + 1);
            setStreak(prev => prev + 1);

            // Apply clinic XP multiplier
            const baseXP = 100;
            const earned = Math.round(baseXP * xpMultiplier);
            setXpEarned(prev => prev + earned);
        } else {
            feedback.incorrect();
            setStreak(0);
        }
    }, [showResult, xpMultiplier]);

    // Next question
    const handleNext = useCallback(() => {
        feedback.tap();

        if (questionIndex + 1 >= QUESTIONS_PER_CLINIC) {
            setIsComplete(true);
            const accuracy = Math.round((correctCount / QUESTIONS_PER_CLINIC) * 100);
            const passed = accuracy >= (clinic?.passThreshold || 85);

            if (passed) {
                feedback.levelUp();
                // Clear the leak after successful remediation
                try {
                    localStorage.removeItem('pokeriq_detected_leaks');
                } catch (e) { }
            }

            // Record with clinic ID
            recordSession(`clinic-${clinicId}`, {
                accuracy,
                score: correctCount,
                xpEarned,
                passed,
                level: 1,
                isRemediation: true,
            });
        } else {
            setQuestionIndex(prev => prev + 1);
            setShowResult(false);
            setSelectedAnswer(null);
            setTimeLeft(clinic?.timeLimit || TIME_PER_QUESTION);
        }
    }, [questionIndex, correctCount, xpEarned, clinicId, clinic, recordSession]);

    const handleExit = useCallback(() => {
        feedback.tap();
        router.push('/hub/training');
    }, [router]);

    // PostMessage handler for iframe
    useEffect(() => {
        function handleMessage(event) {
            if (!event.data || typeof event.data !== 'object') return;
            const { type, data } = event.data;

            switch (type) {
                case 'TEMPLATE_READY':
                    console.log('[CLINIC] Template ready');
                    sendClinicDataToIframe();
                    break;
                case 'ANSWER_SELECTED':
                    handleAnswer(data.answerId);
                    break;
                case 'NEXT_QUESTION':
                    handleNext();
                    break;
                case 'EXIT_GAME':
                    handleExit();
                    break;
            }
        }

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [handleAnswer, handleNext, handleExit]);

    // Send clinic data to iframe
    const sendClinicDataToIframe = useCallback(() => {
        if (!iframeRef.current?.contentWindow || !clinic) return;

        // Generate a clinic-specific question
        const question = {
            id: `clinic-q-${questionIndex}`,
            title: `${clinic.name} - Question ${questionIndex + 1}`,
            scenario: clinic.description,
            situation: `Remediation Drill - ${clinic.subtitle}`,
            heroCards: ['Ah', 'Kh'],
            board: [],
            potSize: 12,
            heroPosition: 'BTN',
            heroStack: 40,
            options: [
                { id: 'fold', text: 'FOLD', isCorrect: Math.random() > 0.7 },
                { id: 'call', text: 'CALL', isCorrect: Math.random() > 0.7 },
                { id: 'raise', text: 'RAISE', isCorrect: Math.random() > 0.5 },
                { id: 'all-in', text: 'ALL-IN', isCorrect: Math.random() > 0.8 },
            ],
            explanation: `${clinic.name}: ${clinic.description}`,
        };

        iframeRef.current.contentWindow.postMessage({
            type: 'GAME_DATA',
            data: {
                question,
                questionIndex,
                totalQuestions: QUESTIONS_PER_CLINIC,
                timeLimit: clinic.timeLimit || TIME_PER_QUESTION,
                gameName: `${clinic.icon} ${clinic.name}`,
                streak,
                xpEarned,
                showResult,
                selectedAnswer,
                isComplete,
                isRemediation: true,
                xpMultiplier,
            }
        }, '*');
    }, [clinic, questionIndex, streak, xpEarned, showResult, selectedAnswer, isComplete, xpMultiplier]);

    // Update iframe when state changes
    useEffect(() => {
        if (clinic && iframeRef.current?.contentWindow) {
            sendClinicDataToIframe();
        }
    }, [clinic, questionIndex, showResult, selectedAnswer, isComplete, sendClinicDataToIframe]);

    // Loading state
    if (loading || !clinic) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0a1628' }}>
                <motion.div
                    style={{ width: 50, height: 50, border: '4px solid rgba(255,255,255,0.1)', borderTopColor: '#FF6B35', borderRadius: '50%' }}
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                />
            </div>
        );
    }

    // Completion screen
    if (isComplete) {
        const accuracy = Math.round((correctCount / QUESTIONS_PER_CLINIC) * 100);
        const passed = accuracy >= (clinic.passThreshold || 85);

        return (
            <>
                <Head><title>{passed ? 'Leak Fixed!' : 'Keep Trying'}</title></Head>
                <style>{EFFECT_STYLES}</style>
                <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a1628', color: '#fff' }}>
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 80, marginBottom: 16 }}>{passed ? '🏆' : '🔄'}</div>
                        <h1 style={{ fontSize: 32, color: passed ? '#4CAF50' : '#fff' }}>
                            {passed ? 'LEAK FIXED!' : 'KEEP TRYING'}
                        </h1>
                        {passed && (
                            <div style={{
                                display: 'inline-block',
                                padding: '8px 16px',
                                background: 'linear-gradient(135deg, #FFD700, #FF6B35)',
                                borderRadius: 20,
                                marginBottom: 16
                            }}>
                                🏅 {clinic.badge}
                            </div>
                        )}
                        <div style={{ fontSize: 56, fontWeight: 800, color: passed ? '#4CAF50' : '#FF6B35' }}>{accuracy}%</div>
                        <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: 24 }}>
                            {correctCount}/{QUESTIONS_PER_CLINIC} • {xpEarned.toLocaleString()} XP ({xpMultiplier}x Bonus!)
                        </p>
                        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                            {!passed && (
                                <motion.button
                                    style={{ padding: '16px 32px', background: '#FF6B35', border: 'none', borderRadius: 12, color: '#fff', fontWeight: 700, cursor: 'pointer' }}
                                    onClick={() => {
                                        setQuestionIndex(0);
                                        setCorrectCount(0);
                                        setStreak(0);
                                        setXpEarned(0);
                                        setIsComplete(false);
                                        setShowResult(false);
                                        setTimeLeft(clinic.timeLimit || TIME_PER_QUESTION);
                                    }}
                                    whileHover={{ scale: 1.05 }}
                                >RETRY</motion.button>
                            )}
                            <motion.button
                                style={{ padding: '16px 32px', background: '#2563EB', border: 'none', borderRadius: 12, color: '#fff', fontWeight: 700, cursor: 'pointer' }}
                                onClick={handleExit}
                                whileHover={{ scale: 1.05 }}
                            >{passed ? 'CONTINUE' : 'BACK'}</motion.button>
                        </div>
                    </motion.div>
                </div>
            </>
        );
    }

    // Use iframe template for clinic
    return (
        <>
            <Head>
                <title>{clinic.name} — PokerIQ Clinic</title>
                <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
            </Head>
            <style>{`
                html, body { margin: 0; padding: 0; width: 100%; height: 100vh; overflow: hidden; }
            `}</style>
            {/* Standard Hub Header - DO NOT MODIFY */}
            <UniversalHeader pageDepth={2} />
            <iframe
                ref={iframeRef}
                src={`/templates/training_game_template.html?clinicId=${clinicId}&clinicName=${encodeURIComponent(clinic.name)}&v=clinic`}
                title={clinic.name}
                style={{ border: 'none', width: '100%', height: 'calc(100vh - 60px)', display: 'block' }}
                onLoad={() => {
                    console.log('[CLINIC] Template loaded');
                    setTimeout(sendClinicDataToIframe, 100);
                }}
            />
        </>
    );
}
