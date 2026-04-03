/**
 * 🎰 USE MILLIONAIRE GAME — GTO Wizard-Style Training Flow Controller
 * ═══════════════════════════════════════════════════════════════════════════
 * Manages the training game with GTOW scoring integration:
 * - Fetches questions via API (PIO/CHART/SCENARIO engines)
 * - Tracks answers and enforces no-repeat logic
 * - Calculates GTOW Score, EV loss, and 5-tier move classification
 * - Exposes scoring metrics for GTO Wizard-style feedback UI
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { getAuthUser, getSessionToken } from '../lib/authUtils';
import TRAINING_CONFIG, { checkLevelPassed, getRequiredCorrect } from '../config/trainingConfig';
import useGTOWScore, { simulateGTOFrequencies, classifyMove } from './useGTOWScore';
import { eventBus } from '../engine/EventBus';
import { trainingSounds } from '../utils/trainingSounds';

const QUESTIONS_PER_LEVEL = TRAINING_CONFIG.questionsPerLevel; // 25 questions per level

export default function useGTOTrainer(gameId, engineType = 'PIO', initialLevel = 1, trainerConfig = null) {
    // If custom trainer config provided, use its questions count
    const baseQuestionsPerLevel = trainerConfig?.questionsCount || QUESTIONS_PER_LEVEL;
    const [effectiveQuestionsPerLevel, setEffectiveQuestionsPerLevel] = useState(baseQuestionsPerLevel);
    // Game state
    const [currentQuestion, setCurrentQuestion] = useState(null);
    const [questionNumber, setQuestionNumber] = useState(1);
    const [level, setLevel] = useState(initialLevel);
    const [loading, setLoading] = useState(true); // Start true until pre-load completes
    const [error, setError] = useState(null);

    // 🚀 PRE-LOADED QUESTIONS - All 25 fetched at once
    const [preloadedQuestions, setPreloadedQuestions] = useState([]);
    const [preloadComplete, setPreloadComplete] = useState(false);

    // Score tracking
    const [correctCount, setCorrectCount] = useState(0);
    const [streak, setStreak] = useState(0);
    const [bestStreak, setBestStreak] = useState(0);
    const [totalXP, setTotalXP] = useState(0);

    // Feedback state
    const [showFeedback, setShowFeedback] = useState(false);
    const [feedbackResult, setFeedbackResult] = useState(null); // 'correct' | 'wrong'
    const [explanation, setExplanation] = useState('');

    // Game completion state
    const [gameComplete, setGameComplete] = useState(false);
    const [levelPassed, setLevelPassed] = useState(false);

    // GTOW scoring integration
    const gtowScoring = useGTOWScore();
    const [lastMoveClassification, setLastMoveClassification] = useState(null);
    const [lastEVLoss, setLastEVLoss] = useState(0);
    const [lastGTOFrequencies, setLastGTOFrequencies] = useState(null);

    // ═══ MULTI-STREET STATE ═══
    const [currentStreet, setCurrentStreet] = useState('flop');
    const [isMultiStreetActive, setIsMultiStreetActive] = useState(false);
    const [handSummary, setHandSummary] = useState(null);
    const [lastSelectedAction, setLastSelectedAction] = useState(null);
    const multiStreetHandRef = useRef(null);

    // ═══ MISTAKE REPLAY STATE ═══
    const mistakeQuestionsRef = useRef([]);

    // ═══ ADAPTIVE DIFFICULTY STATE ═══
    const [adaptiveLevelChange, setAdaptiveLevelChange] = useState(null); // { from, to, direction }
    const adaptiveCheckpointRef = useRef(5); // Check every 5 questions

    // ═══ PHASE 14: NEXT-LEVEL PREFETCH STATE ═══
    const nextLevelCacheRef = useRef(null); // { level, questions } — prefetched next level
    const prefetchTriggeredRef = useRef(false);

    // Get user ID for no-repeat tracking
    const userId = getAuthUser()?.id;

    /**
     * ═══ PHASE 14: Background prefetch for next level ═══
     * Fires when player is ~60% through current level
     * Ensures zero loading time when advancing to next level
     */
    const prefetchNextLevel = useCallback(async () => {
        if (prefetchTriggeredRef.current) return;
        if (level >= 10) return; // Max level, nothing to prefetch
        if (trainerConfig) return; // Custom trainers don't auto-advance

        prefetchTriggeredRef.current = true;
        const nextLevel = level + 1;

        try {
            const token = getSessionToken();
            const params = new URLSearchParams({
                gameId,
                level: nextLevel.toString(),
                count: effectiveQuestionsPerLevel.toString(),
            });

            const response = await fetch(`/api/training/batch-preload?${params}`, {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {},
            });

            const textResponse = await response.text();
            const data = JSON.parse(textResponse);

            if (response.ok && data.questions && data.questions.length > 0) {
                nextLevelCacheRef.current = { level: nextLevel, questions: data.questions };
                console.log(`[GTOTrainer] 🚀 Prefetched ${data.questions.length} questions for level ${nextLevel}`);
            }
        } catch (err) {
            // Non-critical — player will just wait for normal fetch
            console.warn('[GTOTrainer] Prefetch non-critical error:', err.message);
        }
    }, [gameId, level, effectiveQuestionsPerLevel, trainerConfig]);

    /**
     * FALLBACK: Fetch single question via deterministic batch-preload (count=1)
     * Eliminates all Grok AI dependency — pure solver data only
     */
    const fetchSingleQuestion = useCallback(async () => {
        if (!gameId) return;

        setLoading(true);
        setError(null);
        setShowFeedback(false);

        try {
            const params = new URLSearchParams({
                gameId,
                level: level.toString(),
                count: '1',
            });

            const token = getSessionToken();
            const response = await fetch(`/api/training/batch-preload?${params}`, {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {},
            });

            // Safe JSON parsing
            let data;
            const textResponse = await response.text();
            try {
                data = JSON.parse(textResponse);
            } catch (e) {
                if (response.status === 401) throw new Error('Auth required');
                throw new Error(`Server error (${response.status})`);
            }

            if (!response.ok || !data.questions || data.questions.length === 0) {
                throw new Error(data.error || 'No solver data available');
            }

            setCurrentQuestion(data.questions[0]);
        } catch (err) {
            console.error('[GTOTrainer] Fetch error:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [gameId, level]);

    /**
     * 🚀 BATCH PRE-LOAD ALL QUESTIONS AT ONCE
     * Fetches all 25 questions when game starts
     * No more individual loading - instant question serving
     */
    const preloadAllQuestions = useCallback(async () => {
        if (!gameId) return;

        setLoading(true);
        setError(null);

        try {
            const token = getSessionToken();
            let apiUrl;
            let params;

            if (trainerConfig) {
                // CUSTOM TRAINER MODE — use custom-train API with detailed config
                params = new URLSearchParams({
                    gameType: trainerConfig.gameType || 'cash',
                    stackDepth: (trainerConfig.stackDepth || 100).toString(),
                    count: (trainerConfig.questionsCount || effectiveQuestionsPerLevel).toString(),
                });
                if (trainerConfig.position && trainerConfig.position !== 'any') {
                    params.set('position', trainerConfig.position);
                }
                if (trainerConfig.villainPosition) {
                    params.set('villainPosition', trainerConfig.villainPosition);
                }
                if (trainerConfig.actionScenario) {
                    params.set('actionScenario', trainerConfig.actionScenario);
                }
                if (trainerConfig.street) {
                    params.set('street', trainerConfig.street);
                }
                if (trainerConfig.handClass) {
                    params.set('handClass', trainerConfig.handClass);
                }
                apiUrl = `/api/training/custom-train?${params}`;
                console.log(`[GTOTrainer] Custom trainer: ${trainerConfig.label || 'custom config'}`);
            } else {
                // STANDARD MODE — use batch-preload
                params = new URLSearchParams({
                    gameId,
                    level: level.toString(),
                    count: effectiveQuestionsPerLevel.toString(),
                });

                // ═══ PHASE 15: Pass weak-spot targeting hints if available ═══
                const weakSpots = getWeakSpots();
                if (weakSpots.length > 0) {
                    // Extract the weakest positions and streets
                    const weakPositions = [...new Set(weakSpots.map(s => s.position))].slice(0, 3);
                    if (weakPositions.length > 0) {
                        params.set('targetPositions', weakPositions.join(','));
                    }
                    // If the top weak spot has a clear street pattern, target that
                    if (weakSpots[0].street && weakSpots[0].mistakeRate >= 0.5) {
                        params.set('targetStreet', weakSpots[0].street);
                    }
                    console.log(`[GTOTrainer] 🎯 Targeting weak spots: positions=${weakPositions.join(',')} street=${weakSpots[0].street || 'any'}`);
                }

                // ═══ PHASE 19: Pass difficulty hint if set in localStorage ═══
                if (typeof window !== 'undefined') {
                    const diff = localStorage.getItem('gma_difficulty');
                    if (diff && diff !== 'standard') params.set('difficulty', diff);
                }

                apiUrl = `/api/training/batch-preload?${params}`;
                console.log(`[GTOTrainer] Pre-loading ${effectiveQuestionsPerLevel} questions for ${gameId} level ${level}`);
            }

            const response = await fetch(apiUrl, {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {},
            });

            // Safe JSON parsing to prevent Unexpected Token '<' HTML crash
            let data;
            const textResponse = await response.text();
            try {
                data = JSON.parse(textResponse);
            } catch (e) {
                console.error('[GTOTrainer] Non-JSON response:', textResponse.substring(0, 100));
                if (response.status === 401) throw new Error('Auth required');
                throw new Error(`Server error (${response.status})`);
            }

            if (!response.ok || !data.questions || data.questions.length === 0) {
                console.warn('[GTOTrainer] Pre-load failed, using single-question mode');
                setPreloadComplete(false);
                setLoading(false);
                return fetchSingleQuestion();
            }

            console.log(`[GTOTrainer] ✅ Pre-loaded ${data.questions.length} questions`);

            setPreloadedQuestions(data.questions);
            setPreloadComplete(true);
            setCurrentQuestion(data.questions[0]);

            // Bug 5 fix: Cap question count at actual returned count to prevent game never ending
            if (data.questions.length < effectiveQuestionsPerLevel) {
                console.warn(`[GTOTrainer] API returned ${data.questions.length}/${effectiveQuestionsPerLevel} questions, capping`);
                setEffectiveQuestionsPerLevel(data.questions.length);
            }

            setLoading(false);

        } catch (err) {
            console.error('[GTOTrainer] Pre-load error:', err);
            setPreloadComplete(false);
            setLoading(false);
            return fetchSingleQuestion();
        }
    }, [gameId, level, trainerConfig, effectiveQuestionsPerLevel, fetchSingleQuestion]);


    // ═══ PHASE 14: WEAK-SPOT ANALYSIS STATE ═══
    // Tracks per-position, per-street, per-spotType accuracy for smart targeting
    const weakSpotMapRef = useRef({});

    /**
     * Derive the spot type from scenario context
     * e.g., 'facing_cbet', 'open_raise', '3bet_defense', 'check_raise', etc.
     */
    const deriveSpotType = useCallback((scenario) => {
        if (!scenario) return 'unknown';
        const ctx = (scenario.context || '').toLowerCase();
        const title = (scenario.title || '').toLowerCase();
        const combined = ctx + ' ' + title;

        if (combined.includes('3-bet') || combined.includes('3bet')) return '3bet_defense';
        if (combined.includes('4-bet') || combined.includes('4bet')) return '4bet_pot';
        if (combined.includes('c-bet') || combined.includes('cbet') || combined.includes('continuation')) return 'facing_cbet';
        if (combined.includes('check-raise') || combined.includes('checkraise') || combined.includes('check raise')) return 'check_raise';
        if (combined.includes('donk')) return 'donk_bet';
        if (combined.includes('squeeze')) return 'squeeze';
        if (combined.includes('open') || combined.includes('raise first')) return 'open_raise';
        if (combined.includes('blind') && combined.includes('defend')) return 'blind_defense';
        // Infer from position
        const hero = scenario.heroPosition || '';
        if (hero === 'BB') return 'bb_defense';
        if (hero === 'SB') return 'sb_play';
        if (hero === 'BTN') return 'btn_play';
        return 'general';
    }, []);

    /**
     * Update weak-spot map with a new data point
     */
    const updateWeakSpotMap = useCallback((position, street, spotType, classification) => {
        const map = weakSpotMapRef.current;
        const key = `${position}_${street}_${spotType}`;
        if (!map[key]) {
            map[key] = { total: 0, mistakes: 0, position, street, spotType };
        }
        map[key].total++;
        if (['INACCURACY', 'WRONG', 'BLUNDER'].includes(classification)) {
            map[key].mistakes++;
        }
    }, []);

    /**
     * Get the player's weakest spots (sorted by mistake rate, min 3 samples)
     */
    const getWeakSpots = useCallback(() => {
        const map = weakSpotMapRef.current;
        return Object.values(map)
            .filter(s => s.total >= 3) // Need min sample
            .map(s => ({ ...s, mistakeRate: s.mistakes / s.total }))
            .sort((a, b) => b.mistakeRate - a.mistakeRate)
            .slice(0, 5); // Top 5 weak spots
    }, []);

    /**
     * Record answer to API (for no-repeat tracking + weak-spot metadata)
     */
    const recordAnswer = useCallback(async (questionId, selectedAnswer, isCorrect, spotMeta = {}) => {
        if (!userId || !gameId) return;

        try {
            const token = getSessionToken();
            await fetch('/api/training/record-question', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    userId,
                    gameId,
                    questionId,
                    selectedAnswer,
                    isCorrect,
                    level,
                    // ═══ PHASE 14: Spot metadata for weak-spot targeting ═══
                    heroPosition: spotMeta.heroPosition || null,
                    villainPosition: spotMeta.villainPosition || null,
                    street: spotMeta.street || null,
                    classification: spotMeta.classification || null,
                    evLoss: spotMeta.evLoss || 0,
                    spotType: spotMeta.spotType || null,
                }),
            });
        } catch (err) {
            // Non-blocking - continue even if recording fails
            console.warn('[GTOTrainer] Record error:', err);
        }
    }, [userId, gameId, level]);

    /**
     * Submit answer and show feedback
     */
    const submitAnswer = useCallback(async (selectedOptionId) => {
        if (!currentQuestion || showFeedback) return;

        const isCorrect = selectedOptionId === currentQuestion.correctAnswer;
        const correctAnswer = currentQuestion.correctAnswer;
        const options = currentQuestion.options || [];
        const scenario = currentQuestion.scenario || {};

        // ═══ PREFER REAL PIO DATA, FALL BACK TO SIMULATED ═══
        const hasPIOData = currentQuestion.gtoFrequencies && Object.keys(currentQuestion.gtoFrequencies).length > 0;
        const frequencies = hasPIOData
            ? currentQuestion.gtoFrequencies  // Real PIO solver frequencies (0-100%)
            : simulateGTOFrequencies(options, correctAnswer, level);

        // Classify the move — pass real PIO data for accurate EV loss when available
        const moveResult = classifyMove(
            selectedOptionId,
            correctAnswer,
            frequencies,
            level,
            hasPIOData ? currentQuestion.evData : null,        // Real EV data (or null)
            hasPIOData ? currentQuestion.rawFrequencies : null, // Full PIO frequency matrix
            currentQuestion.heroHand || scenario.heroHand,      // Hero hand for EV lookup
            scenario.pot                                        // Pot size for scaling
        );

        // Store for UI consumption
        setLastMoveClassification(moveResult.classification);
        setLastEVLoss(moveResult.evLoss);
        setLastGTOFrequencies(frequencies);

        // Record to GTOW scoring engine
        const selectedText = options.find(o => o.id === selectedOptionId)?.text || selectedOptionId;
        const correctText = options.find(o => o.id === correctAnswer)?.text || correctAnswer;
        gtowScoring.recordMove({
            classification: moveResult.classification,
            evLoss: moveResult.evLoss,
            frequencyDiff: moveResult.frequencyDiff,
            isRealData: moveResult.isRealData || false,
            handData: {
                heroCards: currentQuestion.heroCards || scenario.heroHand,
                board: scenario.board,
                heroPosition: scenario.heroPosition || scenario.position,
                pot: scenario.pot,
                action: selectedText,
                correctAction: correctText,
                question: currentQuestion.question || currentQuestion.text,
                source: currentQuestion.source || 'UNKNOWN',
                gtoFrequencies: frequencies || {},
                // ═══ PHASE 20: Raw solver matrix for RangeGrid display ═══
                rawFrequencies: currentQuestion.rawFrequencies || null,
                heroHand: currentQuestion.heroHand || scenario.heroHand || null,
                street: scenario.street || null,
                scenarioHash: scenario.scenarioHash || null,
                // ═══ PHASE 21: EV data for RangeGrid EV overlay ═══
                evData: currentQuestion.evData || null,
            },
        });

        // Save full question for mistake replay
        const isMistakeMove = [
            'INACCURACY', 'WRONG', 'BLUNDER',
        ].includes(moveResult.classification);
        if (isMistakeMove) {
            mistakeQuestionsRef.current.push({ ...currentQuestion });
        }

        // Update legacy scores
        let currentStreakCount = prevStreak => prevStreak; // fallback
        if (isCorrect) {
            setCorrectCount(prev => prev + 1);
            setStreak(prev => {
                const newStreak = prev + 1;
                if (newStreak > bestStreak) setBestStreak(newStreak);
                if (newStreak % 5 === 0) trainingSounds.play('streak'); // Streak milestone
                return newStreak;
            });
        } else {
            setStreak(0);
        }

        // Audio Feedback for Move Quality
        const cls = moveResult.classification;
        if (cls === 'blunder' || cls === 'wrong' || cls === 'inaccuracy') {
            trainingSounds.play('incorrect');
        } else {
            trainingSounds.play('correct');
        }

        // Show feedback
        setFeedbackResult(isCorrect ? 'correct' : 'wrong');
        setExplanation(currentQuestion.explanation || '');
        setShowFeedback(true);

        // Store the selected action for multi-street advance
        setLastSelectedAction(selectedOptionId);

        // ═══ ADAPTIVE DIFFICULTY: Auto-adjust level every 5 questions ═══
        // Also identifies weak spots and emits them for targeted practice
        const answeredSoFar = questionNumber; // 1-based, this is the Nth answer
        if (answeredSoFar >= adaptiveCheckpointRef.current && answeredSoFar < effectiveQuestionsPerLevel) {
            const windowSize = 5;
            const recentHistory = gtowScoring.handHistory.slice(-windowSize);
            const recentCorrect = recentHistory.filter(h => h.classification === 'best' || h.classification === 'correct').length;
            const recentAccuracy = (recentCorrect / windowSize) * 100;

            if (recentAccuracy >= 90 && level < 10) {
                // Player is crushing it → increase difficulty
                const newLevel = Math.min(10, level + 1);
                setLevel(newLevel);
                setAdaptiveLevelChange({ from: level, to: newLevel, direction: 'up' });
                try {
                    eventBus.emit('adaptiveDifficultyChange', { from: level, to: newLevel, direction: 'up' });
                } catch (_) { /* SSR guard */ }
                console.log(`[GTOTrainer] 📈 Adaptive: Level ${level} → ${newLevel} (accuracy ${recentAccuracy}%)`);
            } else if (recentAccuracy < 50 && level > 1) {
                // Player struggling → decrease difficulty
                const newLevel = Math.max(1, level - 1);
                setLevel(newLevel);
                setAdaptiveLevelChange({ from: level, to: newLevel, direction: 'down' });
                try {
                    eventBus.emit('adaptiveDifficultyChange', { from: level, to: newLevel, direction: 'down' });
                } catch (_) { /* SSR guard */ }
                console.log(`[GTOTrainer] 📉 Adaptive: Level ${level} → ${newLevel} (accuracy ${recentAccuracy}%)`);
            }

            // ═══ PHASE 14: Emit weak-spot analysis for UI consumption ═══
            const weakSpots = getWeakSpots();
            if (weakSpots.length > 0) {
                try {
                    eventBus.emit('weakSpotAnalysis', {
                        weakSpots,
                        topWeakSpot: weakSpots[0],
                        checkpoint: answeredSoFar,
                    });
                } catch (_) { /* SSR guard */ }
                console.log(`[GTOTrainer] 🎯 Weak spots detected:`, weakSpots.map(s => `${s.position}/${s.street}/${s.spotType} (${Math.round(s.mistakeRate * 100)}%)`).join(', '));
            }

            adaptiveCheckpointRef.current = answeredSoFar + 5; // Next checkpoint
        }

        // ═══ MULTI-STREET: Record action on current hand ═══
        if (multiStreetHandRef.current && !multiStreetHandRef.current.isComplete) {
            multiStreetHandRef.current.recordAction(
                selectedOptionId,
                moveResult.classification,
                moveResult.evLoss
            );
        }

        // ═══ PHASE 14: Trigger background prefetch at 60% through level ═══
        const progress = questionNumber / effectiveQuestionsPerLevel;
        if (progress >= 0.6 && !prefetchTriggeredRef.current) {
            prefetchNextLevel();
        }

        // ═══ PHASE 14: Track weak spots + record with spot metadata ═══
        const spotType = deriveSpotType(scenario);
        const heroPos = scenario.heroPosition || 'BTN';
        const streetName = scenario.street || 'flop';
        updateWeakSpotMap(heroPos, streetName, spotType, moveResult.classification);

        // Record to backend (async, non-blocking) — now with spot metadata
        recordAnswer(currentQuestion.id, selectedOptionId, isCorrect, {
            heroPosition: heroPos,
            villainPosition: scenario.villainPosition || 'BB',
            street: streetName,
            classification: moveResult.classification,
            evLoss: moveResult.evLoss,
            spotType,
        });
    }, [currentQuestion, showFeedback, bestStreak, recordAnswer, level, gtowScoring, questionNumber, effectiveQuestionsPerLevel, deriveSpotType, updateWeakSpotMap]);

    /**
     * ═══ MULTI-STREET: Advance to next street within same hand ═══
     * Called by nextQuestion() when multi-street hand is active.
     * Queries API for next-street solver data.
     */
    const advanceToNextStreet = useCallback(async () => {
        const hand = multiStreetHandRef.current;
        if (!hand || hand.isComplete) return false;

        try {
            setLoading(true);

            // Call API endpoint to get next-street question
            const token = getSessionToken();
            const params = new URLSearchParams({
                gameId,
                heroHand: hand.heroHand,
                boardCards: hand.boardCards.join(','),
                street: hand.nextStreetName,
                pot: Math.round(hand.pot).toString(),
                stackDepth: hand.stackDepth.toString(),
            });

            const response = await fetch(`/api/training/next-street?${params}`, {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {},
            });

            if (response.ok) {
                const data = await response.json();
                if (data.question) {
                    // Update MultiStreetHand state with the new card from API
                    const advancingToStreet = hand.nextStreetName; // 'turn' or 'river'
                    const newCard = data.newCard;
                    if (newCard) {
                        hand.boardCards.push(newCard);
                        hand.deadCards.add(newCard.toLowerCase());
                    }
                    hand.streetIndex++;
                    hand.currentStreet = advancingToStreet || data.street || 'done';

                    // Track street data in MultiStreetHand
                    hand.streetData.push({
                        street: data.street || hand.currentStreet,
                        boardCards: [...hand.boardCards],
                        pot: hand.pot,
                        newCard: newCard,
                    });

                    // Enrich question with multi-street context
                    const nextQ = data.question;
                    nextQ.scenario = {
                        ...nextQ.scenario,
                        isMultiStreet: true,
                        streetNumber: hand.streetData.length,
                        previousActions: hand.streetActions,
                        pot: Math.round(hand.pot),
                        board: hand.boardCards.join(' '),
                        street: data.street || hand.currentStreet,
                        heroPosition: hand.heroPosition,
                        villainPosition: hand.villainPosition,
                        heroHand: hand.heroHand,
                    };
                    nextQ.heroCards = hand.heroCards;
                    nextQ.heroHand = hand.heroHand;
                    hand.currentQuestion = nextQ;

                    setCurrentQuestion(nextQ);
                    setCurrentStreet(data.street || hand.currentStreet);
                    setShowFeedback(false);
                    setLoading(false);
                    return true;
                }
            }

            // Next street failed — end the hand
            setIsMultiStreetActive(false);
            setHandSummary(hand.getHandSummary());
            multiStreetHandRef.current = null;
            setLoading(false);
            return false;

        } catch (err) {
            console.warn('[GTOTrainer] Multi-street advance error:', err);
            setIsMultiStreetActive(false);
            multiStreetHandRef.current = null;
            setLoading(false);
            return false;
        }
    }, [gameId]);

    /**
     * ═══ PHASE 14: Save mistakes to spaced repetition system ═══
     * Called on session complete. Sends mistake hand signatures to the SR API.
     */
    const saveMistakesToSpacedRepetition = useCallback(async () => {
        const mistakes = mistakeQuestionsRef.current;
        if (!mistakes || mistakes.length === 0) return;

        try {
            const token = getSessionToken();
            if (!token) return;

            const mistakePayloads = mistakes.map(q => {
                const scenario = q.scenario || {};
                return {
                    gameId,
                    heroPosition: scenario.heroPosition || 'BTN',
                    villainPosition: scenario.villainPosition || 'BB',
                    street: scenario.street || 'flop',
                    spotType: deriveSpotType(scenario),
                    classification: 'WRONG', // All items in mistakeQuestionsRef are mistakes
                    evLoss: 0,
                    heroHand: q.heroCards ? q.heroCards.join('') : (scenario.heroHand || ''),
                    board: q.boardCards ? q.boardCards.join(' ') : (scenario.board || ''),
                    correctAction: q.correctAnswerText || q.correctAnswer || '',
                    chosenAction: '',
                };
            });

            await fetch('/api/training/spaced-repetition', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ mistakes: mistakePayloads }),
            });

            console.log(`[GTOTrainer] 🔄 Saved ${mistakePayloads.length} mistakes to spaced repetition`);
        } catch (err) {
            console.warn('[GTOTrainer] Spaced repetition save error (non-critical):', err.message);
        }
    }, [gameId, deriveSpotType]);

    /**
     * Save progress to database
     */
    const saveProgress = useCallback(async (passed, accuracy) => {
        if (!userId || !gameId) return;

        try {
            const token = getSessionToken();
            const headers = {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            };

            // Save basic progress (training_progress + training_level_history)
            // Calculate diamond rewards based on performance
            const diamondsForPassing = passed ? 5 : 0;
            const accuracyBonus = accuracy >= 100 ? 10 : accuracy >= 90 ? 5 : accuracy >= 80 ? 3 : 0;
            const levelMultiplier = Math.ceil(level / 3); // Levels 1-3 = 1x, 4-6 = 2x, 7-9 = 3x, 10 = 4x
            const diamondsEarned = (diamondsForPassing + accuracyBonus) * levelMultiplier;

            await fetch('/api/training/save-progress', {
                method: 'POST', headers,
                body: JSON.stringify({
                    userId, gameId, level,
                    questionsAnswered: effectiveQuestionsPerLevel,
                    questionsCorrect: correctCount,
                    accuracy, passed,
                    streak: bestStreak,
                    xpEarned: totalXP,
                    diamondsEarned,
                    timeSpentSeconds: 0,
                }),
            });

            // ═══ PHASE 14: Save mistakes to spaced repetition ═══
            saveMistakesToSpacedRepetition();

            // NOTE: save-session is handled by GodModeArena's auto-save useEffect
            // to avoid duplicate training_sessions rows.

            // Emit progress-saved event so useTrainingProgress can re-hydrate
            try {
                eventBus.emit('training:session-saved', {
                    gameId: gameId,
                    gtowScore: gtowScoring.gtowScore,
                    handsPlayed: gtowScoring.handsPlayed
                }, 'useGTOTrainer');
            } catch (busErr) {
                console.warn('[GTOTrainer] Bus emit failed (non-critical):', busErr.message);
            }

        } catch (err) {
            console.warn('[GTOTrainer] Save progress error:', err);
        }
    }, [userId, gameId, level, correctCount, bestStreak, totalXP, gtowScoring, effectiveQuestionsPerLevel, saveMistakesToSpacedRepetition]);

    /**
     * Advance to next question or complete level
     * 🚀 MULTI-STREET: First tries to advance the street within same hand
     * If no next street → advance to next hand from pre-loaded array
     */
    const nextQuestion = useCallback(async () => {
        setShowFeedback(false);

        // ═══ MULTI-STREET: Try advancing street first ═══
        if (isMultiStreetActive && multiStreetHandRef.current && !multiStreetHandRef.current.isComplete) {
            // Hero didn't fold — try to advance to next street
            const isFold = lastSelectedAction === 'f' || lastSelectedAction === 'simple_fold';
            if (!isFold) {
                const advanced = await advanceToNextStreet();
                if (advanced) return; // Successfully moved to next street
            }

            // Multi-street hand is done — save summary (persists until next hand feedback dismisses it)
            setHandSummary(multiStreetHandRef.current.getHandSummary());
            setIsMultiStreetActive(false);
            multiStreetHandRef.current = null;
        } else {
            // Only clear hand summary when starting a fresh hand (not when finishing multi-street)
            setHandSummary(null);
        }

        // Reset street state for new hand
        setCurrentStreet('flop');

        if (questionNumber >= effectiveQuestionsPerLevel) {
            // Level complete
            const accuracy = Math.round((correctCount / effectiveQuestionsPerLevel) * 100);
            const passed = checkLevelPassed(level, correctCount, effectiveQuestionsPerLevel);

            setLevelPassed(passed);
            setGameComplete(true);

            // Audio feedback for level completion
            if (passed) {
                if (accuracy === 100) trainingSounds.play('mastery');
                else trainingSounds.play('levelUp');
            } else {
                trainingSounds.play('incorrect');
            }

            // Save progress to database
            saveProgress(passed, accuracy);
        } else {
            if (preloadComplete && preloadedQuestions[questionNumber]) {
                // Serve next question from pre-loaded array (INSTANT)
                const nextQ = preloadedQuestions[questionNumber];
                setCurrentQuestion(nextQ);
                setQuestionNumber(prev => prev + 1);

                // ═══ START MULTI-STREET HAND if this is a postflop question ═══
                const scenario = nextQ.scenario || {};
                const street = scenario.street || '';
                // Removed 'DETERMINISTIC_SOLVER' source restriction to enable multi-street for all 100+ games
                if (street === 'flop' || street === 'turn') {
                    try {
                        const { MultiStreetHand } = await import('../engines/MultiStreetHandManager');
                        multiStreetHandRef.current = new MultiStreetHand(nextQ);
                        setIsMultiStreetActive(true);
                        setCurrentStreet(street);
                    } catch (e) {
                        console.warn('[GTOTrainer] MultiStreetHand import failed:', e);
                    }
                }
            } else {
                // Fallback to single-question mode
                setQuestionNumber(prev => prev + 1);
                fetchSingleQuestion();
            }
        }
    }, [questionNumber, correctCount, level, preloadComplete, preloadedQuestions, saveProgress, fetchSingleQuestion, isMultiStreetActive, advanceToNextStreet, lastSelectedAction, effectiveQuestionsPerLevel]);

    /**
     * Start next level (if passed)
     * 🚀 Uses prefetched cache if available, otherwise fetches fresh
     */
    const startNextLevel = useCallback(() => {
        if (!levelPassed || level >= TRAINING_CONFIG.totalLevels) return;

        const nextLevel = level + 1;
        setLevel(nextLevel);
        setQuestionNumber(1);
        setCorrectCount(0);
        setStreak(0);
        setGameComplete(false);
        setLevelPassed(false);
        prefetchTriggeredRef.current = false; // Reset for next level

        // ═══ PHASE 14: Use prefetched cache if available for INSTANT level transition ═══
        const cache = nextLevelCacheRef.current;
        if (cache && cache.level === nextLevel && cache.questions.length > 0) {
            console.log(`[GTOTrainer] ⚡ Using prefetched cache for level ${nextLevel} (${cache.questions.length} questions)`);
            setPreloadedQuestions(cache.questions);
            setPreloadComplete(true);
            setCurrentQuestion(cache.questions[0]);
            if (cache.questions.length < effectiveQuestionsPerLevel) {
                setEffectiveQuestionsPerLevel(cache.questions.length);
            }
            setLoading(false);
            nextLevelCacheRef.current = null; // Clear used cache
        } else {
            setPreloadComplete(false);
            preloadAllQuestions();
        }
    }, [levelPassed, level, preloadAllQuestions, effectiveQuestionsPerLevel]);

    /**
     * Retry current level
     * 🚀 Pre-loads fresh set of questions
     */
    const retryLevel = useCallback(() => {
        setQuestionNumber(1);
        setCorrectCount(0);
        setStreak(0);
        setGameComplete(false);
        setLevelPassed(false);
        setPreloadComplete(false);
        setEffectiveQuestionsPerLevel(baseQuestionsPerLevel); // Reset to original count
        preloadAllQuestions();
    }, [preloadAllQuestions, baseQuestionsPerLevel]);

    /**
     * Retrain only the hands the player got wrong.
     * Injects saved mistake questions directly into the queue.
     */
    const retrainMistakes = useCallback(() => {
        const mistakes = mistakeQuestionsRef.current;
        if (!mistakes || mistakes.length === 0) return;

        // Shuffle mistake questions for varied practice
        const shuffled = [...mistakes].sort(() => Math.random() - 0.5);

        setQuestionNumber(1);
        setCorrectCount(0);
        setStreak(0);
        setGameComplete(false);
        setLevelPassed(false);
        setShowFeedback(false);
        setPreloadedQuestions(shuffled);
        setPreloadComplete(true);
        setEffectiveQuestionsPerLevel(shuffled.length);
        setCurrentQuestion(shuffled[0]);
        setLoading(false);

        // Reset scoring for the retrain session
        gtowScoring.resetScore();
        // Clear the mistakes ref so this retrain session tracks fresh mistakes
        mistakeQuestionsRef.current = [];

        console.log(`[GTOTrainer] Retraining ${shuffled.length} mistake hands`);
    }, [gtowScoring]);

    /**
     * Reset entire game
     * 🚀 Pre-loads questions for level 1
     */
    const resetGame = useCallback(() => {
        setLevel(1);
        setQuestionNumber(1);
        setCorrectCount(0);
        setStreak(0);
        setBestStreak(0);
        setTotalXP(0);
        setGameComplete(false);
        setLevelPassed(false);
        setPreloadComplete(false);
        setEffectiveQuestionsPerLevel(baseQuestionsPerLevel); // Reset to original count
        preloadAllQuestions();
    }, [preloadAllQuestions, baseQuestionsPerLevel]);

    // 🚀 Pre-load all questions on mount
    useEffect(() => {
        if (gameId) {
            preloadAllQuestions();
        }
    }, [gameId, preloadAllQuestions]); // Only pre-load on gameId change

    return {
        // Current state
        currentQuestion,
        questionNumber,
        totalQuestions: effectiveQuestionsPerLevel,
        level,
        loading,
        error,

        // Pre-load state
        preloadComplete,

        // Score state
        correctCount,
        streak,
        bestStreak,
        totalXP,
        requiredCorrect: getRequiredCorrect(level),
        passThreshold: TRAINING_CONFIG.passThresholds[level],

        // Feedback state
        showFeedback,
        feedbackResult,
        explanation,

        // GTOW scoring state
        moveClassification: lastMoveClassification,
        evLoss: lastEVLoss,
        gtoFrequencies: lastGTOFrequencies,
        gtowScore: gtowScoring.gtowScore,
        totalEVLoss: gtowScoring.totalEVLoss,
        sessionMistakes: gtowScoring.mistakeCount,
        handHistory: gtowScoring.handHistory,
        avgEVLossPerHand: gtowScoring.avgEVLossPerHand,
        avgEVLossPerMistake: gtowScoring.avgEVLossPerMistake,
        avgFrequencyDiff: gtowScoring.avgFrequencyDiff,

        // Multi-street state
        currentStreet,
        isMultiStreetActive,
        handSummary,

        // Completion state
        gameComplete,
        levelPassed,

        // Adaptive difficulty
        adaptiveLevelChange,

        // ═══ PHASE 14: Weak-spot targeting ═══
        getWeakSpots,
        weakSpotMap: weakSpotMapRef.current,

        // Actions
        submitAnswer,
        nextQuestion,
        startNextLevel,
        retryLevel,
        retrainMistakes,
        resetGame,
    };
}
