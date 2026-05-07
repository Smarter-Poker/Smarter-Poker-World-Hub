/* ═══════════════════════════════════════════════════════════════════════════
    PREFLOP CHARTS - THE GTO WIZARD KILLER
   Full Video Game Experience with Pressure, Combos, and Diamond Economy
   Master GTO Preflop Ranges Through High-Pressure Training
   ═══════════════════════════════════════════════════════════════════════════ */

import { useRouter } from 'next/router';
import SEOHead from '../../src/components/seo/SEOHead';
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@supabase/supabase-js';
// confetti loaded lazily on first use
let _confetti = null;
async function fireConfetti(opts) {
    try {
        if (!_confetti) { const m = await import('canvas-confetti'); _confetti = m.default || m; }
        _confetti(opts);
    } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
}
import { SoundEngine, EffectsEngine, LEVELS, MASTERY_THRESHOLD, GAME_COST } from '../../src/games/GameEngine';
import { getScenariosByLevel, getRandomScenario, getLevelConfig, RANKS, getHandName, MIXED_SCENARIOS, LEVEL_1_SCENARIOS, LEVEL_2_SCENARIOS, LEVEL_3_SCENARIOS, LEVEL_4_SCENARIOS, LEVEL_5_SCENARIOS, LEVEL_6_SCENARIOS, LEVEL_7_SCENARIOS, LEVEL_8_SCENARIOS, LEVEL_9_SCENARIOS, LEVEL_10_SCENARIOS } from '../../src/games/ScenarioDatabase';

// God-Mode Stack
import { useMemoryStore } from '../../src/stores/memoryStore';
import PageTransition from '../../src/components/transitions/PageTransition';
import { useAvatar } from '../../src/contexts/AvatarContext';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import HamburgerMenu from '../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../src/config/hamburgerMenus';
import { getMemoryGamesPreferences, updateMemoryGamesPreferences } from '../../src/services/memoryGamesPreferences';

// ═══════════════════════════════════════════════════════════════════════════
// Diamonds DIAMOND ENGINE - Local storage with VIP check
// ═══════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
// Diamonds DIAMOND ENGINE - Import Supabase-powered version
// ═══════════════════════════════════════════════════════════════════════════
import DiamondEngine from '../../src/services/DiamondEngine';
import leaderboardService from '../../src/services/LeaderboardService';
import GameCostPopup from '../../src/components/gates/GameCostPopup';
import dailyChallengeService from '../../src/services/DailyChallengeService';
import { processGameResult } from '../../src/games/ELOService';
import gameSessionService from '../../src/services/GameSessionService';
import achievementService from '../../src/services/AchievementService';
import { claimReward } from '../../src/lib/claimReward';
import useTrainingBus from '../../src/hooks/useTrainingBus';
// busEmit not needed at page level - DiamondEngine auto-emits, useTrainingBus has own import
import { leakAnalyzer } from '../../src/engine/LeakSignalAnalyzer';

// New Game Mode Components (dynamic imports for code splitting)
import dynamic from 'next/dynamic';
const EnhancedReviewPanel = dynamic(() => import('../../src/components/memory-games/EnhancedReviewPanel'), { ssr: false });
const OutOfDiamondsModal = dynamic(() => import('../../src/components/gates/OutOfDiamondsModal'), { ssr: false });
const DailyChallengeCard = dynamic(() => import('../../src/components/memory-games/DailyChallengeCard'), { ssr: false });

const SpotTrainerGame = dynamic(() => import('../../src/games/SpotTrainerGame'), { ssr: false });
const TournamentModeGame = dynamic(() => import('../../src/games/TournamentModeGame'), { ssr: false });
const SpeedDrillGame = dynamic(() => import('../../src/games/SpeedDrillGame'), { ssr: false });
const PressureCookerGame = dynamic(() => import('../../src/games/PressureCookerGame'), { ssr: false });
const PatternRecognitionGame = dynamic(() => import('../../src/games/PatternRecognitionGame'), { ssr: false });
const MixedStrategyGame = dynamic(() => import('../../src/games/MixedStrategyGame'), { ssr: false });
import ScenarioFilterPanel, { filterScenarios } from '../../src/games/ScenarioFilterPanel';
import { getAccessToken } from '../../src/lib/authUtils';
// 2026-05-07 — Lucide icons replace emoji in the menu surface (UI-UX-Pro-Max no-emoji-icons rule)
import { Target, Zap, Bomb, Puzzle, Dices, Crosshair, Swords, Calendar, Trophy, Lock, Filter, ShieldCheck } from 'lucide-react';
import BottomNavBar from '../../src/components/ui/BottomNavBar';

// ACTION_COLORS moved to src/games/MixedStrategyGame.js


// ═══════════════════════════════════════════════════════════════════════════
// 🧮 GRADING ENGINE
// ═══════════════════════════════════════════════════════════════════════════
function gradeUserGrid(userGrid, solution) {
    let correctHands = 0;
    const missedHands = [];
    const extraHands = [];
    const wrongActionHands = [];

    for (const [hand, correctAction] of Object.entries(solution || {})) {
        const userAction = userGrid[hand];
        if (!userAction || userAction === 'fold') {
            missedHands.push(hand);
        } else if (userAction !== correctAction) {
            wrongActionHands.push(hand);
        } else {
            correctHands++;
        }
    }

    for (const [hand, userAction] of Object.entries(userGrid || {})) {
        if (!solution[hand] && userAction && userAction !== 'fold') {
            extraHands.push(hand);
        }
    }

    const totalSolutionHands = Object.keys(solution || {}).length;
    const mistakes = missedHands.length + extraHands.length + wrongActionHands.length;
    const score = totalSolutionHands > 0
        ? Math.round(((totalSolutionHands - missedHands.length - wrongActionHands.length) / totalSolutionHands) * 100)
        : 0;

    return { score: Math.max(0, score), correctHands, missedHands, extraHands, wrongActionHands, mistakes };
}

// SpeedDrillGame - extracted to src/games/SpeedDrillGame.js (dynamic import above)
// PressureCookerGame - extracted to src/games/PressureCookerGame.js (dynamic import above)
// PatternRecognitionGame - extracted to src/games/PatternRecognitionGame.js (dynamic import above)
// MixedStrategyGame - extracted to src/games/MixedStrategyGame.js (dynamic import above)

// ═══════════════════════════════════════════════════════════════════════════
// 📊 ENHANCED REVIEW PANEL - GTO Wizard-Quality Post-Game Analysis
// ═══════════════════════════════════════════════════════════════════════════
/* EnhancedReviewPanel dynamically imported */



// ═══════════════════════════════════════════════════════════════════════════
// 💎 OUT OF DIAMONDS MODAL
// ═══════════════════════════════════════════════════════════════════════════
/* OutOfDiamondsModal dynamically imported */

// ═══════════════════════════════════════════════════════════════════════════
// 📅 DAILY CHALLENGE CARD
// ═══════════════════════════════════════════════════════════════════════════
/* DailyChallengeCard dynamically imported */

// ═══════════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function MemoryGamesPage() {
    const router = useRouter();
    const { user } = useAvatar();
    useTrainingBus('preflop-charts');
    const userId = user?.id;
    const containerRef = useRef(null);

    // Start leak analyzer for Jarvis integration - feeds into LeakService + Jarvis PA alerts
    useEffect(() => {
        leakAnalyzer.start();
        if (userId) leakAnalyzer.setUserId(userId);
    }, [userId]);

    // Zustand Global State (replaces some local useState)
    const currentLevel = useMemoryStore((s) => s.currentLevel) || 1; // Fallback to level 1 if undefined
    const setCurrentLevel = useMemoryStore((s) => s.setCurrentLevel);
    const currentView = useMemoryStore((s) => s.currentView);
    const setCurrentView = useMemoryStore((s) => s.setCurrentView);
    const currentMiniGame = useMemoryStore((s) => s.currentMiniGame);
    const setCurrentMiniGame = useMemoryStore((s) => s.setCurrentMiniGame);

    // Game state (keep local for game session)
    const [mode, setMode] = useState('menu'); // 'menu' | 'game' | 'result' | 'speed-drill'
    const [gameType, setGameType] = useState('range'); // 'range' | 'speed' | 'leaderboard' | 'daily'
    const [currentScenario, setCurrentScenario] = useState(null);
    const [userGrid, setUserGrid] = useState({});
    const [selectedAction, setSelectedAction] = useState('raise');
    const [gradeResult, setGradeResult] = useState(null);

    // Leaderboard state
    const [leaderboardData, setLeaderboardData] = useState([]);
    const [leaderboardLoading, setLeaderboardLoading] = useState(false);
    const [leaderboardMode, setLeaderboardMode] = useState('range-memory');
    const [userRank, setUserRank] = useState(null);

    // Daily Challenge state
    const [dailyChallenge, setDailyChallenge] = useState(null);
    const [challengeLoading, setChallengeLoading] = useState(false);
    const [userStreak, setUserStreak] = useState({ current_streak: 0, longest_streak: 0 });
    const [challengeCompleted, setChallengeCompleted] = useState(false);

    // Scenario Filter state
    const [showFilters, setShowFilters] = useState(false);
    const [scenarioFilters, setScenarioFilters] = useState({});

    // AI Generation state
    const [useAIGeneration, setUseAIGeneration] = useState(false);
    const [aiGenerating, setAIGenerating] = useState(false);

    // Timer state
    const [timeRemaining, setTimeRemaining] = useState(90);
    const [timerActive, setTimerActive] = useState(false);
    const timerRef = useRef(null);

    // Combo state
    const [combo, setCombo] = useState(0);
    const [comboName, setComboName] = useState(null);
    const [multiplier, setMultiplier] = useState(1);

    // Economy state - fetched from Supabase
    const [diamondBalance, setDiamondBalance] = useState(100);
    // 2026-05-07 — single-call dashboard payload from /api/memory/dashboard
    // RPC: public.rpc_memory_dashboard(uuid). Renders grade chip + per-level
    // mastery + daily-challenge state in one round-trip (replaces 5+ fetches).
    const [memoryDashboard, setMemoryDashboard] = useState(null);
    const [memoryDashboardLoading, setMemoryDashboardLoading] = useState(true);
    const [isVIP, setIsVIP] = useState(false);

    // Initialize Supabase client
    const supabase = useRef(null);
    if (!supabase.current && typeof window !== 'undefined') {
        supabase.current = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        );
    }
    const [lastReward, setLastReward] = useState(null);

    // Progress state
    const [consecutivePasses, setConsecutivePasses] = useState(0);
    const [totalXP, setTotalXP] = useState(0);

    // Session history for trend tracking
    const [sessionHistory, setSessionHistory] = useState(() => {
        if (typeof window !== 'undefined') {
            try { return JSON.parse(localStorage.getItem('preflop_session_history') || '[]'); } catch { return []; }
        }
        return [];
    });

    // Visual state
    const [screenShake, setScreenShake] = useState(false);
    const [showComboPopup, setShowComboPopup] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [showOutOfDiamondsModal, setShowOutOfDiamondsModal] = useState(false);

    // Jarvis Explain Modal state
    const [explainModal, setExplainModal] = useState({
        show: false,
        hand: null,
        correctAction: null,
        userAction: null,
        explanation: null,
        loading: false
    });

    // Jarvis Post-Game Coach state
    const [coachAnalysis, setCoachAnalysis] = useState({
        show: false,
        loading: false,
        analysis: null
    });

    // Adaptive training state
    const [weakSpots, setWeakSpots] = useState([]);
    const [adaptiveLoading, setAdaptiveLoading] = useState(false);
    const [lobbySuggestions, setLobbySuggestions] = useState([]);

    // Hamburger menu preferences
    const [preferences, setPreferences] = useState({
        soundEffects: true,
        showHints: true,
        autoSave: true
    });

    // Load preferences from Supabase on mount
    useEffect(() => {
        if (userId) {
            getMemoryGamesPreferences(userId).then(setPreferences);
        }
    }, []);

    const updatePreference = useCallback(async (key, value) => {
        const newPrefs = { ...preferences, [key]: value };
        setPreferences(newPrefs);

        if (userId) {
            try {
                await updateMemoryGamesPreferences(userId, { [key]: value });
            } catch (error) {
                console.warn('Failed to save preference:', error);
            }
        }
    }, [preferences]);

    const menuConfig = getMenuConfig('preflop-charts', user, preferences, {
        setSoundEffects: (val) => updatePreference('soundEffects', val),
        setKeyboardShortcuts: (val) => updatePreference('keyboardShortcuts', val),
        setShowTimer: (val) => updatePreference('showTimer', val),
        setVisualHints: (val) => updatePreference('visualHints', val)
    });

    //  INTRO VIDEO STATE - Video plays while page loads in background
    // Only show once per session (not on every reload)
    const [showIntro, setShowIntro] = useState(() => {
        if (typeof window !== 'undefined') {
            return !sessionStorage.getItem('memory-games-intro-seen');
        }
        return false;
    });
    const introVideoRef = useRef(null);

    // Mark intro as seen when it ends
    const handleIntroEnd = useCallback(() => {
        sessionStorage.setItem('memory-games-intro-seen', 'true');
        setShowIntro(false);
    }, []);

    // Attempt to unmute video after it starts playing
    const handleIntroPlay = useCallback(() => {
        if (introVideoRef.current) {
            introVideoRef.current.muted = false;
        }
    }, []);

    // Safe helper to get level config with fallback
    const safeLevelConfig = getLevelConfig(currentLevel) || { timer: 90, gridSize: 13, maxHands: 20 };

    // Initialize effects CSS and DiamondEngine with user session
    useEffect(() => {
        EffectsEngine.initCSS();

        // Initialize DiamondEngine with user session
        const initializeDiamondEngine = async () => {
            try {
                // Get user session
                if (supabase.current) {
                    const { data: { session } } = await supabase.current.auth.getSession();
                    const user = session?.user;

                    if (user) {
                        setUserId(user.id);
                        // Initialize DiamondEngine with user ID
                        await DiamondEngine.init(user.id);

                        // Load balance and VIP status
                        const balance = await DiamondEngine.getBalance();
                        const vipStatus = await DiamondEngine.isVIP();

                        setDiamondBalance(balance);
                        setIsVIP(vipStatus);
                    } else {
                        // Guest user - use localStorage fallback
                        await DiamondEngine.init(null);
                        const balance = await DiamondEngine.getBalance();
                        setDiamondBalance(balance);
                    }
                }
            } catch (e) {
                console.warn('[MemoryGames] Failed to initialize DiamondEngine:', e);
                // Fallback to localStorage
                await DiamondEngine.init(null);
                const balance = await DiamondEngine.getBalance();
                setDiamondBalance(balance);
            }
        };

        initializeDiamondEngine();
    }, []);

    // Timer logic
    useEffect(() => {
        if (timerActive && timeRemaining > 0) {
            timerRef.current = setInterval(() => {
                setTimeRemaining(prev => {
                    if (prev <= 1) {
                        clearInterval(timerRef.current);
                        handleTimeUp();
                        return 0;
                    }
                    if (prev <= 10) SoundEngine.play('tick');
                    return prev - 1;
                });
            }, 1000);
        }
        return () => clearInterval(timerRef.current);
    }, [timerActive]);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (mode !== 'game' || gradeResult) return;
            const key = e.key;
            const actions = Object.entries(ACTION_COLORS || {});
            const found = actions.find(([_, v]) => v.key === key);
            if (found) {
                setSelectedAction(found[0]);
            }
            if (key === 'Enter' || key === ' ') {
                e.preventDefault();
                handleSubmit();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [mode, gradeResult, userGrid, currentScenario]);

    // Reusable: Fresh DB balance check + DiamondEngine deduction
    // NOTE: isStartingRef guards here AND in startGame - both are needed because:
    //   - 8 buttons call checkAndDeductDiamonds directly (need guard here)
    //   - VIP users skip checkAndDeductDiamonds in startGame (need guard there)
    const isStartingRef = useRef(false); // Double-click guard
    const checkAndDeductDiamonds = async () => {
        if (isVIP) return true;
        if (isStartingRef.current) return false;
        isStartingRef.current = true;
        try {
        // Fresh balance check from DB to avoid stale-state false negatives
        try {
            if (supabase.current && userId) {
                const { data: profile } = await supabase.current
                    .from('profiles')
                    .select('diamonds')
                    .eq('id', userId)
                    .maybeSingle();
                if (profile) {
                    const freshBalance = profile.diamonds || 0;
                    setDiamondBalance(freshBalance);
                    if (freshBalance < GAME_COST) {
                        setShowOutOfDiamondsModal(true);
                        return false;
                    }
                }
            }
        } catch (e) {
            console.warn('[MemoryGames] Balance check failed:', e);
        }
        const result = await DiamondEngine.deduct(GAME_COST);
        if (!result.success) {
            setShowOutOfDiamondsModal(true);
            return false;
        }
        if (result.balance !== undefined) setDiamondBalance(result.balance);
        // DiamondEngine.deduct auto-emits busEmit.diamondsSpent - no manual emit needed
        return true;
        } finally {
            isStartingRef.current = false;
        }
    };

    // Start game - separate guard for VIP path (isStartingRef guards deduction only)
    const isGameStartingRef = useRef(false);
    const startGame = async (level) => {
        // Double-click guard - protects ALL users (VIP + non-VIP)
        if (isGameStartingRef.current) return;
        isGameStartingRef.current = true;
        try {
        // Check diamond access
        if (!isVIP) {
            const canPlay = await checkAndDeductDiamonds();
            if (!canPlay) return;
        }

        let scenario = null;

        // Use AI Generation if enabled (VIP feature)
        if (useAIGeneration) {
            setAIGenerating(true);
            try {
                // Build filter params from active filters
                const requestBody = {
                    level,
                    position: scenarioFilters.position || undefined,
                    stackDepth: scenarioFilters.stackDepth || undefined,
                    format: scenarioFilters.format || undefined,
                };

                const response = await fetch('/api/gto/generate-scenario', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody)
                });

                if (!response.ok) throw new Error(`Request failed (${response.status})`);
                const result = await response.json();

                if (result.success && result.scenario) {
                    scenario = result.scenario;
                } else {
                    console.warn('[MemoryGames] AI generation failed:', result.error);
                    // Fallback to static scenarios
                    scenario = null;
                }
            } catch (error) {
                console.warn('[MemoryGames] AI generation error:', error);
                // Fallback to static scenarios
                scenario = null;
            } finally {
                setAIGenerating(false);
            }
        }

        // Fallback: Use static scenarios if AI generation failed or is disabled
        if (!scenario) {
            let levelScenarios = getScenariosByLevel(level);

            // Apply filters if any are active
            if (Object.keys(scenarioFilters || {}).filter(k => scenarioFilters[k]).length > 0) {
                levelScenarios = filterScenarios(levelScenarios, scenarioFilters);
            }

            // Select random scenario from filtered list
            scenario = levelScenarios.length > 0
                ? levelScenarios[Math.floor(Math.random() * levelScenarios.length)]
                : null;
        }

        if (!scenario) {
            alert('No scenarios available for this level!\n\nTry adjusting or resetting your filters.');
            return;
        }

        // Get level-specific config for progressive difficulty
        const levelConfig = getLevelConfig(level) || { timer: 90, gridSize: 13, maxHands: 20 };

        setCurrentLevel(level);
        setCurrentScenario(scenario);
        setUserGrid({});
        setGradeResult(null);
        setTimeRemaining(levelConfig.timer); // Progressive: higher levels = less time
        setTimerActive(true);
        setCombo(0);
        setComboName(null);
        setMultiplier(1);
        setMode('game');

        SoundEngine.play('levelUp');
        } finally {
            isGameStartingRef.current = false;
        }
    };

    // Handle time up
    const handleTimeUp = () => {
        setTimerActive(false);
        SoundEngine.play('gameOver');
        triggerScreenShake();
        handleSubmit(true);
    };

    // Cell click handler
    const handleCellClick = (hand) => {
        if (gradeResult || !timerActive) return;

        setUserGrid(prev => {
            if (prev[hand] === selectedAction) {
                const { [hand]: _, ...rest } = prev;
                return rest;
            }
            return { ...prev, [hand]: selectedAction };
        });
    };

    // Submit handler
    const handleSubmit = (timedOut = false) => {
        setTimerActive(false);
        clearInterval(timerRef.current);

        const result = gradeUserGrid(userGrid, currentScenario.solution);
        setGradeResult(result);

        // Track session history for trend analysis
        const sessionEntry = {
            score: result.score, level: currentLevel, position: currentScenario?.title || '',
            mistakes: result.missedHands.length + result.extraHands.length + result.wrongActionHands.length,
            timestamp: Date.now()
        };
        setSessionHistory(prev => {
            const updated = [...prev, sessionEntry].slice(-50); // Keep last 50
            try { localStorage.setItem('preflop_session_history', JSON.stringify(updated)); } catch (e) { console.warn('[App] Handled exception:', e); }
            return updated;
        });

        const passed = result.score >= MASTERY_THRESHOLD;

        // Compute totalReward at function scope so it's available for analytics below
        let totalReward = 0;

        if (passed) {
            // Success!
            SoundEngine.play('combo');
            triggerParticles();

            // God-Mode: Confetti celebration on mastery
            fireConfetti({
                particleCount: 200,
                spread: 120,
                origin: { y: 0.6 },
                colors: ['#FFD700', '#00D4FF', '#00ff88'],
            });

            // Update combo
            const newCombo = combo + 1;
            setCombo(newCombo);
            updateComboDisplay(newCombo);

            // Update consecutive passes
            const newPasses = consecutivePasses + 1;
            setConsecutivePasses(newPasses);

            // Award diamonds and XP
            const baseReward = 15;
            const accuracyBonus = Math.floor((result.score - 85) / 5) * 5;
            const perfectBonus = result.score === 100 ? 50 : 0;
            const comboBonus = Math.floor(newCombo * 2);
            totalReward = Math.floor((baseReward + accuracyBonus + perfectBonus + comboBonus) * multiplier);

            const newBalance = DiamondEngine.award(totalReward);
            setDiamondBalance(newBalance);
            setLastReward({ diamonds: totalReward, timestamp: Date.now() });

            // XP - higher levels give more XP
            const levelConfig = getLevelConfig(currentLevel);
            const xpGain = Math.floor((50 + (result.score - 85) * 2 + (newCombo * 5)) * levelConfig.xpMultiplier);
            setTotalXP(prev => prev + xpGain);
        } else {
            // Failure
            SoundEngine.play('wrong');
            triggerScreenShake();
            setCombo(0);
            setComboName(null);
            setMultiplier(1);
            setConsecutivePasses(0);
        }

        // ═══════════════════════════════════════════════════════════════════════════
        // 📊 PERSIST TO SUPABASE - Leaderboard, ELO, Daily Challenge
        // ═══════════════════════════════════════════════════════════════════════════
        if (user?.id) {
            const gameMode = gameType || 'range';
            const timeTaken = Math.max(0, Math.floor((safeLevelConfig.timer || 90) - timeRemaining));

            // 1. Update leaderboard (only if passed)
            if (passed) {
                leaderboardService.updateLeaderboard(
                    user.id,
                    gameMode,
                    currentLevel,
                    result.score,
                    result.score, // accuracy
                    timeTaken,
                    null // sessionId
                ).then(res => {
                }).catch(err => console.warn('[App] Handled promise rejection:', err?.message || err));
            }

            // 2. Update ELO rating
            processGameResult(user.id, currentLevel, result.score, gamesPlayed || 0)
                .then(eloResult => {
                    if (eloResult?.rank) {
                        setEloRank && setEloRank(eloResult.rank);
                    }
                }).catch(err => console.warn('[App] Handled promise rejection:', err?.message || err));

            // 3. Check and complete daily challenge
            dailyChallengeService.getTodaysChallenge().then(challengeData => {
                if (challengeData?.success && challengeData?.challenge && !challengeData.completed) {
                    const challenge = challengeData.challenge;
                    // Check if this game matches the daily challenge
                    if (challenge.level === currentLevel && result.score >= challenge.target_accuracy) {
                        dailyChallengeService.completeChallenge(
                            user.id,
                            challenge.id,
                            result.score,
                            result.score,
                            timeTaken
                        ).then(completionResult => {
                            if (completionResult?.success) {
                                // Award bonus diamonds for daily challenge
                                const bonus = challenge.diamond_reward || 25;
                                DiamondEngine.award(bonus);
                                setDiamondBalance(prev => prev + bonus);

                                // Award daily trivia diamonds via server-validated API (15💎, with toast)
                                claimReward('/api/rewards/daily-trivia', { userId: user.id }, 'Daily Trivia Challenge');
                            }
                        }).catch(err => console.warn('[App] Handled promise rejection:', err?.message || err));
                    }
                }
            });

            // 4. Increment games played counter
            const newGamesPlayed = (gamesPlayed || 0) + 1;
            setGamesPlayed && setGamesPlayed(newGamesPlayed);

            // 5. Record game session for analytics
            gameSessionService.recordSession(user.id, {
                gameMode,
                level: currentLevel,
                scenarioId: currentScenario?.id || currentScenario?.title,
                score: result.score,
                accuracy: result.score,
                timeTaken,
                diamondsSpent: isVIP ? 0 : 10,
                diamondsEarned: passed ? totalReward : 0,
                completed: true
            }).then(sessionResult => {
            }).catch(err => console.warn('[App] Handled promise rejection:', err?.message || err));

            // 6. Check and unlock achievements
            achievementService.checkAndUnlock(user.id, {
                gamesPlayed: newGamesPlayed,
                accuracy: result.score,
                timeTaken,
                level: currentLevel,
                gameMode,
                totalDiamonds: diamondBalance,
                aiScenariosCompleted: useAIGeneration ? 1 : 0,
                currentStreak: consecutivePasses,
                modesPlayed: [gameMode] // TODO: track all modes played
            }).then(unlocked => {
                if (unlocked.length > 0) {
                }
            }).catch(err => console.warn('[App] Handled promise rejection:', err?.message || err));

            // 7. Push to Jarvis Personal Assistant for leak detection
            const answersData = [];
            // Build answers array from gradeResult
            if (result.wrongActionHands) {
                result.wrongActionHands.forEach(hand => {
                    answersData.push({
                        hand,
                        userAnswer: userGrid[hand] || 'fold',
                        correctAnswer: currentScenario?.solution?.[hand] || 'raise',
                        wasCorrect: false,
                        position: currentScenario?.position,
                        scenario: { title: currentScenario?.title, stackDepth: currentScenario?.stackDepth }
                    });
                });
            }
            if (result.missedHands) {
                result.missedHands.forEach(hand => {
                    answersData.push({
                        hand,
                        userAnswer: 'fold',
                        correctAnswer: currentScenario?.solution?.[hand] || 'raise',
                        wasCorrect: false,
                        position: currentScenario?.position,
                        scenario: { title: currentScenario?.title, stackDepth: currentScenario?.stackDepth }
                    });
                });
            }
            if (result.correctHands) {
                result.correctHands.forEach(hand => {
                    answersData.push({
                        hand,
                        userAnswer: userGrid[hand] || currentScenario?.solution?.[hand],
                        correctAnswer: currentScenario?.solution?.[hand],
                        wasCorrect: true,
                        position: currentScenario?.position,
                        scenario: { title: currentScenario?.title, stackDepth: currentScenario?.stackDepth }
                    });
                });
            }

            fetch('/api/jarvis/training-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: user.id,
                    sessionId: `memory_${Date.now()}`,
                    gameId: 'preflop-charts',
                    gameName: 'Preflop Charts',
                    category: currentScenario?.position || 'PREFLOP',
                    level: currentLevel,
                    questionsAnswered: Object.keys(currentScenario?.solution || {}).length,
                    questionsCorrect: result.correctHands?.length || 0,
                    accuracy: result.score,
                    streak: consecutivePasses,
                    timeSpentSeconds: timeTaken,
                    answers: answersData,
                    leaksDetected: []
                })
            }).then(res => res.json()).then(jarvisResult => {
            }).catch(err => console.warn('[App] Handled promise rejection:', err?.message || err)).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
        }

        setMode('result');
    };

    // Update combo display
    const updateComboDisplay = (comboCount) => {
        let name = null;
        let mult = 1;

        if (comboCount >= 20) { name = ' LEGENDARY!'; mult = 3.0; }
        else if (comboCount >= 15) { name = 'UNSTOPPABLE!'; mult = 2.5; }
        else if (comboCount >= 10) { name = '++ ON FIRE!'; mult = 2.0; }
        else if (comboCount >= 7) { name = ' DOMINATING!'; mult = 1.7; }
        else if (comboCount >= 5) { name = ' HOT STREAK!'; mult = 1.5; }
        else if (comboCount >= 3) { name = 'NICE!'; mult = 1.2; }

        setComboName(name);
        setMultiplier(mult);

        if (name) {
            setShowComboPopup(true);
            setTimeout(() => setShowComboPopup(false), 1500);
        }
    };

    // Visual effects
    const triggerScreenShake = () => {
        setScreenShake(true);
        setTimeout(() => setScreenShake(false), 300);
    };

    const triggerParticles = () => {
        if (typeof window !== 'undefined') {
            const x = window.innerWidth / 2;
            const y = window.innerHeight / 2;
            EffectsEngine.particles(x, y, 20, '#00ff88');
        }
    };

    // Next scenario
    const handleNext = () => {
        startGame(currentLevel);
    };

    // Fetch Jarvis explanation for a hand (with GTO panel image)
    const fetchJarvisExplanation = async (hand, correctAction, userAction) => {
        setExplainModal({
            show: true,
            hand,
            correctAction,
            userAction,
            explanation: null,
            panelImageUrl: null,
            loading: true
        });

        try {
            // Fetch both explanation AND GTO panel image in parallel
            const [explainResponse, panelResponse] = await Promise.all([
                fetch('/api/gto/explain-hand', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        hand,
                        position: currentScenario?.position,
                        stackDepth: currentScenario?.stackDepth,
                        correctAction,
                        userAction,
                        scenario: currentScenario
                    })
                }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e)),
                fetch('/api/gto/render-analysis-card', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: correctAction,
                        frequency: 100,
                        explanation: `${correctAction.toUpperCase()} with ${hand} is the correct play in this spot.`,
                        gtoApproach: currentScenario?.tip || 'Follow solver-approved strategies.',
                        evAnalysis: '+EV',
                        alternateLines: []
                    })
                }).catch(() => null) // Fallback if panel generation fails
            ]);

            const explainResult = await explainResponse.json();
            const panelResult = panelResponse ? await panelResponse.json().catch(() => null) : null;

            setExplainModal(prev => ({
                ...prev,
                explanation: explainResult.explanation || 'Unable to generate explanation.',
                panelImageUrl: panelResult?.imageUrl || null,
                loading: false
            }));
        } catch (error) {
            console.warn('[MemoryGames] Explain error:', error);
            setExplainModal(prev => ({
                ...prev,
                explanation: 'Failed to get explanation. Please try again.',
                panelImageUrl: null,
                loading: false
            }));
        }
    };

    // Fetch Jarvis post-game analysis
    const fetchCoachAnalysis = async (gradeResult) => {
        if (!gradeResult) return;

        // Build mistakes array
        const mistakes = [];

        // Wrong action hands
        if (gradeResult.wrongActionHands) {
            gradeResult.wrongActionHands.forEach(hand => {
                mistakes.push({
                    hand,
                    userAction: userGrid[hand] || 'fold',
                    correctAction: currentScenario?.solution?.[hand] || 'raise'
                });
            });
        }

        // Missed hands (should have selected but didn't)
        if (gradeResult.missedHands) {
            gradeResult.missedHands.forEach(hand => {
                mistakes.push({
                    hand,
                    userAction: 'fold',
                    correctAction: currentScenario?.solution?.[hand] || 'raise'
                });
            });
        }

        setCoachAnalysis({
            show: true,
            loading: true,
            analysis: null
        });

        try {
            const response = await fetch('/api/gto/analyze-game', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mistakes,
                    scenario: currentScenario,
                    finalScore: gradeResult.score,
                    position: currentScenario?.position,
                    stackDepth: currentScenario?.stackDepth
                })
            });

            if (!response.ok) throw new Error(`Request failed (${response.status})`);
            const result = await response.json();

            setCoachAnalysis({
                show: true,
                loading: false,
                analysis: result.analysis
            });
        } catch (error) {
            console.warn('[MemoryGames] Coach analysis error:', error);
            setCoachAnalysis({
                show: true,
                loading: false,
                analysis: {
                    summary: "Great effort! Review your mistakes to improve.",
                    patternInsights: [],
                    recommendations: ["Practice this scenario again"]
                }
            });
        }
    };

    // Fetch user's weak spots for adaptive training
    const fetchWeakSpots = async () => {
        const controller = new AbortController();
        const { signal } = controller;
        if (!userId) return;

        try {
            const response = await fetch(`/api/gto/get-weak-spots?userId=${userId}`);
            if (!response.ok) throw new Error(`Request failed (${response.status})`);
            const result = await response.json();

            if (result.success && result.weakSpots) {
                setWeakSpots(result.weakSpots);
            }
        } catch (error) {
            console.warn('[MemoryGames] Fetch weak spots error:', error);
        }
    };

    // Start adaptive training targeting weaknesses
    const startAdaptiveTraining = async () => {
        const controller = new AbortController();
        const { signal } = controller;
        if (!userId) return;

        setAdaptiveLoading(true);

        try {
            const response = await fetch('/api/gto/generate-adaptive', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId })
            });

            if (!response.ok) throw new Error(`Request failed (${response.status})`);
            const result = await response.json();

            if (result.success && result.scenario) {
                // Load the adaptive scenario
                setCurrentScenario(result.scenario);
                setGameState('playing');
                setUserGrid({});
                setGradeResult(null);
                setCoachAnalysis({ show: false, loading: false, analysis: null });
            }
        } catch (error) {
            console.warn('[MemoryGames] Adaptive training error:', error);
        } finally {
            setAdaptiveLoading(false);
        }
    };

    // Fetch lobby suggestions for proactive learning
    const fetchLobbySuggestions = async () => {
        const controller = new AbortController();
        const { signal } = controller;
        if (!userId) return;

        try {
            const response = await fetch(`/api/gto/lobby-suggestions?userId=${userId}`);
            if (!response.ok) throw new Error(`Request failed (${response.status})`);
            const result = await response.json();

            if (result.success && result.suggestions) {
                setLobbySuggestions(result.suggestions);
            }
        } catch (error) {
            setAdaptiveLoading(false);
            console.warn('[MemoryGames] Lobby suggestions error:', error);
        }
    };

    // Fetch weak spots and suggestions on mount when user is available
    useEffect(() => {
        if (userId && mode === 'menu') {
            fetchWeakSpots();
            fetchLobbySuggestions();
        }
    }, [userId, mode]);

    // Load aggregated dashboard payload (real grade, per-level mastery, daily-challenge state)
    useEffect(() => {
        if (!userId) {
            setMemoryDashboardLoading(false);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const token = typeof getAccessToken === 'function' ? getAccessToken() : null;
                const r = await fetch('/api/memory/dashboard', {
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                });
                if (!r.ok) throw new Error(`memory/dashboard ${r.status}`);
                const json = await r.json();
                if (!cancelled && json?.success) setMemoryDashboard(json.stats);
            } catch (e) {
                if (!cancelled) console.warn('[MemoryGames] dashboard fetch failed:', e?.message || e);
            } finally {
                if (!cancelled) setMemoryDashboardLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [userId]);

    // Load leaderboard data

    const loadLeaderboard = useCallback(async () => {
        const controller = new AbortController();
        const { signal } = controller;
        setLeaderboardLoading(true);
        try {
            // Initialize service with supabase client if not done
            if (supabase.current) {
                await leaderboardService.initialize(supabase.current);
            }

            const result = await leaderboardService.getLeaderboard(leaderboardMode, null, 50);
            if (result.success) {
                setLeaderboardData(result.leaderboard);
            }

            // Get user rank if logged in
            if (userId) {
                const rankResult = await leaderboardService.getUserRank(userId, leaderboardMode, null);
                if (rankResult.success) {
                    setUserRank(rankResult);
                }
            }
        } catch (error) {
            console.warn('[MemoryGames] Failed to load leaderboard:', error);
        } finally {
            setLeaderboardLoading(false);
        }
    }, [leaderboardMode, userId]);

    // Load daily challenge data
    const loadDailyChallenge = useCallback(async () => {
        const controller = new AbortController();
        const { signal } = controller;
        setChallengeLoading(true);
        try {
            // Initialize service with supabase client if not done
            if (supabase.current) {
                await dailyChallengeService.initialize(supabase.current);
            }

            const result = await dailyChallengeService.getTodaysChallenge();
            if (result.success && result.challenge) {
                // Parse scenario from scenario_id JSON string
                let challenge = { ...result.challenge };
                if (challenge.scenario_id && typeof challenge.scenario_id === 'string') {
                    try {
                        const scenario = JSON.parse(challenge.scenario_id);
                        // Merge scenario properties into challenge object
                        challenge = {
                            ...challenge,
                            title: scenario.title || challenge.title,
                            description: scenario.description || challenge.description,
                            tip: scenario.tip,
                            solution: scenario.solution,
                            position: scenario.position,
                            stackDepth: scenario.stackDepth,
                            scenario: scenario // Keep full scenario for gameplay
                        };
                    } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
                }
                setDailyChallenge(challenge);
                setChallengeCompleted(result.completed);
            }

            // Get user streak if logged in
            if (userId) {
                const streakResult = await dailyChallengeService.getUserStreak(userId);
                if (streakResult.success) {
                    setUserStreak(streakResult.streak);
                }
            }
        } catch (error) {
            console.warn('[MemoryGames] Failed to load daily challenge:', error);
        } finally {
            setChallengeLoading(false);
        }
    }, [userId]);

    // Submit score to leaderboard after game ends
    const submitToLeaderboard = useCallback(async (gameMode, level, score, accuracy, timeTaken) => {
        if (!userId) return; // Only logged-in users

        try {
            if (supabase.current) {
                await leaderboardService.initialize(supabase.current);
            }

            const sessionId = crypto.randomUUID();
            const result = await leaderboardService.updateLeaderboard(
                userId, gameMode, level, score, accuracy, timeTaken, sessionId
            );

            if (result.new_record) {
                // Show celebration for new record
                SoundEngine.play('levelUp');
                fireConfetti({
                    particleCount: 100,
                    spread: 70,
                    origin: { y: 0.6 }
                });
            }

            return result;
        } catch (error) {
            console.warn('[MemoryGames] Failed to submit score:', error);
        }
    }, [userId]);

    // Handle VIP upgrade - initiate Stripe checkout for VIP subscription
    const handleVipUpgrade = useCallback(async () => {
        const controller = new AbortController();
        const { signal } = controller;
        // Check if user is logged in
        if (!userId) {
            alert('Please log in to upgrade to VIP!');
            return;
        }

        try {
            // Get auth token for API call
            const token = getAccessToken();
            if (!session?.access_token) {
                alert('Please log in to upgrade to VIP!');
                return;
            }

            // Call checkout session API
            const response = await fetch('/api/store/create-checkout-session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getAccessToken()}`
                },
                body: JSON.stringify({
                    type: 'subscription',
                    items: [{
                        name: 'Preflop Charts VIP',
                        tier: 'vip',
                        priceId: process.env.NEXT_PUBLIC_STRIPE_VIP_PRICE_ID || 'price_vip_monthly' // Configured in Stripe dashboard
                    }],
                    successUrl: `${window.location.origin}/hub/preflop-charts?vip_success=true`,
                    cancelUrl: `${window.location.origin}/hub/preflop-charts?vip_canceled=true`
                })
            });

            if (!response.ok) throw new Error(`Request failed (${response.status})`);
            const result = await response.json();

            if (result.success && result.data?.url) {
                // Redirect to Stripe checkout
                window.location.href = result.data.url;
            } else {
                // Handle error - show helpful message
                if (result.error?.code === 'PAYMENTS_NOT_CONFIGURED') {
                    alert('VIP subscriptions coming soon! Payment processing is being set up.');
                } else {
                    alert(result.error?.message || 'Failed to start checkout. Please try again.');
                }
            }
        } catch (error) {
            console.warn('[MemoryGames] VIP upgrade error:', error);
            alert('Something went wrong. Please try again later.');
        }
    }, [userId]);

    // Timer color
    const getTimerColor = () => {
        if (timeRemaining > 30) return '#00ff88';
        if (timeRemaining > 10) return '#ffaa00';
        return '#ff4444';
    };

    // Get level scenarios count
    const getLevelScenarios = (level) => getScenariosByLevel(level).length;

    return (
        <PageTransition>
            {/*  INTRO VIDEO OVERLAY - Plays while page loads behind it */}
            {showIntro && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 99999,
                    background: '#000',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}>
                    <video
                        ref={introVideoRef}
                        src="/videos/memory-games-intro.mp4"
                        autoPlay
                        muted
                        playsInline
                        onPlay={handleIntroPlay}
                        onEnded={handleIntroEnd}
                        onError={handleIntroEnd}
                        style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'contain'
                        }}
                    />
                    {/* Skip button */}
                    <button
                        onClick={handleIntroEnd}
                        style={{
                            position: 'absolute',
                            top: 20,
                            right: 20,
                            padding: '8px 20px',
                            background: 'rgba(255,255,255,0.2)',
                            backdropFilter: 'blur(10px)',
                            border: '1px solid rgba(255,255,255,0.3)',
                            borderRadius: 20,
                            color: 'white',
                            fontSize: 14,
                            fontWeight: 500,
                            cursor: 'pointer',
                            zIndex: 100000
                        }}
                    >
                        Skip
                    </button>
                </div>
            )}
            <SEOHead
                title="Preflop Charts - Master GTO Ranges"
                description="Master GTO Preflop Ranges Through High-Pressure Training. Speed Drills, Pattern Recognition, Mixed Strategy Practice, and Tournament Prep."
                canonical="/hub/preflop-charts"
            >
                <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
            </SEOHead>

            <div className="memory-games-page"
                ref={containerRef}
                style={{
                    ...styles.container,
                    transform: screenShake ? 'translate(5px, 5px)' : 'none',
                    animation: screenShake ? 'shake 0.3s ease-in-out' : 'none',
                }}
            >
                {/* Background */}
                <div style={styles.bgGrid} />
                <div style={styles.bgGlow} />

                {/* Standard Hub Header - DO NOT MODIFY */}
                <UniversalHeader pageDepth={1} onMenuClick={() => setMenuOpen(true)} />

                {/* Per-game cost popup (one-time) */}
                {userId && !isVIP && (
                    <GameCostPopup userId={userId} featureKey="memory_games" isVip={isVIP} cost={10} />
                )}

                {/* Hamburger Menu */}
                <HamburgerMenu
                    isOpen={menuOpen}
                    onClose={() => setMenuOpen(false)}
                    direction="left"
                    theme="dark"
                    user={null}
                    showProfile={false}
                    menuItems={menuConfig.menuItems}
                    bottomLinks={menuConfig.bottomLinks}
                />

                {/* Combo Popup */}
                {showComboPopup && comboName && (
                    <div style={styles.comboOverlay}>
                        <div style={styles.comboText}>{comboName}</div>
                        <div style={styles.multiplierText}>{multiplier}x MULTIPLIER</div>
                    </div>
                )}

                {/* Main Content */}
                <div style={styles.content}>
                    {mode === 'menu' && (
                        <>
                            {/* Title */}
                            <div style={styles.titleSection}>
                                <div style={styles.orbIcon}></div>
                                <h1 style={{...styles.title, textTransform: 'none', letterSpacing: '-0.5px'}}>Preflop charts</h1>
                                <p style={styles.subtitle}>
                                    Master GTO ranges through high-pressure training.
                                </p>
                                {memoryDashboard?.current_grade && memoryDashboard?.rolling_30d_sessions > 0 && (
                                    <div style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 8,
                                        padding: '6px 14px', borderRadius: 999,
                                        background: 'rgba(0, 212, 255, 0.10)',
                                        border: '1px solid rgba(0, 212, 255, 0.30)',
                                        marginTop: 10,
                                        fontSize: 13, color: '#cbd5e1',
                                    }} aria-label={`Current GTO grade ${memoryDashboard.current_grade}`}>
                                        <span style={{ fontFamily: 'Orbitron, monospace', fontWeight: 800, color: '#00D4FF' }}>
                                            {memoryDashboard.current_grade}
                                        </span>
                                        <span>{memoryDashboard.rolling_accuracy_pct}% across last 30 days</span>
                                        {memoryDashboard.mastered_levels_count > 0 && (
                                            <span style={{ color: '#94a3b8', marginLeft: 4 }}>
                                                · {memoryDashboard.mastered_levels_count}/10 mastered
                                            </span>
                                        )}
                                    </div>
                                )}
                                <div style={styles.costInfo}>
                                    {isVIP ? 'VIP: Unlimited Access' : `💎 ${GAME_COST} Diamonds per game`}
                                </div>
                            </div>

                            {/* Daily Challenge Card */}
                            <DailyChallengeCard
                                challenge={dailyChallenge}
                                streak={userStreak}
                                completed={challengeCompleted}
                                loading={challengeLoading}
                                onPlay={() => {
                                    if (dailyChallenge) {
                                        setCurrentLevel(dailyChallenge.level || 1);
                                        startGame(dailyChallenge.level || 1);
                                    }
                                }}
                            />

                            {/* Smart Practice Card - Adaptive Training */}
                            {userId && (
                                <div style={{
                                    background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(6, 182, 212, 0.15))',
                                    border: '1px solid rgba(16, 185, 129, 0.3)',
                                    borderRadius: 16,
                                    padding: 20,
                                    marginBottom: 20
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                                        <span style={{ fontSize: 20, fontWeight: 'bold', color: '#10B981' }}>J</span>
                                        <span style={{ fontFamily: 'Orbitron', fontSize: 16, color: '#10B981' }}>
                                            Smart Practice
                                        </span>
                                    </div>

                                    <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>
                                        Jarvis analyzes your history and creates personalized training.
                                    </p>

                                    {/* Weak Spots Display */}
                                    {weakSpots.length > 0 && (
                                        <div style={{ marginBottom: 16 }}>
                                            <div style={{ fontSize: 12, color: '#06B6D4', marginBottom: 8 }}>
                                                Areas to Improve:
                                            </div>
                                            {weakSpots.slice(0, 2).map((spot, i) => (
                                                <div key={i} style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    background: 'rgba(0, 0, 0, 0.2)',
                                                    borderRadius: 8,
                                                    padding: '8px 12px',
                                                    marginBottom: 6,
                                                    fontSize: 13
                                                }}>
                                                    <span style={{ color: '#FFD700' }}>{spot.area}</span>
                                                    <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>
                                                        {spot.errorCount} errors
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    <button
                                        onClick={startAdaptiveTraining}
                                        disabled={adaptiveLoading}
                                        style={{
                                            width: '100%',
                                            padding: '12px 20px',
                                            background: adaptiveLoading
                                                ? 'rgba(16, 185, 129, 0.3)'
                                                : 'linear-gradient(135deg, #10B981, #06B6D4)',
                                            border: 'none',
                                            borderRadius: 12,
                                            color: '#fff',
                                            fontSize: 14,
                                            fontWeight: 600,
                                            cursor: adaptiveLoading ? 'wait' : 'pointer',
                                            opacity: adaptiveLoading ? 0.7 : 1
                                        }}
                                    >
                                        {adaptiveLoading ? 'Generating...' : weakSpots.length > 0
                                            ? `Train ${weakSpots[0]?.area}`
                                            : 'Start Smart Practice'}
                                    </button>
                                </div>
                            )}

                            {/* Jarvis Suggestions Panel */}
                            {userId && lobbySuggestions.length > 0 && (
                                <div style={{
                                    background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.12), rgba(236, 72, 153, 0.12))',
                                    border: '1px solid rgba(139, 92, 246, 0.25)',
                                    borderRadius: 16,
                                    padding: 16,
                                    marginBottom: 20
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                        <span style={{ fontSize: 14, color: '#A78BFA' }}>Jarvis Suggests</span>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {lobbySuggestions.map((suggestion, i) => (
                                            <div
                                                key={i}
                                                onClick={() => {
                                                    if (suggestion.actionType === 'daily_challenge') {
                                                        // Start daily challenge
                                                        startDailyChallenge && startDailyChallenge();
                                                    } else if (suggestion.actionType === 'start_level') {
                                                        // Start specific level
                                                        const levelData = LEVEL_CONFIGS.find(l => l.id === suggestion.levelId);
                                                        if (levelData) selectLevel(levelData);
                                                    } else if (suggestion.actionType === 'adaptive_training') {
                                                        startAdaptiveTraining();
                                                    }
                                                }}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    background: 'rgba(0, 0, 0, 0.25)',
                                                    borderRadius: 10,
                                                    padding: '10px 14px',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s ease'
                                                }}
                                            >
                                                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)' }}>
                                                    {suggestion.message}
                                                </span>
                                                <span style={{
                                                    fontSize: 11,
                                                    color: '#8B5CF6',
                                                    fontWeight: 600,
                                                    whiteSpace: 'nowrap'
                                                }}>
                                                    {suggestion.action}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Game Mode Selector */}
                            {(() => {
                                const MODES = [
                                    { key: 'range',      label: 'Range',        Icon: Target,         color: '#00D4FF', desc: 'Core GTO training' },
                                    { key: 'speed',      label: 'Speed drill',  Icon: Zap,            color: '#FFD700', desc: 'Beat the clock' },
                                    { key: 'pressure',   label: 'Pressure',     Icon: Bomb,           color: '#FF4444', desc: 'Defuse the bomb' },
                                    { key: 'pattern',    label: 'Pattern',      Icon: Puzzle,         color: '#3B82F6', desc: 'Read the range' },
                                    { key: 'mixed',      label: 'Mixed',        Icon: Dices,          color: '#A855F7', desc: 'Dial frequencies' },
                                    { key: 'spot',       label: 'Spot trainer', Icon: Crosshair,      color: '#F97316', desc: 'Full hand trees' },
                                    { key: 'tournament', label: 'VS ranked',    Icon: Swords,         color: '#EC4899', desc: 'Climb the ladder' },
                                ];
                                const EXTRA = [
                                    { key: 'daily',       label: 'Daily',    Icon: Calendar, color: '#00FF88', special: true },
                                    { key: 'leaderboard', label: 'Rankings', Icon: Trophy,   color: '#FFD700', special: true },
                                ];
                                return (
                                    <>
                                        {/* Primary Training Modes */}
                                        <div style={{
                                            display: 'grid',
                                            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                                            gap: 10,
                                            marginBottom: 12,
                                        }}>
                                            {MODES.map(m => {
                                                const active = gameType === m.key;
                                                return (
                                                    <button
                                                        key={m.key}
                                                        onClick={() => setGameType(m.key)}
                                                        style={{
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            alignItems: 'center',
                                                            gap: 4,
                                                            padding: '14px 8px 12px',
                                                            background: active
                                                                ? `linear-gradient(135deg, ${m.color}22, ${m.color}11)`
                                                                : 'rgba(255,255,255,0.03)',
                                                            border: active
                                                                ? `2px solid ${m.color}`
                                                                : '2px solid rgba(255,255,255,0.08)',
                                                            borderRadius: 14,
                                                            cursor: 'pointer',
                                                            transition: 'all 0.2s ease',
                                                            position: 'relative',
                                                            overflow: 'hidden',
                                                        }}
                                                    >
                                                        <m.Icon size={22} aria-hidden style={{ color: active ? m.color : 'rgba(255,255,255,0.85)' }} />
                                                        <span style={{
                                                            fontSize: 12,
                                                            fontWeight: 700,
                                                            color: active ? m.color : 'rgba(255,255,255,0.7)',
                                                            letterSpacing: 0.3,
                                                        }}>{m.label}</span>
                                                        <span style={{
                                                            fontSize: 10,
                                                            color: active ? `${m.color}99` : 'rgba(255,255,255,0.3)',
                                                            lineHeight: 1.2,
                                                        }}>{m.desc}</span>
                                                        {active && <div style={{
                                                            position: 'absolute',
                                                            bottom: 0,
                                                            left: '20%',
                                                            right: '20%',
                                                            height: 2,
                                                            background: m.color,
                                                            borderRadius: 2,
                                                        }} />}
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        {/* Quick Access Row */}
                                        <div style={{
                                            display: 'flex',
                                            gap: 10,
                                            justifyContent: 'center',
                                            marginBottom: 32,
                                        }}>
                                            {EXTRA.map(m => {
                                                const active = gameType === m.key;
                                                return (
                                                    <button
                                                        key={m.key}
                                                        onClick={() => {
                                                            setGameType(m.key);
                                                            if (m.key === 'leaderboard') loadLeaderboard();
                                                            if (m.key === 'daily') loadDailyChallenge();
                                                        }}
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: 6,
                                                            padding: '10px 20px',
                                                            background: active
                                                                ? `${m.color}22`
                                                                : 'rgba(255,255,255,0.05)',
                                                            border: active
                                                                ? `2px solid ${m.color}`
                                                                : '2px solid rgba(255,255,255,0.1)',
                                                            borderRadius: 30,
                                                            cursor: 'pointer',
                                                            transition: 'all 0.2s ease',
                                                            color: active ? m.color : 'rgba(255,255,255,0.5)',
                                                            fontSize: 13,
                                                            fontWeight: 600,
                                                        }}
                                                    >
                                                        <m.Icon size={16} aria-hidden />
                                                        <span>{m.label}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </>
                                );
                            })()}

                            {/* ── Mode Launch Cards ── */}
                            <AnimatePresence mode="wait">
                            {(() => {
                                const MODE_CARDS = {
                                    speed: {
                                        icon: '\u26A1', title: 'SPEED DRILL', color: '#FFD700', gradient: ['#FFD700', '#F59E0B'],
                                        difficulty: 'INTERMEDIATE', diffColor: '#FFD700',
                                        desc: 'Flash a hand \u2192 Pick the action \u2192 Build streaks! Time gets shorter the better you do. 3 lives \u2014 don\'t lose them!',
                                        stats: [{ label: 'FORMAT', value: '3 Lives' }, { label: 'SPEED', value: 'Accelerating' }, { label: 'REWARD', value: '\uD83D\uDC8E 15-50' }],
                                        mode: 'speed-drill', btn: 'START SPEED DRILL',
                                    },
                                    pressure: {
                                        icon: '\uD83D\uDCA3', title: 'PRESSURE COOKER', color: '#FF4444', gradient: ['#FF4444', '#FF0066'],
                                        difficulty: 'HARD', diffColor: '#FF4444',
                                        desc: 'Answer 10 hands before the clock runs out! Correct answers add time, wrong answers cost you. Can you defuse the bomb?',
                                        stats: [{ label: 'FORMAT', value: '10 Hands' }, { label: 'CLOCK', value: '\u00B13-5 sec' }, { label: 'REWARD', value: '\uD83D\uDC8E 20-60' }],
                                        mode: 'pressure-cooker', btn: 'START PRESSURE COOKER',
                                    },
                                    pattern: {
                                        icon: '\uD83E\uDDE9', title: 'PATTERN RECOGNITION', color: '#3B82F6', gradient: ['#3B82F6', '#0088ff'],
                                        difficulty: 'ADVANCED', diffColor: '#3B82F6',
                                        desc: 'See a partial range \u2192 Identify the dominant action. Is it a RAISING, CALLING, or FOLDING range? Train your GTO intuition.',
                                        stats: [{ label: 'FORMAT', value: '8 Patterns' }, { label: 'SKILL', value: 'Range Reading' }, { label: 'REWARD', value: '\uD83D\uDC8E 20-50' }],
                                        mode: 'pattern-recognition', btn: 'START PATTERN RECOGNITION',
                                    },
                                    mixed: {
                                        icon: '\uD83C\uDFB0', title: 'MIXED STRATEGY', color: '#A855F7', gradient: ['#A855F7', '#D946EF'],
                                        difficulty: 'EXPERT', diffColor: '#A855F7',
                                        desc: 'Dial in the exact frequency for complex GTO spots. Should you Raise 30% or 70%? 10 rounds of high-precision frequency training.',
                                        stats: [{ label: 'FORMAT', value: '10 Rounds' }, { label: 'SKILL', value: 'Frequencies' }, { label: 'REWARD', value: '\uD83D\uDC8E 25-75' }],
                                        mode: 'mixed-strategy', btn: 'START MIXED TRAINER',
                                    },
                                    spot: {
                                        icon: '\u25CE', title: 'SPOT TRAINER', color: '#F97316', gradient: ['#F97316', '#EA580C'],
                                        difficulty: 'ADVANCED', diffColor: '#F97316',
                                        desc: 'Play through entire hand trees from preflop to river. Learn how ranges evolve on each street and compare your EV to optimal GTO play.',
                                        stats: [{ label: 'FORMAT', value: 'Full Trees' }, { label: 'SKILL', value: 'EV Analysis' }, { label: 'REWARD', value: '\uD83D\uDC8E 30-80' }],
                                        mode: 'spot-trainer', btn: 'START SPOT TRAINER',
                                    },
                                    tournament: {
                                        icon: '\u2694\uFE0F', title: 'VS RANKED', color: '#EC4899', gradient: ['#EC4899', '#DB2777'],
                                        difficulty: 'COMPETITIVE', diffColor: '#EC4899',
                                        desc: 'Head-to-head GTO challenges against 300+ AI opponents for ELO ranking. Climb the ladder and prove you\'re the best.',
                                        stats: [{ label: 'FORMAT', value: 'Best of 10' }, { label: 'RANKING', value: 'ELO System' }, { label: 'REWARD', value: '\uD83D\uDC8E 40-100' }],
                                        mode: 'tournament', btn: 'ENTER RANKED BATTLE',
                                    },
                                };

                                const card = MODE_CARDS[gameType];
                                if (!card) return null;

                                // Personal best from localStorage
                                let personalBest = null;
                                try {
                                    const stored = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem(`pb_${card.mode}`) || 'null') : null;
                                    if (stored && stored.score) personalBest = stored;
                                } catch (e) { console.warn('[App] Handled exception:', e); }

                                return (
                                    <motion.div
                                        key={gameType}
                                        initial={{ opacity: 0, y: 20, scale: 0.97 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: -15, scale: 0.97 }}
                                        transition={{ duration: 0.25, ease: 'easeOut' }}
                                        style={{
                                            background: `linear-gradient(135deg, ${card.color}11, ${card.color}08)`,
                                            border: `2px solid ${card.color}4D`,
                                            borderRadius: 20,
                                            padding: '32px 28px',
                                            textAlign: 'center',
                                            maxWidth: 520,
                                            margin: '0 auto',
                                            position: 'relative',
                                            overflow: 'hidden',
                                        }}>
                                        {/* Difficulty Badge */}
                                        <div style={{
                                            position: 'absolute',
                                            top: 14,
                                            right: 14,
                                            padding: '4px 12px',
                                            background: `${card.diffColor}22`,
                                            border: `1px solid ${card.diffColor}66`,
                                            borderRadius: 20,
                                            fontSize: 10,
                                            fontWeight: 800,
                                            color: card.diffColor,
                                            letterSpacing: 1.5,
                                        }}>
                                            {card.difficulty}
                                        </div>

                                        <div style={{ fontSize: 48, marginBottom: 12 }}>{card.icon}</div>
                                        <h2 style={{
                                            fontSize: 24,
                                            fontWeight: 800,
                                            color: card.color,
                                            marginBottom: 10,
                                            letterSpacing: 1,
                                        }}>
                                            {card.title}
                                        </h2>

                                        <p style={{
                                            fontSize: 14,
                                            color: 'rgba(255,255,255,0.65)',
                                            marginBottom: 20,
                                            lineHeight: 1.6,
                                            maxWidth: 380,
                                            margin: '0 auto 20px',
                                        }}>
                                            {card.desc}
                                        </p>

                                        {/* Stat Pills */}
                                        <div style={{
                                            display: 'flex',
                                            justifyContent: 'center',
                                            gap: 12,
                                            marginBottom: 24,
                                            flexWrap: 'wrap',
                                        }}>
                                            {card.stats.map((s, i) => (
                                                <div key={i} style={{
                                                    background: 'rgba(0,0,0,0.3)',
                                                    borderRadius: 10,
                                                    padding: '8px 14px',
                                                    textAlign: 'center',
                                                    minWidth: 90,
                                                }}>
                                                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 600, letterSpacing: 1, marginBottom: 2 }}>
                                                        {s.label}
                                                    </div>
                                                    <div style={{ fontSize: 13, color: '#fff', fontWeight: 700 }}>
                                                        {s.value}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Personal Best Badge */}
                                        {personalBest && (
                                            <div style={{
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
                                                background: 'rgba(255,215,0,0.08)', border: '1px solid rgba(255,215,0,0.2)',
                                                borderRadius: 10, padding: '8px 16px', marginBottom: 16,
                                            }}>
                                                <span style={{ fontSize: 14 }}>{'\uD83C\uDFC6'}</span>
                                                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>YOUR BEST</span>
                                                <span style={{ fontSize: 14, color: '#FFD700', fontWeight: 800, fontFamily: 'Orbitron, sans-serif' }}>{personalBest.score}</span>
                                                {personalBest.grade && (
                                                    <span style={{
                                                        fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 4,
                                                        background: ({ S: '#FFD70022', A: '#22C55E22', B: '#3B82F622', C: '#F59E0B22', D: '#EF444422' })[personalBest.grade] || '#fff1',
                                                        color: ({ S: '#FFD700', A: '#22C55E', B: '#3B82F6', C: '#F59E0B', D: '#EF4444' })[personalBest.grade] || '#fff',
                                                    }}>{personalBest.grade}</span>
                                                )}
                                                {personalBest.plays && (
                                                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>{personalBest.plays} plays</span>
                                                )}
                                            </div>
                                        )}

                                        <button
                                            onClick={async () => {
                                                const canPlay = await checkAndDeductDiamonds();
                                                if (!canPlay) return;
                                                setMode(card.mode);
                                            }}
                                            style={{
                                                padding: '16px 48px',
                                                fontSize: 16,
                                                fontWeight: 800,
                                                background: `linear-gradient(135deg, ${card.gradient[0]}, ${card.gradient[1]})`,
                                                border: 'none',
                                                borderRadius: 14,
                                                color: '#fff',
                                                cursor: 'pointer',
                                                letterSpacing: 1,
                                                transition: 'all 0.2s ease',
                                                boxShadow: `0 4px 20px ${card.color}33`,
                                            }}
                                        >
                                            {card.btn}
                                        </button>
                                    </motion.div>
                                );
                            })()}
                            </AnimatePresence>

                            {/* Leaderboard Section */}
                            {gameType === 'leaderboard' && (
                                <div style={{
                                    background: 'linear-gradient(135deg, rgba(255, 215, 0, 0.05), rgba(255, 140, 0, 0.05))',
                                    border: '2px solid rgba(255, 215, 0, 0.3)',
                                    borderRadius: 20,
                                    padding: 24,
                                    maxWidth: 800,
                                    margin: '0 auto',
                                }}>
                                    <div style={{ textAlign: 'center', marginBottom: 24 }}>
                                        <div style={{ fontSize: 48, marginBottom: 12 }}>{'\uD83C\uDFC6'}</div>
                                        <h2 style={{ fontSize: 28, fontWeight: 700, color: '#FFD700', marginBottom: 8 }}>
                                            GLOBAL LEADERBOARD
                                        </h2>
                                        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>
                                            Compete with players worldwide. Top scores win prizes!
                                        </p>
                                    </div>

                                    {/* Mode Toggle */}
                                    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
                                        {[
                                            { id: 'range-memory', label: '\uD83C\uDFAF Range', color: '#00D4FF' },
                                            { id: 'speed-drill', label: '\u26A1 Speed', color: '#FFD700' },
                                            { id: 'pressure-cooker', label: '\uD83D\uDCA3 Pressure', color: '#ff4444' },
                                            { id: 'pattern-recognition', label: '\uD83E\uDDE9 Pattern', color: '#3B82F6' },
                                            { id: 'mixed-strategy', label: '\uD83C\uDFB0 Mixed', color: '#A855F7' },
                                            { id: 'spot-trainer', label: '\u25CE Spot', color: '#F97316' },
                                            { id: 'tournament', label: '\u2694\uFE0F Ranked', color: '#EC4899' },
                                        ].map(mode => (
                                            <button
                                                key={mode.id}
                                                onClick={() => {
                                                    setLeaderboardMode(mode.id);
                                                    loadLeaderboard();
                                                }}
                                                style={{
                                                    padding: '8px 16px',
                                                    fontSize: 12,
                                                    fontWeight: 600,
                                                    background: leaderboardMode === mode.id ? `${mode.color}22` : 'rgba(0,0,0,0.3)',
                                                    border: `2px solid ${leaderboardMode === mode.id ? mode.color : 'rgba(255,255,255,0.1)'}`,
                                                    borderRadius: 20,
                                                    color: leaderboardMode === mode.id ? mode.color : 'rgba(255,255,255,0.5)',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s ease',
                                                }}
                                            >
                                                {mode.label}
                                            </button>
                                        ))}
                                    </div>

                                    {/* User Rank Display */}
                                    {userRank && (
                                        <div style={{
                                            background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.15), rgba(138, 43, 226, 0.15))',
                                            border: '2px solid #00D4FF',
                                            borderRadius: 12,
                                            padding: 16,
                                            marginBottom: 20,
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                        }}>
                                            <div>
                                                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>YOUR RANK</div>
                                                <div style={{ fontSize: 32, fontWeight: 900, color: '#00D4FF' }}>#{userRank.rank || '-'}</div>
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>BEST SCORE</div>
                                                <div style={{ fontSize: 24, fontWeight: 700, color: '#fff' }}>{userRank.score || 0}</div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Leaderboard Table */}
                                    <div style={{
                                        background: 'rgba(0,0,0,0.4)',
                                        borderRadius: 12,
                                        overflow: 'hidden',
                                        maxHeight: 400,
                                        overflowY: 'auto',
                                    }}>
                                        {leaderboardLoading ? (
                                            <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>
                                                <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
                                                Loading rankings...
                                            </div>
                                        ) : leaderboardData.length === 0 ? (
                                            <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>
                                                <div style={{ fontSize: 32, marginBottom: 12 }}></div>
                                                No rankings yet. Be the first!
                                            </div>
                                        ) : (
                                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                                <thead>
                                                    <tr style={{ background: 'rgba(255,215,0,0.1)' }}>
                                                        <th style={{ padding: '12px 16px', textAlign: 'left', color: '#FFD700', fontSize: 12, fontWeight: 600 }}>RANK</th>
                                                        <th style={{ padding: '12px 16px', textAlign: 'left', color: '#FFD700', fontSize: 12, fontWeight: 600 }}>PLAYER</th>
                                                        <th style={{ padding: '12px 16px', textAlign: 'right', color: '#FFD700', fontSize: 12, fontWeight: 600 }}>SCORE</th>
                                                        <th style={{ padding: '12px 16px', textAlign: 'right', color: '#FFD700', fontSize: 12, fontWeight: 600 }}>STREAK</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {leaderboardData.map((entry, idx) => (
                                                        <tr
                                                            key={entry.user_id}
                                                            style={{
                                                                background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                                                                borderBottom: '1px solid rgba(255,255,255,0.05)',
                                                            }}
                                                        >
                                                            <td style={{ padding: '12px 16px', color: idx < 3 ? '#FFD700' : '#fff', fontSize: 14, fontWeight: idx < 3 ? 700 : 400 }}>
                                                                {idx === 0 ? '' : idx === 1 ? '' : idx === 2 ? '' : `#${idx + 1}`}
                                                            </td>
                                                            <td style={{ padding: '12px 16px', color: '#fff', fontSize: 14 }}>
                                                                {entry.display_name || 'Anonymous'}
                                                            </td>
                                                            <td style={{ padding: '12px 16px', color: '#00ff88', fontSize: 14, fontWeight: 600, textAlign: 'right' }}>
                                                                {entry.score?.toLocaleString()}
                                                            </td>
                                                            <td style={{ padding: '12px 16px', color: '#FF6B00', fontSize: 14, textAlign: 'right' }}>
                                                                {entry.streak || 0}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        )}
                                    </div>

                                    {/* Refresh Button */}
                                    <div style={{ textAlign: 'center', marginTop: 20 }}>
                                        <button
                                            onClick={loadLeaderboard}
                                            disabled={leaderboardLoading}
                                            style={{
                                                padding: '12px 32px',
                                                fontSize: 14,
                                                fontWeight: 600,
                                                background: 'rgba(255,255,255,0.1)',
                                                border: '1px solid rgba(255,255,255,0.2)',
                                                borderRadius: 30,
                                                color: '#fff',
                                                cursor: 'pointer',
                                            }}
                                        >
                                            🔄 Refresh Rankings
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Daily Challenge Section */}
                            {gameType === 'daily' && (
                                <div style={{
                                    background: 'linear-gradient(135deg, rgba(0, 255, 136, 0.05), rgba(0, 212, 255, 0.05))',
                                    border: '2px solid rgba(0, 255, 136, 0.3)',
                                    borderRadius: 20,
                                    padding: 24,
                                    maxWidth: 600,
                                    margin: '0 auto',
                                }}>
                                    {/* Streak Display */}
                                    <div style={{
                                        display: 'flex',
                                        justifyContent: 'center',
                                        gap: 32,
                                        marginBottom: 24,
                                    }}>
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ fontSize: 48, marginBottom: 4 }}></div>
                                            <div style={{ fontSize: 32, fontWeight: 900, color: '#FF6B00' }}>{userStreak.current_streak || 0}</div>
                                            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Current Streak</div>
                                        </div>
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ fontSize: 48, marginBottom: 4 }}></div>
                                            <div style={{ fontSize: 32, fontWeight: 900, color: '#FFD700' }}>{userStreak.longest_streak || 0}</div>
                                            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Best Streak</div>
                                        </div>
                                    </div>

                                    {/* Challenge Card */}
                                    <div style={{ textAlign: 'center', marginBottom: 24 }}>
                                        <div style={{ fontSize: 48, marginBottom: 12 }}>◉</div>
                                        <h2 style={{ fontSize: 28, fontWeight: 700, color: '#00ff88', marginBottom: 8 }}>
                                            DAILY CHALLENGE
                                        </h2>
                                        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', marginBottom: 20 }}>
                                            Complete today's challenge to keep your streak alive!
                                        </p>
                                    </div>

                                    {challengeLoading ? (
                                        <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>
                                            <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
                                            Loading today's challenge...
                                        </div>
                                    ) : challengeCompleted ? (
                                        <div style={{
                                            background: 'linear-gradient(135deg, rgba(0, 255, 136, 0.2), rgba(0, 212, 255, 0.2))',
                                            border: '2px solid #00ff88',
                                            borderRadius: 16,
                                            padding: 32,
                                            textAlign: 'center',
                                        }}>
                                            <div style={{ fontSize: 64, marginBottom: 16, color: '#00ff88' }}>✓</div>
                                            <h3 style={{ fontSize: 24, fontWeight: 700, color: '#00ff88', marginBottom: 8 }}>
                                                CHALLENGE COMPLETE!
                                            </h3>
                                            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>
                                                Come back tomorrow for a new challenge!
                                            </p>
                                            <div style={{ marginTop: 20, fontSize: 18, color: '#FFD700' }}>
                                                +{dailyChallenge?.diamond_reward || 50} Diamonds Earned!
                                            </div>
                                        </div>
                                    ) : dailyChallenge ? (
                                        <div style={{
                                            background: 'rgba(0,0,0,0.4)',
                                            border: '1px solid rgba(255,255,255,0.1)',
                                            borderRadius: 16,
                                            padding: 24,
                                        }}>
                                            <div style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 16,
                                                marginBottom: 16,
                                                padding: '12px 16px',
                                                background: 'rgba(0, 255, 136, 0.1)',
                                                borderRadius: 12,
                                            }}>
                                                <div style={{ fontSize: 32 }}>
                                                    {dailyChallenge.game_mode === 'range-memory' ? '\uD83C\uDFAF' :
                                                        dailyChallenge.game_mode === 'speed-drill' ? '\u26A1' :
                                                            dailyChallenge.game_mode === 'pressure-cooker' ? '\uD83D\uDCA3' :
                                                                dailyChallenge.game_mode === 'pattern-recognition' ? '\uD83E\uDDE9' :
                                                                    dailyChallenge.game_mode === 'mixed-strategy' ? '\uD83C\uDFB0' :
                                                                        dailyChallenge.game_mode === 'spot-trainer' ? '\u25CE' :
                                                                            dailyChallenge.game_mode === 'tournament' ? '\u2694\uFE0F' : '\uD83C\uDFAF'}
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>
                                                        {dailyChallenge.title || 'Today\'s Challenge'}
                                                    </div>
                                                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                                                        Level {dailyChallenge.level || 1} • {dailyChallenge.game_mode?.replace('-', ' ').toUpperCase()}
                                                    </div>
                                                </div>
                                            </div>

                                            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', marginBottom: 20 }}>
                                                {dailyChallenge.description || `Score ${dailyChallenge.target_accuracy || 80}% or higher to complete the challenge.`}
                                            </p>

                                            <div style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                padding: '12px 16px',
                                                background: 'rgba(255,215,0,0.1)',
                                                borderRadius: 12,
                                                marginBottom: 20,
                                            }}>
                                                <div>
                                                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>TARGET SCORE</div>
                                                    <div style={{ fontSize: 20, fontWeight: 700, color: '#00ff88' }}>{dailyChallenge.target_accuracy || 80}%</div>
                                                </div>
                                                <div style={{ textAlign: 'right' }}>
                                                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>REWARD</div>
                                                    <div style={{ fontSize: 20, fontWeight: 700, color: '#FFD700' }}>{dailyChallenge.diamond_reward || 50}Diamonds</div>
                                                </div>
                                            </div>

                                            <button
                                                onClick={() => {
                                                    // Start the challenge based on game mode
                                                    const mode = dailyChallenge.game_mode;
                                                    if (mode === 'range-memory') {
                                                        startGame(dailyChallenge.level || 1);
                                                    } else if (mode === 'speed-drill') {
                                                        setMode('speed-drill');
                                                    } else if (mode === 'pressure-cooker') {
                                                        setMode('pressure-cooker');
                                                    } else if (mode === 'pattern-recognition') {
                                                        setMode('pattern-recognition');
                                                    } else if (mode === 'mixed-strategy') {
                                                        setMode('mixed-strategy');
                                                    }
                                                }}
                                                style={{
                                                    width: '100%',
                                                    padding: '16px 32px',
                                                    fontSize: 18,
                                                    fontWeight: 700,
                                                    background: 'linear-gradient(135deg, #00ff88, #00D4FF)',
                                                    color: '#000',
                                                    border: 'none',
                                                    borderRadius: 50,
                                                    cursor: 'pointer',
                                                    boxShadow: '0 0 30px rgba(0, 255, 136, 0.4)',
                                                }}
                                            >
                                                START DAILY CHALLENGE
                                            </button>
                                        </div>
                                    ) : (
                                        <div style={{
                                            background: 'rgba(255,165,0,0.1)',
                                            border: '1px solid rgba(255,165,0,0.3)',
                                            borderRadius: 16,
                                            padding: 32,
                                            textAlign: 'center',
                                        }}>
                                            <div style={{ fontSize: 48, marginBottom: 12 }}></div>
                                            <h3 style={{ fontSize: 18, fontWeight: 600, color: '#FFA500', marginBottom: 8 }}>
                                                No Challenge Available
                                            </h3>
                                            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>
                                                Check back soon for today's challenge!
                                            </p>
                                        </div>
                                    )}

                                    {/* Streak Rewards Info */}
                                    <div style={{
                                        marginTop: 24,
                                        padding: 16,
                                        background: 'rgba(0,0,0,0.3)',
                                        borderRadius: 12,
                                        textAlign: 'center',
                                    }}>
                                        <div style={{ fontSize: 14, fontWeight: 600, color: '#FFD700', marginBottom: 8 }}>
                                            STREAK REWARDS
                                        </div>
                                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>
                                            7 days: +100Diamonds bonus • 30 days: +500Diamonds bonus • 100 days: +2000Diamonds bonus
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Level Grid - Only show for Range Memory */}
                            {gameType === 'range' && (
                                <>
                                    {/* Filter Toggle Button + AI Generation Toggle */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                        <h3 style={{ margin: 0, fontSize: 16, color: 'rgba(255,255,255,0.8)' }}>
                                            Select a Level
                                        </h3>
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            {/* AI Generation Toggle (VIP Feature) */}
                                            <button
                                                onClick={() => setUseAIGeneration(!useAIGeneration)}
                                                style={{
                                                    padding: '8px 16px',
                                                    background: useAIGeneration ? 'rgba(255, 215, 0, 0.2)' : 'rgba(255, 255, 255, 0.1)',
                                                    border: useAIGeneration ? '1px solid #FFD700' : '1px solid rgba(255, 255, 255, 0.2)',
                                                    borderRadius: 20,
                                                    color: useAIGeneration ? '#FFD700' : 'rgba(255, 255, 255, 0.7)',
                                                    fontSize: 13,
                                                    fontWeight: 600,
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 6,
                                                }}
                                                title="Generate Unique Scenarios Using Jarvis AI"
                                            >
                                                {useAIGeneration ? 'AI ON' : 'AI Mode'}
                                            </button>

                                            {/* Filter Toggle */}
                                            <button
                                                onClick={() => setShowFilters(!showFilters)}
                                                style={{
                                                    padding: '8px 16px',
                                                    background: showFilters ? 'rgba(0, 212, 255, 0.2)' : 'rgba(255, 255, 255, 0.1)',
                                                    border: showFilters ? '1px solid #00D4FF' : '1px solid rgba(255, 255, 255, 0.2)',
                                                    borderRadius: 20,
                                                    color: showFilters ? '#00D4FF' : 'rgba(255, 255, 255, 0.7)',
                                                    fontSize: 13,
                                                    fontWeight: 600,
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 6,
                                                }}
                                            >
                                                <Filter size={14} aria-hidden style={{ verticalAlign: '-2px', marginRight: 4 }} />{showFilters ? 'Hide filters' : 'Filter scenarios'}
                                                {Object.keys(scenarioFilters || {}).filter(k => scenarioFilters[k]).length > 0 && (
                                                    <span style={{
                                                        background: '#00D4FF',
                                                        color: '#000',
                                                        padding: '2px 6px',
                                                        borderRadius: 10,
                                                        fontSize: 11,
                                                        fontWeight: 700,
                                                    }}>
                                                        {Object.keys(scenarioFilters || {}).filter(k => scenarioFilters[k]).length}
                                                    </span>
                                                )}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Filter Panel */}
                                    {showFilters && (
                                        <ScenarioFilterPanel
                                            onFilterChange={(filters) => {
                                                setScenarioFilters(filters);
                                            }}
                                            onClose={() => setShowFilters(false)}
                                            currentFilters={scenarioFilters}
                                            availableScenarios={(() => {
                                                const allScenarios = [
                                                    ...LEVEL_1_SCENARIOS,
                                                    ...LEVEL_2_SCENARIOS,
                                                    ...LEVEL_3_SCENARIOS,
                                                    ...LEVEL_4_SCENARIOS,
                                                    ...LEVEL_5_SCENARIOS,
                                                    ...LEVEL_6_SCENARIOS,
                                                    ...LEVEL_7_SCENARIOS,
                                                    ...LEVEL_8_SCENARIOS,
                                                    ...LEVEL_9_SCENARIOS,
                                                    ...LEVEL_10_SCENARIOS,
                                                ];
                                                return allScenarios.length;
                                            })()}
                                            filteredCount={(() => {
                                                const allScenarios = [
                                                    ...LEVEL_1_SCENARIOS,
                                                    ...LEVEL_2_SCENARIOS,
                                                    ...LEVEL_3_SCENARIOS,
                                                    ...LEVEL_4_SCENARIOS,
                                                    ...LEVEL_5_SCENARIOS,
                                                    ...LEVEL_6_SCENARIOS,
                                                    ...LEVEL_7_SCENARIOS,
                                                    ...LEVEL_8_SCENARIOS,
                                                    ...LEVEL_9_SCENARIOS,
                                                    ...LEVEL_10_SCENARIOS,
                                                ];
                                                return filterScenarios(allScenarios, scenarioFilters).length;
                                            })()}
                                        />
                                    )}

                                    <div style={styles.levelGrid}>
                                        {LEVELS.map((level, idx) => {
                                            const scenarioCount = getLevelScenarios(level.level);
                                            const levelConfig = getLevelConfig(level.level) || { timer: 90, gridSize: 13, maxHands: 20, xpMultiplier: 1 };
                                            const isUnlocked = idx === 0 || consecutivePasses >= (idx * 5);

                                            return (
                                                <div
                                                    key={level.level}
                                                    onClick={() => isUnlocked && scenarioCount > 0 && startGame(level.level)}
                                                    style={{
                                                        ...styles.levelCard,
                                                        opacity: isUnlocked && scenarioCount > 0 ? 1 : 0.4,
                                                        cursor: isUnlocked && scenarioCount > 0 ? 'pointer' : 'not-allowed',
                                                        borderColor: isUnlocked ? '#00D4FF' : '#333',
                                                    }}
                                                >
                                                    <div style={styles.levelNumber}>Level {level.level}</div>
                                                    <h3 style={styles.levelName}>{level.name}</h3>
                                                    <p style={styles.levelFocus}>{level.focus}</p>
                                                    <div style={styles.levelMeta}>
                                                        <span> {levelConfig.timer}s</span>
                                                        <span>×{levelConfig.xpMultiplier} XP</span>
                                                    </div>
                                                    <div style={styles.levelMeta}>
                                                        <span>{scenarioCount} scenario{scenarioCount !== 1 ? 's' : ''}</span>
                                                        {!isUnlocked && <Lock size={12} aria-hidden style={{ color: 'rgba(255,255,255,0.45)' }} />}
                                                    </div>
                                                    {/* 2026-05-07 — real progress from memoryDashboard.per_level_mastery */}
                                                    {(() => {
                                                        const m = memoryDashboard?.per_level_mastery?.find(x => x.level === level.level);
                                                        if (!m || m.attempts === 0) return null;
                                                        const pct = Math.max(0, Math.min(100, m.best_accuracy));
                                                        return (
                                                            <div style={{ marginTop: 8 }}>
                                                                <div style={{
                                                                    display: 'flex',
                                                                    justifyContent: 'space-between',
                                                                    alignItems: 'center',
                                                                    fontSize: 10,
                                                                    color: 'rgba(255,255,255,0.55)',
                                                                    marginBottom: 4,
                                                                }}>
                                                                    <span>Best {pct}%</span>
                                                                    {m.mastered && (
                                                                        <span style={{
                                                                            display: 'inline-flex',
                                                                            alignItems: 'center',
                                                                            gap: 3,
                                                                            color: '#22C55E',
                                                                            fontWeight: 600,
                                                                        }}>
                                                                            <ShieldCheck size={10} aria-hidden /> Mastered
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <div style={{
                                                                    height: 4,
                                                                    background: 'rgba(255,255,255,0.06)',
                                                                    borderRadius: 999,
                                                                    overflow: 'hidden',
                                                                }} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                                                                    <div style={{
                                                                        height: '100%',
                                                                        width: pct + '%',
                                                                        background: m.mastered
                                                                            ? 'linear-gradient(90deg, #22C55E, #00D4FF)'
                                                                            : 'linear-gradient(90deg, #00D4FF, #A855F7)',
                                                                        transition: 'width 0.4s ease',
                                                                    }} />
                                                                </div>
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Mastery Gate */}
                                    <div style={styles.masteryGate}>
                                        <ShieldCheck size={20} aria-hidden style={{ color: '#00D4FF' }} />
                                        <div>
                                            <div style={styles.masteryTitle}>85% Mastery Gate</div>
                                            <div style={styles.masteryDesc}>
                                                Score 85%+ on 5 consecutive scenarios to unlock the next level
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* Recent Sessions */}
                            {sessionHistory.length > 0 && (
                                <div style={{
                                    background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.6), rgba(30, 41, 59, 0.4))',
                                    border: '1px solid rgba(255,255,255,0.08)',
                                    borderRadius: 16,
                                    padding: 20,
                                    marginTop: 24,
                                    marginBottom: 16,
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                                        <span style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.8)', letterSpacing: 0.5 }}>
                                            RECENT SESSIONS
                                        </span>
                                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
                                            Last {Math.min(sessionHistory.length, 8)}
                                        </span>
                                    </div>

                                    {/* Mini Trend Chart */}
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'flex-end',
                                        gap: 4,
                                        height: 48,
                                        marginBottom: 16,
                                        padding: '0 4px',
                                    }}>
                                        {sessionHistory.slice(-12).map((s, i, arr) => {
                                            const maxScore = Math.max(...arr.map(x => x.score || 0), 1);
                                            const pct = ((s.score || 0) / maxScore) * 100;
                                            const isLast = i === arr.length - 1;
                                            const color = (s.score || 0) >= 85 ? '#22C55E' : (s.score || 0) >= 60 ? '#3B82F6' : '#F59E0B';
                                            return (
                                                <div key={i} style={{
                                                    flex: 1,
                                                    height: `${Math.max(pct, 8)}%`,
                                                    background: isLast
                                                        ? `linear-gradient(to top, ${color}, ${color}88)`
                                                        : `${color}44`,
                                                    borderRadius: 3,
                                                    transition: 'height 0.3s ease',
                                                    position: 'relative',
                                                }} title={`Score: ${s.score || 0}%`} />
                                            );
                                        })}
                                    </div>

                                    {/* Session List */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        {sessionHistory.slice(-5).reverse().map((s, i) => {
                                            const date = new Date(s.timestamp);
                                            const timeAgo = (() => {
                                                const diff = Date.now() - s.timestamp;
                                                const mins = Math.floor(diff / 60000);
                                                if (mins < 60) return `${mins}m ago`;
                                                const hrs = Math.floor(mins / 60);
                                                if (hrs < 24) return `${hrs}h ago`;
                                                return `${Math.floor(hrs / 24)}d ago`;
                                            })();
                                            const grade = (s.score || 0) >= 95 ? 'S' : (s.score || 0) >= 85 ? 'A' : (s.score || 0) >= 70 ? 'B' : (s.score || 0) >= 50 ? 'C' : 'D';
                                            const gradeColor = { S: '#FFD700', A: '#22C55E', B: '#3B82F6', C: '#F59E0B', D: '#EF4444' }[grade];
                                            return (
                                                <div key={i} style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 10,
                                                    padding: '8px 12px',
                                                    background: 'rgba(0,0,0,0.2)',
                                                    borderRadius: 10,
                                                }}>
                                                    <div style={{
                                                        width: 28,
                                                        height: 28,
                                                        borderRadius: 6,
                                                        background: `${gradeColor}22`,
                                                        border: `1px solid ${gradeColor}55`,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontSize: 13,
                                                        fontWeight: 900,
                                                        color: gradeColor,
                                                        flexShrink: 0,
                                                    }}>
                                                        {grade}
                                                    </div>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>
                                                            Level {s.level || '?'} {s.position ? `\u2022 ${s.position}` : ''}
                                                        </div>
                                                    </div>
                                                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                                        <div style={{ fontSize: 13, fontWeight: 700, color: gradeColor }}>
                                                            {s.score || 0}%
                                                        </div>
                                                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>
                                                            {timeAgo}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Quick Stats Row */}
                                    <div style={{
                                        display: 'flex',
                                        justifyContent: 'space-around',
                                        marginTop: 14,
                                        paddingTop: 14,
                                        borderTop: '1px solid rgba(255,255,255,0.06)',
                                    }}>
                                        {[
                                            { label: 'SESSIONS', value: sessionHistory.length },
                                            { label: 'AVG SCORE', value: `${Math.round(sessionHistory.reduce((a, s) => a + (s.score || 0), 0) / sessionHistory.length)}%` },
                                            { label: 'BEST', value: `${Math.max(...sessionHistory.map(s => s.score || 0))}%` },
                                        ].map((stat, i) => (
                                            <div key={i} style={{ textAlign: 'center' }}>
                                                <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>{stat.value}</div>
                                                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', fontWeight: 600, letterSpacing: 1 }}>{stat.label}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* VIP Upsell */}
                            {!isVIP && (
                                <div style={styles.vipUpsell}>
                                    <div style={styles.vipTitle}> GO VIP - $19.99/month</div>
                                    <div style={styles.vipFeatures}>
                                        Unlimited games • All levels • No diamond cost • Exclusive modes
                                    </div>
                                    <button style={styles.vipButton} onClick={handleVipUpgrade}>
                                        Upgrade to VIP
                                    </button>
                                </div>
                            )}
                        </>
                    )}

                    {/* Speed Drill Mode - Full Implementation */}
                    {mode === 'speed-drill' && (
                        <SpeedDrillGame
                            level={currentLevel}
                            onExit={() => setMode('menu')}
                            onScoreUpdate={(newBalance) => setDiamondBalance(newBalance)}
                            DiamondEngine={DiamondEngine}
                            userId={userId}
                        />
                    )}

                    {/* Pressure Cooker Mode - Full Implementation */}
                    {mode === 'pressure-cooker' && (
                        <PressureCookerGame
                            level={currentLevel}
                            onExit={() => setMode('menu')}
                            onScoreUpdate={(newBalance) => setDiamondBalance(newBalance)}
                            DiamondEngine={DiamondEngine}
                            userId={userId}
                        />
                    )}

                    {/* Pattern Recognition Mode - Full Implementation */}
                    {mode === 'pattern-recognition' && (
                        <PatternRecognitionGame
                            level={currentLevel}
                            onExit={() => setMode('menu')}
                            onScoreUpdate={(newBalance) => setDiamondBalance(newBalance)}
                            DiamondEngine={DiamondEngine}
                            userId={userId}
                        />
                    )}

                    {/* Mixed Strategy Mode - Full Implementation */}
                    {mode === 'mixed-strategy' && (
                        <MixedStrategyGame
                            level={currentLevel}
                            onExit={() => setMode('menu')}
                            onScoreUpdate={(newBalance) => setDiamondBalance(newBalance)}
                            DiamondEngine={DiamondEngine}
                            userId={userId}
                        />
                    )}

                    {/* Spot Trainer Mode - Full Implementation */}
                    {mode === 'spot-trainer' && (
                        <SpotTrainerGame
                            level={currentLevel}
                            onExit={() => setMode('menu')}
                            onScoreUpdate={(newBalance) => setDiamondBalance(newBalance)}
                            DiamondEngine={DiamondEngine}
                            userId={userId}
                        />
                    )}

                    {/* Tournament Mode - Full Implementation */}
                    {mode === 'tournament' && (
                        <TournamentModeGame
                            level={currentLevel}
                            onExit={() => setMode('menu')}
                            onScoreUpdate={(newBalance) => setDiamondBalance(newBalance)}
                            DiamondEngine={DiamondEngine}
                            userId={userId}
                        />
                    )}

                    {/* Out of Diamonds Modal */}
                    <OutOfDiamondsModal
                        isOpen={showOutOfDiamondsModal}
                        onClose={() => setShowOutOfDiamondsModal(false)}
                        gameCost={GAME_COST}
                        isVIP={isVIP}
                    />

                    {/* AI Generation Loading Overlay */}
                    {aiGenerating && (
                        <div style={{
                            position: 'fixed',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            background: 'rgba(0, 0, 0, 0.85)',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 9999,
                        }}>
                            <div style={{
                                fontSize: 48,
                                marginBottom: 20,
                                animation: 'pulse 1.5s infinite',
                            }}>
                                ◈
                            </div>
                            <div style={{
                                fontSize: 20,
                                fontWeight: 600,
                                color: '#FFD700',
                                marginBottom: 10,
                            }}>
                                Jarvis is generating your scenario...
                            </div>
                            <div style={{
                                fontSize: 14,
                                color: 'rgba(255, 255, 255, 0.6)',
                            }}>
                                Creating a unique, solver-accurate training challenge
                            </div>
                            <style>{`
                                @keyframes pulse {
                                    0%, 100% { transform: scale(1); }
                                    50% { transform: scale(1.15); }
                                }
                            `}</style>
                        </div>
                    )}

                    {(mode === 'game' || mode === 'result') && currentScenario && (
                        <>
                            {/* Timer Bar */}
                            <div style={styles.timerContainer}>
                                <div
                                    style={{
                                        ...styles.timerBar,
                                        width: `${(timeRemaining / safeLevelConfig.timer) * 100}%`,
                                        backgroundColor: getTimerColor(),
                                    }}
                                />
                                <div style={{
                                    ...styles.timerText,
                                    color: getTimerColor(),
                                }}>
                                    {timeRemaining}s
                                </div>
                            </div>

                            {/* Scenario Header */}
                            <div style={styles.gameHeader}>
                                <div>
                                    <div style={styles.levelBadge}>Level {currentLevel} •  {safeLevelConfig.timer}s</div>
                                    <h2 style={styles.scenarioTitle}>{currentScenario.title}</h2>
                                    <p style={styles.scenarioDesc}>{currentScenario.description}</p>
                                    {currentScenario.tip && !gradeResult && (
                                        <p style={styles.tipText}> {currentScenario.tip}</p>
                                    )}
                                </div>
                                {gradeResult && (
                                    <div style={styles.scoreDisplay}>
                                        <div style={{
                                            ...styles.scoreValue,
                                            color: gradeResult.score >= 85 ? '#00ff88' : '#ff4444',
                                        }}>
                                            {gradeResult.score}%
                                        </div>
                                        <div style={{
                                            ...styles.passBadge,
                                            background: gradeResult.score >= 85
                                                ? 'linear-gradient(135deg, #00ff88, #00D4FF)'
                                                : 'linear-gradient(135deg, #ff4444, #ff6b6b)',
                                        }}>
                                            {gradeResult.score >= 85 ? ' PASSED' : '✗ FAILED'}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Action Bar */}
                            <div style={styles.actionBar}>
                                {Object.entries(ACTION_COLORS || {}).map(([action, { bg, border, label, key }]) => (
                                    <button
                                        key={action}
                                        onClick={() => setSelectedAction(action)}
                                        disabled={!!gradeResult}
                                        style={{
                                            ...styles.actionButton,
                                            background: selectedAction === action ? bg : 'rgba(0,0,0,0.4)',
                                            borderColor: selectedAction === action ? border : 'rgba(255,255,255,0.2)',
                                            color: selectedAction === action ? '#fff' : 'rgba(255,255,255,0.5)',
                                            transform: selectedAction === action ? 'scale(1.05)' : 'scale(1)',
                                        }}
                                    >
                                        <span style={styles.keyHint}>{key}</span>
                                        {label}
                                    </button>
                                ))}
                            </div>

                            {/* Grid */}
                            <div style={styles.gridWrapper}>
                                <div style={styles.grid}>
                                    {RANKS.map((_, row) => (
                                        RANKS.map((_, col) => {
                                            const hand = getHandName(row, col);
                                            const userAction = userGrid[hand];
                                            const solutionAction = currentScenario.solution[hand];
                                            const actionStyle = userAction && ACTION_COLORS[userAction];

                                            let feedbackBorder = 'transparent';
                                            if (gradeResult) {
                                                if (gradeResult.missedHands.includes(hand)) feedbackBorder = '#3B82F6';
                                                else if (gradeResult.extraHands.includes(hand)) feedbackBorder = '#EF4444';
                                                else if (gradeResult.wrongActionHands.includes(hand)) feedbackBorder = '#F59E0B';
                                            }

                                            return (
                                                <div
                                                    key={hand}
                                                    onClick={() => handleCellClick(hand)}
                                                    style={{
                                                        ...styles.cell,
                                                        background: actionStyle?.bg || 'rgba(20, 20, 30, 0.6)',
                                                        borderColor: actionStyle?.border || 'rgba(255,255,255,0.1)',
                                                        boxShadow: feedbackBorder !== 'transparent'
                                                            ? `inset 0 0 0 2px ${feedbackBorder}`
                                                            : 'none',
                                                        cursor: gradeResult ? 'default' : 'pointer',
                                                    }}
                                                >
                                                    {hand}
                                                </div>
                                            );
                                        })
                                    ))}
                                </div>
                            </div>

                            {/* Submit / Result Buttons */}
                            <div style={styles.buttonArea}>
                                {!gradeResult ? (
                                    <button onClick={() => handleSubmit()} style={styles.submitButton}>
                                        SUBMIT RANGE [SPACE]
                                    </button>
                                ) : (
                                    <div style={styles.resultButtons}>
                                        <button onClick={() => setMode('menu')} style={styles.menuButton}>
                                            ← MENU
                                        </button>
                                        <button onClick={handleNext} style={styles.nextButton}>
                                            NEXT SCENARIO →
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Result Feedback */}
                            {gradeResult && (
                                <div style={styles.feedbackPanel}>
                                    <div style={styles.feedbackGrid}>
                                        <div style={styles.feedbackItem}>
                                            <span style={{ color: '#00ff88' }}> Correct</span>
                                            <span style={styles.feedbackValue}>{gradeResult.correctHands}</span>
                                        </div>
                                        <div style={styles.feedbackItem}>
                                            <span style={{ color: '#3B82F6' }}>● Missed</span>
                                            <span style={styles.feedbackValue}>{gradeResult.missedHands.length}</span>
                                        </div>
                                        <div style={styles.feedbackItem}>
                                            <span style={{ color: '#EF4444' }}>● Extra</span>
                                            <span style={styles.feedbackValue}>{gradeResult.extraHands.length}</span>
                                        </div>
                                        <div style={styles.feedbackItem}>
                                            <span style={{ color: '#F59E0B' }}>● Wrong Action</span>
                                            <span style={styles.feedbackValue}>{gradeResult.wrongActionHands.length}</span>
                                        </div>
                                    </div>
                                    {gradeResult.score >= 85 && lastReward && (
                                        <div style={styles.rewardSummary}>
                                            Diamonds +{lastReward.diamonds} Diamonds earned! (×{multiplier} multiplier)
                                        </div>
                                    )}

                                    {/* Ask Jarvis Why Button - shows when there are mistakes */}
                                    {(gradeResult.missedHands.length > 0 || gradeResult.wrongActionHands.length > 0) && (<>
                                        <button
                                            onClick={() => {
                                                const firstMistake = gradeResult.wrongActionHands[0] || gradeResult.missedHands[0];
                                                const correctAction = currentScenario?.solution?.[firstMistake] || 'call';
                                                const userAction = userGrid[firstMistake] || 'fold';
                                                fetchJarvisExplanation(firstMistake, correctAction, userAction);
                                            }}
                                            style={{
                                                marginTop: 16,
                                                padding: '12px 24px',
                                                background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.3), rgba(59, 130, 246, 0.3))',
                                                border: '1px solid rgba(139, 92, 246, 0.5)',
                                                borderRadius: 12,
                                                color: '#fff',
                                                fontSize: 14,
                                                fontWeight: 600,
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: 8,
                                                width: '100%'
                                            }}
                                        >
                                            Ask Jarvis: Why was I wrong?
                                        </button>
                                        <button
                                            onClick={() => fetchCoachAnalysis(gradeResult)}
                                            style={{
                                                marginTop: 8,
                                                padding: '10px 20px',
                                                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.3), rgba(6, 182, 212, 0.3))',
                                                border: '1px solid rgba(16, 185, 129, 0.5)',
                                                borderRadius: 12,
                                                color: '#fff',
                                                fontSize: 13,
                                                fontWeight: 500,
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: 8,
                                                width: '100%'
                                            }}
                                        >
                                            Get Full Game Analysis
                                        </button>
                                    </>)}


                                    {/* Jarvis Coach Panel */}
                                    {coachAnalysis.show && (
                                        <div style={{
                                            marginTop: 16,
                                            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(6, 182, 212, 0.1))',
                                            border: '1px solid rgba(16, 185, 129, 0.3)',
                                            borderRadius: 12,
                                            padding: 16
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                                <span style={{ fontSize: 20, fontWeight: 'bold', color: '#10B981' }}>J</span>
                                                <span style={{ fontFamily: 'Orbitron', fontSize: 14, color: '#10B981' }}>Jarvis Analysis</span>
                                            </div>

                                            {coachAnalysis.loading ? (
                                                <div style={{ textAlign: 'center', padding: 20, color: 'rgba(255, 255, 255, 0.6)' }}>
                                                    <div style={{ marginBottom: 8 }}>...</div>
                                                    Jarvis is analyzing your game...
                                                </div>
                                            ) : coachAnalysis.analysis ? (
                                                <div>
                                                    {/* Summary */}
                                                    <div style={{
                                                        color: 'rgba(255, 255, 255, 0.9)',
                                                        lineHeight: 1.6,
                                                        marginBottom: 12,
                                                        fontSize: 14
                                                    }}>
                                                        {coachAnalysis.analysis.summary}
                                                    </div>

                                                    {/* Pattern Insights */}
                                                    {coachAnalysis.analysis.patternInsights?.length > 0 && (
                                                        <div style={{ marginBottom: 12 }}>
                                                            <div style={{ fontSize: 12, color: '#10B981', marginBottom: 6 }}>Patterns Detected</div>
                                                            {coachAnalysis.analysis.patternInsights.map((item, i) => (
                                                                <div key={i} style={{
                                                                    background: 'rgba(0, 0, 0, 0.2)',
                                                                    borderRadius: 8,
                                                                    padding: 8,
                                                                    marginBottom: 6,
                                                                    fontSize: 13
                                                                }}>
                                                                    <span style={{ color: '#FFD700' }}>{item.pattern}:</span>{' '}
                                                                    <span style={{ color: 'rgba(255, 255, 255, 0.7)' }}>{item.insight}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}

                                                    {/* Recommendations */}
                                                    {coachAnalysis.analysis.recommendations?.length > 0 && (
                                                        <div>
                                                            <div style={{ fontSize: 12, color: '#06B6D4', marginBottom: 6 }}>Next Steps</div>
                                                            {coachAnalysis.analysis.recommendations.map((rec, i) => (
                                                                <div key={i} style={{
                                                                    display: 'flex',
                                                                    alignItems: 'flex-start',
                                                                    gap: 8,
                                                                    marginBottom: 4,
                                                                    fontSize: 13,
                                                                    color: 'rgba(255, 255, 255, 0.8)'
                                                                }}>
                                                                    <span>•</span>
                                                                    <span>{rec}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : null}
                                        </div>
                                    )}
                                </div>
                            )}


                            {/* ═══ ENHANCED REVIEW PANEL - GTO Wizard-Quality Analysis ═══ */}
                            {gradeResult && (
                                <EnhancedReviewPanel
                                    gradeResult={gradeResult}
                                    scenario={currentScenario}
                                    userGrid={userGrid}
                                    sessionHistory={sessionHistory}
                                    onAskJarvis={(hand, correctAction, userAction) => fetchJarvisExplanation(hand, correctAction, userAction)}
                                    onCoachAnalysis={() => fetchCoachAnalysis(gradeResult)}
                                />
                            )}

                            {/* Jarvis GTO Panel Modal - Futuristic Metal Design */}
                            {explainModal.show && (
                                <div style={{
                                    position: 'fixed',
                                    top: 0, left: 0, right: 0, bottom: 0,
                                    background: 'rgba(0, 0, 0, 0.92)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    zIndex: 9999,
                                    padding: 16,
                                    backdropFilter: 'blur(8px)'
                                }}>
                                    <div style={{
                                        maxWidth: 440,
                                        width: '100%',
                                        position: 'relative'
                                    }}>
                                        {/* Close Button */}
                                        <button
                                            onClick={() => setExplainModal(prev => ({ ...prev, show: false }))}
                                            style={{
                                                position: 'absolute',
                                                top: -12,
                                                right: -12,
                                                background: 'linear-gradient(135deg, #1a1a2e, #0a0a12)',
                                                border: '2px solid rgba(0, 212, 255, 0.5)',
                                                borderRadius: '50%',
                                                width: 36,
                                                height: 36,
                                                color: '#00D4FF',
                                                cursor: 'pointer',
                                                fontSize: 16,
                                                fontWeight: 'bold',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                boxShadow: '0 4px 20px rgba(0, 212, 255, 0.3)',
                                                zIndex: 10
                                            }}
                                        >
                                            ✕
                                        </button>

                                        {explainModal.loading ? (
                                            /* Loading State - Futuristic */
                                            <div style={{
                                                background: 'linear-gradient(180deg, #0d1b2a, #1b263b)',
                                                border: '2px solid rgba(0, 212, 255, 0.4)',
                                                borderRadius: 20,
                                                padding: 48,
                                                textAlign: 'center',
                                                boxShadow: '0 0 60px rgba(0, 212, 255, 0.15), inset 0 0 30px rgba(0, 0, 0, 0.5)'
                                            }}>
                                                <div style={{
                                                    width: 80,
                                                    height: 80,
                                                    borderRadius: '50%',
                                                    border: '4px solid rgba(0, 212, 255, 0.2)',
                                                    borderTop: '4px solid #00D4FF',
                                                    animation: 'spin 1s linear infinite',
                                                    margin: '0 auto 24px'
                                                }} />
                                                <div style={{
                                                    fontFamily: 'Orbitron, sans-serif',
                                                    fontSize: 18,
                                                    color: '#00D4FF',
                                                    marginBottom: 8,
                                                    textShadow: '0 0 20px rgba(0, 212, 255, 0.5)'
                                                }}>
                                                    JARVIS ANALYZING
                                                </div>
                                                <div style={{
                                                    fontSize: 13,
                                                    color: 'rgba(255, 255, 255, 0.5)'
                                                }}>
                                                    Generating strategic intelligence...
                                                </div>
                                            </div>
                                        ) : explainModal.panelImageUrl ? (
                                            /* GTO Panel Image - The New Template */
                                            <img
                                                src={explainModal.panelImageUrl}
                                                alt="GTO Analysis Panel"
                                                style={{
                                                    width: '100%',
                                                    borderRadius: 16,
                                                    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.6), 0 0 40px rgba(0, 212, 255, 0.15)'
                                                }}
                                            />
                                        ) : (
                                            /* Fallback to text if no panel image */
                                            <div style={{
                                                background: 'linear-gradient(180deg, #0d1b2a, #1b263b)',
                                                border: '2px solid rgba(0, 212, 255, 0.4)',
                                                borderRadius: 20,
                                                padding: 24,
                                                boxShadow: '0 0 60px rgba(0, 212, 255, 0.15), inset 0 0 30px rgba(0, 0, 0, 0.5)'
                                            }}>
                                                {/* Header */}
                                                <div style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    marginBottom: 16,
                                                    paddingBottom: 16,
                                                    borderBottom: '1px solid rgba(0, 212, 255, 0.2)'
                                                }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                        <div style={{
                                                            width: 48,
                                                            height: 48,
                                                            borderRadius: '50%',
                                                            background: 'linear-gradient(135deg, #1a3a52, #0d2233)',
                                                            border: '2px solid rgba(0, 212, 255, 0.5)',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            fontSize: 20,
                                                            color: '#00D4FF'
                                                        }}>
                                                            J
                                                        </div>
                                                        <span style={{ fontFamily: 'Orbitron', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>JARVIS</span>
                                                    </div>
                                                    <div style={{
                                                        padding: '8px 20px',
                                                        background: `linear-gradient(135deg, ${explainModal.correctAction === 'raise' ? '#00ff88' :
                                                            explainModal.correctAction === 'call' ? '#FFD700' :
                                                                explainModal.correctAction === 'fold' ? '#EF4444' :
                                                                    '#00D4FF'
                                                            }22, transparent)`,
                                                        border: `2px solid ${explainModal.correctAction === 'raise' ? '#00ff88' :
                                                            explainModal.correctAction === 'call' ? '#FFD700' :
                                                                explainModal.correctAction === 'fold' ? '#EF4444' :
                                                                    '#00D4FF'
                                                            }`,
                                                        borderRadius: 8,
                                                        fontFamily: 'Orbitron',
                                                        fontSize: 18,
                                                        fontWeight: 'bold',
                                                        color: explainModal.correctAction === 'raise' ? '#00ff88' :
                                                            explainModal.correctAction === 'call' ? '#FFD700' :
                                                                explainModal.correctAction === 'fold' ? '#EF4444' :
                                                                    '#00D4FF',
                                                        textShadow: '0 0 10px currentColor'
                                                    }}>
                                                        {explainModal.correctAction?.toUpperCase()}
                                                    </div>
                                                </div>

                                                {/* Hand Info */}
                                                <div style={{
                                                    background: 'rgba(0, 0, 0, 0.4)',
                                                    borderRadius: 12,
                                                    padding: 16,
                                                    marginBottom: 16,
                                                    border: '1px solid rgba(255, 255, 255, 0.1)'
                                                }}>
                                                    <div style={{
                                                        fontFamily: 'Orbitron',
                                                        fontSize: 28,
                                                        color: '#fff',
                                                        marginBottom: 8,
                                                        textShadow: '0 0 20px rgba(255, 255, 255, 0.3)'
                                                    }}>
                                                        {explainModal.hand}
                                                    </div>
                                                    <div style={{ fontSize: 13, color: 'rgba(255, 255, 255, 0.5)' }}>
                                                        You chose: <span style={{ color: '#EF4444' }}>{explainModal.userAction?.toUpperCase()}</span>
                                                        {' → '}
                                                        Optimal: <span style={{ color: '#00ff88' }}>{explainModal.correctAction?.toUpperCase()}</span>
                                                    </div>
                                                </div>

                                                {/* Explanation Section */}
                                                <div style={{
                                                    background: 'rgba(0, 0, 0, 0.3)',
                                                    borderRadius: 12,
                                                    padding: 16,
                                                    border: '1px solid rgba(0, 212, 255, 0.2)'
                                                }}>
                                                    <div style={{
                                                        fontSize: 11,
                                                        color: '#00D4FF',
                                                        fontWeight: 600,
                                                        marginBottom: 8,
                                                        textTransform: 'uppercase',
                                                        letterSpacing: 1
                                                    }}>
                                                        ⓘ GTO Explanation
                                                    </div>
                                                    <div style={{
                                                        color: 'rgba(255, 255, 255, 0.85)',
                                                        lineHeight: 1.7,
                                                        fontSize: 14
                                                    }}>
                                                        {explainModal.explanation}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <style>{`
                                        @keyframes spin {
                                            0% { transform: rotate(0deg); }
                                            100% { transform: rotate(360deg); }
                                        }
                                    `}</style>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div >


            {/* Inject shake animation */}
            <style> {`
                @keyframes shake {
                    0%, 100% { transform: translate(0, 0); }
                    25% { transform: translate(-5px, 5px); }
                    50% { transform: translate(5px, -5px); }
                    75% { transform: translate(-5px, -5px); }
                }
                @keyframes pulse {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.1); }
                }
            `}</style >
              <BottomNavBar />
    </PageTransition >
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════
const styles = {
    container: {
        minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
        background: '#0a0a12',
        fontFamily: 'Inter, -apple-system, sans-serif',
        position: 'relative',
        padding: '16px',
        transition: 'transform 0.05s ease-out',
    },
    bgGrid: {
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundImage: `
            linear-gradient(rgba(0, 255, 255, 0.015) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 255, 255, 0.015) 1px, transparent 1px)
        `,
        backgroundSize: '50px 50px',
        pointerEvents: 'none',
    },
    bgGlow: {
        position: 'fixed',
        top: '30%', left: '50%',
        width: '100%', height: '100%',
        transform: 'translate(-50%, -50%)',
        background: 'radial-gradient(ellipse at center, rgba(0, 200, 255, 0.06), transparent 60%)',
        pointerEvents: 'none',
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
        position: 'relative',
        zIndex: 10,
    },
    backButton: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 16px',
        background: 'rgba(0, 212, 255, 0.1)',
        border: '1px solid rgba(0, 212, 255, 0.3)',
        borderRadius: 8,
        color: '#00D4FF',
        fontSize: 14,
        fontWeight: 500,
        cursor: 'pointer',
    },
    headerStats: {
        display: 'flex',
        gap: 10,
        alignItems: 'center',
    },
    statBadge: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 14px',
        background: 'rgba(0, 0, 0, 0.4)',
        borderRadius: 20,
        border: '1px solid rgba(255, 255, 255, 0.1)',
    },
    diamondBadge: {
        background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.15), rgba(138, 43, 226, 0.15))',
        border: '1px solid rgba(0, 212, 255, 0.3)',
    },
    vipBadge: {
        padding: '6px 12px',
        background: 'linear-gradient(135deg, #FFD700, #FFA500)',
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 700,
        color: '#000',
    },
    comboBadge: {
        padding: '6px 12px',
        background: 'linear-gradient(135deg, #ff6b00, #ff0066)',
        borderRadius: 20,
        fontSize: 14,
        fontWeight: 700,
        color: '#fff',
    },
    statIcon: { fontSize: 16 },
    statValue: { fontSize: 14, fontWeight: 600, color: '#fff' },
    rewardPopup: {
        position: 'absolute',
        top: -35,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'linear-gradient(135deg, #00ff88, #00D4FF)',
        padding: '6px 14px',
        borderRadius: 20,
        fontSize: 14,
        fontWeight: 700,
        color: '#000',
        whiteSpace: 'nowrap',
        boxShadow: '0 4px 20px rgba(0, 255, 136, 0.5)',
        animation: 'pulse 0.5s ease-out',
    },
    comboOverlay: {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        textAlign: 'center',
        zIndex: 1000,
        pointerEvents: 'none',
    },
    comboText: {
        fontSize: 48,
        fontFamily: 'Orbitron, sans-serif',
        fontWeight: 900,
        color: '#fff',
        textShadow: '0 0 40px rgba(255, 100, 0, 0.8), 0 0 80px rgba(255, 0, 100, 0.5)',
        animation: 'pulse 0.5s ease-out',
    },
    multiplierText: {
        fontSize: 24,
        fontWeight: 700,
        color: '#FFD700',
        textShadow: '0 0 20px rgba(255, 215, 0, 0.8)',
    },
    content: {
        maxWidth: 1100,
        margin: '0 auto',
    },
    titleSection: {
        textAlign: 'center',
        marginBottom: 40,
    },
    orbIcon: {
        fontSize: 72,
        marginBottom: 16,
        animation: 'pulse 2s ease-in-out infinite',
    },
    title: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: 42,
        fontWeight: 900,
        color: '#fff',
        marginBottom: 12,
        textShadow: '0 0 30px rgba(0, 255, 255, 0.4)',
        letterSpacing: 4,
    },
    subtitle: {
        fontSize: 16,
        color: 'rgba(255, 255, 255, 0.6)',
        marginBottom: 16,
    },
    costInfo: {
        fontSize: 14,
        color: '#00D4FF',
        fontWeight: 600,
    },
    gameModeTabs: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        justifyContent: 'center',
        marginBottom: 32,
    },
    gameModeTab: {
        padding: '10px 18px',
        fontSize: 'clamp(12px, 3vw, 15px)',
        fontWeight: 600,
        background: 'rgba(255, 255, 255, 0.05)',
        border: '2px solid rgba(255, 255, 255, 0.1)',
        borderRadius: 30,
        color: 'rgba(255, 255, 255, 0.5)',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
    },
    gameModeTabActive: {
        background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.2), rgba(0, 255, 136, 0.2))',
        border: '2px solid #00D4FF',
        color: '#fff',
    },
    speedDrillCard: {
        background: 'linear-gradient(135deg, rgba(255, 200, 0, 0.1), rgba(255, 140, 0, 0.1))',
        border: '2px solid rgba(255, 215, 0, 0.3)',
        borderRadius: 20,
        padding: 40,
        textAlign: 'center',
        maxWidth: 500,
        margin: '0 auto',
    },
    speedDrillButton: {
        padding: '16px 48px',
        fontSize: 18,
        fontWeight: 700,
        background: 'linear-gradient(135deg, #FFD700, #FFA500)',
        color: '#000',
        border: 'none',
        borderRadius: 50,
        cursor: 'pointer',
        boxShadow: '0 0 30px rgba(255, 215, 0, 0.4)',
    },
    levelGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 16,
        marginBottom: 32,
    },
    levelCard: {
        background: 'rgba(0, 0, 0, 0.4)',
        border: '2px solid',
        borderRadius: 16,
        padding: 20,
        transition: 'all 0.2s ease',
    },
    levelNumber: {
        fontSize: 11,
        fontFamily: 'Orbitron, sans-serif',
        color: '#00D4FF',
        marginBottom: 6,
        letterSpacing: 1,
    },
    levelName: {
        fontSize: 18,
        fontWeight: 700,
        color: '#fff',
        marginBottom: 6,
    },
    levelFocus: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.5)',
        marginBottom: 12,
    },
    levelMeta: {
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: 11,
        color: 'rgba(255, 255, 255, 0.4)',
    },
    masteryGate: {
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        background: 'linear-gradient(135deg, rgba(0, 255, 136, 0.08), rgba(0, 212, 255, 0.08))',
        border: '1px solid rgba(0, 255, 136, 0.25)',
        borderRadius: 16,
        padding: 20,
        marginBottom: 24,
    },
    masteryIcon: { fontSize: 32 },
    masteryTitle: { fontSize: 16, fontWeight: 700, color: '#00ff88', marginBottom: 4 },
    masteryDesc: { fontSize: 13, color: 'rgba(255, 255, 255, 0.6)' },
    vipUpsell: {
        background: 'linear-gradient(135deg, rgba(255, 215, 0, 0.1), rgba(255, 140, 0, 0.1))',
        border: '2px solid rgba(255, 215, 0, 0.4)',
        borderRadius: 16,
        padding: 24,
        textAlign: 'center',
    },
    vipTitle: { fontSize: 20, fontWeight: 700, color: '#FFD700', marginBottom: 8 },
    vipFeatures: { fontSize: 13, color: 'rgba(255, 255, 255, 0.7)', marginBottom: 16 },
    vipButton: {
        padding: '12px 32px',
        background: 'linear-gradient(135deg, #FFD700, #FFA500)',
        border: 'none',
        borderRadius: 30,
        fontSize: 16,
        fontWeight: 700,
        color: '#000',
        cursor: 'pointer',
    },
    timerContainer: {
        position: 'relative',
        height: 8,
        background: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 4,
        marginBottom: 20,
        overflow: 'hidden',
    },
    timerBar: {
        height: '100%',
        transition: 'width 1s linear, background-color 0.3s ease',
        borderRadius: 4,
    },
    timerText: {
        position: 'absolute',
        right: 0,
        top: 12,
        fontSize: 14,
        fontFamily: 'Orbitron, sans-serif',
        fontWeight: 700,
    },
    gameHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 20,
    },
    levelBadge: {
        fontSize: 11,
        fontFamily: 'Orbitron, sans-serif',
        color: '#00D4FF',
        marginBottom: 4,
    },
    scenarioTitle: {
        fontSize: 24,
        fontWeight: 700,
        color: '#fff',
        marginBottom: 4,
    },
    scenarioDesc: {
        fontSize: 13,
        color: 'rgba(255, 255, 255, 0.6)',
    },
    tipText: {
        fontSize: 12,
        color: '#FFD700',
        marginTop: 8,
        padding: '8px 12px',
        background: 'rgba(255, 215, 0, 0.1)',
        borderRadius: 8,
        border: '1px solid rgba(255, 215, 0, 0.2)',
    },
    scoreDisplay: {
        textAlign: 'right',
    },
    scoreValue: {
        fontSize: 56,
        fontFamily: 'Orbitron, sans-serif',
        fontWeight: 900,
        lineHeight: 1,
    },
    passBadge: {
        display: 'inline-block',
        padding: '6px 16px',
        borderRadius: 20,
        fontSize: 14,
        fontWeight: 700,
        color: '#000',
        marginTop: 8,
    },
    actionBar: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 16,
        justifyContent: 'center',
    },
    actionButton: {
        padding: '10px 16px',
        borderRadius: 8,
        border: '2px solid',
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        position: 'relative',
    },
    keyHint: {
        position: 'absolute',
        top: -8,
        right: -6,
        background: 'rgba(0, 0, 0, 0.8)',
        width: 18,
        height: 18,
        borderRadius: 4,
        fontSize: 10,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '1px solid rgba(255, 255, 255, 0.3)',
    },
    gridWrapper: {
        width: '100%',
        maxWidth: 750,
        margin: '0 auto',
        marginBottom: 20,
    },
    grid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(13, 1fr)',
        gap: 'min(0.5vw, 2px)',
        width: '100%',
    },
    cell: {
        aspectRatio: '1',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 'clamp(8px, 1.8vw, 12px)',
        fontWeight: 600,
        color: '#fff',
        borderRadius: 'min(1vw, 4px)',
        border: '1px solid',
        transition: 'all 0.1s ease',
        userSelect: 'none',
        touchAction: 'manipulation',
    },
    buttonArea: {
        display: 'flex',
        justifyContent: 'center',
        marginBottom: 20,
    },
    submitButton: {
        padding: '16px 48px',
        fontSize: 18,
        fontWeight: 700,
        background: 'linear-gradient(135deg, #fff, #e0e0e0)',
        color: '#000',
        border: 'none',
        borderRadius: 50,
        cursor: 'pointer',
        boxShadow: '0 0 40px rgba(255, 255, 255, 0.3)',
        transition: 'transform 0.1s ease',
    },
    resultButtons: {
        display: 'flex',
        gap: 16,
    },
    menuButton: {
        padding: '14px 28px',
        fontSize: 16,
        fontWeight: 600,
        background: 'rgba(255, 255, 255, 0.1)',
        color: '#fff',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        borderRadius: 12,
        cursor: 'pointer',
    },
    nextButton: {
        padding: '14px 32px',
        fontSize: 16,
        fontWeight: 600,
        background: 'linear-gradient(135deg, #00D4FF, #0088dd)',
        color: '#fff',
        border: 'none',
        borderRadius: 12,
        cursor: 'pointer',
        boxShadow: '0 0 25px rgba(0, 212, 255, 0.4)',
    },
    feedbackPanel: {
        background: 'rgba(0, 0, 0, 0.5)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: 16,
        padding: 20,
        maxWidth: 500,
        margin: '0 auto',
    },
    feedbackGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 12,
    },
    feedbackItem: {
        display: 'flex',
        justifyContent: 'space-between',
        padding: '8px 12px',
        background: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 8,
        fontSize: 13,
    },
    feedbackValue: {
        fontWeight: 700,
        color: '#fff',
    },
    rewardSummary: {
        marginTop: 16,
        padding: 16,
        background: 'linear-gradient(135deg, rgba(0, 255, 136, 0.15), rgba(0, 212, 255, 0.15))',
        borderRadius: 12,
        textAlign: 'center',
        fontSize: 16,
        fontWeight: 700,
        color: '#00ff88',
    },
};
