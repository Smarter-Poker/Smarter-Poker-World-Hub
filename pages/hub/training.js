/* ═══════════════════════════════════════════════════════════════════════════
   GTO TRAINING ORB — Interactive Poker Training System
   Orb #4: Master Game Theory Optimal play with AI-powered drills
   💎 DIAMOND PAYOUT ENGINE INTEGRATED — Automatic rewards on correct answers
   🎮 VIDEO GAME MODE — Pressure timer, screen effects, combo system
   ═══════════════════════════════════════════════════════════════════════════ */

import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { xpEngine } from '../../src/engine/XPEngine';
import { leakAnalyzer } from '../../src/engine/LeakSignalAnalyzer';
import { eventBus, EventType, busEmit } from '../../src/engine/EventBus';

// Initialize Supabase
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

// ═══════════════════════════════════════════════════════════════════════════
// 💎 DIAMOND PAYOUT ENGINE — Automatic Reward System with Local Fallback
// Works immediately with localStorage, syncs to database when available
// ═══════════════════════════════════════════════════════════════════════════
const DiamondPayoutEngine = {
    _localBalance: null,
    _localClaims: [],

    // Initialize local storage
    _initLocal() {
        if (typeof window === 'undefined') return;
        if (this._localBalance === null) {
            this._localBalance = parseInt(localStorage.getItem('diamond_balance') || '0', 10);
            this._localClaims = JSON.parse(localStorage.getItem('diamond_claims') || '[]');
        }
    },

    // Save to local storage
    _saveLocal() {
        if (typeof window === 'undefined') return;
        localStorage.setItem('diamond_balance', String(this._localBalance));
        localStorage.setItem('diamond_claims', JSON.stringify(this._localClaims));
    },

    // Claim a diamond reward (tries database, falls back to local)
    async claimReward(rewardId, metadata = {}) {
        this._initLocal();

        // Define reward values
        const REWARD_VALUES = {
            'correct_answer_bonus': { diamonds: 5, name: 'Correct Answer', rarity: 'common' },
            'first_training_of_day': { diamonds: 10, name: 'First Training', rarity: 'common' },
            'level_completion_85': { diamonds: 50, name: 'Level Mastered', rarity: 'rare' },
            'perfect_score_bonus': { diamonds: 100, name: 'Perfect Score', rarity: 'epic' },
            'pillar5_jackpot': { diamonds: 777, name: 'THE JACKPOT!', rarity: 'legendary' },
            'pillar3_perfectionist': { diamonds: 25, name: 'Perfectionist', rarity: 'uncommon' },
            'pillar4_speed_runner': { diamonds: 25, name: 'Speed Runner', rarity: 'uncommon' },
            'pillar3_sniper': { diamonds: 30, name: 'The Sniper', rarity: 'uncommon' },
        };

        try {
            const { data: { user } } = await supabase.auth.getUser();

            // Try database first
            if (user) {
                const { data, error } = await supabase.rpc('claim_reward', {
                    p_user_id: user.id,
                    p_reward_id: rewardId,
                    p_metadata: metadata
                });

                if (!error && data?.success) {
                    // Database worked! Sync local
                    this._localBalance = data.new_balance || (this._localBalance + data.diamonds);
                    this._saveLocal();
                    return data;
                }
            }

            // Fallback to local simulation
            const rewardDef = REWARD_VALUES[rewardId] || { diamonds: 5, name: rewardId, rarity: 'common' };

            // Check if already claimed (for non-repeatable)
            if (!rewardId.includes('correct_answer') && !rewardId.includes('jackpot')) {
                if (this._localClaims.includes(rewardId)) {
                    return { success: false, already_claimed: true };
                }
                this._localClaims.push(rewardId);
            }

            // Award diamonds locally
            this._localBalance += rewardDef.diamonds;
            this._saveLocal();

            return {
                success: true,
                reward_id: rewardId,
                reward_name: rewardDef.name,
                diamonds: rewardDef.diamonds,
                rarity: rewardDef.rarity,
                new_balance: this._localBalance,
                local_mode: true
            };
        } catch (err) {
            console.log('Diamond engine (local mode):', err.message);
            return { success: false, error: err.message };
        }
    },

    // Track training action (correct answer, level complete, etc.)
    async trackAction(actionType, metadata = {}) {
        const rewards = [];

        switch (actionType) {
            case 'correct_answer':
                // Base reward for correct answer
                const base = await this.claimReward('correct_answer_bonus', metadata);
                if (base?.success) rewards.push(base);

                // 0.1% Jackpot chance
                if (Math.random() < 0.001) {
                    const jackpot = await this.claimReward('pillar5_jackpot', metadata);
                    if (jackpot?.success) rewards.push(jackpot);
                }
                break;

            case 'level_complete':
                // Level completion reward
                const complete = await this.claimReward('level_completion_85', metadata);
                if (complete?.success) rewards.push(complete);

                // Perfect score bonus
                if (metadata.accuracy === 100) {
                    const perfect = await this.claimReward('pillar3_perfectionist', metadata);
                    if (perfect?.success) rewards.push(perfect);
                }

                // Speed runner check
                if (metadata.time_seconds && metadata.time_seconds < 60) {
                    const speed = await this.claimReward('pillar4_speed_runner', metadata);
                    if (speed?.success) rewards.push(speed);
                }
                break;

            case 'first_training':
                const first = await this.claimReward('first_training_of_day', metadata);
                if (first?.success) rewards.push(first);
                break;

            case 'streak_milestone':
                if (metadata.streak >= 10) {
                    const streak = await this.claimReward('pillar3_sniper', metadata);
                    if (streak?.success) rewards.push(streak);
                }
                break;
        }

        return rewards;
    },

    // Get user's diamond balance (tries database, falls back to local)
    async getBalance() {
        this._initLocal();

        try {
            const { data: { user } } = await supabase.auth.getUser();

            if (user) {
                const { data, error } = await supabase
                    .from('user_diamond_balance')
                    .select('balance')
                    .eq('user_id', user.id)
                    .single();

                if (!error && data?.balance !== undefined) {
                    // Sync local with database
                    this._localBalance = data.balance;
                    this._saveLocal();
                    return data.balance;
                }
            }

            // Fallback to local
            return this._localBalance || 0;
        } catch {
            return this._localBalance || 0;
        }
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// TRAINING LEVELS — 10 Levels with 85% Mastery Gate
// ═══════════════════════════════════════════════════════════════════════════
const TRAINING_LEVELS = [
    { level: 1, name: 'Fundamentals', requiredScore: 0, xpReward: 100, scenarios: 20 },
    { level: 2, name: 'Position Play', requiredScore: 85, xpReward: 150, scenarios: 25 },
    { level: 3, name: 'Preflop Ranges', requiredScore: 85, xpReward: 200, scenarios: 30 },
    { level: 4, name: 'Pot Odds', requiredScore: 85, xpReward: 250, scenarios: 30 },
    { level: 5, name: 'Betting Patterns', requiredScore: 85, xpReward: 300, scenarios: 35 },
    { level: 6, name: 'Reading Opponents', requiredScore: 85, xpReward: 400, scenarios: 35 },
    { level: 7, name: 'Bluffing Strategy', requiredScore: 85, xpReward: 500, scenarios: 40 },
    { level: 8, name: 'Advanced Concepts', requiredScore: 85, xpReward: 600, scenarios: 40 },
    { level: 9, name: 'Tournament Play', requiredScore: 85, xpReward: 750, scenarios: 45 },
    { level: 10, name: 'GTO Mastery', requiredScore: 85, xpReward: 1000, scenarios: 50 },
];

// ═══════════════════════════════════════════════════════════════════════════
// SAMPLE GTO SCENARIOS — Training drills with GTO solutions
// ═══════════════════════════════════════════════════════════════════════════
const SAMPLE_SCENARIOS = [
    {
        id: 1,
        level: 1,
        title: 'UTG Opening Range',
        situation: 'You are UTG in a 9-handed cash game with 100BB. What hands should you open?',
        heroCards: ['As', 'Kh'],
        board: [],
        potSize: 1.5,
        stackSize: 100,
        position: 'UTG',
        options: [
            { id: 'a', text: 'Raise to 3BB', isGTO: true, evDiff: 0 },
            { id: 'b', text: 'Limp', isGTO: false, evDiff: -2.5 },
            { id: 'c', text: 'Fold', isGTO: false, evDiff: -5.0 },
        ],
        explanation: 'AKo is a premium hand that should always be raised from any position. Limping loses value and allows the blinds to see a cheap flop.',
    },
    {
        id: 2,
        level: 1,
        title: 'Button Steal',
        situation: 'Folded to you on the button with 50BB. Blinds are tight players.',
        heroCards: ['Jd', 'Ts'],
        board: [],
        potSize: 1.5,
        stackSize: 50,
        position: 'BTN',
        options: [
            { id: 'a', text: 'Raise to 2.5BB', isGTO: true, evDiff: 0 },
            { id: 'b', text: 'Fold', isGTO: false, evDiff: -1.2 },
            { id: 'c', text: 'Raise to 5BB', isGTO: false, evDiff: -0.8 },
        ],
        explanation: 'JTs is a strong suited connector that plays well postflop. Raising from the button with position is highly profitable against tight blinds.',
    },
    {
        id: 3,
        level: 1,
        title: 'C-Bet Decision',
        situation: 'You raised preflop from MP, BB called. Flop: K♠ 7♦ 2♣',
        heroCards: ['Ah', 'Qd'],
        board: ['Ks', '7d', '2c'],
        potSize: 7,
        stackSize: 94,
        position: 'MP',
        options: [
            { id: 'a', text: 'Bet 1/3 pot', isGTO: true, evDiff: 0 },
            { id: 'b', text: 'Check', isGTO: false, evDiff: -0.5 },
            { id: 'c', text: 'Bet full pot', isGTO: false, evDiff: -1.0 },
        ],
        explanation: 'On a dry K-high board, a small c-bet is optimal. You have overcards and backdoor draws. Betting allows you to take down the pot or set up a bluff.',
    },
];

// ═══════════════════════════════════════════════════════════════════════════
// ⏱️ PRESSURE TIMER — Video Game Urgency
// ═══════════════════════════════════════════════════════════════════════════
function PressureTimer({ duration, isActive, onExpire, timeRemaining, setTimeRemaining }) {
    const percentRemaining = (timeRemaining / duration) * 100;

    const getColor = () => {
        if (percentRemaining > 60) return { bg: '#22C55E', glow: 'rgba(34,197,94,0.5)' };
        if (percentRemaining > 30) return { bg: '#EAB308', glow: 'rgba(234,179,8,0.6)' };
        return { bg: '#EF4444', glow: 'rgba(239,68,68,0.7)' };
    };
    const color = getColor();

    useEffect(() => {
        if (!isActive || timeRemaining <= 0) return;

        const interval = setInterval(() => {
            setTimeRemaining(prev => {
                const newTime = prev - 0.1;

                if (newTime <= duration * 0.3 && newTime > duration * 0.3 - 0.1) {
                    busEmit.timerWarning();
                    busEmit.screenShake('light');
                }

                if (newTime <= 0) {
                    busEmit.timerExpired();
                    onExpire?.();
                    return 0;
                }
                return newTime;
            });
        }, 100);

        return () => clearInterval(interval);
    }, [isActive, timeRemaining, duration, setTimeRemaining, onExpire]);

    if (!isActive) return null;

    return (
        <div style={{
            position: 'relative',
            width: 80,
            height: 80,
            borderRadius: '50%',
            background: '#0a1628',
            border: `4px solid ${color.bg}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: `0 0 20px ${color.glow}`,
            animation: percentRemaining <= 30 ? 'pulse 0.5s infinite' : 'none',
        }}>
            <div style={{
                textAlign: 'center',
                color: color.bg,
            }}>
                <div style={{ fontSize: 24, fontWeight: 800, fontFamily: 'Orbitron, monospace' }}>
                    {Math.ceil(timeRemaining)}
                </div>
                <div style={{ fontSize: 10, opacity: 0.7 }}>SEC</div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎬 SCREEN EFFECTS — Video Game Visual Feedback
// ═══════════════════════════════════════════════════════════════════════════
function ScreenEffects({ isCorrect, isIncorrect, comboLevel }) {
    const [flash, setFlash] = useState(null);
    const [shake, setShake] = useState(false);

    useEffect(() => {
        const correctUnsub = eventBus.on(EventType.DECISION_CORRECT, () => {
            setFlash('#22C55E');
            setTimeout(() => setFlash(null), 300);
        });

        const incorrectUnsub = eventBus.on(EventType.DECISION_INCORRECT, () => {
            setFlash('#EF4444');
            setShake(true);
            setTimeout(() => {
                setFlash(null);
                setShake(false);
            }, 400);
        });

        return () => {
            correctUnsub();
            incorrectUnsub();
        };
    }, []);

    return (
        <>
            {/* Flash Overlay */}
            {flash && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    backgroundColor: flash,
                    opacity: 0.3,
                    pointerEvents: 'none',
                    zIndex: 9999,
                    transition: 'opacity 0.2s'
                }} />
            )}
            {/* Combo Display */}
            {comboLevel >= 2 && (
                <div style={{
                    position: 'fixed',
                    top: 100,
                    right: 24,
                    padding: '12px 24px',
                    background: comboLevel >= 4 ? 'linear-gradient(135deg, #A855F7, #EC4899)' :
                        comboLevel >= 3 ? 'linear-gradient(135deg, #22C55E, #10B981)' :
                            'linear-gradient(135deg, #3B82F6, #06B6D4)',
                    borderRadius: 12,
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: 24,
                    fontFamily: 'Orbitron, sans-serif',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
                    zIndex: 100,
                }}>
                    {comboLevel + 1}x COMBO
                </div>
            )}
        </>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// CARD DISPLAY COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
function PlayingCard({ card, size = 'medium' }) {
    if (!card) return null;

    const suit = card[card.length - 1];
    const rank = card.slice(0, -1);

    const suitSymbols = { s: '♠', h: '♥', d: '♦', c: '♣' };
    const suitColors = { s: '#1a1a2e', h: '#ff4757', d: '#3498db', c: '#2ecc71' };

    const sizes = {
        small: { width: 40, height: 56, fontSize: 14 },
        medium: { width: 60, height: 84, fontSize: 20 },
        large: { width: 80, height: 112, fontSize: 26 },
    };

    const s = sizes[size];

    return (
        <div style={{
            width: s.width,
            height: s.height,
            background: 'linear-gradient(135deg, #ffffff, #f0f0f0)',
            borderRadius: 6,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            border: '2px solid rgba(255, 255, 255, 0.8)',
            fontFamily: 'Georgia, serif',
            color: suitColors[suit],
            fontWeight: 'bold',
            fontSize: s.fontSize,
        }}>
            <span>{rank}</span>
            <span style={{ fontSize: s.fontSize * 1.2 }}>{suitSymbols[suit]}</span>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// LEVEL CARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
function LevelCard({ level, userScore, isUnlocked, isActive, onClick }) {
    const progressPercent = Math.min((userScore / 85) * 100, 100);
    const isMastered = userScore >= 85;

    return (
        <div
            onClick={() => isUnlocked && onClick()}
            style={{
                background: isActive
                    ? 'linear-gradient(135deg, rgba(0, 212, 255, 0.2), rgba(138, 43, 226, 0.2))'
                    : isUnlocked
                        ? 'rgba(255, 255, 255, 0.05)'
                        : 'rgba(0, 0, 0, 0.3)',
                border: isActive
                    ? '2px solid #00D4FF'
                    : isUnlocked
                        ? '1px solid rgba(255, 255, 255, 0.2)'
                        : '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: 12,
                padding: 16,
                cursor: isUnlocked ? 'pointer' : 'not-allowed',
                opacity: isUnlocked ? 1 : 0.5,
                transition: 'all 0.2s ease',
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: isUnlocked ? '#00D4FF' : '#666',
                    fontFamily: 'Orbitron, sans-serif',
                }}>
                    LEVEL {level.level}
                </span>
                {isMastered && <span style={{ fontSize: 16 }}>✅</span>}
                {!isUnlocked && <span style={{ fontSize: 14 }}>🔒</span>}
            </div>
            <h3 style={{
                fontSize: 16,
                fontWeight: 600,
                color: '#fff',
                marginBottom: 8,
            }}>
                {level.name}
            </h3>
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 12,
                color: 'rgba(255, 255, 255, 0.6)',
                marginBottom: 8,
            }}>
                <span>{level.scenarios} scenarios</span>
                <span>+{level.xpReward} XP</span>
            </div>
            {isUnlocked && (
                <div style={{
                    height: 4,
                    background: 'rgba(255, 255, 255, 0.1)',
                    borderRadius: 2,
                    overflow: 'hidden',
                }}>
                    <div style={{
                        height: '100%',
                        width: `${progressPercent}%`,
                        background: isMastered
                            ? 'linear-gradient(90deg, #00ff88, #00D4FF)'
                            : 'linear-gradient(90deg, #00D4FF, #8a2be2)',
                        borderRadius: 2,
                    }} />
                </div>
            )}
            {isUnlocked && (
                <div style={{
                    fontSize: 11,
                    color: isMastered ? '#00ff88' : 'rgba(255, 255, 255, 0.5)',
                    marginTop: 4,
                    textAlign: 'right',
                }}>
                    {userScore}% / 85% required
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN TRAINING PAGE — 💎 Diamond Payout + 🎮 Video Game Mode
// ═══════════════════════════════════════════════════════════════════════════
export default function TrainingPage() {
    const router = useRouter();
    const [activeLevel, setActiveLevel] = useState(1);
    const [currentScenario, setCurrentScenario] = useState(null);
    const [selectedAnswer, setSelectedAnswer] = useState(null);
    const [showResult, setShowResult] = useState(false);
    const [userProgress, setUserProgress] = useState({
        1: 45, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0
    });
    const [totalXP, setTotalXP] = useState(50);
    const [streak, setStreak] = useState(0);
    const [mode, setMode] = useState('levels'); // 'levels' | 'drill'
    const [diamondBalance, setDiamondBalance] = useState(0);
    const [lastReward, setLastReward] = useState(null);
    const [sessionStartTime] = useState(Date.now());
    const [isFirstTraining, setIsFirstTraining] = useState(true);

    // 🎮 VIDEO GAME MODE STATE
    const [timerDuration] = useState(15); // 15 seconds per decision
    const [timeRemaining, setTimeRemaining] = useState(15);
    const [timerActive, setTimerActive] = useState(false);
    const [comboLevel, setComboLevel] = useState(0);
    const [xpMultiplier, setXpMultiplier] = useState(1);
    const [fastBonus, setFastBonus] = useState(null);
    const [xpState, setXPState] = useState(xpEngine.getState());

    // Subscribe to XP engine updates
    useEffect(() => {
        leakAnalyzer.start();
        const unsub = xpEngine.subscribe((state) => {
            setXPState(state);
            setStreak(state.currentStreak);
            setComboLevel(state.comboLevel);
        });
        return unsub;
    }, []);

    // 💎 Load diamond balance on mount
    useEffect(() => {
        DiamondPayoutEngine.getBalance().then(setDiamondBalance);
    }, []);

    // 💎 Trigger first training reward
    useEffect(() => {
        if (mode === 'drill' && isFirstTraining) {
            setIsFirstTraining(false);
            DiamondPayoutEngine.trackAction('first_training', {
                level: activeLevel,
                timestamp: new Date().toISOString()
            });
        }
    }, [mode, isFirstTraining, activeLevel]);

    // Start a drill for the active level (🎮 with pressure timer)
    const startDrill = () => {
        const levelScenarios = SAMPLE_SCENARIOS.filter(s => s.level === activeLevel);
        const randomScenario = levelScenarios[Math.floor(Math.random() * levelScenarios.length)] || SAMPLE_SCENARIOS[0];
        setCurrentScenario(randomScenario);
        setSelectedAnswer(null);
        setShowResult(false);
        setMode('drill');
        // 🎮 Activate pressure timer
        setTimeRemaining(timerDuration);
        setTimerActive(true);
        setFastBonus(null);
        xpEngine.resetSession();
    };

    // 💎🎮 Handle answer selection with diamond rewards AND XP Engine
    const selectAnswer = async (option) => {
        if (showResult) return;
        setSelectedAnswer(option);
        setShowResult(true);
        setTimerActive(false); // 🎮 Stop timer

        // 🎮 Calculate fast decision bonus
        const timeUsed = timerDuration - timeRemaining;
        const percentUsed = (timeUsed / timerDuration) * 100;
        let speedBonus = 1.0;
        if (percentUsed <= 20) speedBonus = 2.0;      // Lightning fast
        else if (percentUsed <= 40) speedBonus = 1.5; // Fast
        else if (percentUsed <= 60) speedBonus = 1.25; // Normal-fast

        if (option.isGTO) {
            // ✅ Correct answer — Award XP and diamonds!
            const event = xpEngine.recordCorrect();

            // Apply speed bonus
            const bonusXP = Math.round((speedBonus - 1) * event.totalXP);
            if (bonusXP > 0) {
                setFastBonus({ multiplier: speedBonus, amount: bonusXP });
                setTotalXP(prev => prev + event.totalXP + bonusXP);
            } else {
                setTotalXP(prev => prev + event.totalXP);
            }

            setUserProgress(prev => ({
                ...prev,
                [activeLevel]: Math.min(prev[activeLevel] + 5, 100)
            }));

            // 💎 Track correct answer with Diamond Payout Engine
            const rewards = await DiamondPayoutEngine.trackAction('correct_answer', {
                level: activeLevel,
                scenario_id: currentScenario?.id,
                streak: xpEngine.getState().currentStreak,
                xp_gained: event.totalXP + bonusXP
            });

            // Update balance and show reward notification
            if (rewards.length > 0) {
                const totalDiamonds = rewards.reduce((sum, r) => sum + (r.diamonds || 0), 0);
                setDiamondBalance(prev => prev + totalDiamonds);
                setLastReward({ diamonds: totalDiamonds, timestamp: Date.now() });

                // Check for streak milestones
                const currentStreak = xpEngine.getState().currentStreak;
                if (currentStreak === 10 || currentStreak === 25 || currentStreak === 50) {
                    DiamondPayoutEngine.trackAction('streak_milestone', { streak: currentStreak });
                }
            }

            // Check for level completion
            const newProgress = Math.min(userProgress[activeLevel] + 5, 100);
            if (newProgress >= 85 && userProgress[activeLevel] < 85) {
                const timeSpent = Math.floor((Date.now() - sessionStartTime) / 1000);
                DiamondPayoutEngine.trackAction('level_complete', {
                    level: activeLevel,
                    accuracy: newProgress,
                    time_seconds: timeSpent
                });
            }
        } else {
            // ❌ Wrong answer - XP Engine handles streak reset
            const bestAction = currentScenario.options.find(o => o.isGTO)?.text || 'Unknown';
            xpEngine.recordIncorrect({
                userAction: option.text,
                bestAction: bestAction,
                scenario: {
                    id: currentScenario.id,
                    title: currentScenario.title,
                    situation: currentScenario.situation
                }
            });
        }
    };

    // Continue to next scenario (🎮 reset timer)
    const nextScenario = () => {
        setLastReward(null);
        setFastBonus(null);
        setTimeRemaining(timerDuration);
        setTimerActive(true);
        const levelScenarios = SAMPLE_SCENARIOS.filter(s => s.level === activeLevel);
        const randomScenario = levelScenarios[Math.floor(Math.random() * levelScenarios.length)] || SAMPLE_SCENARIOS[0];
        setCurrentScenario(randomScenario);
        setSelectedAnswer(null);
        setShowResult(false);
    };

    return (
        <>
            <Head>
                <title>GTO Training — Smarter.Poker</title>
                <meta name="description" content="Master Game Theory Optimal poker with AI-powered drills" />
                <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
                <style>{`
                    @keyframes pulse {
                        0%, 100% { transform: scale(1); }
                        50% { transform: scale(1.05); }
                    }
                    @keyframes popIn {
                        0% { transform: translateX(-50%) scale(0); opacity: 0; }
                        100% { transform: translateX(-50%) scale(1); opacity: 1; }
                    }
                `}</style>
            </Head>

            {/* 🎮 SCREEN EFFECTS — Visual Feedback */}
            <ScreenEffects comboLevel={comboLevel} />

            <div style={styles.container}>
                {/* Background */}
                <div style={styles.bgGrid} />
                <div style={styles.bgGlow} />

                {/* Header */}
                <div style={styles.header}>
                    <button onClick={() => router.push('/hub')} style={styles.backButton}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M19 12H5M12 19l-7-7 7-7" />
                        </svg>
                        <span>Hub</span>
                    </button>

                    <div style={styles.headerStats}>
                        {/* 💎 Diamond Balance */}
                        <div style={{
                            ...styles.statBadge,
                            background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.2), rgba(138, 43, 226, 0.2))',
                            border: '1px solid rgba(0, 212, 255, 0.4)',
                            position: 'relative',
                        }}>
                            <span style={styles.statIcon}>💎</span>
                            <span style={{ ...styles.statValue, color: '#00D4FF' }}>
                                {diamondBalance.toLocaleString()}
                            </span>
                            {/* Reward popup */}
                            {lastReward && Date.now() - lastReward.timestamp < 3000 && (
                                <div style={{
                                    position: 'absolute',
                                    top: -30,
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                    background: 'linear-gradient(135deg, #00ff88, #00D4FF)',
                                    padding: '4px 12px',
                                    borderRadius: 20,
                                    fontSize: 12,
                                    fontWeight: 700,
                                    color: '#0a1628',
                                    whiteSpace: 'nowrap',
                                    animation: 'popIn 0.3s ease-out',
                                    boxShadow: '0 4px 20px rgba(0, 255, 136, 0.4)',
                                }}>
                                    +{lastReward.diamonds} 💎
                                </div>
                            )}
                        </div>
                        <div style={styles.statBadge}>
                            <span style={styles.statIcon}>🎯</span>
                            <span style={styles.statValue}>{totalXP} XP</span>
                        </div>
                        <div style={styles.statBadge}>
                            <span style={styles.statIcon}>🔥</span>
                            <span style={styles.statValue}>{streak} streak</span>
                        </div>
                    </div>
                </div>

                {/* Main Content */}
                <div style={styles.content}>
                    {mode === 'levels' ? (
                        <>
                            {/* Title Section */}
                            <div style={styles.titleSection}>
                                <div style={styles.orbIcon}>🎯</div>
                                <h1 style={styles.title}>GTO Training</h1>
                                <p style={styles.subtitle}>
                                    Master Game Theory Optimal play • 85% required to unlock next level
                                </p>
                            </div>

                            {/* Level Grid */}
                            <div style={styles.levelGrid}>
                                {TRAINING_LEVELS.map((level, index) => {
                                    const isUnlocked = index === 0 || userProgress[index] >= 85;
                                    return (
                                        <LevelCard
                                            key={level.level}
                                            level={level}
                                            userScore={userProgress[level.level]}
                                            isUnlocked={isUnlocked}
                                            isActive={activeLevel === level.level}
                                            onClick={() => {
                                                setActiveLevel(level.level);
                                            }}
                                        />
                                    );
                                })}
                            </div>

                            {/* Start Training Button */}
                            <button onClick={startDrill} style={styles.startButton}>
                                <span style={styles.startIcon}>⚡</span>
                                Start Level {activeLevel} Training
                            </button>
                        </>
                    ) : (
                        /* Drill Mode — 🎮 Video Game Mode */
                        <div style={styles.drillContainer}>
                            {/* Scenario Header with Timer */}
                            <div style={{ ...styles.scenarioHeader, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                    <span style={styles.levelBadge}>Level {activeLevel}</span>
                                    <h2 style={styles.scenarioTitle}>{currentScenario?.title}</h2>
                                </div>
                                {/* 🎮 PRESSURE TIMER */}
                                <PressureTimer
                                    duration={timerDuration}
                                    isActive={timerActive}
                                    timeRemaining={timeRemaining}
                                    setTimeRemaining={setTimeRemaining}
                                    onExpire={() => {
                                        // Auto-select wrong answer on timeout
                                        const wrongOption = currentScenario?.options.find(o => !o.isGTO);
                                        if (wrongOption) selectAnswer(wrongOption);
                                    }}
                                />
                            </div>

                            {/* Fast Bonus Popup */}
                            {fastBonus && (
                                <div style={{
                                    position: 'fixed',
                                    top: '50%',
                                    left: '50%',
                                    transform: 'translate(-50%, -50%)',
                                    padding: '16px 32px',
                                    background: 'linear-gradient(135deg, #EAB308, #F59E0B)',
                                    borderRadius: 16,
                                    color: '#0a1628',
                                    fontSize: 24,
                                    fontWeight: 800,
                                    fontFamily: 'Orbitron, sans-serif',
                                    boxShadow: '0 8px 40px rgba(234, 179, 8, 0.6)',
                                    zIndex: 200,
                                    animation: 'popIn 0.3s ease-out',
                                }}>
                                    ⚡ {fastBonus.multiplier}x FAST! +{fastBonus.amount} XP
                                </div>
                            )}

                            {/* Cards Display */}
                            <div style={styles.cardsSection}>
                                <div style={styles.heroCards}>
                                    <span style={styles.cardLabel}>Your Hand</span>
                                    <div style={styles.cardRow}>
                                        {currentScenario?.heroCards.map((card, i) => (
                                            <PlayingCard key={i} card={card} size="large" />
                                        ))}
                                    </div>
                                </div>

                                {currentScenario?.board.length > 0 && (
                                    <div style={styles.boardCards}>
                                        <span style={styles.cardLabel}>Board</span>
                                        <div style={styles.cardRow}>
                                            {currentScenario.board.map((card, i) => (
                                                <PlayingCard key={i} card={card} size="medium" />
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Situation */}
                            <div style={styles.situationBox}>
                                <div style={styles.situationMeta}>
                                    <span>Position: <strong>{currentScenario?.position}</strong></span>
                                    <span>Pot: <strong>{currentScenario?.potSize}BB</strong></span>
                                    <span>Stack: <strong>{currentScenario?.stackSize}BB</strong></span>
                                </div>
                                <p style={styles.situationText}>{currentScenario?.situation}</p>
                            </div>

                            {/* Answer Options */}
                            <div style={styles.optionsGrid}>
                                {currentScenario?.options.map((option) => (
                                    <button
                                        key={option.id}
                                        onClick={() => selectAnswer(option)}
                                        disabled={showResult}
                                        style={{
                                            ...styles.optionButton,
                                            ...(showResult && option.isGTO ? styles.optionCorrect : {}),
                                            ...(showResult && selectedAnswer?.id === option.id && !option.isGTO ? styles.optionWrong : {}),
                                            ...(selectedAnswer?.id === option.id && !showResult ? styles.optionSelected : {}),
                                        }}
                                    >
                                        <span style={styles.optionLetter}>{option.id.toUpperCase()}</span>
                                        <span style={styles.optionText}>{option.text}</span>
                                        {showResult && (
                                            <span style={styles.evBadge}>
                                                {option.evDiff === 0 ? 'GTO ✓' : `${option.evDiff > 0 ? '+' : ''}${option.evDiff} EV`}
                                            </span>
                                        )}
                                    </button>
                                ))}
                            </div>

                            {/* Result Feedback */}
                            {showResult && (
                                <div style={{
                                    ...styles.resultBox,
                                    borderColor: selectedAnswer?.isGTO ? '#00ff88' : '#ff4757',
                                }}>
                                    <div style={styles.resultHeader}>
                                        <span style={{ fontSize: 24 }}>
                                            {selectedAnswer?.isGTO ? '✅' : '❌'}
                                        </span>
                                        <span style={{
                                            color: selectedAnswer?.isGTO ? '#00ff88' : '#ff4757',
                                            fontWeight: 700,
                                        }}>
                                            {selectedAnswer?.isGTO ? 'Correct! GTO Play' : 'Suboptimal Play'}
                                        </span>
                                    </div>
                                    <p style={styles.explanationText}>
                                        {currentScenario?.explanation}
                                    </p>
                                    <button onClick={nextScenario} style={styles.nextButton}>
                                        Next Scenario →
                                    </button>
                                </div>
                            )}

                            {/* Exit Button */}
                            <button onClick={() => setMode('levels')} style={styles.exitDrill}>
                                ← Back to Levels
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════
const styles = {
    container: {
        minHeight: '100vh',
        background: '#0a1628',
        fontFamily: 'Inter, -apple-system, sans-serif',
        position: 'relative',
        padding: '20px',
    },
    bgGrid: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundImage: `
            linear-gradient(rgba(0, 255, 102, 0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 255, 102, 0.02) 1px, transparent 1px)
        `,
        backgroundSize: '60px 60px',
        pointerEvents: 'none',
    },
    bgGlow: {
        position: 'fixed',
        top: '30%',
        left: '50%',
        width: '100%',
        height: '100%',
        transform: 'translate(-50%, -50%)',
        background: 'radial-gradient(ellipse at center, rgba(0, 255, 102, 0.08), transparent 60%)',
        pointerEvents: 'none',
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
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
        gap: 12,
    },
    statBadge: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 14px',
        background: 'rgba(0, 0, 0, 0.3)',
        borderRadius: 20,
        border: '1px solid rgba(255, 255, 255, 0.1)',
    },
    statIcon: {
        fontSize: 16,
    },
    statValue: {
        fontSize: 14,
        fontWeight: 600,
        color: '#fff',
    },
    content: {
        maxWidth: 1000,
        margin: '0 auto',
    },
    titleSection: {
        textAlign: 'center',
        marginBottom: 40,
    },
    orbIcon: {
        fontSize: 64,
        marginBottom: 16,
    },
    title: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: 36,
        fontWeight: 800,
        color: '#fff',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
        color: 'rgba(255, 255, 255, 0.6)',
    },
    levelGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: 16,
        marginBottom: 32,
    },
    startButton: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        width: '100%',
        maxWidth: 400,
        margin: '0 auto',
        padding: '16px 32px',
        background: 'linear-gradient(135deg, #00ff66, #00cc52)',
        border: 'none',
        borderRadius: 12,
        color: '#0a1628',
        fontSize: 18,
        fontWeight: 700,
        cursor: 'pointer',
        boxShadow: '0 0 30px rgba(0, 255, 102, 0.3)',
    },
    startIcon: {
        fontSize: 24,
    },
    drillContainer: {
        maxWidth: 700,
        margin: '0 auto',
    },
    scenarioHeader: {
        textAlign: 'center',
        marginBottom: 24,
    },
    levelBadge: {
        display: 'inline-block',
        padding: '4px 12px',
        background: 'rgba(0, 255, 102, 0.2)',
        border: '1px solid rgba(0, 255, 102, 0.4)',
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 600,
        color: '#00ff66',
        marginBottom: 8,
    },
    scenarioTitle: {
        fontSize: 24,
        fontWeight: 700,
        color: '#fff',
    },
    cardsSection: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 24,
        marginBottom: 24,
    },
    heroCards: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
    },
    boardCards: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
    },
    cardLabel: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.5)',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    cardRow: {
        display: 'flex',
        gap: 8,
    },
    situationBox: {
        background: 'rgba(0, 0, 0, 0.3)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: 12,
        padding: 20,
        marginBottom: 24,
    },
    situationMeta: {
        display: 'flex',
        gap: 20,
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.7)',
        marginBottom: 12,
    },
    situationText: {
        fontSize: 16,
        color: '#fff',
        lineHeight: 1.6,
    },
    optionsGrid: {
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        marginBottom: 24,
    },
    optionButton: {
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '16px 20px',
        background: 'rgba(255, 255, 255, 0.05)',
        border: '2px solid rgba(255, 255, 255, 0.2)',
        borderRadius: 12,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        textAlign: 'left',
    },
    optionSelected: {
        background: 'rgba(0, 212, 255, 0.2)',
        borderColor: '#00D4FF',
    },
    optionCorrect: {
        background: 'rgba(0, 255, 136, 0.2)',
        borderColor: '#00ff88',
    },
    optionWrong: {
        background: 'rgba(255, 71, 87, 0.2)',
        borderColor: '#ff4757',
    },
    optionLetter: {
        width: 32,
        height: 32,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(255, 255, 255, 0.1)',
        borderRadius: '50%',
        fontSize: 14,
        fontWeight: 700,
        color: '#fff',
    },
    optionText: {
        flex: 1,
        fontSize: 16,
        color: '#fff',
    },
    evBadge: {
        fontSize: 12,
        padding: '4px 10px',
        borderRadius: 6,
        background: 'rgba(0, 0, 0, 0.3)',
        color: 'rgba(255, 255, 255, 0.8)',
    },
    resultBox: {
        background: 'rgba(0, 0, 0, 0.4)',
        border: '2px solid',
        borderRadius: 12,
        padding: 24,
        marginBottom: 24,
    },
    resultHeader: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        marginBottom: 16,
    },
    explanationText: {
        fontSize: 15,
        color: 'rgba(255, 255, 255, 0.85)',
        lineHeight: 1.6,
        marginBottom: 20,
    },
    nextButton: {
        padding: '12px 24px',
        background: 'linear-gradient(135deg, #00D4FF, #0088cc)',
        border: 'none',
        borderRadius: 8,
        color: '#fff',
        fontSize: 16,
        fontWeight: 600,
        cursor: 'pointer',
    },
    exitDrill: {
        display: 'block',
        margin: '0 auto',
        padding: '10px 20px',
        background: 'transparent',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        borderRadius: 8,
        color: 'rgba(255, 255, 255, 0.6)',
        fontSize: 14,
        cursor: 'pointer',
    },
};
