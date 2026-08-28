/* ═══════════════════════════════════════════════════════════════════════════
    PREFLOP CHARTS - THE GTO WIZARD KILLER
   Full Video Game Experience with Pressure, Combos, and Diamond Economy
   Master GTO Preflop Ranges Through High-Pressure Training
   ═══════════════════════════════════════════════════════════════════════════ */

import { useRouter } from 'next/router';
import SEOHead from '../../src/components/seo/SEOHead';
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
import { useAvatar } from '../../src/contexts/AvatarContext';
import { getMenuConfig } from '../../src/config/hamburgerMenus';

const PageTransition = dynamic(() => import('../../src/components/transitions/PageTransition'), { ssr: false });
const UniversalHeader = dynamic(() => import('../../src/components/ui/UniversalHeader'), { ssr: false });
const HamburgerMenu = dynamic(() => import('../../src/components/ui/HamburgerMenu'), { ssr: false });
import { getMemoryGamesPreferences, updateMemoryGamesPreferences } from '../../src/services/memoryGamesPreferences';

// ═══════════════════════════════════════════════════════════════════════════
// Diamonds DIAMOND ENGINE - Local storage with VIP check
// ═══════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
// Diamonds DIAMOND ENGINE - Import Supabase-powered version
// ═══════════════════════════════════════════════════════════════════════════
import DiamondEngine from '../../src/services/DiamondEngine';
import leaderboardService from '../../src/services/LeaderboardService';
const GameCostPopup = dynamic(() => import('../../src/components/gates/GameCostPopup'), { ssr: false });
import dailyChallengeService from '../../src/services/DailyChallengeService';
import { processGameResult } from '../../src/games/ELOService';
import gameSessionService from '../../src/services/GameSessionService';
import achievementService from '../../src/services/AchievementService';
import useTrainingBus from '../../src/hooks/useTrainingBus';
// busEmit not needed at page level - DiamondEngine auto-emits, useTrainingBus has own import
import { leakAnalyzer } from '../../src/engine/LeakSignalAnalyzer';

// New Game Mode Components (dynamic imports for code splitting)
import dynamic from 'next/dynamic';
const EnhancedReviewPanel = dynamic(() => import('../../src/components/memory-games/EnhancedReviewPanel'), { ssr: false });
const JarvisExplanationDialog = dynamic(() => import('../../src/components/memory-games/JarvisExplanationDialog'), { ssr: false });
const OutOfDiamondsModal = dynamic(() => import('../../src/components/gates/OutOfDiamondsModal'), { ssr: false });
const DailyChallengeCard = dynamic(() => import('../../src/components/memory-games/DailyChallengeCard'), { ssr: false });

const SpotTrainerGame = dynamic(() => import('../../src/games/SpotTrainerGame'), { ssr: false });
const TournamentModeGame = dynamic(() => import('../../src/games/TournamentModeGame'), { ssr: false });
const SpeedDrillGame = dynamic(() => import('../../src/games/SpeedDrillGame'), { ssr: false });
const PressureCookerGame = dynamic(() => import('../../src/games/PressureCookerGame'), { ssr: false });
const PatternRecognitionGame = dynamic(() => import('../../src/games/PatternRecognitionGame'), { ssr: false });
const MixedStrategyGame = dynamic(() => import('../../src/games/MixedStrategyGame'), { ssr: false });
import ScenarioFilterPanel, { filterScenarios } from '../../src/games/ScenarioFilterPanel';
import { getAccessToken, authedFetch } from '../../src/lib/authUtils';
import PreflopRangeMatrix from '../../src/components/memory-games/PreflopRangeMatrix';
import {
    accuracyToPercent,
    getUnlockedLevel,
    gradeUserGrid,
    normalizeMemoryDashboard,
} from '../../src/lib/preflopRangeLab';
// 2026-05-07 — Lucide icons replace emoji in the menu surface (UI-UX-Pro-Max no-emoji-icons rule)
import { Target, Zap, Bomb, Puzzle, Dices, Crosshair, Swords, Calendar, Trophy, Lock, Filter, ShieldCheck, BrainCircuit, ChevronRight, Gem, Clock3, Lightbulb, Send, RotateCcw, ArrowRight, Undo2, Redo2, Trash2 } from 'lucide-react';
const BottomNavBar = dynamic(() => import('../../src/components/ui/BottomNavBar'), { ssr: false });

const ALL_TRAINING_SCENARIOS = [
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

// Range-memory actions live here because MixedStrategyGame is lazy loaded and
// does not export its private palette. Keeping this contract local also avoids
// loading an entire game bundle just to render the range grid.
const ACTION_COLORS = {
    fold: { bg: 'rgba(100, 116, 139, 0.3)', border: '#64748B', label: 'FOLD', key: '1' },
    call: { bg: 'rgba(16, 185, 129, 0.5)', border: '#10B981', label: 'CALL', key: '2' },
    raise: { bg: 'rgba(239, 68, 68, 0.5)', border: '#EF4444', label: 'RAISE', key: '3' },
    raise_small: { bg: 'rgba(249, 115, 22, 0.5)', border: '#F97316', label: 'RAISE SM', key: '4' },
    raise_big: { bg: 'rgba(168, 85, 247, 0.5)', border: '#A855F7', label: 'RAISE BIG', key: '5' },
    all_in: { bg: 'rgba(220, 38, 127, 0.6)', border: '#DC2680', label: 'ALL IN', key: '6' },
};


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
const ComboPopup = dynamic(() => import('../../src/components/memory-games/modals/ComboPopup'), { ssr: false });
export default function MemoryGamesPage() {
    const router = useRouter();
    const { user } = useAvatar();
    useTrainingBus('preflop-charts');
    const userId = user?.id;
    const containerRef = useRef(null);

    // Start leak analyzer for Jarvis integration - feeds into LeakService + Jarvis PA alerts
    useEffect(() => {
        leakAnalyzer.start();
        leakAnalyzer.setUserId(userId || null);
        return () => {
            leakAnalyzer.setUserId(null);
            leakAnalyzer.stop();
        };
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
    const [labStatus, setLabStatus] = useState('Raise selected. No hands marked.');
    const [gameNotice, setGameNotice] = useState(null);
    const gridHistoryRef = useRef([]);
    const gridRedoRef = useRef([]);

    // Hamburger and deep links use ?mode=. Hydrate that route contract once so
    // every advertised sub-function opens the matching game instead of landing
    // silently on the default Range Lab menu.
    useEffect(() => {
        if (!router.isReady) return;
        const requested = Array.isArray(router.query.mode) ? router.query.mode[0] : router.query.mode;
        const routeModes = {
            speed: ['speed', 'speed-drill'],
            'speed-drill': ['speed', 'speed-drill'],
            pressure: ['pressure', 'pressure-cooker'],
            'pressure-cooker': ['pressure', 'pressure-cooker'],
            pattern: ['pattern', 'pattern-recognition'],
            'pattern-recognition': ['pattern', 'pattern-recognition'],
            mixed: ['mixed', 'mixed-strategy'],
            'mixed-strategy': ['mixed', 'mixed-strategy'],
            spot: ['spot', 'spot-trainer'],
            'spot-trainer': ['spot', 'spot-trainer'],
            tournament: ['tournament', 'tournament'],
        };
        const mapped = routeModes[requested];
        if (!mapped) return;
        setGameType(mapped[0]);
        setMode(mapped[1]);
    }, [router.isReady, router.query.mode]);

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
    const submissionLockedRef = useRef(false);
    const latestGridRef = useRef(userGrid);
    const latestTimeRef = useRef(timeRemaining);
    latestGridRef.current = userGrid;
    latestTimeRef.current = timeRemaining;

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
    const [isVIP, setIsVIP] = useState(null); // null = loading, true = VIP, false = not VIP

    const [lastReward, setLastReward] = useState(null);

    // Progress state
    const [consecutivePasses, setConsecutivePasses] = useState(0);

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
    const [vipCheckoutPending, setVipCheckoutPending] = useState(false);
    const vipCheckoutRef = useRef(false);

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
        keyboardShortcuts: true,
        showTimer: true,
        visualHints: false,
    });

    // Load preferences from Supabase on mount
    useEffect(() => {
        if (userId) {
            getMemoryGamesPreferences(userId).then(setPreferences);
        }
    }, [userId]);

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
    }, [preferences, userId]);

    const menuConfig = getMenuConfig('preflop-charts', user, preferences, {
        setSoundEffects: (val) => updatePreference('soundEffects', val),
        setKeyboardShortcuts: (val) => updatePreference('keyboardShortcuts', val),
        setShowTimer: (val) => updatePreference('showTimer', val),
        setVisualHints: (val) => updatePreference('visualHints', val)
    });

    // Intro video removed — no longer shown on page load

    // Safe helper to get level config with fallback
    const safeLevelConfig = getLevelConfig(currentLevel) || { timer: 90, gridSize: 13, maxHands: 20 };
    const playSound = useCallback((sound) => {
        if (preferences.soundEffects !== false) SoundEngine.play(sound);
    }, [preferences.soundEffects]);

    // Initialize effects CSS once. Re-initialize the economy whenever auth
    // resolves so an authenticated player can never remain in guest mode.
    useEffect(() => {
        EffectsEngine.initCSS();
    }, []);

    useEffect(() => {
        let cancelled = false;
        const initializeDiamondEngine = async () => {
            try {
                await DiamondEngine.init(userId || null);
                const [balance, vipStatus] = await Promise.all([
                    DiamondEngine.getBalance(),
                    userId ? DiamondEngine.isVIP() : Promise.resolve(false),
                ]);
                if (cancelled) return;
                setDiamondBalance(balance);
                setIsVIP(vipStatus);
            } catch (e) {
                console.warn('[MemoryGames] Failed to initialize DiamondEngine:', e);
                // Fallback to localStorage — treat as non-VIP so gameplay is not blocked
                await DiamondEngine.init(null);
                const balance = await DiamondEngine.getBalance();
                if (cancelled) return;
                setDiamondBalance(balance);
                setIsVIP(false);
            }
        };

        initializeDiamondEngine();
        return () => { cancelled = true; };
    }, [userId]);

    // Timer logic
    useEffect(() => {
        if (timerActive && timeRemaining > 0) {
            timerRef.current = setInterval(() => {
                setTimeRemaining(prev => {
                    if (prev <= 1) {
                        latestTimeRef.current = 0;
                        clearInterval(timerRef.current);
                        handleTimeUp();
                        return 0;
                    }
                    if (prev <= 10 && preferences.soundEffects !== false) SoundEngine.play('tick');
                    const nextTime = prev - 1;
                    latestTimeRef.current = nextTime;
                    return nextTime;
                });
            }, 1000);
        }
        return () => clearInterval(timerRef.current);
    }, [timerActive, preferences.soundEffects]);

    const handleActionSelect = useCallback((action) => {
        setSelectedAction(action);
        setLabStatus(`${ACTION_COLORS[action]?.label || action} selected.`);
    }, []);

    const handleUndo = useCallback(() => {
        if (gradeResult || !timerActive) return;
        const previousGrid = gridHistoryRef.current.pop();
        if (!previousGrid) return;
        gridRedoRef.current.push(userGrid);
        gridRedoRef.current = gridRedoRef.current.slice(-30);
        setUserGrid(previousGrid);
        const count = Object.keys(previousGrid).length;
        setLabStatus(`Last range edit undone. ${count} hand${count === 1 ? '' : 's'} marked.`);
    }, [gradeResult, timerActive, userGrid]);

    const handleRedo = useCallback(() => {
        if (gradeResult || !timerActive) return;
        const nextGrid = gridRedoRef.current.pop();
        if (!nextGrid) return;
        gridHistoryRef.current.push(userGrid);
        gridHistoryRef.current = gridHistoryRef.current.slice(-30);
        setUserGrid(nextGrid);
        const count = Object.keys(nextGrid).length;
        setLabStatus(`Range edit restored. ${count} hand${count === 1 ? '' : 's'} marked.`);
    }, [gradeResult, timerActive, userGrid]);

    const handleClearRange = useCallback(() => {
        if (gradeResult || !timerActive) return;
        if (Object.keys(userGrid).length === 0) return;
        gridHistoryRef.current.push(userGrid);
        gridHistoryRef.current = gridHistoryRef.current.slice(-30);
        gridRedoRef.current = [];
        setUserGrid({});
        setLabStatus('Range cleared. Use undo to restore it.');
    }, [gradeResult, timerActive, userGrid]);

    const handleFillShape = useCallback((shape) => {
        if (gradeResult || !timerActive) return;
        const hands = [];
        RANKS.forEach((_, row) => RANKS.forEach((__, col) => {
            if (shape === 'pairs' && row === col) hands.push(getHandName(row, col));
            if (shape === 'suited' && row < col) hands.push(getHandName(row, col));
            if (shape === 'offsuit' && row > col) hands.push(getHandName(row, col));
        }));
        gridHistoryRef.current.push(userGrid);
        gridHistoryRef.current = gridHistoryRef.current.slice(-30);
        gridRedoRef.current = [];
        const nextGrid = { ...userGrid };
        hands.forEach((hand) => { nextGrid[hand] = selectedAction; });
        setUserGrid(nextGrid);
        setLabStatus(`${shape} filled with ${ACTION_COLORS[selectedAction]?.label || selectedAction}. ${Object.keys(nextGrid).length} hands marked.`);
    }, [gradeResult, selectedAction, timerActive, userGrid]);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (mode !== 'game' || gradeResult || preferences.keyboardShortcuts === false) return;
            const target = e.target instanceof Element ? e.target : null;
            const isInteractiveTarget = target?.closest('button, a, input, select, textarea, [contenteditable="true"]');
            const isTextEntry = target?.closest('input, select, textarea, [contenteditable="true"]');

            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
                if (isTextEntry) return;
                e.preventDefault();
                if (e.shiftKey) handleRedo();
                else handleUndo();
                return;
            }

            const key = e.key;
            const actions = Object.entries(ACTION_COLORS);
            const found = actions.find(([_, v]) => v.key === key);
            if (found) {
                if (isTextEntry) return;
                e.preventDefault();
                handleActionSelect(found[0]);
                return;
            }
            if (isInteractiveTarget) return;
            if (key === 'Enter' || key === ' ') {
                e.preventDefault();
                handleSubmit();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [mode, gradeResult, userGrid, currentScenario, preferences.keyboardShortcuts, handleActionSelect, handleRedo, handleUndo]);

    // Reusable: Fresh DB balance check + DiamondEngine deduction
    // NOTE: isStartingRef guards here AND in startGame - both are needed because:
    //   - 8 buttons call checkAndDeductDiamonds directly (need guard here)
    //   - VIP users skip checkAndDeductDiamonds in startGame (need guard there)
    const isStartingRef = useRef(false); // Double-click guard
    const checkAndDeductDiamonds = async () => {
        if (isVIP === true) return true;
        if (isVIP === null) return false;
        if (isStartingRef.current) return false;
        isStartingRef.current = true;
        try {
        // Fresh authoritative balance check to avoid stale-state false negatives.
        try {
            const freshBalance = await DiamondEngine.getBalance();
            setDiamondBalance(freshBalance);
            if (freshBalance < GAME_COST) {
                setShowOutOfDiamondsModal(true);
                return false;
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
    const startGame = async (level, filterOverrides = null) => {
        // Double-click guard - protects ALL users (VIP + non-VIP)
        if (isGameStartingRef.current) return;
        isGameStartingRef.current = true;
        setGameNotice(null);
        try {
        if (isVIP === null) {
            isGameStartingRef.current = false;
            return;
        }

        const serverUnlockedLevel = getUnlockedLevel(memoryDashboard?.per_level_mastery || []);
        const sessionUnlockedLevel = Math.min(10, Math.floor(consecutivePasses / 5) + 1);
        const highestUnlocked = Math.max(serverUnlockedLevel, sessionUnlockedLevel);
        if (Number(level) > highestUnlocked) {
            setGameNotice({
                type: 'warning',
                message: `Level ${level} is locked. Master Level ${highestUnlocked} at 85% or better first.`,
            });
            return;
        }
        
        let scenario = null;

        // Use AI Generation if enabled (VIP feature)
        if (useAIGeneration) {
            setAIGenerating(true);
            try {
                // Build filter params from active filters
                const effectiveFilters = filterOverrides || scenarioFilters;
                const requestBody = {
                    level,
                    position: effectiveFilters.position || undefined,
                    stackDepth: effectiveFilters.stackDepth || undefined,
                    format: effectiveFilters.format || undefined,
                };

                const response = await authedFetch('/api/gto/generate-scenario', {
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
            const effectiveFilters = filterOverrides || scenarioFilters;
            if (Object.keys(effectiveFilters || {}).filter(k => effectiveFilters[k]).length > 0) {
                levelScenarios = filterScenarios(levelScenarios, effectiveFilters);
            }

            // Select random scenario from filtered list
            scenario = levelScenarios.length > 0
                ? levelScenarios[Math.floor(Math.random() * levelScenarios.length)]
                : null;
        }

        if (!scenario) {
            setGameNotice({
                type: 'warning',
                message: 'No scenarios match this level. Adjust or reset your filters, then try again.',
            });
            return;
        }

        // Charge only after a playable scenario is resolved. Previously a
        // filtered-out level could deduct diamonds and then fail to launch.
        if (isVIP === false && level > 3) {
            const canPlay = await checkAndDeductDiamonds();
            if (!canPlay) return;
        }

        // Get level-specific config for progressive difficulty
        const levelConfig = getLevelConfig(level) || { timer: 90, gridSize: 13, maxHands: 20 };

        setCurrentLevel(level);
        setCurrentScenario(scenario);
        setUserGrid({});
        gridHistoryRef.current = [];
        gridRedoRef.current = [];
        setGradeResult(null);
        setLabStatus(`${ACTION_COLORS[selectedAction]?.label || selectedAction} selected. No hands marked.`);
        setLastReward(null);
        submissionLockedRef.current = false;
        setTimeRemaining(levelConfig.timer); // Progressive: higher levels = less time
        setTimerActive(true);
        setCombo(0);
        setComboName(null);
        setMultiplier(1);
        setMode('game');

        playSound('levelUp');
        } finally {
            isGameStartingRef.current = false;
        }
    };

    // Handle time up
    const handleTimeUp = () => {
        setTimerActive(false);
        playSound('gameOver');
        triggerScreenShake();
        handleSubmit(true);
    };

    // Cell click handler
    const handleCellClick = useCallback((hand) => {
        if (gradeResult || !timerActive) return;

        gridHistoryRef.current.push(userGrid);
        gridHistoryRef.current = gridHistoryRef.current.slice(-30);
        gridRedoRef.current = [];
        if (userGrid[hand] === selectedAction) {
            const { [hand]: _, ...rest } = userGrid;
            setUserGrid(rest);
            setLabStatus(`${hand} removed. ${Object.keys(rest).length} hands marked.`);
            return;
        }
        const nextGrid = { ...userGrid, [hand]: selectedAction };
        setUserGrid(nextGrid);
        setLabStatus(`${hand} set to ${ACTION_COLORS[selectedAction]?.label || selectedAction}. ${Object.keys(nextGrid).length} hands marked.`);
    }, [gradeResult, selectedAction, timerActive, userGrid]);

    // Submit handler
    const handleSubmit = (timedOut = false) => {
        if (submissionLockedRef.current || !currentScenario) return;
        submissionLockedRef.current = true;
        setTimerActive(false);
        clearInterval(timerRef.current);

        // Timer callbacks retain the render that started the interval. Refs
        // guarantee a timeout grades the player's latest grid and elapsed time.
        const submittedGrid = timedOut ? latestGridRef.current : userGrid;
        const submittedTime = timedOut ? latestTimeRef.current : timeRemaining;
        const result = gradeUserGrid(submittedGrid, currentScenario.solution);
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
            playSound('combo');
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

            // Award diamonds
            const baseReward = 15;
            const accuracyBonus = Math.floor((result.score - 85) / 5) * 5;
            const perfectBonus = result.score === 100 ? 50 : 0;
            const comboBonus = Math.floor(newCombo * 2);
            totalReward = Math.floor((baseReward + accuracyBonus + perfectBonus + comboBonus) * multiplier);

            if (!user?.id) DiamondEngine.award(totalReward).then(newBalance => {
                // Signed-in awards require a server catalog action. Never put a
                // Promise or a failure object into balance state, and only show
                // a reward receipt when an award actually landed.
                if (Number.isFinite(newBalance)) {
                    setDiamondBalance(newBalance);
                    setLastReward({ diamonds: totalReward, timestamp: Date.now() });
                }
            }).catch(err => console.warn('[MemoryGames] Award failed:', err?.message || err));
        } else {
            // Failure
            playSound('wrong');
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
            const timeTaken = Math.max(0, Math.floor((safeLevelConfig.timer || 90) - submittedTime));

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
            const gamesPlayed = memoryDashboard?.rolling_30d_sessions || 0;
            processGameResult(user.id, currentLevel, result.score, gamesPlayed)
                .catch(err => console.warn('[App] Handled promise rejection:', err?.message || err));

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
                        ).then(async completionResult => {
                            if (completionResult?.success) {
                                // The completion RPC records the challenge, streak,
                                // and award atomically. Refresh the authoritative
                                // balance instead of double-claiming trivia rewards.
                                setChallengeCompleted(true);
                                const refreshedBalance = await DiamondEngine.getBalance();
                                if (Number.isFinite(refreshedBalance)) setDiamondBalance(refreshedBalance);
                            }
                        }).catch(err => console.warn('[App] Handled promise rejection:', err?.message || err));
                    }
                }
            }).catch(err => console.warn('[MemoryGames] Daily challenge check failed:', err?.message || err));

            // 4. Increment games played counter
            const newGamesPlayed = gamesPlayed + 1;

            // 5. Record game session for analytics
            gameSessionService.recordSession(user.id, {
                gameMode,
                level: currentLevel,
                scenarioId: currentScenario?.id || currentScenario?.title,
                score: result.score,
                accuracy: result.score,
                timeTaken,
                diamondsSpent: isVIP || currentLevel <= 3 ? 0 : GAME_COST,
                diamondsEarned: 0,
                completed: true
            }).then(sessionResult => {
                if (sessionResult?.success) loadMemoryDashboard(true);
            }).catch(err => console.warn('[App] Handled promise rejection:', err?.message || err));

            // 6. Check and unlock achievements
            const modesPlayed = Array.from(new Set([
                ...(memoryDashboard?.per_mode_best || []).map(mode => mode.game_mode).filter(Boolean),
                gameMode,
            ]));
            achievementService.checkAndUnlock(user.id, {
                gamesPlayed: newGamesPlayed,
                accuracy: result.score,
                timeTaken,
                level: currentLevel,
                gameMode,
                totalDiamonds: diamondBalance,
                aiScenariosCompleted: useAIGeneration ? 1 : 0,
                currentStreak: consecutivePasses,
                modesPlayed,
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
                        userAnswer: submittedGrid[hand] || 'fold',
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
            // result.correctHands is a count (number), not an array — skip forEach loop

            authedFetch('/api/jarvis/training-session', {
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
                    questionsCorrect: result.correctHands || 0,
                    accuracy: result.score,
                    streak: consecutivePasses,
                    timeSpentSeconds: timeTaken,
                    answers: answersData,
                    leaksDetected: []
                })
            }).then(res => res.json()).then(jarvisResult => {
            }).catch(err => console.warn('[App] Handled promise rejection:', err?.message || err));
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

    const handleRetry = () => {
        if (!currentScenario) return;
        const levelConfig = getLevelConfig(currentLevel) || { timer: 90 };
        setUserGrid({});
        gridHistoryRef.current = [];
        gridRedoRef.current = [];
        setGradeResult(null);
        setLastReward(null);
        setCoachAnalysis({ show: false, loading: false, analysis: null });
        setTimeRemaining(levelConfig.timer);
        latestTimeRef.current = levelConfig.timer;
        submissionLockedRef.current = false;
        setTimerActive(true);
        setMode('game');
        setLabStatus(`${ACTION_COLORS[selectedAction]?.label || selectedAction} selected. Retry started.`);
        playSound('levelUp');
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
                authedFetch('/api/gto/explain-hand', {
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
                authedFetch('/api/gto/render-analysis-card', {
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
            const response = await authedFetch('/api/gto/analyze-game', {
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
        if (!userId) return;

        try {
            const response = await authedFetch('/api/gto/get-weak-spots');
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
        if (!userId) return;

        setAdaptiveLoading(true);

        try {
            const response = await authedFetch('/api/gto/generate-adaptive', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId })
            });

            if (!response.ok) throw new Error(`Request failed (${response.status})`);
            const result = await response.json();

            if (result.success && result.scenario) {
                // Load the adaptive scenario through the same range-game state
                // contract as a standard level launch.
                const levelConfig = getLevelConfig(currentLevel) || { timer: 90 };
                setCurrentScenario(result.scenario);
                setUserGrid({});
                gridHistoryRef.current = [];
                gridRedoRef.current = [];
                setGradeResult(null);
                setLastReward(null);
                setCoachAnalysis({ show: false, loading: false, analysis: null });
                setTimeRemaining(levelConfig.timer);
                latestTimeRef.current = levelConfig.timer;
                submissionLockedRef.current = false;
                setTimerActive(true);
                setMode('game');
                playSound('levelUp');
            }
        } catch (error) {
            console.warn('[MemoryGames] Adaptive training error:', error);
        } finally {
            setAdaptiveLoading(false);
        }
    };

    // Fetch lobby suggestions for proactive learning
    const fetchLobbySuggestions = async () => {
        if (!userId) return;

        try {
            const response = await authedFetch('/api/gto/lobby-suggestions');
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

    const loadMemoryDashboard = useCallback(async (fresh = false) => {
        if (!userId) {
            setMemoryDashboardLoading(false);
            return null;
        }
        try {
            const token = typeof getAccessToken === 'function' ? getAccessToken() : null;
            const suffix = fresh ? `?refresh=${Date.now()}` : '';
            const r = await authedFetch(`/api/memory/dashboard${suffix}`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
                cache: fresh ? 'no-store' : 'default',
            });
            if (!r.ok) throw new Error(`memory/dashboard ${r.status}`);
            const json = await r.json();
            if (json?.success) {
                const normalized = normalizeMemoryDashboard(json.stats);
                setMemoryDashboard(normalized);
                return normalized;
            }
        } catch (e) {
            console.warn('[MemoryGames] dashboard fetch failed:', e?.message || e);
        } finally {
            setMemoryDashboardLoading(false);
        }
        return null;
    }, [userId]);

    // Load aggregated dashboard payload (real grade, per-level mastery, daily-challenge state)
    useEffect(() => {
        let cancelled = false;
        if (!cancelled) loadMemoryDashboard();
        return () => { cancelled = true; };
    }, [loadMemoryDashboard]);

    // Load leaderboard data

    const loadLeaderboard = useCallback(async () => {
        setLeaderboardLoading(true);
        try {
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
        setChallengeLoading(true);
        try {
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
            const sessionId = crypto.randomUUID();
            const result = await leaderboardService.updateLeaderboard(
                userId, gameMode, level, score, accuracy, timeTaken, sessionId
            );

            if (result.new_record) {
                // Show celebration for new record
                playSound('levelUp');
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
        if (!userId) {
            router.push('/login?redirect=/hub/preflop-charts');
            return;
        }

        if (vipCheckoutRef.current) return;
        vipCheckoutRef.current = true;
        setVipCheckoutPending(true);
        setGameNotice(null);
        try {
            const token = getAccessToken();
            if (!token) {
                router.push('/login?redirect=/hub/preflop-charts');
                return;
            }

            const response = await authedFetch('/api/store/create-checkout-session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Checkout-Request-ID': `preflop-vip-${crypto.randomUUID()}`,
                },
                body: JSON.stringify({
                    type: 'subscription',
                    // The server owns price resolution; the browser sends only
                    // the plan key accepted by create-checkout-session.
                    items: [{ plan: 'monthly' }],
                    successUrl: `${window.location.origin}/hub/preflop-charts?vip_success=true`,
                    cancelUrl: `${window.location.origin}/hub/preflop-charts?vip_canceled=true`
                })
            });

            const result = await response.json().catch(() => null);
            if (!response.ok || !result?.success) {
                throw new Error(result?.error?.message || `Request failed (${response.status})`);
            }

            if (result.data?.url) {
                window.location.href = result.data.url;
            } else {
                throw new Error('Checkout session missing redirect URL');
            }
        } catch (error) {
            console.warn('[MemoryGames] VIP upgrade error:', error);
            setGameNotice({
                type: 'warning',
                context: 'checkout',
                message: error?.message || 'VIP checkout could not start. Please try again.',
            });
        } finally {
            vipCheckoutRef.current = false;
            setVipCheckoutPending(false);
        }
    }, [router, userId]);

    // Timer color
    const getTimerColor = () => {
        if (timeRemaining > 30) return '#00ff88';
        if (timeRemaining > 10) return '#ffaa00';
        return '#ff4444';
    };

    const activeScenarioFilterCount = Object.values(scenarioFilters || {}).filter(Boolean).length;
    const filteredScenarioCount = filterScenarios(ALL_TRAINING_SCENARIOS, scenarioFilters).length;
    const masteredLevelCount = memoryDashboard?.mastered_levels_count
        ?? memoryDashboard?.per_level_mastery?.filter((level) => level.mastered).length
        ?? 0;
    const serverUnlockedLevel = getUnlockedLevel(memoryDashboard?.per_level_mastery || []);
    const sessionUnlockedLevel = Math.min(10, Math.floor(consecutivePasses / 5) + 1);
    const highestUnlockedLevel = Math.max(serverUnlockedLevel, sessionUnlockedLevel);
    const markedHandCount = Object.keys(userGrid).length;
    const selectedActionCount = Object.values(userGrid).filter((action) => action === selectedAction).length;

    return (
        <PageTransition>
            {/* Intro video removed */}
            <SEOHead
                title="Preflop Charts - Master GTO Ranges"
                description="Master GTO Preflop Ranges Through High-Pressure Training. Speed Drills, Pattern Recognition, Mixed Strategy Practice, and Tournament Prep."
                canonical="/hub/preflop-charts"
            >
                <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
            </SEOHead>

            <div className="memory-games-page preflop-command-deck"
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

                {/* Per-game cost popup (one-time) — only for confirmed non-VIP users */}
                {userId && isVIP === false && (
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
                <ComboPopup
                    comboName={comboName}
                    multiplier={multiplier}
                />
            )}

                {/* Main Content */}
                <div style={styles.content}>
                    {mode === 'menu' && (
                        <div className="preflop-menu">
                            {/* Title */}
                            <div className="preflop-hero">
                                <div className="preflop-hero-copy">
                                    <span className="preflop-eyebrow">GTO RANGE COMMAND</span>
                                    <h1>Preflop Charts</h1>
                                    <p>Master GTO ranges through high-pressure training.</p>
                                    {memoryDashboard?.current_grade && memoryDashboard?.rolling_30d_sessions > 0 && (
                                        <div className="preflop-grade-chip" aria-label={`Current GTO grade ${memoryDashboard.current_grade}`}>
                                            <span>{memoryDashboard.current_grade}</span>
                                            <span>{memoryDashboard.rolling_accuracy_pct}% across last 30 days</span>
                                            {memoryDashboard.mastered_levels_count > 0 && (
                                                <span>· {memoryDashboard.mastered_levels_count}/10 mastered</span>
                                            )}
                                        </div>
                                    )}
                                    {/* Only show cost info once VIP status is confirmed */}
                                    {isVIP !== null && (
                                        <div className="preflop-cost-chip">
                                            <Gem size={17} aria-hidden />
                                            <span>{isVIP ? 'VIP: Unlimited Access' : `${GAME_COST} Diamonds per game`}</span>
                                        </div>
                                    )}
                                </div>
                                <div className="preflop-hero-visual" aria-hidden="true">
                                    <div className="preflop-range-matrix">
                                        {Array.from({ length: 36 }, (_, index) => <span key={index} />)}
                                    </div>
                                    <div className="preflop-diamond-stage">
                                        <img src="/images/diamond-icon.png" alt="" />
                                    </div>
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
                                <section className="preflop-smart-practice" aria-labelledby="smart-practice-title">
                                    <div className="preflop-jarvis-medallion" aria-hidden="true">
                                        <img src="/images/jarvis-avatar-new.png" alt="" />
                                    </div>
                                    <div className="preflop-smart-copy">
                                        <div className="preflop-panel-kicker"><BrainCircuit size={15} aria-hidden /> AI TRAINING LINK</div>
                                        <h2 id="smart-practice-title">Smart Practice</h2>
                                        <p>Jarvis analyzes your history and creates personalized training.</p>

                                    {/* Weak Spots Display */}
                                    {weakSpots.length > 0 && (
                                        <div className="preflop-weak-spots">
                                            <div className="preflop-weak-label">Areas to Improve</div>
                                            {weakSpots.slice(0, 2).map((spot, i) => (
                                                <div key={i} className="preflop-weak-row">
                                                    <span>{spot.area}</span>
                                                    <span>{spot.errorCount} errors</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    </div>

                                    <button
                                        onClick={startAdaptiveTraining}
                                        disabled={adaptiveLoading}
                                        className="preflop-primary-cta"
                                    >
                                        <span>{adaptiveLoading ? 'Generating...' : weakSpots.length > 0
                                            ? `Train ${weakSpots[0]?.area}`
                                            : 'Start Smart Practice'}</span>
                                        <ChevronRight size={20} aria-hidden />
                                    </button>
                                </section>
                            )}

                            {/* Jarvis Suggestions Panel */}
                            {userId && lobbySuggestions.length > 0 && (
                                <section className="preflop-suggestions" aria-labelledby="jarvis-suggestions-title">
                                    <div className="preflop-suggestions-title" id="jarvis-suggestions-title">Jarvis Suggestions</div>
                                    <div className="preflop-suggestions-list">
                                        {lobbySuggestions.map((suggestion, i) => (
                                            <button
                                                key={i}
                                                type="button"
                                                onClick={() => {
                                                    if (suggestion.actionType === 'daily_challenge') {
                                                        if (dailyChallenge) {
                                                            startGame(dailyChallenge.level || 1);
                                                        } else {
                                                            loadDailyChallenge();
                                                        }
                                                    } else if (suggestion.actionType === 'start_level') {
                                                        const suggestedLevel = Number(suggestion.levelId);
                                                        if (LEVELS.some(level => level.level === suggestedLevel)) {
                                                            startGame(suggestedLevel);
                                                        }
                                                    } else if (suggestion.actionType === 'adaptive_training') {
                                                        startAdaptiveTraining();
                                                    } else if (suggestion.actionType === 'quick_game') {
                                                        startGame(currentLevel);
                                                    } else if (suggestion.actionType === 'position_training' && suggestion.position) {
                                                        const suggestedFilters = { ...scenarioFilters, position: suggestion.position };
                                                        setScenarioFilters(suggestedFilters);
                                                        startGame(currentLevel, suggestedFilters);
                                                    }
                                                }}
                                                className="preflop-suggestion-row"
                                            >
                                                <span>{suggestion.message}</span>
                                                <span>{suggestion.action}<ChevronRight size={15} aria-hidden /></span>
                                            </button>
                                        ))}
                                    </div>
                                </section>
                            )}

                            {/* Game Mode Selector */}
                            {(() => {
                                const MODES = [
                                    { key: 'range',      label: 'Range',        Icon: Target,         color: '#00D4FF', desc: 'Core GTO Training' },
                                    { key: 'speed',      label: 'Speed Drill',  Icon: Zap,            color: '#FFD700', desc: 'Beat the Clock' },
                                    { key: 'pressure',   label: 'Pressure',     Icon: Bomb,           color: '#FF4444', desc: 'Defuse the Bomb' },
                                    { key: 'pattern',    label: 'Pattern',      Icon: Puzzle,         color: '#3B82F6', desc: 'Read the Range' },
                                    { key: 'mixed',      label: 'Mixed',        Icon: Dices,          color: '#A855F7', desc: 'Dial Frequencies' },
                                    { key: 'spot',       label: 'Spot Trainer', Icon: Crosshair,      color: '#F97316', desc: 'Full Hand Trees' },
                                    { key: 'tournament', label: 'VS Ranked',    Icon: Swords,         color: '#EC4899', desc: 'Climb the Ladder' },
                                ];
                                const EXTRA = [
                                    { key: 'daily',       label: 'Daily',    Icon: Calendar, color: '#00FF88', special: true },
                                    { key: 'leaderboard', label: 'Rankings', Icon: Trophy,   color: '#FFD700', special: true },
                                ];
                                return (
                                    <>
                                        {/* Primary Training Modes */}
                                        <div className="preflop-mode-rail" aria-label="Training modes">
                                            {MODES.map(m => {
                                                const active = gameType === m.key;
                                                return (
                                                    <button
                                                        key={m.key}
                                                        onClick={() => setGameType(m.key)}
                                                        className={`preflop-mode-card${active ? ' is-active' : ''}`}
                                                        style={{ '--mode-accent': m.color }}
                                                        aria-pressed={active}
                                                    >
                                                        <span className="preflop-mode-icon"><m.Icon size={23} aria-hidden /></span>
                                                        <span className="preflop-mode-label">{m.label}</span>
                                                        <span className="preflop-mode-desc">{m.desc}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        {/* Quick Access Row */}
                                        <div className="preflop-quick-row">
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
                                                        className={`preflop-quick-button${active ? ' is-active' : ''}`}
                                                        style={{ '--mode-accent': m.color }}
                                                        aria-pressed={active}
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
                                                <span style={{ fontSize: 14, color: '#FFD700', fontWeight: 800, fontFamily: "var(--font-orbitron), 'Orbitron', sans-serif" }}>{personalBest.score}</span>
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
                                                {dailyChallenge.description || `Score ${accuracyToPercent(dailyChallenge.target_accuracy ?? 80)}% or higher to complete the challenge.`}
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
                                                    <div style={{ fontSize: 20, fontWeight: 700, color: '#00ff88' }}>{accuracyToPercent(dailyChallenge.target_accuracy ?? 80)}%</div>
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
                                                    } else if (mode === 'spot-trainer') {
                                                        setMode('spot-trainer');
                                                    } else if (mode === 'tournament') {
                                                        setMode('tournament');
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
                                    <div className="preflop-level-toolbar">
                                        <div>
                                            <span className="preflop-panel-kicker">RANGE PROGRESSION</span>
                                            <h3>Select a Level</h3>
                                        </div>
                                        <div className="preflop-level-actions">
                                            {/* AI Generation Toggle (VIP Feature) */}
                                            <button
                                                onClick={() => setUseAIGeneration(!useAIGeneration)}
                                                className={`preflop-tool-button${useAIGeneration ? ' is-active is-gold' : ''}`}
                                                title="Generate Unique Scenarios Using Jarvis AI"
                                                aria-pressed={useAIGeneration}
                                            >
                                                <BrainCircuit size={15} aria-hidden />{useAIGeneration ? 'AI ON' : 'AI Mode'}
                                            </button>

                                            {/* Filter Toggle */}
                                            <button
                                                onClick={() => setShowFilters(!showFilters)}
                                                className={`preflop-tool-button${showFilters ? ' is-active' : ''}`}
                                                aria-expanded={showFilters}
                                            >
                                                <Filter size={14} aria-hidden />{showFilters ? 'Hide filters' : 'Filter scenarios'}
                                                {Object.keys(scenarioFilters || {}).filter(k => scenarioFilters[k]).length > 0 && (
                                                    <span className="preflop-filter-count">
                                                        {Object.keys(scenarioFilters || {}).filter(k => scenarioFilters[k]).length}
                                                    </span>
                                                )}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Filter Panel */}
                                    {showFilters && (
                                        <ScenarioFilterPanel
                                            onFilterChange={setScenarioFilters}
                                            onClose={() => setShowFilters(false)}
                                            currentFilters={scenarioFilters}
                                            availableScenarios={ALL_TRAINING_SCENARIOS.length}
                                            filteredCount={filterScenarios(ALL_TRAINING_SCENARIOS, scenarioFilters).length}
                                        />
                                    )}

                                    {gameNotice && gameNotice.context !== 'checkout' && (
                                        <div className="preflop-game-notice" data-notice={gameNotice.type} role="status">
                                            <Filter size={16} aria-hidden />
                                            <span>{gameNotice.message}</span>
                                            <button type="button" onClick={() => setGameNotice(null)} aria-label="Dismiss message">Dismiss</button>
                                        </div>
                                    )}

                                    <div className="preflop-circuit-status" aria-label="Range progression status">
                                        <div className="preflop-circuit-label">
                                            <span>PROGRESSION CIRCUIT</span>
                                            <strong>Training path online</strong>
                                        </div>
                                        <div className="preflop-circuit-stat is-current">
                                            <Target size={16} aria-hidden />
                                            <span>
                                                <small>Current station</small>
                                                <strong>Level {currentLevel}</strong>
                                            </span>
                                        </div>
                                        <div className="preflop-circuit-stat is-mastery">
                                            <ShieldCheck size={16} aria-hidden />
                                            <span>
                                                <small>Next mastery gate</small>
                                                <strong>Level {highestUnlockedLevel} open <em>· {masteredLevelCount} mastered</em></strong>
                                            </span>
                                        </div>
                                        <div className={`preflop-circuit-stat is-pool${activeScenarioFilterCount > 0 ? ' has-filters' : ''}`}>
                                            <Filter size={15} aria-hidden />
                                            <span>
                                                <small>Practice pool</small>
                                                <strong>{filteredScenarioCount}/{ALL_TRAINING_SCENARIOS.length} <em>· {activeScenarioFilterCount > 0 ? `${activeScenarioFilterCount} active` : 'Full range'}</em></strong>
                                            </span>
                                        </div>
                                    </div>

                                    <div className="preflop-level-grid">
                                        {LEVELS.map((level, idx) => {
                                            const levelScenarios = getScenariosByLevel(level.level);
                                            const scenarioCount = levelScenarios.length;
                                            const matchingScenarioCount = activeScenarioFilterCount > 0
                                                ? filterScenarios(levelScenarios, scenarioFilters).length
                                                : scenarioCount;
                                            const levelConfig = getLevelConfig(level.level) || { timer: 90, gridSize: 13, maxHands: 20, diamondMultiplier: 1.0 };
                                            const isUnlocked = level.level <= highestUnlockedLevel;
                                            const isCurrent = level.level === currentLevel;
                                            const mastery = memoryDashboard?.per_level_mastery?.find(x => x.level === level.level);
                                            const isMastered = Boolean(mastery?.mastered);
                                            const hasMatchingScenarios = matchingScenarioCount > 0;
                                            const isAvailable = isUnlocked && hasMatchingScenarios;
                                            const levelState = !isUnlocked
                                                ? 'locked'
                                                : !hasMatchingScenarios
                                                    ? 'no-match'
                                                    : isMastered
                                                        ? 'mastered'
                                                        : isCurrent
                                                            ? 'current'
                                                            : 'ready';
                                            const levelStateLabel = {
                                                locked: 'Locked',
                                                'no-match': 'No matches',
                                                mastered: 'Mastered',
                                                current: 'Current',
                                                ready: 'Ready',
                                            }[levelState];

                                            return (
                                                <article
                                                    key={level.level}
                                                    className={`preflop-level-card${isCurrent ? ' is-current' : ''}${isMastered ? ' is-mastered' : ''}${!isUnlocked ? ' is-locked' : ''}${isUnlocked && !hasMatchingScenarios ? ' is-no-match' : ''}`}
                                                    style={{ '--level-index': idx }}
                                                    data-level-state={levelState}
                                                    aria-current={isCurrent ? 'step' : undefined}
                                                >
                                                    <button
                                                        type="button"
                                                        className="preflop-level-card-action"
                                                        onClick={() => startGame(level.level)}
                                                        disabled={!isAvailable}
                                                        aria-label={`${levelStateLabel}: Level ${level.level}, ${level.name}. ${matchingScenarioCount} matching scenarios.`}
                                                    />
                                                    <div className="preflop-level-node" aria-hidden="true"><span>{level.level}</span></div>
                                                    <div className="preflop-level-copy">
                                                        <div className="preflop-level-heading">
                                                            <div className="preflop-level-number">Level {level.level}</div>
                                                            <span className={`preflop-level-state is-${levelState}`}>{levelStateLabel}</span>
                                                        </div>
                                                        <h3>{level.name}</h3>
                                                        <p>{level.focus}</p>
                                                    </div>
                                                    <div className="preflop-level-meta">
                                                        <span>{levelConfig.timer}s</span>
                                                        <span><Gem size={13} aria-hidden />×{levelConfig.diamondMultiplier}</span>
                                                        <span className={activeScenarioFilterCount > 0 ? 'is-filtered-count' : ''}>
                                                            {matchingScenarioCount} {activeScenarioFilterCount > 0 ? 'matching' : `scenario${matchingScenarioCount !== 1 ? 's' : ''}`}
                                                        </span>
                                                        <div className="preflop-level-locks">
                                                            {level.level > 3 && isVIP === false && (
                                                                <span className="preflop-level-cost"><Gem size={11} aria-hidden />10</span>
                                                            )}
                                                            {level.level > 3 && isVIP && (
                                                                <span className="preflop-level-vip">VIP</span>
                                                            )}
                                                            {!isUnlocked && <Lock size={12} aria-hidden style={{ color: 'rgba(255,255,255,0.45)' }} />}
                                                        </div>
                                                    </div>
                                                    {/* 2026-05-07 — real progress from memoryDashboard.per_level_mastery */}
                                                    {(() => {
                                                        const m = mastery;
                                                        if (!m || m.attempts === 0) return null;
                                                        const pct = Math.max(0, Math.min(100, m.best_accuracy));
                                                        return (
                                                            <div className="preflop-level-progress">
                                                                <div className="preflop-level-progress-label">
                                                                    <span>Best {pct}%</span>
                                                                    {m.mastered && (
                                                                        <span className="preflop-level-mastered-label">
                                                                            <ShieldCheck size={10} aria-hidden /> Mastered
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <div className="preflop-level-progress-track" role="progressbar" aria-label={`Level ${level.level} best accuracy`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                                                                    <div
                                                                        className={`preflop-level-progress-fill${m.mastered ? ' is-mastered' : ''}`}
                                                                        style={{ '--level-progress': `${pct}%` }}
                                                                    />
                                                                </div>
                                                            </div>
                                                        );
                                                    })()}
                                                </article>
                                            );
                                        })}
                                    </div>

                                    {/* Mastery Gate */}
                                    <div className="preflop-mastery-gate">
                                        <div className="preflop-mastery-icon"><ShieldCheck size={24} aria-hidden /></div>
                                        <div>
                                            <div className="preflop-mastery-title">85% Mastery Gate</div>
                                            <div className="preflop-mastery-desc">
                                                Master each level at 85% or better to permanently open the next station. Five passes in one session also unlock it immediately.
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

                            {/* VIP Upsell — only for confirmed non-VIP users */}
                            {isVIP === false && (
                                <div className="preflop-vip-panel">
                                    <div className="preflop-vip-seal">VIP</div>
                                    <div className="preflop-vip-copy">
                                        <div>Go VIP - $19.99/month</div>
                                        <p>Unlimited Games • All Levels • No Diamond Cost • Exclusive Modes</p>
                                    </div>
                                    <button type="button" onClick={handleVipUpgrade} disabled={vipCheckoutPending}>
                                        {vipCheckoutPending ? 'Opening checkout…' : 'Upgrade to VIP'} <ChevronRight size={18} aria-hidden />
                                    </button>
                                    {gameNotice?.context === 'checkout' && (
                                        <div className="preflop-vip-notice" role="status">
                                            <span>{gameNotice.message}</span>
                                            <button type="button" onClick={() => setGameNotice(null)} aria-label="Dismiss checkout message">Dismiss</button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
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
                        <section className="preflop-range-lab" aria-labelledby="preflop-range-lab-title">
                            <p className="preflop-lab-live" aria-live="polite" aria-atomic="true">{labStatus}</p>
                            <header className="preflop-lab-briefing">
                                <div className="preflop-lab-briefing-copy">
                                    <div className="preflop-lab-kicker">
                                        <span>Range Lab</span>
                                        <span>Level {currentLevel}</span>
                                    </div>
                                    <h2 id="preflop-range-lab-title">{currentScenario.title}</h2>
                                    <p>{currentScenario.description}</p>
                                    {currentScenario.tip && !gradeResult && preferences.visualHints === true && (
                                        <div className="preflop-lab-tip">
                                            <Lightbulb size={16} aria-hidden />
                                            <span>{currentScenario.tip}</span>
                                        </div>
                                    )}
                                </div>

                                <div className={`preflop-lab-readout${gradeResult ? ' has-result' : ''}`}>
                                    {gradeResult ? (
                                        <>
                                            <strong data-pass={gradeResult.score >= MASTERY_THRESHOLD}>{gradeResult.score}%</strong>
                                            <span>{gradeResult.score >= MASTERY_THRESHOLD ? 'Range passed' : 'Review required'}</span>
                                        </>
                                    ) : preferences.showTimer !== false ? (
                                        <>
                                            <Clock3 size={18} aria-hidden />
                                            <strong style={{ color: getTimerColor() }}>{timeRemaining}</strong>
                                            <span>seconds</span>
                                        </>
                                    ) : (
                                        <>
                                            <Clock3 size={18} aria-hidden />
                                            <strong className="preflop-lab-timer-hidden">—</strong>
                                            <span>timer hidden</span>
                                        </>
                                    )}
                                </div>

                                {preferences.showTimer !== false && <div
                                    className="preflop-lab-timer"
                                    data-urgency={timeRemaining <= 10 ? 'critical' : timeRemaining <= 30 ? 'warning' : 'steady'}
                                    role="progressbar"
                                    aria-label="Scenario time remaining"
                                    aria-valuemin="0"
                                    aria-valuemax={safeLevelConfig.timer}
                                    aria-valuenow={timeRemaining}
                                >
                                    <span style={{ '--timer-progress': `${Math.max(0, Math.min(100, (timeRemaining / safeLevelConfig.timer) * 100))}%` }} />
                                </div>}
                            </header>

                            <div className="preflop-lab-console">
                                <div className="preflop-lab-action-header">
                                    <div>
                                        <span className="preflop-lab-section-index">01</span>
                                        <span>Choose action</span>
                                    </div>
                                    <span>{markedHandCount} hand{markedHandCount === 1 ? '' : 's'} marked</span>
                                </div>
                                <div className="preflop-lab-actions" aria-label="Range actions">
                                    {Object.entries(ACTION_COLORS).map(([action, { bg, border, label, key }]) => (
                                        <button
                                            key={action}
                                            type="button"
                                            onClick={() => handleActionSelect(action)}
                                            disabled={!!gradeResult}
                                            className={selectedAction === action ? 'is-selected' : ''}
                                            style={{ '--action-color': border, '--action-fill': bg }}
                                            aria-pressed={selectedAction === action}
                                        >
                                            <kbd>{key}</kbd>
                                            <span>{label}</span>
                                        </button>
                                    ))}
                                </div>
                                <div className="preflop-lab-shape-tools" aria-label="Quick range shapes">
                                    <span>Apply active action to</span>
                                    <button type="button" onClick={() => handleFillShape('pairs')} disabled={!!gradeResult}>Pairs</button>
                                    <button type="button" onClick={() => handleFillShape('suited')} disabled={!!gradeResult}>Suited</button>
                                    <button type="button" onClick={() => handleFillShape('offsuit')} disabled={!!gradeResult}>Offsuit</button>
                                </div>
                            </div>

                            <div
                                className="preflop-lab-command-strip"
                                style={{ '--selected-color': ACTION_COLORS[selectedAction]?.border, '--selected-fill': ACTION_COLORS[selectedAction]?.bg }}
                                aria-label="Range editing controls"
                            >
                                <div className="preflop-lab-active-tool">
                                    <span>Active tool</span>
                                    <strong>
                                        <i aria-hidden />
                                        {ACTION_COLORS[selectedAction]?.label || selectedAction}
                                    </strong>
                                </div>
                                <div className="preflop-lab-command-actions" aria-label="Quick action selector">
                                    {Object.entries(ACTION_COLORS).map(([action, { border, label }]) => (
                                        <button
                                            key={action}
                                            type="button"
                                            onClick={() => handleActionSelect(action)}
                                            disabled={!!gradeResult}
                                            aria-label={`Use ${label}`}
                                            aria-pressed={selectedAction === action}
                                            style={{ '--action-color': border }}
                                        >
                                            <i aria-hidden />
                                            <span>{label.replace('RAISE ', 'R-')}</span>
                                        </button>
                                    ))}
                                </div>
                                <div className="preflop-lab-command-counts" aria-label={`${markedHandCount} hand${markedHandCount === 1 ? '' : 's'} marked; ${selectedActionCount} use the active action`}>
                                    <span><strong>{markedHandCount}</strong> marked</span>
                                    <span><strong>{selectedActionCount}</strong> active</span>
                                </div>
                                <div className="preflop-lab-edit-tools">
                                    <button
                                        type="button"
                                        onClick={handleUndo}
                                        disabled={!!gradeResult || !timerActive || gridHistoryRef.current.length === 0}
                                        aria-label="Undo last range edit"
                                    >
                                        <Undo2 size={16} aria-hidden />
                                        <span>Undo</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleRedo}
                                        disabled={!!gradeResult || !timerActive || gridRedoRef.current.length === 0}
                                        aria-label="Redo last undone range edit"
                                    >
                                        <Redo2 size={16} aria-hidden />
                                        <span>Redo</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleClearRange}
                                        disabled={!!gradeResult || !timerActive || markedHandCount === 0}
                                        aria-label="Clear marked range"
                                    >
                                        <Trash2 size={16} aria-hidden />
                                        <span>Clear</span>
                                    </button>
                                </div>
                            </div>

                            <div className="preflop-lab-matrix-panel">
                                <div className="preflop-lab-matrix-heading">
                                    <div>
                                        <span className="preflop-lab-section-index">02</span>
                                        <span>Build your range</span>
                                    </div>
                                    <span>Tap a hand to apply {ACTION_COLORS[selectedAction]?.label || selectedAction}</span>
                                </div>
                                <PreflopRangeMatrix
                                    ranks={RANKS}
                                    getHandName={getHandName}
                                    actionColors={ACTION_COLORS}
                                    userGrid={userGrid}
                                    gradeResult={gradeResult}
                                    scenario={currentScenario}
                                    timerActive={timerActive}
                                    onCellClick={handleCellClick}
                                />
                            </div>

                            <div className="preflop-lab-submit-panel">
                                {!gradeResult ? (
                                    <button type="button" onClick={() => handleSubmit()} className="preflop-lab-submit" disabled={!timerActive}>
                                        <Send size={18} aria-hidden />
                                        <span>Submit range</span>
                                        {preferences.keyboardShortcuts !== false && <kbd>Space</kbd>}
                                    </button>
                                ) : (
                                    <div className="preflop-lab-result-actions">
                                        <button type="button" onClick={() => setMode('menu')}>
                                            <RotateCcw size={17} aria-hidden />
                                            Training menu
                                        </button>
                                        <button type="button" onClick={handleRetry}>
                                            <RotateCcw size={17} aria-hidden />
                                            Retry this range
                                        </button>
                                        <button type="button" onClick={handleNext} className="is-primary">
                                            Next scenario
                                            <ArrowRight size={17} aria-hidden />
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Result Feedback */}
                            {gradeResult && (
                                <div className="preflop-lab-feedback" aria-live="polite">
                                    <div className="preflop-lab-feedback-grid">
                                        <div data-result="correct">
                                            <span>Correct</span>
                                            <strong>{gradeResult.correctHands}</strong>
                                        </div>
                                        <div data-result="missed">
                                            <span>Missed</span>
                                            <strong>{gradeResult.missedHands.length}</strong>
                                        </div>
                                        <div data-result="extra">
                                            <span>Extra</span>
                                            <strong>{gradeResult.extraHands.length}</strong>
                                        </div>
                                        <div data-result="wrong">
                                            <span>Wrong action</span>
                                            <strong>{gradeResult.wrongActionHands.length}</strong>
                                        </div>
                                    </div>
                                    {gradeResult.score >= 85 && lastReward && (
                                        <div className="preflop-lab-reward">
                                            <Gem size={17} aria-hidden />
                                            +{lastReward.diamonds} diamonds earned · ×{multiplier} multiplier
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
                                                <span style={{ fontFamily: "var(--font-orbitron), 'Orbitron'", fontSize: 14, color: '#10B981' }}>Jarvis Analysis</span>
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

                            <JarvisExplanationDialog
                                modal={explainModal}
                                onClose={() => setExplainModal(prev => ({ ...prev, show: false }))}
                            />
                        </section>
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
        fontFamily: "var(--font-orbitron), 'Orbitron', sans-serif",
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
        maxWidth: 1180,
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
        fontFamily: "var(--font-orbitron), 'Orbitron', sans-serif",
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
        fontFamily: "var(--font-orbitron), 'Orbitron', sans-serif",
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
        fontFamily: "var(--font-orbitron), 'Orbitron', sans-serif",
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
        fontFamily: "var(--font-orbitron), 'Orbitron', sans-serif",
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
        fontFamily: "var(--font-orbitron), 'Orbitron', sans-serif",
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
