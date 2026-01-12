/* ═══════════════════════════════════════════════════════════════════════════
   🧠 MEMORY MATRIX 2.0 — THE GTO WIZARD KILLER
   Full Video Game Experience with Pressure, Combos, and Diamond Economy
   ═══════════════════════════════════════════════════════════════════════════ */

import { useRouter } from 'next/router';
import Head from 'next/head';
import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
    SoundEngine,
    EffectsEngine,
    TimerEngine,
    ComboEngine,
    ProgressionEngine,
    LEVELS,
    MASTERY_THRESHOLD,
    GAME_COST,
} from '../../src/games/GameEngine';
import {
    ALL_SCENARIOS,
    getScenariosByLevel,
    getRandomScenario,
    RANKS,
    getHandName,
} from '../../src/games/ScenarioDatabase';

// Supabase client
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

// ═══════════════════════════════════════════════════════════════════════════
// 💎 DIAMOND ENGINE — Local storage with VIP check
// ═══════════════════════════════════════════════════════════════════════════
const DiamondEngine = {
    _balance: null,
    _isVIP: false,

    init() {
        if (typeof window === 'undefined') return;
        this._balance = parseInt(localStorage.getItem('diamond_balance') || '100', 10);
        this._isVIP = localStorage.getItem('vip_status') === 'true';
    },

    getBalance() {
        this.init();
        return this._balance;
    },

    isVIP() {
        this.init();
        return this._isVIP;
    },

    deduct(amount) {
        this.init();
        if (this._isVIP) return { success: true, charged: 0 };
        if (this._balance < amount) return { success: false, balance: this._balance };
        this._balance -= amount;
        localStorage.setItem('diamond_balance', String(this._balance));
        return { success: true, charged: amount, balance: this._balance };
    },

    award(amount) {
        this.init();
        this._balance += amount;
        localStorage.setItem('diamond_balance', String(this._balance));
        SoundEngine.play('diamond');
        return this._balance;
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// 🎨 ACTION COLORS
// ═══════════════════════════════════════════════════════════════════════════
const ACTION_COLORS = {
    fold: { bg: 'rgba(100, 100, 100, 0.3)', border: '#555', label: 'FOLD', key: '1' },
    call: { bg: 'rgba(16, 185, 129, 0.5)', border: '#10B981', label: 'CALL', key: '2' },
    raise: { bg: 'rgba(239, 68, 68, 0.5)', border: '#EF4444', label: 'RAISE', key: '3' },
    raise_small: { bg: 'rgba(249, 115, 22, 0.5)', border: '#F97316', label: 'RAISE SM', key: '4' },
    raise_big: { bg: 'rgba(168, 85, 247, 0.5)', border: '#A855F7', label: 'RAISE BIG', key: '5' },
    all_in: { bg: 'rgba(220, 38, 127, 0.6)', border: '#DC2680', label: 'ALL IN', key: '6' },
};

// ═══════════════════════════════════════════════════════════════════════════
// 🧮 GRADING ENGINE
// ═══════════════════════════════════════════════════════════════════════════
function gradeUserGrid(userGrid, solution) {
    let correctHands = 0;
    const missedHands = [];
    const extraHands = [];
    const wrongActionHands = [];

    for (const [hand, correctAction] of Object.entries(solution)) {
        const userAction = userGrid[hand];
        if (!userAction || userAction === 'fold') {
            missedHands.push(hand);
        } else if (userAction !== correctAction) {
            wrongActionHands.push(hand);
        } else {
            correctHands++;
        }
    }

    for (const [hand, userAction] of Object.entries(userGrid)) {
        if (!solution[hand] && userAction && userAction !== 'fold') {
            extraHands.push(hand);
        }
    }

    const totalSolutionHands = Object.keys(solution).length;
    const mistakes = missedHands.length + extraHands.length + wrongActionHands.length;
    const score = totalSolutionHands > 0
        ? Math.round(((totalSolutionHands - missedHands.length - wrongActionHands.length) / totalSolutionHands) * 100)
        : 0;

    return { score: Math.max(0, score), correctHands, missedHands, extraHands, wrongActionHands, mistakes };
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎮 MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function MemoryGamesPage() {
    const router = useRouter();
    const containerRef = useRef(null);

    // Game state
    const [mode, setMode] = useState('menu'); // 'menu' | 'game' | 'result'
    const [currentLevel, setCurrentLevel] = useState(1);
    const [currentScenario, setCurrentScenario] = useState(null);
    const [userGrid, setUserGrid] = useState({});
    const [selectedAction, setSelectedAction] = useState('raise');
    const [gradeResult, setGradeResult] = useState(null);

    // Timer state
    const [timeRemaining, setTimeRemaining] = useState(90);
    const [timerActive, setTimerActive] = useState(false);
    const timerRef = useRef(null);

    // Combo state
    const [combo, setCombo] = useState(0);
    const [comboName, setComboName] = useState(null);
    const [multiplier, setMultiplier] = useState(1);

    // Economy state
    const [diamondBalance, setDiamondBalance] = useState(100);
    const [isVIP, setIsVIP] = useState(false);
    const [lastReward, setLastReward] = useState(null);

    // Progress state
    const [consecutivePasses, setConsecutivePasses] = useState(0);
    const [totalXP, setTotalXP] = useState(0);

    // Visual state
    const [screenShake, setScreenShake] = useState(false);
    const [showComboPopup, setShowComboPopup] = useState(false);

    // Initialize effects CSS and load balance
    useEffect(() => {
        EffectsEngine.initCSS();
        setDiamondBalance(DiamondEngine.getBalance());
        setIsVIP(DiamondEngine.isVIP());
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
            const actions = Object.entries(ACTION_COLORS);
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

    // Start game
    const startGame = async (level) => {
        // Check diamond access
        if (!isVIP) {
            const result = DiamondEngine.deduct(GAME_COST);
            if (!result.success) {
                alert(`Not enough diamonds! Need ${GAME_COST}💎 to play.\n\nGet VIP for $19.99/month for unlimited access!`);
                return;
            }
            setDiamondBalance(result.balance);
        }

        const scenario = getRandomScenario(level);
        if (!scenario) {
            alert('No scenarios available for this level yet!');
            return;
        }

        setCurrentLevel(level);
        setCurrentScenario(scenario);
        setUserGrid({});
        setGradeResult(null);
        setTimeRemaining(90);
        setTimerActive(true);
        setCombo(0);
        setComboName(null);
        setMultiplier(1);
        setMode('game');

        SoundEngine.play('levelUp');
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

        const passed = result.score >= MASTERY_THRESHOLD;

        if (passed) {
            // Success!
            SoundEngine.play('combo');
            triggerParticles();

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
            const totalReward = Math.floor((baseReward + accuracyBonus + perfectBonus + comboBonus) * multiplier);

            const newBalance = DiamondEngine.award(totalReward);
            setDiamondBalance(newBalance);
            setLastReward({ diamonds: totalReward, timestamp: Date.now() });

            // XP
            const xpGain = 50 + (result.score - 85) * 2 + (newCombo * 5);
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

        setMode('result');
    };

    // Update combo display
    const updateComboDisplay = (comboCount) => {
        let name = null;
        let mult = 1;

        if (comboCount >= 20) { name = '🔥 LEGENDARY!'; mult = 3.0; }
        else if (comboCount >= 15) { name = '💀 UNSTOPPABLE!'; mult = 2.5; }
        else if (comboCount >= 10) { name = '⚡ ON FIRE!'; mult = 2.0; }
        else if (comboCount >= 7) { name = '🎯 DOMINATING!'; mult = 1.7; }
        else if (comboCount >= 5) { name = '✨ HOT STREAK!'; mult = 1.5; }
        else if (comboCount >= 3) { name = '👍 NICE!'; mult = 1.2; }

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

    // Timer color
    const getTimerColor = () => {
        if (timeRemaining > 30) return '#00ff88';
        if (timeRemaining > 10) return '#ffaa00';
        return '#ff4444';
    };

    // Get level scenarios count
    const getLevelScenarios = (level) => getScenariosByLevel(level).length;

    return (
        <>
            <Head>
                <title>Memory Matrix — Smarter.Poker</title>
                <meta name="description" content="Master GTO ranges through video game training" />
                <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
            </Head>

            <div
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

                {/* Header */}
                <div style={styles.header}>
                    <button
                        onClick={() => mode === 'game' || mode === 'result' ? setMode('menu') : router.push('/hub')}
                        style={styles.backButton}
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M19 12H5M12 19l-7-7 7-7" />
                        </svg>
                        <span>{mode === 'menu' ? 'Hub' : 'Menu'}</span>
                    </button>

                    <div style={styles.headerStats}>
                        {/* VIP Badge */}
                        {isVIP && (
                            <div style={styles.vipBadge}>
                                👑 VIP
                            </div>
                        )}

                        {/* Combo Display */}
                        {combo > 0 && (
                            <div style={{
                                ...styles.comboBadge,
                                animation: showComboPopup ? 'pulse 0.5s ease-in-out' : 'none',
                            }}>
                                🔥 {combo}x
                            </div>
                        )}

                        {/* XP Display */}
                        <div style={styles.statBadge}>
                            <span style={styles.statIcon}>⭐</span>
                            <span style={styles.statValue}>{totalXP.toLocaleString()} XP</span>
                        </div>

                        {/* Diamond Display */}
                        <div style={{
                            ...styles.statBadge,
                            ...styles.diamondBadge,
                            position: 'relative',
                        }}>
                            <span style={styles.statIcon}>💎</span>
                            <span style={{ ...styles.statValue, color: '#00D4FF' }}>
                                {diamondBalance.toLocaleString()}
                            </span>
                            {lastReward && Date.now() - lastReward.timestamp < 2000 && (
                                <div style={styles.rewardPopup}>+{lastReward.diamonds} 💎</div>
                            )}
                        </div>
                    </div>
                </div>

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
                                <div style={styles.orbIcon}>🧠</div>
                                <h1 style={styles.title}>MEMORY MATRIX</h1>
                                <p style={styles.subtitle}>
                                    Master GTO ranges through high-pressure video game training
                                </p>
                                <div style={styles.costInfo}>
                                    {isVIP ? '👑 VIP: Unlimited Access' : `💎 ${GAME_COST} Diamonds per game`}
                                </div>
                            </div>

                            {/* Level Grid */}
                            <div style={styles.levelGrid}>
                                {LEVELS.map((level, idx) => {
                                    const scenarioCount = getLevelScenarios(level.level);
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
                                                <span>{scenarioCount} scenarios</span>
                                                {!isUnlocked && <span>🔒</span>}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Mastery Gate */}
                            <div style={styles.masteryGate}>
                                <span style={styles.masteryIcon}>🔐</span>
                                <div>
                                    <div style={styles.masteryTitle}>85% Mastery Gate</div>
                                    <div style={styles.masteryDesc}>
                                        Score 85%+ on 5 consecutive scenarios to unlock the next level
                                    </div>
                                </div>
                            </div>

                            {/* VIP Upsell */}
                            {!isVIP && (
                                <div style={styles.vipUpsell}>
                                    <div style={styles.vipTitle}>👑 GO VIP — $19.99/month</div>
                                    <div style={styles.vipFeatures}>
                                        Unlimited games • All levels • No diamond cost • Exclusive modes
                                    </div>
                                    <button style={styles.vipButton}>
                                        Upgrade to VIP
                                    </button>
                                </div>
                            )}
                        </>
                    )}

                    {(mode === 'game' || mode === 'result') && currentScenario && (
                        <>
                            {/* Timer Bar */}
                            <div style={styles.timerContainer}>
                                <div
                                    style={{
                                        ...styles.timerBar,
                                        width: `${(timeRemaining / 90) * 100}%`,
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
                                    <div style={styles.levelBadge}>Level {currentLevel}</div>
                                    <h2 style={styles.scenarioTitle}>{currentScenario.title}</h2>
                                    <p style={styles.scenarioDesc}>{currentScenario.description}</p>
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
                                            {gradeResult.score >= 85 ? '✓ PASSED' : '✗ FAILED'}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Action Bar */}
                            <div style={styles.actionBar}>
                                {Object.entries(ACTION_COLORS).map(([action, { bg, border, label, key }]) => (
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
                                            <span style={{ color: '#00ff88' }}>✓ Correct</span>
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
                                            💎 +{lastReward.diamonds} Diamonds earned! (×{multiplier} multiplier)
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Inject shake animation */}
            <style jsx global>{`
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
            `}</style>
        </>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════
const styles = {
    container: {
        minHeight: '100vh',
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
        overflowX: 'auto',
        marginBottom: 20,
    },
    grid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(13, minmax(46px, 1fr))',
        gap: 2,
        minWidth: 620,
    },
    cell: {
        aspectRatio: '1',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 10,
        fontWeight: 600,
        color: '#fff',
        borderRadius: 4,
        border: '1px solid',
        transition: 'all 0.1s ease',
        userSelect: 'none',
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
